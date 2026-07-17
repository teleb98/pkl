/* RAG 기반 의미 검색 — Vision/스캔으로 만든 책 벡터 인덱스(bookVectorDb)를
   검색·지식 화면에서 공통으로 활용한다. 단순 부분일치(pageTextCache)와 달리
   질의를 임베딩해 의미가 가까운 구절을 여러 책에 걸쳐 찾아준다. */
import { listBookVectors } from './bookVectorDb.js';
import { queryBookIndex } from './ragIndex.js';
import { GEMINI_EMBED_MODEL } from './embeddings.js';

/** 인덱스된 책 목록(요약). 현재 키 설정으로 질의 가능한지(usable) 포함. */
export async function listIndexedBooks({ geminiKey } = {}) {
  const list = await listBookVectors();
  return list.map(b => ({
    ...b,
    usable: b.model !== GEMINI_EMBED_MODEL || !!geminiKey, // 로컬 모델은 키 없이도 사용 가능
  }));
}

/**
 * 여러 책의 RAG 인덱스를 가로질러 의미 검색.
 * @param {string} query
 * @param {{geminiKey?:string, perBook?:number, total?:number, bookIds?:string[]}} opts
 *   bookIds 를 주면 해당 책만, 없으면 인덱스된 전체 책 대상.
 * @returns {Promise<Array<{bookId:string, page:number, text:string, score:number}>>}
 */
export async function semanticSearchAll(query, { geminiKey, perBook = 3, total = 8, bookIds } = {}) {
  if (!query?.trim()) return [];
  const indexed = await listBookVectors();
  const targets = bookIds
    ? indexed.filter(b => bookIds.includes(b.bookId))
    : indexed;
  if (!targets.length) return [];

  const all = [];
  for (const b of targets) {
    // 모델 불일치(예: Gemini 인덱스인데 키 없음)면 queryBookIndex 가 []를 반환한다.
    const hits = await queryBookIndex(b.bookId, query, { geminiKey, topK: perBook });
    for (const h of hits) all.push({ bookId: b.bookId, ...h });
  }
  all.sort((a, b) => b.score - a.score);
  return all.slice(0, total);
}

/** semanticSearchAll 결과(여러 책)를 AI 시스템 프롬프트용 텍스트 블록으로 변환.
 *  단일 책용 formatRagContext(ragIndex.js)와 달리 책 제목을 함께 표기해
 *  "서재 전체(다른 책 포함)에서 참고한 내용"임을 AI가 알 수 있게 한다. */
export function formatLibraryContext(hits, titleOf, lang = 'ko') {
  if (!hits?.length) return '';
  const ko = lang === 'ko';
  const header = ko
    ? '[서재의 다른 책에서 찾은 관련 구절 — 관련도순]'
    : '[Related excerpts from other books in your library — ranked by relevance]';
  const body = hits.map(h => `《${titleOf(h.bookId)}》 (p.${h.page}) ${h.text}`).join('\n\n');
  return `\n\n${header}\n${body}`;
}
