import { useMemo, useRef, useState } from 'react';
import { useTheme } from '../context.jsx';
import { useGoogleAuth } from '../utils/useGoogleAuth.js';
import { callAI } from '../aiClient.js';
import { buildKnowledgeGraph, findEvolvingTopics } from '../utils/knowledgeGraph.js';
import { gatherTopicNotes } from '../utils/wikiEvolution.js';
import { buildMocPrompt } from '../utils/mocDraft.js';
import { cleanDraft } from '../utils/gapDraft.js';
import { exportMocNote, WRITE_SCOPE } from '../utils/wikiExport.js';
import { getBookIndex, getBookMeta, getWikiConfig, getWikiIndex } from '../store.js';

/* ── 개념 지도(MOC) 초안 — 한 주제에 흩어진 노트들을 상위 구조로 엮는 허브 노트를
   AI가 제안하고 볼트로 write-back. 노트 2개 이상 쌓인 주제만. */
export function MocCard({ lang, apiKeys }) {
  const { T, F } = useTheme();
  const ko = lang === 'ko';

  const topics = useMemo(() => {
    if (!getWikiConfig().connected) return [];
    const books = getBookIndex().map(b => ({ id: b.id, title: b.title, aiTopics: getBookMeta(b.id)?.aiTopics || [] }));
    return findEvolvingTopics(buildKnowledgeGraph(books, getWikiIndex()), { minNotes: 2 }).slice(0, 5);
  }, []);

  const [active, setActive] = useState(null);
  const [draft, setDraft] = useState('');
  const [status, setStatus] = useState('idle'); // idle | drafting | drafted | exporting | done | error
  const [msg, setMsg] = useState('');
  const pending = useRef(null);

  if (!topics.length) return null;

  async function makeDraft(t) {
    setActive(t); setDraft(''); setMsg(''); setStatus('drafting');
    try {
      const notes = gatherTopicNotes(t.topic, getWikiIndex());
      const books = t.bookIds.map(id => ({
        title: getBookIndex().find(b => b.id === id)?.title || id,
        summary: getBookMeta(id)?.aiSummary || '',
      }));
      const raw = await callAI(apiKeys, buildMocPrompt(t.topic, notes, books, lang), [], ko ? '작성해줘' : 'Write');
      setDraft(cleanDraft(raw));
      setStatus('drafted');
    } catch {
      setStatus('error');
      setMsg(ko ? 'MOC 초안 생성에 실패했어요 (AI 키를 확인하세요)' : 'Draft failed (check AI key)');
    }
  }

  const exportAuth = useGoogleAuth({
    scope: WRITE_SCOPE,
    onSuccess: async ({ access_token }) => {
      const p = pending.current;
      if (!p) return;
      setStatus('exporting'); setMsg('');
      try {
        const res = await exportMocNote(access_token, p);
        setStatus('done');
        setMsg(ko
          ? `✅ 《${res.fileName}》 ${res.created ? '생성' : '갱신'} → cw_wiki/rarebook/`
          : `✅ ${res.fileName} ${res.created ? 'created' : 'updated'} → cw_wiki/rarebook/`);
      } catch {
        setStatus('error'); setMsg(ko ? '내보내기에 실패했어요' : 'Export failed');
      }
    },
    onError: () => { setStatus('error'); setMsg(ko ? '드라이브 연결 실패' : 'Drive connect failed'); },
  });

  function doExport() {
    if (!active || !draft) return;
    pending.current = { topic: active.topic, draftBody: draft };
    exportAuth();
  }

  const busy = status === 'drafting' || status === 'exporting';

  return (
    <div style={{ background: T.surface, borderRadius: 14, padding: '13px 15px', border: `1px solid ${T.border}`, marginBottom: 14 }}>
      <div style={{ fontSize: 12.5, fontWeight: 700, color: T.ink, fontFamily: F.body, marginBottom: 4 }}>
        🗺️ {ko ? '개념 지도(MOC) 초안' : 'Map of Content draft'}
      </div>
      <div style={{ fontSize: 11.5, color: T.inkMid, fontFamily: F.body, lineHeight: 1.5, marginBottom: 10 }}>
        {ko ? '노트가 쌓인 주제를 하나의 구조로 엮는 허브 노트를 만들어 볼트에 넣어드려요.'
            : 'Weave your scattered notes on a topic into one hub note and add it to your vault.'}
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {topics.map(t => (
          <button
            key={t.key}
            onClick={() => makeDraft(t)}
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

      {status === 'drafting' && (
        <div style={{ marginTop: 12, fontSize: 12, color: T.inkMid, fontFamily: F.body }}>🗺️ {ko ? `"${active.topic}" 구조 세우는 중…` : `Structuring "${active.topic}"…`}</div>
      )}

      {draft && (status === 'drafted' || status === 'exporting' || status === 'done') && (
        <div style={{ marginTop: 12 }}>
          <div style={{ background: T.accentSoft, borderRadius: 11, padding: '11px 12px', maxHeight: 240, overflowY: 'auto', fontSize: 12, color: T.ink, fontFamily: F.body, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
            {draft}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 9 }}>
            <button
              onClick={doExport}
              disabled={busy}
              style={{ fontSize: 12, fontWeight: 700, color: '#fff', background: busy ? T.border : T.accent, border: 'none', borderRadius: 9, padding: '8px 14px', cursor: busy ? 'default' : 'pointer', fontFamily: F.body }}
            >
              {status === 'exporting' ? (ko ? '내보내는 중…' : 'Exporting…') : (ko ? '볼트로 내보내기' : 'Export to vault')}
            </button>
            <button
              onClick={() => makeDraft(active)}
              disabled={busy}
              style={{ fontSize: 12, fontWeight: 600, color: T.accent, background: 'transparent', border: `1px solid ${T.accent}55`, borderRadius: 9, padding: '8px 12px', cursor: busy ? 'default' : 'pointer', fontFamily: F.body }}
            >
              {ko ? '다시 생성' : 'Regenerate'}
            </button>
          </div>
        </div>
      )}

      {msg && (
        <div style={{ marginTop: 10, fontSize: 11.5, fontFamily: F.body, lineHeight: 1.5, color: status === 'error' ? '#C0392B' : T.inkMid }}>
          {status === 'error' ? '⚠️ ' : ''}{msg}
        </div>
      )}
    </div>
  );
}
