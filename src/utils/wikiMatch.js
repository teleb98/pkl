/* 서재 책 ↔ cw_wiki 노트 교차 연결(순수 함수) — 책의 주제(aiTopics)·제목과
   위키 노트의 태그·제목·링크가 겹치는 정도로 관련 노트를 찾아 근거와 함께 돌려준다.
   서재의 "지식 성장 경로"(주제 흐름)를 사용자가 직접 쓴 위키와 이어주는 다리. */

/** 소문자화 + 영숫자/한글 토큰만 */
export function tokenize(str) {
  return (String(str || '').toLowerCase().match(/[a-z0-9]+|[가-힣]+/g) || []);
}

function norm(s) {
  return String(s || '').toLowerCase().trim();
}

/** 책에서 매칭에 쓸 신호(주제 구절 + 제목/주제 토큰) */
export function buildBookTerms(book) {
  const topics = (book?.aiTopics || book?.topics || []).map(norm).filter(Boolean);
  const titleTokens = tokenize(book?.title);
  const topicTokens = topics.flatMap(tokenize);
  return {
    topicPhrases: [...new Set(topics)],
    tokens: [...new Set([...titleTokens, ...topicTokens])],
  };
}

/** 위키 노트 하나를 책 신호와 대조해 점수·근거 산출 */
export function scoreNote(bookTerms, note) {
  const reasons = [];
  let score = 0;
  const tagsNorm = (note.tags || []).map(norm);
  const linksNorm = (note.links || []).map(norm);
  const titleTokens = new Set([...tokenize(note.title), ...(note.aliases || []).flatMap(tokenize)]);
  const noteTokens = new Set([...titleTokens, ...(note.tags || []).flatMap(tokenize), ...(note.links || []).flatMap(tokenize)]);

  // 1) 주제 구절이 노트 태그/링크와 정확히 일치 — 가장 강한 신호
  for (const topic of bookTerms.topicPhrases) {
    if (tagsNorm.includes(topic)) { score += 3; reasons.push(`태그 #${topic}`); }
    else if (linksNorm.includes(topic)) { score += 3; reasons.push(`링크 [[${topic}]]`); }
    else if (titleTokens.has(topic)) { score += 2; reasons.push(`제목: ${topic}`); }
  }
  // 2) 토큰 단위 겹침(제목·주제 토큰 ↔ 노트 토큰)
  let tokenHits = 0;
  for (const tk of bookTerms.tokens) {
    if (tk.length < 2) continue;
    if (noteTokens.has(tk)) tokenHits += 1;
  }
  if (tokenHits) { score += Math.min(tokenHits, 3); if (reasons.length === 0) reasons.push(`키워드 ${tokenHits}개 겹침`); }

  return { score, reasons: [...new Set(reasons)] };
}

/**
 * 책과 관련된 위키 노트를 점수순으로 반환.
 * @param {{title?:string, aiTopics?:string[]}} book
 * @param {Array} notes  parseNote 결과 + { id, name, webViewLink } 메타
 * @param {{limit?:number, minScore?:number}} [opts]
 * @returns {Array<{ note, score:number, reasons:string[] }>}
 */
export function findRelatedWikiNotes(book, notes, opts = {}) {
  const { limit = 5, minScore = 2 } = opts;
  const bookTerms = buildBookTerms(book);
  if (!bookTerms.topicPhrases.length && !bookTerms.tokens.length) return [];
  return (notes || [])
    .map(note => ({ note, ...scoreNote(bookTerms, note) }))
    .filter(r => r.score >= minScore)
    .sort((a, b) => b.score - a.score || (b.note.wordCount || 0) - (a.note.wordCount || 0))
    .slice(0, limit);
}
