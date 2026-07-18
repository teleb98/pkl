/* cw_wiki 시맨틱 검색 — 위키 노트를 임베딩해 IndexedDB(bookVectorDb)에 저장하고,
   질의 임베딩과 코사인 유사도로 관련 노트를 찾는다. Gemini 키가 있으면 Gemini
   임베딩, 없으면 로컬 해시 임베딩으로 동작(완전 오프라인 가능).
   벡터가 없거나 모델이 안 맞으면 호출부(searchWiki)가 토큰 검색으로 폴백한다. */
import { getBookVectors, saveBookVectors, deleteBookVectors } from './bookVectorDb.js';
import { embedTexts, cosineSimilarity, GEMINI_EMBED_MODEL } from './embeddings.js';
import { searchWikiNotes, buildSnippet } from './wikiSearch.js';
import { tokenize } from './wikiMatch.js';

const WIKI_VECTOR_KEY = '__wiki__';   // bookVectorDb 안의 예약 키(책 id 와 충돌 없음)
const EMBED_BATCH = 50;
const MIN_SIM = 0.35;                 // 이보다 낮은 유사도는 노이즈로 간주

/** 노트 하나의 임베딩 대상 텍스트(제목·태그·본문) */
function embedTextOf(note) {
  return [note.title, (note.tags || []).join(' '), note.content || note.excerpt || '']
    .filter(Boolean).join('\n').slice(0, 2000);
}

/** 위키 인덱스 전체를 임베딩해 저장. 동기화 직후 호출된다. */
export async function buildWikiVectors(notes, { geminiKey } = {}) {
  const list = notes || [];
  if (!list.length) { await deleteBookVectors(WIKI_VECTOR_KEY).catch(() => {}); return { count: 0 }; }
  const vectors = [];
  let model = null;
  for (let i = 0; i < list.length; i += EMBED_BATCH) {
    const batch = list.slice(i, i + EMBED_BATCH).map(embedTextOf);
    const res = await embedTexts(batch, { geminiKey });
    model = res.model;
    vectors.push(...res.vectors);
  }
  await saveBookVectors(WIKI_VECTOR_KEY, {
    model, dim: vectors[0]?.length || 0, builtAt: Date.now(),
    items: list.map((n, i) => ({ id: n.id, vector: vectors[i] })),
  });
  return { count: list.length, model };
}

/** 저장된 벡터로 시맨틱 검색. 사용 불가(벡터 없음/모델 불일치)면 null 반환. */
export async function semanticSearchWiki(query, notes, { geminiKey, limit = 4 } = {}) {
  const rec = await getBookVectors(WIKI_VECTOR_KEY).catch(() => null);
  if (!rec?.items?.length) return null;
  if (rec.model === GEMINI_EMBED_MODEL && !geminiKey) return null; // 재색인 전엔 질의 임베딩 불가

  const { vectors } = await embedTexts([query], rec.model === GEMINI_EMBED_MODEL ? { geminiKey } : {});
  const qVec = vectors[0];
  const byId = new Map((notes || []).map(n => [n.id, n]));
  const qTokens = tokenize(query).filter(t => t.length >= 2);

  return rec.items
    .map(it => ({ note: byId.get(it.id), score: cosineSimilarity(qVec, it.vector) }))
    .filter(r => r.note && r.score >= MIN_SIM)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(r => ({ ...r, matched: qTokens, snippet: buildSnippet(r.note, qTokens) }));
}

/** 시맨틱 우선, 실패/불가 시 토큰 검색 폴백 — AI 챗이 쓰는 단일 진입점 */
export async function searchWiki(query, notes, { geminiKey, limit = 4 } = {}) {
  try {
    const sem = await semanticSearchWiki(query, notes, { geminiKey, limit });
    if (sem && sem.length) return sem;
  } catch { /* 시맨틱 실패 → 토큰 폴백 */ }
  return searchWikiNotes(query, notes, { limit });
}
