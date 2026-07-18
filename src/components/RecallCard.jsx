import { useMemo, useState } from 'react';
import { useTheme } from '../context.jsx';
import { callAI } from '../aiClient.js';
import { pickRecallCandidates, buildRecallQuizPrompt, parseRecallQuiz } from '../utils/knowledgeRecall.js';
import { getWikiConfig, getWikiIndex, getRecallLog, recordRecall } from '../store.js';

/* ── 지식 정착 복습 — 오래됨×중심성×약점 순으로 고른 노트를 능동 회상시킨다:
   질문 → 스스로 떠올림 → 정답(노트 내용) 확인 → 자기 평가 → 기록.
   AI 키가 없으면 폴백 질문으로도 동작. 위키 연결 + 후보가 있을 때만. */
export function RecallCard({ lang, apiKeys }) {
  const { T, F } = useTheme();
  const ko = lang === 'ko';

  const candidates = useMemo(() => {
    if (!getWikiConfig().connected) return [];
    return pickRecallCandidates(getWikiIndex(), getRecallLog());
  }, []);

  const [session, setSession] = useState(null);  // [{note, question}]
  const [idx, setIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [results, setResults] = useState([]);    // [{noteId, ok}]
  const [loading, setLoading] = useState(false);

  if (!candidates.length) return null;

  async function start() {
    setLoading(true);
    const notes = candidates.map(c => c.note);
    let questions;
    try {
      const raw = await callAI(apiKeys, buildRecallQuizPrompt(notes, lang), [], ko ? '만들어줘' : 'Generate');
      questions = parseRecallQuiz(raw, notes, lang);
    } catch {
      questions = parseRecallQuiz('', notes, lang);   // AI 실패 → 폴백 질문
    }
    setSession(notes.map(n => ({ note: n, question: questions.get(n.id) })));
    setIdx(0); setRevealed(false); setResults([]);
    setLoading(false);
  }

  function grade(ok) {
    const cur = session[idx];
    recordRecall(cur.note.id, ok);
    const nextResults = [...results, { noteId: cur.note.id, ok }];
    setResults(nextResults);
    if (idx + 1 < session.length) { setIdx(idx + 1); setRevealed(false); }
    else setIdx(session.length);   // 완료 화면
  }

  function close() { setSession(null); setIdx(0); setRevealed(false); setResults([]); }

  const done = session && idx >= session.length;
  const cur = session && !done ? session[idx] : null;
  const okCount = results.filter(r => r.ok).length;

  return (
    <div style={{ background: T.surface, borderRadius: 14, padding: '13px 15px', border: `1px solid ${T.border}`, marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: T.ink, fontFamily: F.body }}>
          🔁 {ko ? '지식 정착 복습' : 'Knowledge recall'}
        </div>
        {session && (
          <button onClick={close} style={{ fontSize: 11, fontWeight: 600, color: T.inkMid, background: 'transparent', border: `1px solid ${T.border}`, borderRadius: 8, padding: '4px 10px', cursor: 'pointer', fontFamily: F.body }}>
            {ko ? '닫기' : 'Close'}
          </button>
        )}
      </div>

      {!session && (
        <>
          <div style={{ fontSize: 11.5, color: T.inkMid, fontFamily: F.body, lineHeight: 1.5, margin: '4px 0 10px' }}>
            {ko ? `오래됐거나 허브이거나 자주 틀린 노트 ${candidates.length}개를 골랐어요. 떠올려서 기억에 정착시켜요.`
                : `${candidates.length} notes picked by staleness × centrality × weakness. Recall them to make them stick.`}
          </div>
          <button
            onClick={start}
            disabled={loading}
            style={{ fontSize: 12, fontWeight: 700, color: '#fff', background: loading ? T.border : T.accent, border: 'none', borderRadius: 9, padding: '9px 16px', cursor: loading ? 'default' : 'pointer', fontFamily: F.body }}
          >
            {loading ? (ko ? '질문 만드는 중…' : 'Preparing…') : (ko ? `오늘의 복습 시작 (${candidates.length})` : `Start today's recall (${candidates.length})`)}
          </button>
        </>
      )}

      {cur && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 10.5, color: T.inkLight, fontFamily: F.body, marginBottom: 6 }}>
            {idx + 1} / {session.length} · {ko ? '힌트' : 'hint'}: 《{cur.note.title}》
          </div>
          <div style={{ background: T.accentSoft, borderRadius: 11, padding: '11px 12px', fontSize: 13, color: T.ink, fontFamily: F.body, lineHeight: 1.6 }}>
            ❓ {cur.question}
          </div>

          {!revealed ? (
            <button
              onClick={() => setRevealed(true)}
              style={{ marginTop: 10, fontSize: 12, fontWeight: 700, color: T.accent, background: 'transparent', border: `1px solid ${T.accent}55`, borderRadius: 9, padding: '8px 14px', cursor: 'pointer', fontFamily: F.body }}
            >
              {ko ? '떠올렸어요 — 정답 보기' : 'I tried — reveal answer'}
            </button>
          ) : (
            <>
              <div style={{ marginTop: 10, background: T.surfaceAlt, borderRadius: 11, padding: '11px 12px', maxHeight: 180, overflowY: 'auto', fontSize: 12, color: T.inkMid, fontFamily: F.body, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                {(cur.note.content || cur.note.excerpt || '').slice(0, 800)}
                {cur.note.webViewLink && (
                  <div style={{ marginTop: 6 }}>
                    <a href={cur.note.webViewLink} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: T.accent, fontWeight: 700 }}>
                      {ko ? '원문 열기 ↗' : 'Open note ↗'}
                    </a>
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button onClick={() => grade(true)} style={{ flex: 1, fontSize: 12, fontWeight: 700, color: '#fff', background: T.accent, border: 'none', borderRadius: 9, padding: '9px 0', cursor: 'pointer', fontFamily: F.body }}>
                  ✅ {ko ? '기억했어요' : 'Recalled'}
                </button>
                <button onClick={() => grade(false)} style={{ flex: 1, fontSize: 12, fontWeight: 700, color: T.ink, background: T.surfaceAlt, border: `1px solid ${T.border}`, borderRadius: 9, padding: '9px 0', cursor: 'pointer', fontFamily: F.body }}>
                  ❌ {ko ? '못 떠올렸어요' : 'Missed'}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {done && (
        <div style={{ marginTop: 10, fontSize: 12.5, color: T.ink, fontFamily: F.body, lineHeight: 1.6 }}>
          🎉 {ko
            ? `복습 완료 — ${session.length}개 중 ${okCount}개 기억! 못 떠올린 노트는 다음 복습에서 먼저 나와요.`
            : `Done — recalled ${okCount} of ${session.length}. Missed notes will surface first next time.`}
        </div>
      )}
    </div>
  );
}
