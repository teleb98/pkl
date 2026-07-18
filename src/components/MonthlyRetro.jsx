import { useState, useMemo, useRef, useEffect } from 'react';
import { useTheme } from '../context.jsx';
import { Icon } from '../components.jsx';
import { getRetroCandidates, generateMonthlyRetro } from '../utils/monthlyRetro.js';

/* ── 다권 종합 회고 패널 ──────────────────────────────────────
   BookCompare(2권 비교)를 일반화 — 최근 기간에 읽은 여러 책을
   세션 기록에서 자동으로 뽑아 AI가 공통 주제·시너지·다음 스텝을 종합.
   generateMonthlyRetro 가 aiClient.js 의 callAI 를 직접 호출하므로
   apiKeys 만 전달하면 된다(BookCompare 처럼 래퍼 함수 불필요). */
export function MonthlyRetro({ lang, apiKeys }) {
  const { T, F } = useTheme();
  const [periodDays, setPeriodDays] = useState(30);
  const [selected, setSelected] = useState(() => new Set());
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const scrollRef = useRef(null);

  const candidates = useMemo(() => getRetroCandidates(periodDays), [periodDays]);

  // 기간이 바뀌면 새 후보 전체를 기본 선택
  useEffect(() => {
    setSelected(new Set(candidates.map(c => c.bookId)));
    setResult(null);
    setError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodDays]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [result]);

  const toggle = (bookId) => {
    setSelected(s => {
      const next = new Set(s);
      if (next.has(bookId)) next.delete(bookId); else next.add(bookId);
      return next;
    });
  };

  const selectedBooks = candidates.filter(c => selected.has(c.bookId));

  const periodLabel = {
    7:  lang === 'ko' ? '최근 7일' : 'Last 7 days',
    30: lang === 'ko' ? '최근 30일' : 'Last 30 days',
    90: lang === 'ko' ? '최근 90일' : 'Last 90 days',
  };

  const run = async () => {
    if (!selectedBooks.length || loading) return;
    if (!apiKeys?.claude && !apiKeys?.gemini) {
      setError(lang === 'ko' ? 'AI 키를 설정해주세요.' : 'Set an AI key first.');
      return;
    }
    setLoading(true);
    setResult(null);
    setError('');
    try {
      const reply = await generateMonthlyRetro(selectedBooks, { lang, apiKeys });
      setResult(reply);
    } catch (e) {
      setError(lang === 'ko' ? `오류: ${e.message}` : `Error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* 설정 패널 */}
      <div style={{ padding: '16px 18px', borderBottom: `1px solid ${T.border}`, background: T.surfaceAlt, flexShrink: 0 }}>
        {/* 기간 선택 */}
        <div style={{ display: 'flex', gap: 5, marginBottom: 12 }}>
          {[7, 30, 90].map(d => (
            <button
              key={d}
              onClick={() => setPeriodDays(d)}
              style={{
                flex: 1, padding: '7px 0', borderRadius: 10, cursor: 'pointer',
                border: `1px solid ${periodDays === d ? T.accent : T.border}`,
                background: periodDays === d ? T.accentSoft : T.surface,
                color: periodDays === d ? T.accentDeep : T.inkMid,
                fontSize: 12, fontWeight: periodDays === d ? 700 : 400, fontFamily: F.body,
              }}
            >
              {periodLabel[d]}
            </button>
          ))}
        </div>

        {/* 후보 책 목록(체크리스트) */}
        {candidates.length === 0 ? (
          <div style={{ fontSize: 12.5, color: T.inkLight, fontFamily: F.body, padding: '10px 2px', lineHeight: 1.6 }}>
            {lang === 'ko' ? `${periodLabel[periodDays]} 동안 읽은 기록이 없어요.` : `No reading recorded in the ${periodLabel[periodDays].toLowerCase()}.`}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12, maxHeight: 180, overflowY: 'auto' }}>
            {candidates.map(c => (
              <label key={c.bookId} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 9px', borderRadius: 9, background: T.surface, border: `1px solid ${T.border}`, cursor: 'pointer' }}>
                <input type="checkbox" checked={selected.has(c.bookId)} onChange={() => toggle(c.bookId)} style={{ accentColor: T.accent }} />
                <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: T.ink, fontFamily: F.body, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.bookTitle}</span>
                <span style={{ fontSize: 10.5, color: T.inkLight, fontFamily: F.mono, flexShrink: 0 }}>{c.minutes}m</span>
              </label>
            ))}
          </div>
        )}

        {selectedBooks.length === 1 && (
          <div style={{ fontSize: 11, color: T.inkLight, fontFamily: F.body, marginBottom: 8 }}>
            {lang === 'ko' ? '💡 2권 이상 선택하면 더 풍부한 인사이트를 얻을 수 있어요.' : '💡 Select 2+ books for richer cross-book insight.'}
          </div>
        )}

        <button
          onClick={run}
          disabled={!selectedBooks.length || loading}
          style={{
            width: '100%', padding: '10px', borderRadius: 10, border: 'none',
            background: !selectedBooks.length ? T.border : T.accent,
            color: '#fff', fontSize: 13, fontWeight: 600, fontFamily: F.body,
            cursor: (!selectedBooks.length || loading) ? 'default' : 'pointer',
            opacity: loading ? 0.7 : 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
          }}
        >
          <Icon name="spark" size={14} color="#fff" />
          {loading
            ? (lang === 'ko' ? '회고 작성 중…' : 'Writing retro…')
            : (lang === 'ko' ? `${selectedBooks.length}권 종합 회고 시작` : `Synthesize ${selectedBooks.length} books`)}
        </button>

        {error && (
          <div style={{ marginTop: 8, fontSize: 12, color: '#d32f2f', fontFamily: F.body }}>⚠️ {error}</div>
        )}
      </div>

      {/* 결과 */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '18px 20px' }}>
        {!result && !loading && (
          <div style={{ textAlign: 'center', color: T.inkLight, fontFamily: F.body, fontSize: 13, padding: '48px 0' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>📚✨</div>
            <div style={{ fontWeight: 600, marginBottom: 6, color: T.inkMid }}>
              {lang === 'ko' ? '최근 읽은 책들을 종합 회고해보세요' : 'Get a synthesis of your recent reads'}
            </div>
            <div style={{ fontSize: 12, lineHeight: 1.7 }}>
              {lang === 'ko'
                ? '공통 주제, 연결점, 다음 스텝을 AI가 분석합니다'
                : 'AI analyzes common themes, connections, and next steps'}
            </div>
          </div>
        )}

        {loading && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: '48px 0', color: T.inkMid, fontFamily: F.body }}>
            <div style={{ display: 'flex', gap: 6 }}>
              {[0, 1, 2].map(i => (
                <div key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: T.accent, animation: `pulse 1.2s ${i * 0.2}s infinite` }} />
              ))}
            </div>
            <style>{`@keyframes pulse{0%,100%{opacity:.3;transform:scale(.9)}50%{opacity:1;transform:scale(1)}}`}</style>
            <div style={{ fontSize: 13 }}>
              {lang === 'ko' ? `${selectedBooks.length}권 종합 분석 중…` : `Synthesizing ${selectedBooks.length} books…`}
            </div>
          </div>
        )}

        {result && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, paddingBottom: 12, borderBottom: `1px solid ${T.border}` }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.ink, fontFamily: F.body }}>
                {lang === 'ko' ? '📚 종합 회고 결과' : '📚 Synthesis Result'}
              </div>
              <div style={{ fontSize: 11, color: T.inkLight, fontFamily: F.body }}>
                {selectedBooks.map(b => b.bookTitle).join(' · ')}
              </div>
            </div>
            <div style={{ fontSize: 13.5, color: T.ink, fontFamily: F.body, lineHeight: 1.8, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {result}
            </div>
            <button
              onClick={() => setResult(null)}
              style={{ marginTop: 20, padding: '8px 16px', borderRadius: 8, border: `1px solid ${T.border}`, background: 'transparent', color: T.inkMid, fontSize: 12, fontFamily: F.body, cursor: 'pointer' }}
            >
              {lang === 'ko' ? '다시 회고하기' : 'Retro again'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
