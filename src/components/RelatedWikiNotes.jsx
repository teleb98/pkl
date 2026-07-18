import { useMemo } from 'react';
import { useTheme } from '../context.jsx';
import { getWikiIndex, getWikiConfig, getBookMeta } from '../store.js';
import { findRelatedWikiNotes } from '../utils/wikiMatch.js';

/* ── 이 책과 연결된 cw_wiki 노트 — 책의 주제(aiTopics)·제목과 겹치는 위키 노트를
   근거와 함께 보여주고, 클릭하면 Drive에서 원문을 연다. 연결·매칭이 없으면 렌더 안 함. */
export function RelatedWikiNotes({ book, lang }) {
  const { T, F } = useTheme();
  const ko = lang === 'ko';

  const related = useMemo(() => {
    if (!book || !getWikiConfig().connected) return [];
    const aiTopics = getBookMeta(book.id)?.aiTopics || book.aiTopics || [];
    return findRelatedWikiNotes({ title: book.title, aiTopics }, getWikiIndex());
  }, [book?.id]);

  if (!related.length) return null;

  return (
    <div style={{ background: T.surface, borderRadius: 14, padding: '13px 15px', border: `1px solid ${T.border}`, marginBottom: 14 }}>
      <div style={{ fontSize: 12.5, fontWeight: 700, color: T.ink, fontFamily: F.body, marginBottom: 10 }}>
        🧩 {ko ? '이 책과 연결된 위키' : 'Related wiki notes'}
        <span style={{ color: T.inkLight, fontWeight: 500 }}> · {book.title}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {related.map(({ note, reasons }) => (
          <a
            key={note.id}
            href={note.webViewLink || '#'}
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: 'block', textDecoration: 'none', background: T.accentSoft, borderRadius: 11, padding: '10px 12px' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: T.ink, fontFamily: 'serif', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {note.title}
              </div>
              <span style={{ flexShrink: 0, fontSize: 10.5, fontWeight: 700, color: T.accent, fontFamily: F.body }}>
                {ko ? '열기 ↗' : 'Open ↗'}
              </span>
            </div>
            {reasons.length > 0 && (
              <div style={{ marginTop: 5, display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                {reasons.slice(0, 3).map((r, i) => (
                  <span key={i} style={{ fontSize: 10, color: T.inkMid, background: T.surface, padding: '2px 7px', borderRadius: 999, fontFamily: F.body }}>{r}</span>
                ))}
              </div>
            )}
            {note.excerpt && (
              <div style={{ marginTop: 6, fontSize: 11.5, color: T.inkMid, fontFamily: F.body, lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                {note.excerpt}
              </div>
            )}
          </a>
        ))}
      </div>
    </div>
  );
}
