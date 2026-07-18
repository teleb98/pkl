import { useEffect, useState } from 'react';
import { useTheme } from '../context.jsx';
import { buildWeeklyReview } from '../utils/weeklyReview.js';
import { buildKnowledgeGraph, findGaps } from '../utils/knowledgeGraph.js';
import { discoverBridges } from '../utils/wikiBridge.js';
import { getBookIndex, getBookMeta, getWikiConfig, getWikiIndex, getRecallLog } from '../store.js';

/* ── 주간 지식 리뷰 — 이번 주 지식 활동(새 노트·공백·연결·복습)을 한 다이제스트로.
   모든 카드를 "실천"으로 잇는 요약. 위키 연결 시에만, AI 불필요. */
export function WeeklyReviewCard({ lang }) {
  const { T, F } = useTheme();
  const ko = lang === 'ko';
  const [review, setReview] = useState(null);

  useEffect(() => {
    let alive = true;
    if (!getWikiConfig().connected) return undefined;
    const notes = getWikiIndex();
    const books = getBookIndex().map(b => ({ id: b.id, title: b.title, aiTopics: getBookMeta(b.id)?.aiTopics || [] }));
    const gaps = findGaps(buildKnowledgeGraph(books, notes));
    discoverBridges().catch(() => []).then(bridges => {
      if (!alive) return;
      setReview(buildWeeklyReview(notes, { gaps, bridgeCount: (bridges || []).length, recallLog: getRecallLog() }));
    });
    return () => { alive = false; };
  }, []);

  if (!review) return null;

  const stat = (icon, label, value) => (
    <div style={{ flex: 1, minWidth: 90, background: T.accentSoft, borderRadius: 11, padding: '9px 11px', textAlign: 'center' }}>
      <div style={{ fontSize: 15 }}>{icon}</div>
      <div style={{ fontSize: 15, fontWeight: 800, color: T.ink, fontFamily: F.body, marginTop: 2 }}>{value}</div>
      <div style={{ fontSize: 10, color: T.inkMid, fontFamily: F.body, marginTop: 1 }}>{label}</div>
    </div>
  );

  return (
    <div style={{ background: T.surface, borderRadius: 14, padding: '13px 15px', border: `1px solid ${T.border}`, marginBottom: 14 }}>
      <div style={{ fontSize: 12.5, fontWeight: 700, color: T.ink, fontFamily: F.body, marginBottom: 10 }}>
        📆 {ko ? '주간 지식 리뷰' : 'Weekly knowledge review'}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {stat('✍️', ko ? '새 노트' : 'New notes', review.newNoteCount)}
        {stat('🧭', ko ? '지식 공백' : 'Gaps', review.gapCount)}
        {stat('🔀', ko ? '연결 후보' : 'Missing links', review.bridgeCount)}
        {stat('🔁', ko ? '이번 주 복습' : 'Reviewed', review.reviewedCount)}
      </div>

      {review.newNoteTitles.length > 0 && (
        <div style={{ marginTop: 9, fontSize: 11, color: T.inkMid, fontFamily: F.body, lineHeight: 1.5 }}>
          {ko ? '이번 주' : 'This week'}: {review.newNoteTitles.map(t => `《${t}》`).join(' · ')}
        </div>
      )}

      {review.suggestions.length > 0 && (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 5 }}>
          {review.suggestions.map((s, i) => (
            <div key={i} style={{ fontSize: 11.5, color: T.ink, fontFamily: F.body, lineHeight: 1.5 }}>
              {s.icon} {s.text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
