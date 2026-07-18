import { useMemo, useRef, useState } from 'react';
import { useTheme } from '../context.jsx';
import { callAI } from '../aiClient.js';
import { buildKnowledgeGraph } from '../utils/knowledgeGraph.js';
import { findDeepDiveTopics, buildDeepDivePrompt, openingUserMsg } from '../utils/deepDive.js';
import { gatherTopicNotes } from '../utils/wikiEvolution.js';
import {
  getBookIndex, getBookMeta, getAllHighlightsByBook,
  getWikiConfig, getWikiIndex,
} from '../store.js';

/* ── 개념 심화 문답 — 개념을 고르면 서재가 노트·책을 근거로 소크라테스식 질문을
   던지며 이해를 벼린다(멀티턴 스파링). 위키 연결 + 신호 있는 주제가 있을 때만. */
export function DeepDiveCard({ lang, apiKeys }) {
  const { T, F } = useTheme();
  const ko = lang === 'ko';

  const topics = useMemo(() => {
    if (!getWikiConfig().connected) return [];
    const books = getBookIndex().map(b => ({ id: b.id, title: b.title, aiTopics: getBookMeta(b.id)?.aiTopics || [] }));
    return findDeepDiveTopics(buildKnowledgeGraph(books, getWikiIndex()));
  }, []);

  const [active, setActive] = useState(null);      // 진행 중인 주제
  const [messages, setMessages] = useState([]);    // [{role:'ai'|'user', content}]
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [err, setErr] = useState('');
  const sysRef = useRef('');

  if (!topics.length) return null;

  function buildSources(t) {
    return {
      notes: gatherTopicNotes(t.topic, getWikiIndex()),
      books: t.bookIds.map(id => ({
        title: getBookIndex().find(b => b.id === id)?.title || id,
        summary: getBookMeta(id)?.aiSummary || '',
        highlights: getAllHighlightsByBook(id).map(h => h.text).filter(Boolean).slice(0, 5),
      })),
    };
  }

  async function start(t) {
    setActive(t); setMessages([]); setErr(''); setThinking(true);
    sysRef.current = buildDeepDivePrompt(t.topic, buildSources(t), lang);
    try {
      const q = await callAI(apiKeys, sysRef.current, [], openingUserMsg(lang));
      setMessages([{ role: 'ai', content: String(q || '').trim() }]);
    } catch {
      setErr(ko ? '문답을 시작하지 못했어요 (AI 키를 확인하세요)' : 'Could not start (check AI key)');
      setActive(null);
    } finally { setThinking(false); }
  }

  async function send() {
    const text = input.trim();
    if (!text || thinking) return;
    setInput(''); setErr('');
    const next = [...messages, { role: 'user', content: text }];
    setMessages(next); setThinking(true);
    try {
      const reply = await callAI(apiKeys, sysRef.current, next.slice(0, -1), text);
      setMessages([...next, { role: 'ai', content: String(reply || '').trim() }]);
    } catch {
      setErr(ko ? '응답에 실패했어요' : 'Reply failed');
    } finally { setThinking(false); }
  }

  function end() { setActive(null); setMessages([]); setInput(''); setErr(''); }

  return (
    <div style={{ background: T.surface, borderRadius: 14, padding: '13px 15px', border: `1px solid ${T.border}`, marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: T.ink, fontFamily: F.body }}>
          🥊 {ko ? '개념 심화 문답' : 'Concept sparring'}
        </div>
        {active && (
          <button onClick={end} style={{ fontSize: 11, fontWeight: 600, color: T.inkMid, background: 'transparent', border: `1px solid ${T.border}`, borderRadius: 8, padding: '4px 10px', cursor: 'pointer', fontFamily: F.body }}>
            {ko ? '끝내기' : 'End'}
          </button>
        )}
      </div>

      {!active && (
        <>
          <div style={{ fontSize: 11.5, color: T.inkMid, fontFamily: F.body, lineHeight: 1.5, margin: '4px 0 10px' }}>
            {ko ? '개념을 고르면, 당신의 노트와 읽은 책을 근거로 서재가 질문을 던지며 이해를 벼려줘요.'
                : 'Pick a concept — your library will spar with you, grounded in your notes and books.'}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {topics.map(t => (
              <button
                key={t.key}
                onClick={() => start(t)}
                disabled={thinking}
                style={{ fontSize: 11.5, fontWeight: 600, fontFamily: F.body, borderRadius: 999, padding: '6px 11px', cursor: thinking ? 'default' : 'pointer', border: `1px solid ${T.border}`, background: 'transparent', color: T.inkMid }}
              >
                {t.topic} <span style={{ color: T.inkLight }}>· {ko ? `노트 ${t.noteCount}·책 ${t.bookCount}` : `${t.noteCount}n·${t.bookCount}b`}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {active && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 11, color: T.accentDeep, fontWeight: 700, fontFamily: F.body, marginBottom: 8 }}>
            {active.topic} {ko ? '스파링 중' : 'sparring'}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7, maxHeight: 300, overflowY: 'auto' }}>
            {messages.map((m, i) => (
              <div
                key={i}
                style={{
                  alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '88%',
                  background: m.role === 'user' ? T.accent : T.accentSoft,
                  color: m.role === 'user' ? '#fff' : T.ink,
                  borderRadius: 12, padding: '9px 12px', fontSize: 12.5, fontFamily: F.body, lineHeight: 1.6, whiteSpace: 'pre-wrap',
                }}
              >
                {m.content}
              </div>
            ))}
            {thinking && (
              <div style={{ alignSelf: 'flex-start', fontSize: 12, color: T.inkLight, fontFamily: F.body }}>
                🥊 {ko ? '질문 준비 중…' : 'thinking…'}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 7, marginTop: 10 }}>
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder={ko ? '당신의 답을 쓰세요… (Enter 전송)' : 'Your answer… (Enter to send)'}
              rows={2}
              style={{ flex: 1, resize: 'none', borderRadius: 10, border: `1px solid ${T.border}`, background: T.surfaceAlt, color: T.ink, fontSize: 12.5, fontFamily: F.body, padding: '8px 10px', lineHeight: 1.5, outline: 'none' }}
            />
            <button
              onClick={send}
              disabled={thinking || !input.trim()}
              style={{ alignSelf: 'flex-end', fontSize: 12, fontWeight: 700, color: '#fff', background: thinking || !input.trim() ? T.border : T.accent, border: 'none', borderRadius: 9, padding: '9px 14px', cursor: thinking || !input.trim() ? 'default' : 'pointer', fontFamily: F.body }}
            >
              {ko ? '답하기' : 'Send'}
            </button>
          </div>
        </div>
      )}

      {err && <div style={{ marginTop: 8, fontSize: 11.5, color: '#C0392B', fontFamily: F.body }}>⚠️ {err}</div>}
    </div>
  );
}
