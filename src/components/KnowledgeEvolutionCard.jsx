import { useMemo, useState } from 'react';
import { useTheme } from '../context.jsx';
import { callAI } from '../aiClient.js';
import { buildKnowledgeGraph, findEvolvingTopics } from '../utils/knowledgeGraph.js';
import { gatherTopicNotes, buildEvolutionPrompt } from '../utils/wikiEvolution.js';
import { getBookIndex, getBookMeta, getWikiConfig, getWikiIndex } from '../store.js';

/* ── 관점의 진화 — 한 주제로 쌓인 위키 노트를 시간순으로 종합해 "생각의 흐름"과
   "긴장·모순"을 AI가 서사로 짚어준다(읽기 전용 인사이트). 노트 2개 이상 쌓인 주제만. */
export function KnowledgeEvolutionCard({ lang, apiKeys }) {
  const { T, F } = useTheme();
  const ko = lang === 'ko';

  const topics = useMemo(() => {
    if (!getWikiConfig().connected) return [];
    const books = getBookIndex().map(b => ({ id: b.id, title: b.title, aiTopics: getBookMeta(b.id)?.aiTopics || [] }));
    return findEvolvingTopics(buildKnowledgeGraph(books, getWikiIndex())).slice(0, 5);
  }, []);

  const [active, setActive] = useState(null);
  const [text, setText] = useState('');
  const [status, setStatus] = useState('idle'); // idle | thinking | done | error
  const [err, setErr] = useState('');

  if (!topics.length) return null;

  async function synthesize(topic) {
    setActive(topic); setText(''); setErr(''); setStatus('thinking');
    try {
      const notes = gatherTopicNotes(topic.topic, getWikiIndex());
      const books = topic.bookIds.map(id => ({
        title: getBookIndex().find(b => b.id === id)?.title || id,
        summary: getBookMeta(id)?.aiSummary || '',
      }));
      const raw = await callAI(apiKeys, buildEvolutionPrompt(topic.topic, notes, books, lang), [], ko ? '정리해줘' : 'Summarize');
      setText(String(raw || '').replace(/^```[a-z]*\s*|\s*```$/g, '').trim());
      setStatus('done');
    } catch {
      setStatus('error');
      setErr(ko ? '종합에 실패했어요 (AI 키를 확인하세요)' : 'Synthesis failed (check AI key)');
    }
  }

  const busy = status === 'thinking';

  return (
    <div style={{ background: T.surface, borderRadius: 14, padding: '13px 15px', border: `1px solid ${T.border}`, marginBottom: 14 }}>
      <div style={{ fontSize: 12.5, fontWeight: 700, color: T.ink, fontFamily: F.body, marginBottom: 4 }}>
        🌱 {ko ? '관점의 진화' : 'How your view evolved'}
      </div>
      <div style={{ fontSize: 11.5, color: T.inkMid, fontFamily: F.body, lineHeight: 1.5, marginBottom: 10 }}>
        {ko ? '여러 노트가 쌓인 주제예요. 생각이 어떻게 바뀌었는지, 모순은 없는지 AI가 짚어줘요.'
            : 'Topics with several notes. AI traces how your thinking changed and flags tensions.'}
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {topics.map(t => (
          <button
            key={t.key}
            onClick={() => synthesize(t)}
            disabled={busy}
            style={{
              fontSize: 11.5, fontWeight: 600, fontFamily: F.body, borderRadius: 999, padding: '6px 11px', cursor: busy ? 'default' : 'pointer',
              border: `1px solid ${active?.key === t.key ? T.accent : T.border}`,
              background: active?.key === t.key ? T.accentSoft : 'transparent',
              color: active?.key === t.key ? T.accentDeep : T.inkMid,
            }}
          >
            {t.topic} <span style={{ color: T.inkLight }}>· {ko ? `노트 ${t.noteCount}` : t.noteCount}</span>
          </button>
        ))}
      </div>

      {status === 'thinking' && (
        <div style={{ marginTop: 12, fontSize: 12, color: T.inkMid, fontFamily: F.body }}>🌱 {ko ? `"${active.topic}" 생각의 흐름 종합 중…` : `Synthesizing "${active.topic}"…`}</div>
      )}
      {text && status === 'done' && (
        <div style={{ marginTop: 12, background: T.accentSoft, borderRadius: 11, padding: '11px 12px', maxHeight: 320, overflowY: 'auto', fontSize: 12, color: T.ink, fontFamily: F.body, lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>
          {text}
        </div>
      )}
      {status === 'error' && (
        <div style={{ marginTop: 10, fontSize: 11.5, color: '#C0392B', fontFamily: F.body }}>⚠️ {err}</div>
      )}
    </div>
  );
}
