/* 주간 지식 리뷰 — 위키·그래프·복습 활동을 한 다이제스트로 묶어 "이번 주 무엇이
   자랐고, 다음에 무엇을 하면 좋은가"를 보여준다. AI 없이 결정적으로 계산(순수 함수). */

const WEEK = 7 * 24 * 60 * 60 * 1000;

/**
 * @param {Array} notes  파싱된 위키 인덱스(modifiedTime 포함)
 * @param {{gaps?:Array, bridgeCount?:number, recallLog?:object, now?:number}} ctx
 * @returns {{ newNoteCount, newNoteTitles:string[], gapCount, gapTop:string|null,
 *   bridgeCount, reviewedCount, weakCount, suggestions:Array<{icon,text}> }}
 */
export function buildWeeklyReview(notes, { gaps = [], bridgeCount = 0, recallLog = {}, now = Date.now() } = {}) {
  const since = now - WEEK;
  const newNotes = (notes || []).filter(n => {
    const t = n.modifiedTime ? new Date(n.modifiedTime).getTime() : 0;
    return t >= since && t <= now;
  });
  const reviewedCount = Object.values(recallLog).filter(e => (e?.lastReviewAt || 0) >= since).length;
  const weakCount = Object.values(recallLog).filter(e => (e?.fails || 0) > 0).length;
  const gapTop = gaps[0]?.topic || null;

  const suggestions = [];
  if (gapTop) suggestions.push({ icon: '🧭', text: `「${gapTop}」 공백을 초안으로 채우기` });
  if (bridgeCount > 0) suggestions.push({ icon: '🔀', text: `끊어진 연결 ${bridgeCount}개 살펴보기` });
  if (reviewedCount === 0) suggestions.push({ icon: '🔁', text: '이번 주 복습을 아직 안 했어요 — 오늘의 복습 시작하기' });
  else if (weakCount > 0) suggestions.push({ icon: '🔁', text: `헷갈렸던 노트 ${weakCount}개 다시 복습하기` });
  if (newNotes.length === 0) suggestions.push({ icon: '✍️', text: '이번 주 새 노트가 없어요 — 읽던 책에서 한 조각 남겨보기' });

  return {
    newNoteCount: newNotes.length,
    newNoteTitles: newNotes.slice(0, 3).map(n => n.title),
    gapCount: gaps.length,
    gapTop,
    bridgeCount,
    reviewedCount,
    weakCount,
    suggestions: suggestions.slice(0, 3),
  };
}
