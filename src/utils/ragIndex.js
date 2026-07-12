/* RAG(검색 증강 생성) 인덱스 — Vision/텍스트로 스캔된 책 전문(bookTextDb)을
   청크로 나눠 임베딩하고, 질의에 가장 관련 있는 구절만 뽑아 AI 컨텍스트로
   제공한다. "책 전체를 프롬프트에 욱여넣기" 대신 질문에 맞는 부분만 검색. */
import { getBookText } from './bookTextDb.js';
import { getBookVectors, saveBookVectors, deleteBookVectors } from './bookVectorDb.js';
import { embedTexts, embedTextsGemini, embedTextsLocal, cosineSimilarity, GEMINI_EMBED_MODEL, LOCAL_EMBED_MODEL } from './embeddings.js';

const CHUNK_SIZE = 700;    // 청크당 최대 문자 수
const CHUNK_OVERLAP = 120; // 문맥 단절 방지용 겹침
const MAX_CHUNKS = 800;    // 매우 큰 책의 인덱싱 시간/비용 상한
const EMBED_BATCH = 50;

/** 페이지별 텍스트({pageNum:text}) → 겹침 있는 청크 목록. 각 청크는 대표 페이지 번호를 가진다. */
export function chunkPages(pages) {
  const nums = Object.keys(pages || {}).map(Number).sort((a, b) => a - b);
  const chunks = [];
  for (const n of nums) {
    const text = String(pages[n] || '').trim();
    if (!text) continue;
    if (text.length <= CHUNK_SIZE) {
      chunks.push({ page: n, text });
      continue;
    }
    let start = 0;
    while (start < text.length) {
      const end = Math.min(text.length, start + CHUNK_SIZE);
      chunks.push({ page: n, text: text.slice(start, end) });
      if (end >= text.length) break;
      start = end - CHUNK_OVERLAP;
    }
  }
  return chunks.slice(0, MAX_CHUNKS);
}

/** 인덱스 상태 — 존재 여부 + 현재 키 설정으로 그대로 질의 가능한지(usable) */
export async function getIndexStatus(bookId, { geminiKey } = {}) {
  const rec = await getBookVectors(bookId);
  if (!rec?.chunks?.length) return { indexed: false, chunkCount: 0, model: null, usable: false };
  const usable = rec.model === LOCAL_EMBED_MODEL || (rec.model === GEMINI_EMBED_MODEL && !!geminiKey);
  return { indexed: true, chunkCount: rec.chunkCount || rec.chunks.length, model: rec.model, builtAt: rec.builtAt, usable };
}

/**
 * 책 전체 스캔 텍스트(bookTextDb)로부터 벡터 인덱스 생성.
 * @returns {{chunkCount:number, model:string}}
 */
export async function buildBookIndex(bookId, { geminiKey, onProgress } = {}) {
  const textRec = await getBookText(bookId);
  if (!textRec?.pages) throw new Error('no-scanned-text');

  const chunks = chunkPages(textRec.pages);
  if (!chunks.length) throw new Error('no-text-to-index');

  const model = geminiKey ? GEMINI_EMBED_MODEL : LOCAL_EMBED_MODEL;
  const vectors = [];
  for (let i = 0; i < chunks.length; i += EMBED_BATCH) {
    const batchTexts = chunks.slice(i, i + EMBED_BATCH).map(c => c.text);
    const batchVecs = geminiKey
      ? await embedTextsGemini(batchTexts, geminiKey)
      : embedTextsLocal(batchTexts);
    vectors.push(...batchVecs);
    onProgress?.({ done: Math.min(i + EMBED_BATCH, chunks.length), total: chunks.length });
  }

  const record = {
    model,
    dim: vectors[0]?.length || 0,
    chunkCount: chunks.length,
    chunks: chunks.map((c, i) => ({ page: c.page, text: c.text, vector: vectors[i] })),
    builtAt: Date.now(),
  };
  await saveBookVectors(bookId, record);
  return { chunkCount: chunks.length, model };
}

/**
 * 질의와 가장 관련 있는 상위 K개 청크 검색.
 * 인덱스가 없거나(모델 불일치로) 사용 불가하면 빈 배열.
 * @returns {Array<{page:number, text:string, score:number}>}
 */
export async function queryBookIndex(bookId, queryText, { geminiKey, topK = 5 } = {}) {
  const rec = await getBookVectors(bookId);
  if (!rec?.chunks?.length || !queryText?.trim()) return [];
  if (rec.model === GEMINI_EMBED_MODEL && !geminiKey) return []; // 재색인 필요 — 모델 불일치

  const { vectors } = await embedTexts([queryText], rec.model === GEMINI_EMBED_MODEL ? { geminiKey } : {});
  const qVec = vectors[0];
  const scored = rec.chunks
    .map(c => ({ page: c.page, text: c.text, score: cosineSimilarity(qVec, c.vector) }))
    .filter(c => c.score > -1); // 차원 불일치 방어
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}

export async function removeBookIndex(bookId) {
  await deleteBookVectors(bookId);
}

/** 검색 결과를 AI 시스템 프롬프트에 넣을 텍스트 블록으로 변환 */
export function formatRagContext(hits, lang = 'ko') {
  if (!hits?.length) return '';
  const ko = lang === 'ko';
  const header = ko ? '[질문과 관련된 책 발췌 — 관련도순]' : '[Relevant excerpts from the book — ranked by relevance]';
  const body = hits.map(h => `(p.${h.page}) ${h.text}`).join('\n\n');
  return `\n\n${header}\n${body}`;
}
