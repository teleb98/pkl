import { useMemo, useState, useRef } from 'react';
import { useTheme } from '../context.jsx';
import { useGoogleAuth } from '../utils/useGoogleAuth.js';
import { callAI } from '../aiClient.js';
import { buildKnowledgeGraph, findGaps } from '../utils/knowledgeGraph.js';
import { buildGapNotePrompt, cleanDraft } from '../utils/gapDraft.js';
import { exportGapNote, WRITE_SCOPE } from '../utils/wikiExport.js';
import {
  getBookIndex, getBookMeta, getAllHighlightsByBook, getNotesByBook,
  getWikiConfig, getWikiIndex,
} from '../store.js';

/* ── 지식 공백 파인더 — 많이 읽었지만(책 신호) 위키엔 없는 주제를 찾아,
   AI가 하이라이트로 개념 노트 초안을 합성하고 cw_wiki 볼트로 write-back 한다.
   "읽기가 위키를 자라게 하는" 닫힌 루프. 위키 연결 + 공백이 있을 때만 렌더. */
export function KnowledgeGapCard({ lang, apiKeys }) {
  const { T, F } = useTheme();
  const ko = lang === 'ko';

  const gaps = useMemo(() => {
    if (!getWikiConfig().connected) return [];
    const books = getBookIndex().map(b => ({ id: b.id, title: b.title, aiTopics: getBookMeta(b.id)?.aiTopics || [] }));
    return findGaps(buildKnowledgeGraph(books, getWikiIndex())).slice(0, 5);
  }, []);

  const [active, setActive] = useState(null);     // 선택된 gap
  const [draft, setDraft] = useState('');
  const [status, setStatus] = useState('idle');   // idle | drafting | drafted | exporting | done | error
  const [msg, setMsg] = useState('');
  const pending = useRef(null);                    // 내보내기 대기 데이터(OAuth 콜백용)

  if (!gaps.length) return null;

  const gatherSources = (bookIds) => bookIds.map(id => {
    const b = getBookIndex().find(x => x.id === id);
    return {
      id, title: b?.title || id, summary: getBookMeta(id)?.aiSummary || '',
      highlights: getAllHighlightsByBook(id).map(h => h.text).filter(Boolean).slice(0, 8),
      notes: getNotesByBook(id).map(n => n.text).filter(Boolean).slice(0, 5),
    };
  });

  async function makeDraft(gap) {
    setActive(gap); setDraft(''); setMsg(''); setStatus('drafting');
    try {
      const sources = gatherSources(gap.bookIds);
      const raw = await callAI(apiKeys, buildGapNotePrompt(gap.topic, sources, lang), [], ko ? '작성해줘' : 'Write');
      setDraft(cleanDraft(raw));
      setStatus('drafted');
    } catch {
      setStatus('error');
      setMsg(ko ? '초안 생성에 실패했어요 (AI 키를 확인하세요)' : 'Draft failed (check AI key)');
    }
  }

  const exportAuth = useGoogleAuth({
    scope: WRITE_SCOPE,
    onSuccess: async ({ access_token }) => {
      const p = pending.current;
      if (!p) return;
      setStatus('exporting'); setMsg('');
      try {
        const res = await exportGapNote(access_token, p);
        setStatus('done');
        setMsg(ko
          ? `✅ 《${res.fileName}》 ${res.created ? '생성' : '갱신'} → cw_wiki/rarebook/`
          : `✅ ${res.fileName} ${res.created ? 'created' : 'updated'} → cw_wiki/rarebook/`);
      } catch {
        setStatus('error');
        setMsg(ko ? '내보내기에 실패했어요' : 'Export failed');
      }
    },
    onError: () => { setStatus('error'); setMsg(ko ? '드라이브 연결 실패' : 'Drive connect failed'); },
  });

  function doExport() {
    if (!active || !draft) return;
    pending.current = {
      topic: active.topic, title: active.topic, draftBody: draft,
      sources: gatherSources(active.bookIds).map(s => s.title),
    };
    exportAuth();
  }

  const busy = status === 'drafting' || status === 'exporting';

  return (
    <div style={{ background: T.surface, borderRadius: 14, padding: '13px 15px', border: `1px solid ${T.border}`, marginBottom: 14 }}>
      <div style={{ fontSize: 12.5, fontWeight: 700, color: T.ink, fontFamily: F.body, marginBottom: 4 }}>
        🧭 {ko ? '지식 공백' : 'Knowledge gaps'}
      </div>
      <div style={{ fontSize: 11.5, color: T.inkMid, fontFamily: F.body, lineHeight: 1.5, marginBottom: 10 }}>
        {ko ? '많이 읽었지만 아직 위키에 정리 안 한 주제예요. AI가 초안을 만들어 볼트에 넣어드려요.'
            : 'Topics you read a lot but haven’t noted in your wiki. AI can draft one and add it to your vault.'}
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {gaps.map(g => (
          <button
            key={g.key}
            onClick={() => makeDraft(g)}
            disabled={busy}
            style={{
              fontSize: 11.5, fontWeight: 600, fontFamily: F.body, borderRadius: 999, padding: '6px 11px', cursor: busy ? 'default' : 'pointer',
              border: `1px solid ${active?.key === g.key ? T.accent : T.border}`,
              background: active?.key === g.key ? T.accentSoft : 'transparent',
              color: active?.key === g.key ? T.accentDeep : T.inkMid,
            }}
          >
            {g.topic} <span style={{ color: T.inkLight }}>· {ko ? `${g.bookCount}권` : `${g.bookCount}`}</span>
          </button>
        ))}
      </div>

      {status === 'drafting' && (
        <div style={{ marginTop: 12, fontSize: 12, color: T.inkMid, fontFamily: F.body }}>✍️ {ko ? `"${active.topic}" 초안 만드는 중…` : `Drafting "${active.topic}"…`}</div>
      )}

      {draft && (status === 'drafted' || status === 'exporting' || status === 'done') && (
        <div style={{ marginTop: 12 }}>
          <div style={{ background: T.accentSoft, borderRadius: 11, padding: '11px 12px', maxHeight: 220, overflowY: 'auto', fontSize: 12, color: T.ink, fontFamily: F.body, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
            {draft}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 9, alignItems: 'center' }}>
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
