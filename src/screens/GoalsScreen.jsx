import { useState, useEffect, useRef, useMemo } from 'react';
import { i18n } from '../data.js';
import { useTheme } from '../context.jsx';
import { Button, Icon, ProgressBar, ScreenHeader } from '../components.jsx';
import {
  getGoals, saveGoals, addSession, getWeekStats, getSessions, getBookIndex,
  getBadges, checkAndAwardBadges, BADGE_DEFS,
  computeReadingSpeed, estimateCompletion,
  getNotificationSettings, saveNotificationSettings,
  getMonthStats, getYearStats,
  getBackupSettings, appendBackupLog, getNotesByBook, getAllHighlightsByBook,
  getReadingStrategy, saveReadingStrategy,
} from '../store.js';
import { backupBookToDrive } from '../utils/driveBackup.js';
import { scheduleProgressAutoSync } from '../utils/autoProgressSync.js';
import { renderStatsCard, downloadStatsCard, STATS_THEMES, fmtMinutes, monthName as monthLabel } from '../utils/statsCard.js';
import { getWeeklyCoachData, generateCoachPrompt } from '../utils/readingCoach.js';
import { generateReadingStrategy } from '../utils/readingStrategy.js';
import { callAI } from '../aiClient.js';

function pad(n) { return String(n).padStart(2, '0'); }

function computeTodayStats() {
  const today = new Date().toISOString().slice(0, 10);
  const sessions = getSessions().filter(s => s.date.slice(0, 10) === today);
  return {
    minutes: sessions.reduce((a, s) => a + (s.minutes || 0), 0),
    pages: sessions.reduce((a, s) => a + (s.pages || 0), 0),
  };
}

function computeMonthReadDays() {
  const now = new Date();
  const prefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  return new Set(getSessions().filter(s => s.date.startsWith(prefix)).map(s => s.date.slice(0, 10)));
}

// 90-day heatmap: dateStr → totalMinutes
function compute90DayHeatmap() {
  const map = {};
  const now = new Date();
  for (let i = 89; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    map[d.toISOString().slice(0, 10)] = 0;
  }
  getSessions().forEach(s => {
    const d = s.date.slice(0, 10);
    if (d in map) map[d] += s.minutes || 0;
  });
  return map;
}

// Intensity level 0-4 based on minutes
function heatIntensity(minutes) {
  if (minutes <= 0) return 0;
  if (minutes < 15) return 1;
  if (minutes < 30) return 2;
  if (minutes < 60) return 3;
  return 4;
}

function countCompletedBooks() {
  return getBookIndex().filter(b => {
    try {
      const m = JSON.parse(localStorage.getItem(`pkl_book_${b.id}`) || '{}');
      return m.status === 'done' || m.progress >= 100;
    } catch { return false; }
  }).length;
}

export function GoalsScreen({ lang, currentBook, onOpenBook, apiKeys }) {
  const { T, F } = useTheme();
  const t = i18n[lang];
  const [goals, setGoals] = useState(() => getGoals());
  const [weekStats, setWeekStats] = useState(() => getWeekStats());
  const [todayStat, setTodayStat] = useState(() => computeTodayStats());
  const [monthReadDays, setMonthReadDays] = useState(() => computeMonthReadDays());

  const [sessionActive, setSessionActive] = useState(false);
  const [sessionSeconds, setSessionSeconds] = useState(0);
  const [sessionPages, setSessionPages] = useState(0);
  const [pageInput, setPageInput] = useState('');
  const [sessionDone, setSessionDone] = useState(null);
  const timerRef = useRef(null);

  // Scenario 3 state
  const [heatmap, setHeatmap]         = useState(() => compute90DayHeatmap());
  const [badges, setBadges]           = useState(() => getBadges());
  const [readSpeed, setReadSpeed]     = useState(() => computeReadingSpeed());
  const [completion, setCompletion]   = useState(() => currentBook?.id ? estimateCompletion(currentBook.id) : null);
  const [notifSettings, setNotifSettings] = useState(() => getNotificationSettings());
  const [notifPermission, setNotifPermission] = useState(() => typeof Notification !== 'undefined' ? Notification.permission : 'default');
  const [goalsTab, setGoalsTab] = useState('session'); // 'session' | 'strategy' | 'stats'
  const [coachData, setCoachData] = useState(null);
  const [coachResponse, setCoachResponse] = useState('');
  const [coachLoading, setCoachLoading] = useState(false);
  const [coachError, setCoachError] = useState('');

  // 독서 전략(책별 RAG 기반 맞춤 목표) state
  const [strategy, setStrategy] = useState(() => currentBook?.id ? getReadingStrategy(currentBook.id) : null);
  const [strategyLoading, setStrategyLoading] = useState(false);
  const [strategyError, setStrategyError] = useState('');
  useEffect(() => {
    setStrategy(currentBook?.id ? getReadingStrategy(currentBook.id) : null);
    setStrategyError('');
  }, [currentBook?.id]);

  const runGenerateStrategy = async () => {
    if (!currentBook?.id || strategyLoading) return;
    if (!apiKeys?.claude && !apiKeys?.gemini) {
      setStrategyError(lang === 'ko' ? 'AI 키를 설정해주세요' : 'Set an API key first');
      return;
    }
    setStrategyLoading(true);
    setStrategyError('');
    try {
      const est = estimateCompletion(currentBook.id);
      const result = await generateReadingStrategy(currentBook, {
        lang, apiKeys, speed: readSpeed, remainingPages: est?.remaining ?? null,
      });
      saveReadingStrategy(currentBook.id, result);
      setStrategy({ ...result, generatedAt: Date.now() });
    } catch (e) {
      setStrategyError(
        e.message === 'no-scanned-text'
          ? (lang === 'ko' ? '먼저 뷰어에서 책 전체를 스캔해주세요(Vision).' : 'Full-scan the book first (Vision) in the viewer.')
          : (lang === 'ko' ? `전략 생성 실패: ${e.message}` : `Failed to generate: ${e.message}`)
      );
    } finally {
      setStrategyLoading(false);
    }
  };

  // 4-4: 통계 카드
  const now = new Date();
  const [statsYear, setStatsYear]   = useState(now.getFullYear());
  const [statsMonth, setStatsMonth] = useState(now.getMonth() + 1); // 1-based
  const [statsMode, setStatsMode]   = useState('month'); // 'month' | 'year'
  const [statsTheme, setStatsTheme] = useState('night');
  const statsCanvasRef = useRef(null);
  const monthStats = useMemo(() => getMonthStats(statsYear, statsMonth), [statsYear, statsMonth]);
  const yearStats  = useMemo(() => getYearStats(statsYear),               [statsYear]);
  const activeStats = statsMode === 'month' ? monthStats : yearStats;

  useEffect(() => {
    if (!statsCanvasRef.current) return;
    try { renderStatsCard(statsCanvasRef.current, activeStats, { theme: statsTheme, lang }); }
    catch { /* jsdom canvas not supported */ }
  }, [activeStats, statsTheme, lang]);

  useEffect(() => {
    if (sessionActive) {
      timerRef.current = setInterval(() => setSessionSeconds(s => s + 1), 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [sessionActive]);

  const updateGoal = (key, val) => {
    const next = { ...goals, [key]: val };
    setGoals(next);
    saveGoals(next);
  };

  const requestNotifPermission = async () => {
    if (typeof Notification === 'undefined') return;
    const perm = await Notification.requestPermission();
    setNotifPermission(perm);
    if (perm === 'granted') {
      const next = { ...notifSettings, enabled: true };
      setNotifSettings(next);
      saveNotificationSettings(next);
    }
  };

  const updateNotifSettings = (patch) => {
    const next = { ...notifSettings, ...patch };
    setNotifSettings(next);
    saveNotificationSettings(next);
  };

  const startSession = () => {
    setSessionSeconds(0);
    setSessionPages(0);
    setPageInput('');
    setSessionActive(true);
  };

  const endSession = () => {
    setSessionActive(false);
    const minutes = Math.max(1, Math.round(sessionSeconds / 60));
    addSession({ bookId: currentBook?.id || '', bookTitle: currentBook?.title || '', minutes, pages: sessionPages });
    setSessionDone({ minutes, pages: sessionPages });
    const ws = getWeekStats();
    setWeekStats(ws);
    setTodayStat(computeTodayStats());
    setMonthReadDays(computeMonthReadDays());
    setHeatmap(compute90DayHeatmap());
    setReadSpeed(computeReadingSpeed());
    if (currentBook?.id) setCompletion(estimateCompletion(currentBook.id));
    const awarded = checkAndAwardBadges(ws.streak, countCompletedBooks());
    setBadges(awarded);

    // 자동 백업 (currentBook 있고, autoBackup 켜져 있을 때)
    if (currentBook?.id) {
      const bs = getBackupSettings();
      if (bs.autoBackup && bs.writeToken) {
        const notes = getNotesByBook(currentBook.id);
        const highlights = getAllHighlightsByBook(currentBook.id);
        backupBookToDrive(bs.writeToken, currentBook, notes, highlights)
          .then(() => appendBackupLog({ status: 'ok', succeeded: 1, failed: 0, auto: true }))
          .catch(e => appendBackupLog({ status: 'error', error: e.message, auto: true }));
      }
      // 읽은 위치·컬렉션·단어장 자동 동기화 — 메모 백업과 별개 토글, 같은 writeToken 재사용
      scheduleProgressAutoSync(0);
    }
  };

  const closeSession = () => { setSessionDone(null); setSessionSeconds(0); };

  const commitPages = () => {
    const p = parseInt(pageInput);
    if (!isNaN(p) && p > 0) setSessionPages(p);
    setPageInput('');
  };

  const askCoach = async () => {
    if (!apiKeys?.claude && !apiKeys?.gemini) {
      setCoachError(lang === 'ko' ? 'AI 키를 설정해주세요' : 'Set API key first');
      return;
    }
    setCoachLoading(true);
    setCoachError('');
    setCoachResponse('');
    try {
      const data = getWeeklyCoachData();
      setCoachData(data);
      const systemPrompt = generateCoachPrompt(lang, data);
      const result = await callAI(apiKeys, systemPrompt, [], '');
      setCoachResponse(result || '');
    } catch (e) {
      setCoachError(lang === 'ko' ? 'AI 응답 실패' : 'AI response failed');
    } finally {
      setCoachLoading(false);
    }
  };

  const minutesRead = Math.round(sessionSeconds / 60);
  const timeProgress = Math.min(100, Math.round((minutesRead / goals.dailyMinutes) * 100));
  const pageProgress = Math.min(100, Math.round((sessionPages / goals.dailyPages) * 100));

  /* ── Calendar data ── */
  const calData = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDow = new Date(year, month, 1).getDay();
    const todayStr = now.toISOString().slice(0, 10);
    const monthName = now.toLocaleDateString(lang === 'ko' ? 'ko-KR' : 'en-US', { year: 'numeric', month: 'long' });
    const cells = [];
    for (let i = 0; i < firstDow; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    return { year, month, daysInMonth, todayStr, monthName, cells };
  }, [lang]);

  /* ── Session complete screen ── */
  if (sessionDone) {
    return (
      <div style={{ padding: '0 22px 24px' }}>
        <ScreenHeader subtitle={lang === 'ko' ? '오늘의 결과' : "Today's session"} title={lang === 'ko' ? '독서 완료!' : 'Session done!'} />
        <div style={{ background: `linear-gradient(160deg, ${T.accent}, ${T.accentDeep})`, borderRadius: 22, padding: '22px 20px', color: '#FFF', marginBottom: 16, position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: -40, right: -40, width: 160, height: 160, borderRadius: '50%', background: 'rgba(255,255,255,.08)' }} />
          <div style={{ position: 'relative' }}>
            <Icon name="check-circle" size={32} color="#FFF" stroke={1.4} />
            <div style={{ fontSize: 28, fontFamily: 'serif', fontWeight: 600, lineHeight: 1.1, marginTop: 10, letterSpacing: -0.5 }}>
              {lang === 'ko' ? '잘 하셨어요!' : 'Great session!'}
            </div>
            <div style={{ fontSize: 13, marginTop: 6, opacity: 0.85, fontFamily: F.body }}>
              {sessionDone.minutes}{lang === 'ko' ? '분' : 'min'}{sessionDone.pages > 0 ? ` · ${sessionDone.pages}${lang === 'ko' ? '페이지' : 'p'}` : ''}
              {currentBook ? ` · ${currentBook.title.slice(0, 20)}` : ''}
            </div>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
          {[
            { icon: 'clock', label: lang === 'ko' ? '이번 세션' : 'This session', value: `${sessionDone.minutes}m` },
            { icon: 'page', label: lang === 'ko' ? '읽은 페이지' : 'Pages', value: sessionDone.pages > 0 ? `+${sessionDone.pages}` : '-' },
            { icon: 'fire', label: lang === 'ko' ? '이번 주 총' : 'This week', value: `${weekStats.totalMinutes}m` },
            { icon: 'spark', label: lang === 'ko' ? '연속 일수' : 'Streak', value: `${weekStats.streak}d` },
          ].map((s, i) => (
            <div key={i} style={{ background: T.surface, borderRadius: 14, padding: 14, border: `1px solid ${T.border}` }}>
              <Icon name={s.icon} size={16} color={T.accent} />
              <div style={{ fontSize: 22, fontWeight: 600, color: T.ink, fontFamily: 'serif', marginTop: 6, letterSpacing: -0.4 }}>{s.value}</div>
              <div style={{ fontSize: 10.5, color: T.inkLight, fontFamily: F.body, letterSpacing: 0.3, marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="ghost" onClick={closeSession} style={{ flex: 1 }}>{lang === 'ko' ? '닫기' : 'Close'}</Button>
          <Button variant="accent" onClick={() => { closeSession(); startSession(); }} style={{ flex: 1.2 }}>
            <Icon name="play" size={12} color="#FFF" /> {lang === 'ko' ? '계속 읽기' : 'Keep going'}
          </Button>
        </div>
      </div>
    );
  }

  /* ── Active session ── */
  if (sessionActive) {
    const elapsed = `${pad(Math.floor(sessionSeconds / 60))}:${pad(sessionSeconds % 60)}`;
    return (
      <div style={{ padding: '0 22px 24px' }}>
        <ScreenHeader subtitle={currentBook?.title || (lang === 'ko' ? '독서 중' : 'Reading')} title={lang === 'ko' ? '세션 진행 중' : 'Session in progress'} />
        <div style={{ background: T.surface, borderRadius: 20, padding: '28px 20px', border: `1px solid ${T.border}`, textAlign: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 52, fontWeight: 600, fontFamily: F.mono, color: T.ink, letterSpacing: -1, lineHeight: 1 }}>{elapsed}</div>
          <div style={{ fontSize: 12, color: T.inkLight, fontFamily: F.body, marginTop: 8 }}>
            {lang === 'ko' ? `목표 ${goals.dailyMinutes}분` : `Goal: ${goals.dailyMinutes}min`}
          </div>
          <div style={{ marginTop: 14, maxWidth: 220, margin: '14px auto 0' }}>
            <ProgressBar value={timeProgress} height={4} />
          </div>
        </div>
        <div style={{ background: T.surface, borderRadius: 16, padding: 16, border: `1px solid ${T.border}`, marginBottom: 16 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: T.inkLight, letterSpacing: 1.3, textTransform: 'uppercase', fontFamily: F.body, marginBottom: 10 }}>
            {lang === 'ko' ? '읽은 페이지 기록' : 'Log pages read'}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              value={pageInput}
              onChange={e => setPageInput(e.target.value.replace(/\D/g, ''))}
              onKeyDown={e => e.key === 'Enter' && commitPages()}
              placeholder={lang === 'ko' ? `현재 ${sessionPages}페이지` : `Currently ${sessionPages}p`}
              style={{ flex: 1, border: `1.5px solid ${T.border}`, borderRadius: 10, padding: '9px 13px', fontSize: 14, fontFamily: F.mono, color: T.ink, background: T.surfaceAlt, outline: 'none' }}
            />
            <Button variant="ghost" onClick={commitPages} style={{ padding: '9px 14px', flexShrink: 0 }}>
              {lang === 'ko' ? '저장' : 'Set'}
            </Button>
          </div>
          {sessionPages > 0 && (
            <div style={{ marginTop: 10 }}>
              <ProgressBar value={pageProgress} height={3} />
              <div style={{ fontSize: 11, color: T.inkLight, fontFamily: F.body, marginTop: 5 }}>
                {sessionPages} / {goals.dailyPages} {lang === 'ko' ? '페이지' : 'pages'}
              </div>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="ghost" onClick={() => { setSessionActive(false); setSessionSeconds(0); }} style={{ flex: 1 }}>
            {lang === 'ko' ? '취소' : 'Cancel'}
          </Button>
          <Button variant="accent" onClick={endSession} style={{ flex: 1.4, padding: 14, fontSize: 15 }}>
            {lang === 'ko' ? '세션 종료' : 'End session'}
          </Button>
        </div>
      </div>
    );
  }

  /* ── Setup ── */
  const achievedDays = weekStats.weekDays.filter(w => w.minutes >= goals.dailyMinutes).length;

  return (
    <div style={{ paddingBottom: 24 }}>
      <ScreenHeader subtitle={lang === 'ko' ? '독서 세션 & 통계' : 'Session & Stats'} title={t.todayGoal} />

      {/* 탭 전환 */}
      <div style={{ padding: '0 22px 16px' }}>
        <div style={{ display: 'flex', background: T.surfaceAlt, borderRadius: 12, padding: 3, border: `1px solid ${T.border}` }}>
          {[
            { key: 'session',  label: lang === 'ko' ? '📖 세션' : '📖 Session' },
            { key: 'strategy', label: lang === 'ko' ? '📋 독서 전략' : '📋 Strategy' },
            { key: 'stats',    label: lang === 'ko' ? '📊 통계 공유' : '📊 Stats Share' },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setGoalsTab(tab.key)}
              style={{ flex: 1, padding: '9px 0', borderRadius: 9, border: 'none', background: goalsTab === tab.key ? T.surface : 'transparent', color: goalsTab === tab.key ? T.ink : T.inkLight, fontSize: 13, fontWeight: goalsTab === tab.key ? 700 : 400, fontFamily: F.body, cursor: 'pointer', boxShadow: goalsTab === tab.key ? `0 1px 4px ${T.ink}15` : 'none', transition: 'all .2s' }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── 통계 공유 탭 ── */}
      {goalsTab === 'stats' && (
        <div style={{ padding: '0 22px 32px' }}>
          <div style={{ background: T.surface, borderRadius: 16, padding: 18, border: `1px solid ${T.border}` }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: T.inkLight, letterSpacing: 1.4, textTransform: 'uppercase', fontFamily: F.body, marginBottom: 14 }}>
              {lang === 'ko' ? '독서 통계 이미지 만들기' : 'Create Stats Image'}
            </div>

            {/* 모드 + 기간 */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              {['month', 'year'].map(m => (
                <button key={m} onClick={() => setStatsMode(m)} style={{ padding: '6px 14px', borderRadius: 10, border: `1px solid ${statsMode === m ? T.accent : T.border}`, background: statsMode === m ? T.accentSoft : 'transparent', color: statsMode === m ? T.accent : T.inkLight, fontSize: 12, fontWeight: statsMode === m ? 700 : 400, cursor: 'pointer', fontFamily: F.body }}>
                  {m === 'month' ? (lang === 'ko' ? '월간' : 'Monthly') : (lang === 'ko' ? '연간' : 'Yearly')}
                </button>
              ))}
              {statsMode === 'month' && (
                <>
                  <select value={statsYear} onChange={e => setStatsYear(Number(e.target.value))} style={{ padding: '5px 8px', borderRadius: 8, border: `1px solid ${T.border}`, background: T.surfaceAlt, color: T.ink, fontSize: 12, fontFamily: F.body }}>
                    {[now.getFullYear() - 1, now.getFullYear()].map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                  <select value={statsMonth} onChange={e => setStatsMonth(Number(e.target.value))} style={{ padding: '5px 8px', borderRadius: 8, border: `1px solid ${T.border}`, background: T.surfaceAlt, color: T.ink, fontSize: 12, fontFamily: F.body }}>
                    {Array.from({ length: 12 }, (_, i) => i + 1).map(mo => (
                      <option key={mo} value={mo}>{monthLabel(mo, lang)}</option>
                    ))}
                  </select>
                </>
              )}
              {statsMode === 'year' && (
                <select value={statsYear} onChange={e => setStatsYear(Number(e.target.value))} style={{ padding: '5px 8px', borderRadius: 8, border: `1px solid ${T.border}`, background: T.surfaceAlt, color: T.ink, fontSize: 12, fontFamily: F.body }}>
                  {[now.getFullYear() - 1, now.getFullYear()].map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              )}
            </div>

            {/* 테마 */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 14, alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: T.inkMid, fontFamily: F.body, marginRight: 4 }}>{lang === 'ko' ? '테마' : 'Theme'}</span>
              {Object.entries(STATS_THEMES).map(([key, t]) => (
                <button key={key} onClick={() => setStatsTheme(key)} title={key} style={{ width: 28, height: 28, borderRadius: '50%', background: t.bg, border: statsTheme === key ? `3px solid ${T.accent}` : `1px solid ${T.border}`, cursor: 'pointer', padding: 0, flexShrink: 0 }} />
              ))}
            </div>

            {/* Canvas 미리보기 */}
            <div style={{ background: '#000', borderRadius: 12, padding: 8, marginBottom: 14 }}>
              <canvas ref={statsCanvasRef} style={{ width: '100%', aspectRatio: '1/1', borderRadius: 8, display: 'block' }} />
            </div>

            {/* 다운로드 */}
            <button
              onClick={() => downloadStatsCard(activeStats, { theme: statsTheme, lang })}
              style={{ width: '100%', padding: '13px', borderRadius: 12, border: 'none', background: T.accent, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: F.body }}
            >
              📥 {lang === 'ko' ? 'PNG로 저장' : 'Save as PNG'}
            </button>
          </div>
        </div>
      )}

      {/* ── 세션 탭 ── */}
      {goalsTab === 'session' && <>

      {/* Today's progress */}
      <div style={{ padding: '0 22px 12px' }}>
        <div style={{ background: T.surface, borderRadius: 16, padding: 18, border: `1px solid ${T.border}` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: T.inkLight, letterSpacing: 1.4, textTransform: 'uppercase', fontFamily: F.body }}>
              {lang === 'ko' ? '오늘 달성률' : "Today's Progress"}
            </span>
            {todayStat.minutes >= goals.dailyMinutes ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700, color: T.accent, background: T.accentSoft, padding: '2px 8px', borderRadius: 999 }}>
                <Icon name="check" size={10} color={T.accent} /> {lang === 'ko' ? '목표 달성' : 'Goal met!'}
              </span>
            ) : todayStat.minutes === 0 ? (
              <span style={{ fontSize: 10, color: T.inkFaint, fontFamily: F.body }}>
                {lang === 'ko' ? '아직 기록 없음' : 'No sessions yet'}
              </span>
            ) : null}
          </div>
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
              <span style={{ fontSize: 11, color: T.inkMid, fontFamily: F.body, display: 'flex', alignItems: 'center', gap: 4 }}>
                <Icon name="clock" size={11} color={T.inkLight} /> {lang === 'ko' ? '독서 시간' : 'Reading time'}
              </span>
              <span style={{ fontSize: 11, fontFamily: F.mono, color: T.ink }}>
                {todayStat.minutes}<span style={{ color: T.inkLight }}> / {goals.dailyMinutes}{lang === 'ko' ? '분' : 'min'}</span>
              </span>
            </div>
            <ProgressBar value={Math.min(100, Math.round((todayStat.minutes / goals.dailyMinutes) * 100))} height={5} />
          </div>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
              <span style={{ fontSize: 11, color: T.inkMid, fontFamily: F.body, display: 'flex', alignItems: 'center', gap: 4 }}>
                <Icon name="page" size={11} color={T.inkLight} /> {lang === 'ko' ? '읽은 페이지' : 'Pages read'}
              </span>
              <span style={{ fontSize: 11, fontFamily: F.mono, color: T.ink }}>
                {todayStat.pages}<span style={{ color: T.inkLight }}> / {goals.dailyPages}p</span>
              </span>
            </div>
            <ProgressBar value={Math.min(100, Math.round((todayStat.pages / goals.dailyPages) * 100))} height={5} />
          </div>
        </div>
      </div>

      {/* Current book */}
      {currentBook && (
        <div style={{ margin: '0 22px 12px', background: T.accentSoft, borderRadius: 14, padding: '12px 14px', border: `1px solid ${T.accent}22`, display: 'flex', alignItems: 'center', gap: 10 }}>
          <Icon name="library" size={16} color={T.accent} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: T.accentDeep, letterSpacing: 0.8, textTransform: 'uppercase', fontFamily: F.body }}>{lang === 'ko' ? '현재 책' : 'Current book'}</div>
            <div style={{ fontSize: 13, color: T.ink, fontFamily: 'serif', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{currentBook.title}</div>
          </div>
        </div>
      )}

      {/* Time goal */}
      <div style={{ padding: '0 22px 12px' }}>
        <div style={{ background: T.surface, borderRadius: 16, padding: 18, border: `1px solid ${T.border}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <Icon name="clock" size={14} color={T.inkLight} />
            <span style={{ fontSize: 10, fontWeight: 700, color: T.inkLight, letterSpacing: 1.4, textTransform: 'uppercase', fontFamily: F.body }}>{t.timeGoal}</span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {[15, 30, 60].map(m => (
              <button key={m} onClick={() => updateGoal('dailyMinutes', m)} style={{ flex: 1, padding: '14px 0', borderRadius: 12, border: 'none', cursor: 'pointer', background: goals.dailyMinutes === m ? T.ink : T.surfaceAlt, color: goals.dailyMinutes === m ? T.surface : T.ink, fontFamily: 'serif', transition: 'all .2s' }}>
                <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: -0.4 }}>{m}</div>
                <div style={{ fontSize: 10, fontFamily: F.body, opacity: 0.7, letterSpacing: 0.4, textTransform: 'uppercase' }}>{lang === 'ko' ? '분' : 'min'}</div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Page goal */}
      <div style={{ padding: '0 22px 12px' }}>
        <div style={{ background: T.surface, borderRadius: 16, padding: 18, border: `1px solid ${T.border}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <Icon name="page" size={14} color={T.inkLight} />
            <span style={{ fontSize: 10, fontWeight: 700, color: T.inkLight, letterSpacing: 1.4, textTransform: 'uppercase', fontFamily: F.body }}>{t.pageGoal}</span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {[10, 20, 30].map(p => (
              <button key={p} onClick={() => updateGoal('dailyPages', p)} style={{ flex: 1, padding: '14px 0', borderRadius: 12, border: 'none', cursor: 'pointer', background: goals.dailyPages === p ? T.ink : T.surfaceAlt, color: goals.dailyPages === p ? T.surface : T.ink, fontFamily: 'serif', transition: 'all .2s' }}>
                <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: -0.4 }}>{p}</div>
                <div style={{ fontSize: 10, fontFamily: F.body, opacity: 0.7, letterSpacing: 0.4, textTransform: 'uppercase' }}>p</div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Weekly chart */}
      <div style={{ padding: '0 22px 12px' }}>
        <div style={{ background: T.surface, borderRadius: 16, padding: 18, border: `1px solid ${T.border}` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 8 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: T.inkLight, letterSpacing: 1.4, textTransform: 'uppercase', fontFamily: F.body, whiteSpace: 'nowrap' }}>{t.thisWeek}</span>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {achievedDays > 0 && (
                <span style={{ fontSize: 11, color: T.accent, fontWeight: 600, fontFamily: F.body, background: T.accentSoft, padding: '2px 8px', borderRadius: 999, whiteSpace: 'nowrap' }}>
                  {lang === 'ko' ? `${achievedDays}일 달성` : `${achievedDays} day${achievedDays > 1 ? 's' : ''} met`}
                </span>
              )}
              {weekStats.streak > 0 && (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
                  <Icon name="fire" size={12} color={T.accent} />
                  <span style={{ fontSize: 12, color: T.accent, fontWeight: 600, fontFamily: F.body }}>{weekStats.streak} {lang === 'ko' ? '일 연속' : 'day streak'}</span>
                </div>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', height: 70, marginBottom: 14 }}>
            {weekStats.weekDays.map((w, i) => {
              const metGoal = w.minutes >= goals.dailyMinutes && w.minutes > 0;
              const isToday = i === weekStats.weekDays.length - 1;
              return (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, height: '100%' }}>
                  <div style={{ flex: 1, width: '100%', display: 'flex', alignItems: 'flex-end' }}>
                    <div style={{ width: '100%', height: `${Math.max(w.v, w.minutes > 0 ? 8 : 0)}%`, background: metGoal ? T.accent : isToday ? T.accent : T.accentSoft, opacity: metGoal ? 1 : isToday ? 0.7 : 0.5, borderRadius: 3, minHeight: w.minutes > 0 ? 4 : 0, transition: 'height .3s' }} />
                  </div>
                  <span style={{ fontSize: 10, color: metGoal ? T.accent : T.inkLight, fontFamily: F.mono, fontWeight: metGoal ? 700 : 400 }}>{w.d}</span>
                </div>
              );
            })}
          </div>
          {weekStats.totalMinutes > 0 || weekStats.totalPages > 0 ? (
            <div style={{ display: 'flex', borderTop: `1px solid ${T.border}`, paddingTop: 12 }}>
              {[
                { v: weekStats.totalMinutes >= 60 ? `${Math.floor(weekStats.totalMinutes / 60)}h${weekStats.totalMinutes % 60 > 0 ? `${weekStats.totalMinutes % 60}m` : ''}` : `${weekStats.totalMinutes}m`, l: lang === 'ko' ? '총 시간' : 'Total' },
                { v: String(weekStats.totalPages), l: lang === 'ko' ? '페이지' : 'Pages' },
                { v: String(weekStats.weekHighlights), l: lang === 'ko' ? '하이라이트' : 'Highlights' },
              ].map((s, i) => (
                <div key={i} style={{ flex: 1, textAlign: 'center', borderLeft: i > 0 ? `1px solid ${T.border}` : 'none' }}>
                  <div style={{ fontSize: 18, fontWeight: 600, color: T.ink, fontFamily: 'serif', letterSpacing: -0.3 }}>{s.v}</div>
                  <div style={{ fontSize: 10, color: T.inkLight, fontFamily: F.body, marginTop: 1, letterSpacing: 0.3 }}>{s.l}</div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: T.inkLight, fontFamily: F.body, textAlign: 'center', padding: '8px 0' }}>
              {lang === 'ko' ? '이번 주 독서 기록이 없어요' : 'No reading sessions this week yet'}
            </div>
          )}
        </div>
      </div>

      {/* Monthly calendar */}
      <div style={{ padding: '0 22px 20px' }}>
        <div style={{ background: T.surface, borderRadius: 16, padding: 18, border: `1px solid ${T.border}` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: T.inkLight, letterSpacing: 1.4, textTransform: 'uppercase', fontFamily: F.body }}>{calData.monthName}</span>
            {monthReadDays.size > 0 && (
              <span style={{ fontSize: 10, color: T.inkMid, fontFamily: F.body }}>
                {lang === 'ko' ? `${monthReadDays.size}일 독서` : `${monthReadDays.size} days`}
              </span>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 4 }}>
            {(lang === 'ko' ? ['일', '월', '화', '수', '목', '금', '토'] : ['S', 'M', 'T', 'W', 'T', 'F', 'S']).map((d, i) => (
              <div key={i} style={{ textAlign: 'center', fontSize: 9, color: T.inkFaint, fontFamily: F.mono, padding: '2px 0' }}>{d}</div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
            {calData.cells.map((d, i) => {
              if (!d) return <div key={i} />;
              const dateStr = `${calData.year}-${String(calData.month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
              const isToday = dateStr === calData.todayStr;
              const hasReading = monthReadDays.has(dateStr);
              return (
                <div key={i} style={{ textAlign: 'center', padding: '5px 2px', borderRadius: 7, background: isToday ? T.ink : hasReading ? T.accentSoft : 'transparent' }}>
                  <span style={{ fontSize: 11, fontFamily: F.mono, color: isToday ? T.surface : hasReading ? T.accent : T.inkLight, fontWeight: isToday || hasReading ? 600 : 400 }}>{d}</span>
                  {hasReading && !isToday && <div style={{ width: 4, height: 4, borderRadius: '50%', background: T.accent, margin: '1px auto 0' }} />}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Start button */}
      <div style={{ padding: '0 22px' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          {currentBook ? (
            <>
              <Button variant="ghost" onClick={startSession} style={{ flex: 1, padding: 14 }}>
                {lang === 'ko' ? '목표 없이' : 'No goal'}
              </Button>
              <Button variant="accent" onClick={startSession} style={{ flex: 1.6, padding: 14, fontSize: 15 }}>
                <Icon name="play" size={12} color="#FFF" /> {t.startReading}
              </Button>
            </>
          ) : (
            <div style={{ flex: 1, textAlign: 'center', fontSize: 13, color: T.inkLight, fontFamily: F.body, padding: '14px 0', background: T.surface, borderRadius: 14, border: `1px solid ${T.border}` }}>
              {lang === 'ko' ? '서재에서 책을 선택한 뒤 시작하세요' : 'Select a book from the Library to start'}
            </div>
          )}
        </div>
      </div>

      {/* ── 3-1: 90일 스트릭 캘린더 ── */}
      <div style={{ padding: '12px 22px 0' }}>
        <div style={{ background: T.surface, borderRadius: 16, padding: 18, border: `1px solid ${T.border}` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: T.inkLight, letterSpacing: 1.4, textTransform: 'uppercase', fontFamily: F.body }}>
                {lang === 'ko' ? '90일 독서 기록' : '90-day Reading Heatmap'}
              </div>
              {weekStats.streak > 0 && (
                <div style={{ fontSize: 12, color: T.accent, fontWeight: 700, fontFamily: F.body, marginTop: 2 }}>
                  🔥 {weekStats.streak}{lang === 'ko' ? '일 연속' : '-day streak'}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <span style={{ fontSize: 9, color: T.inkFaint, fontFamily: F.body }}>{lang === 'ko' ? '적음' : 'less'}</span>
              {[0,1,2,3,4].map(lv => (
                <div key={lv} style={{ width: 9, height: 9, borderRadius: 2, background: lv === 0 ? T.border : T.accent, opacity: lv === 0 ? 1 : lv * 0.25 + 0.1 }} />
              ))}
              <span style={{ fontSize: 9, color: T.inkFaint, fontFamily: F.body }}>{lang === 'ko' ? '많음' : 'more'}</span>
            </div>
          </div>
          {/* 13 weeks × 7 days grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(13, 1fr)', gap: 3 }}>
            {(() => {
              const days = Object.entries(heatmap);
              // Group into 13 weeks (91 days, skip first if needed for 90)
              const weeks = [];
              for (let w = 0; w < 13; w++) weeks.push(days.slice(w * 7, w * 7 + 7));
              return weeks.map((week, wi) => (
                <div key={wi} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {week.map(([date, mins]) => {
                    const lv = heatIntensity(mins);
                    const isToday = date === new Date().toISOString().slice(0, 10);
                    return (
                      <div key={date} title={`${date}: ${mins}m`} style={{
                        width: '100%', paddingBottom: '100%', borderRadius: 2, position: 'relative',
                        background: isToday ? T.ink : lv === 0 ? T.border : T.accent,
                        opacity: isToday ? 1 : lv === 0 ? 0.5 : lv * 0.22 + 0.18,
                      }} />
                    );
                  })}
                </div>
              ));
            })()}
          </div>
        </div>
      </div>

      {/* ── 3-3: 독서 속도 트래커 ── */}
      {readSpeed && (
        <div style={{ padding: '12px 22px 0' }}>
          <div style={{ background: T.surface, borderRadius: 16, padding: 18, border: `1px solid ${T.border}` }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: T.inkLight, letterSpacing: 1.4, textTransform: 'uppercase', fontFamily: F.body, marginBottom: 12 }}>
              {lang === 'ko' ? '독서 속도' : 'Reading Speed'}
            </div>
            <div style={{ display: 'flex', gap: 0 }}>
              {[
                { v: readSpeed.pagesPerMin.toFixed(1), l: lang === 'ko' ? '페이지/분' : 'pages/min' },
                { v: `${Math.round(readSpeed.pagesPerMin * 30)}`, l: lang === 'ko' ? '30분당 페이지' : 'pages/30 min' },
                { v: readSpeed.sessionCount, l: lang === 'ko' ? '세션 수' : 'sessions' },
              ].map((s, i) => (
                <div key={i} style={{ flex: 1, textAlign: 'center', borderLeft: i > 0 ? `1px solid ${T.border}` : 'none' }}>
                  <div style={{ fontSize: 22, fontWeight: 700, color: T.ink, fontFamily: 'serif', letterSpacing: -0.5 }}>{s.v}</div>
                  <div style={{ fontSize: 10, color: T.inkLight, fontFamily: F.body, marginTop: 2 }}>{s.l}</div>
                </div>
              ))}
            </div>
            {completion && (
              <div style={{ marginTop: 14, padding: '10px 14px', background: T.accentSoft, borderRadius: 10 }}>
                <div style={{ fontSize: 12, color: T.accent, fontWeight: 600, fontFamily: F.body }}>
                  📖 {lang === 'ko' ? `현재 책 완독까지 약 ${completion.daysLeft || '?'}일 · ${completion.remaining}p 남음` : `~${completion.daysLeft || '?'} days to finish · ${completion.remaining}p left`}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── 3-5: 배지 ── */}
      {badges.length > 0 && (
        <div style={{ padding: '12px 22px 0' }}>
          <div style={{ background: T.surface, borderRadius: 16, padding: 18, border: `1px solid ${T.border}` }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: T.inkLight, letterSpacing: 1.4, textTransform: 'uppercase', fontFamily: F.body, marginBottom: 12 }}>
              {lang === 'ko' ? '획득 배지' : 'Badges Earned'}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {badges.map(b => {
                const def = BADGE_DEFS[b.id];
                return (
                  <div key={b.id} style={{ background: T.accentSoft, borderRadius: 10, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 6, border: `1px solid ${T.accent}30` }}>
                    <span style={{ fontSize: 18 }}>{b.emoji}</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: T.accent, fontFamily: F.body }}>
                      {def ? (lang === 'ko' ? def.ko : def.en) : b.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── 3-2: 독서 알림 설정 ── */}
      <div style={{ padding: '12px 22px 24px' }}>
        <div style={{ background: T.surface, borderRadius: 16, padding: 18, border: `1px solid ${T.border}` }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: T.inkLight, letterSpacing: 1.4, textTransform: 'uppercase', fontFamily: F.body, marginBottom: 12 }}>
            {lang === 'ko' ? '일일 독서 알림' : 'Daily Reading Reminder'}
          </div>
          {notifPermission === 'denied' ? (
            <div style={{ fontSize: 12, color: T.inkMid, fontFamily: F.body }}>
              {lang === 'ko' ? '알림이 차단됐습니다. 브라우저 설정에서 허용해주세요.' : 'Notifications blocked. Allow them in browser settings.'}
            </div>
          ) : notifPermission !== 'granted' ? (
            <button onClick={requestNotifPermission} style={{ width: '100%', padding: '12px', borderRadius: 10, border: 'none', background: T.ink, color: T.surface, fontSize: 13, fontWeight: 600, fontFamily: F.body, cursor: 'pointer' }}>
              🔔 {lang === 'ko' ? '알림 허용하기' : 'Enable Notifications'}
            </button>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', flex: 1 }}>
                <input type="checkbox" checked={notifSettings.enabled} onChange={e => updateNotifSettings({ enabled: e.target.checked })} style={{ width: 18, height: 18, cursor: 'pointer' }} />
                <span style={{ fontSize: 13, color: T.ink, fontFamily: F.body }}>
                  {lang === 'ko' ? '매일 독서 알림' : 'Daily reminder'}
                </span>
              </label>
              {notifSettings.enabled && (
                <input type="time" value={notifSettings.time} onChange={e => updateNotifSettings({ time: e.target.value })} style={{ border: `1px solid ${T.border}`, borderRadius: 8, padding: '6px 10px', fontSize: 13, fontFamily: F.mono, color: T.ink, background: T.surfaceAlt, outline: 'none' }} />
              )}
            </div>
          )}
          {notifPermission === 'granted' && notifSettings.enabled && (
            <p style={{ margin: '10px 0 0', fontSize: 10.5, color: T.inkFaint, fontFamily: F.body, lineHeight: 1.5 }}>
              {lang === 'ko' ? '앱이 열려 있을 때만 알림이 울립니다.' : 'Reminders only fire while the app is open.'}
            </p>
          )}
        </div>
      </div>

      {/* ── 5-4: AI 독서 코치 ── */}
      <div style={{ padding: '12px 22px 24px' }}>
        <div style={{ background: T.surface, borderRadius: 16, padding: 18, border: `1px solid ${T.border}` }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: T.inkLight, letterSpacing: 1.4, textTransform: 'uppercase', fontFamily: F.body, marginBottom: 14 }}>
            {lang === 'ko' ? '🤖 AI 독서 코치' : '🤖 AI Reading Coach'}
          </div>
          {!coachResponse ? (
            <button
              onClick={askCoach}
              disabled={coachLoading}
              style={{
                width: '100%', padding: '12px', borderRadius: 10, border: 'none',
                background: coachLoading ? T.border : T.accent,
                color: '#fff', fontSize: 13, fontWeight: 600,
                cursor: coachLoading ? 'default' : 'pointer',
                fontFamily: F.body,
                opacity: coachLoading ? 0.6 : 1,
              }}
            >
              {coachLoading ? `${lang === 'ko' ? '분석 중...' : 'Analyzing...'}` : `${lang === 'ko' ? '이번 주 독서 분석 받기' : 'Get weekly analysis'}`}
            </button>
          ) : (
            <>
              <div style={{ background: T.surfaceAlt, borderRadius: 10, padding: 12, marginBottom: 12, fontSize: 13, lineHeight: 1.6, color: T.ink, fontFamily: F.body }}>
                {coachResponse}
              </div>
              <button
                onClick={() => { setCoachResponse(''); setCoachData(null); }}
                style={{
                  width: '100%', padding: '10px', borderRadius: 10, border: `1px solid ${T.border}`,
                  background: 'transparent', color: T.inkMid, fontSize: 13, fontFamily: F.body,
                  cursor: 'pointer',
                }}
              >
                {lang === 'ko' ? '다시 분석하기' : 'Analyze again'}
              </button>
            </>
          )}
          {coachError && (
            <div style={{ marginTop: 12, fontSize: 12, color: '#d32f2f', fontFamily: F.body }}>
              ⚠️ {coachError}
            </div>
          )}
        </div>
      </div>
      </>}

      {/* ── 독서 전략 탭 — 전체 스캔(RAG) + 실제 독서 속도로 맞춤 목표 생성 ── */}
      {goalsTab === 'strategy' && (
        <div style={{ padding: '0 22px 32px' }}>
          {!currentBook ? (
            <div style={{ padding: '40px 4px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, textAlign: 'center' }}>
              <div style={{ width: 64, height: 64, borderRadius: 18, background: T.accentSoft, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="goals" size={28} color={T.accent} />
              </div>
              <div style={{ fontSize: 13, color: T.inkLight, fontFamily: F.body, lineHeight: 1.65, maxWidth: 260 }}>
                {lang === 'ko' ? '서재에서 책을 열면 그 책의 독서 전략을 세울 수 있어요.' : 'Open a book from your library to build a reading strategy for it.'}
              </div>
            </div>
          ) : (
            <>
              <div style={{ background: T.accentSoft, borderRadius: 14, padding: '12px 14px', border: `1px solid ${T.accent}22`, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
                <Icon name="library" size={16} color={T.accent} />
                <div style={{ fontSize: 13, color: T.ink, fontFamily: 'serif', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{currentBook.title}</div>
              </div>

              <button
                onClick={runGenerateStrategy}
                disabled={strategyLoading}
                style={{ width: '100%', padding: '13px 0', borderRadius: 12, border: 'none', background: strategyLoading ? T.border : T.accent, color: '#FFF', fontSize: 13.5, fontWeight: 700, fontFamily: F.body, cursor: strategyLoading ? 'default' : 'pointer', marginBottom: 10 }}
              >
                {strategyLoading
                  ? (lang === 'ko' ? '전략 생성 중…' : 'Generating…')
                  : strategy
                    ? (lang === 'ko' ? '🔄 전략 다시 생성' : '🔄 Regenerate strategy')
                    : (lang === 'ko' ? '📋 AI 독서 전략 생성' : '📋 Generate AI reading strategy')}
              </button>

              {strategyError && (
                <div style={{ fontSize: 12, color: '#C0392B', fontFamily: F.body, marginBottom: 14, lineHeight: 1.55 }}>
                  ⚠️ {strategyError}
                </div>
              )}

              {strategy && (
                <div style={{ background: T.surface, borderRadius: 16, padding: 18, border: `1px solid ${T.border}` }}>
                  {/* 난이도 */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: T.accent, background: T.accentSoft, padding: '4px 10px', borderRadius: 999, fontFamily: F.body }}>
                      {lang === 'ko' ? '난이도' : 'Difficulty'} · {strategy.difficulty || '—'}
                    </span>
                  </div>
                  {strategy.difficultyReason && (
                    <div style={{ fontSize: 12.5, color: T.inkMid, fontFamily: F.body, lineHeight: 1.6, marginBottom: 16 }}>{strategy.difficultyReason}</div>
                  )}

                  {/* 목표 */}
                  <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
                    <div style={{ flex: 1, background: T.surfaceAlt, borderRadius: 12, padding: '12px 14px', border: `1px solid ${T.border}` }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: T.inkLight, letterSpacing: 1, textTransform: 'uppercase', fontFamily: F.body, marginBottom: 4 }}>{lang === 'ko' ? '일일 목표' : 'Daily target'}</div>
                      <div style={{ fontSize: 20, fontWeight: 700, color: T.ink, fontFamily: F.mono }}>{strategy.dailyPageTarget}<span style={{ fontSize: 12, color: T.inkLight }}>p</span></div>
                    </div>
                    <div style={{ flex: 1, background: T.surfaceAlt, borderRadius: 12, padding: '12px 14px', border: `1px solid ${T.border}` }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: T.inkLight, letterSpacing: 1, textTransform: 'uppercase', fontFamily: F.body, marginBottom: 4 }}>{lang === 'ko' ? '예상 완독' : 'Est. finish'}</div>
                      <div style={{ fontSize: 20, fontWeight: 700, color: T.ink, fontFamily: F.mono }}>{strategy.estimatedDays}<span style={{ fontSize: 12, color: T.inkLight }}>{lang === 'ko' ? '일' : 'd'}</span></div>
                    </div>
                  </div>

                  {/* 집중 영역 */}
                  {strategy.focusAreas?.length > 0 && (
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: T.inkLight, letterSpacing: 1.2, textTransform: 'uppercase', fontFamily: F.body, marginBottom: 8 }}>
                        {lang === 'ko' ? '집중해서 볼 부분' : 'Focus areas'}
                      </div>
                      {strategy.focusAreas.map((f, i) => (
                        <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6, fontSize: 12.5, color: T.inkMid, fontFamily: F.body, lineHeight: 1.55 }}>
                          <span style={{ color: T.accent, flexShrink: 0 }}>▸</span><span>{f}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* 마일스톤 */}
                  {strategy.milestones?.length > 0 && (
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: T.inkLight, letterSpacing: 1.2, textTransform: 'uppercase', fontFamily: F.body, marginBottom: 8 }}>
                        {lang === 'ko' ? '마일스톤' : 'Milestones'}
                      </div>
                      {strategy.milestones.map((m, i) => (
                        <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'baseline', marginBottom: 8, paddingLeft: 2 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: T.accent, fontFamily: F.body, minWidth: 44, flexShrink: 0 }}>{m.label}</span>
                          <span style={{ fontSize: 12.5, color: T.inkMid, fontFamily: F.body, lineHeight: 1.5 }}>{m.goal}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
