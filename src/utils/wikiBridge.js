/* 끊어진 연결 발견 — cw_wiki 노트 중 "의미는 가까운데 아직 [[링크]]로 이어지지 않은"
   쌍을 찾아 연결을 제안한다. 옵시디언 사용자가 스스로 못 본 연결을 서재가 짚어주는
   그래프 네이티브 기능. 동기화 때 저장한 노트 임베딩을 재사용(오프라인·키 불필요). */
import { cosineSimilarity } from './embeddings.js';
import { getBookVectors } from './bookVectorDb.js';
import { getWikiIndex } from '../store.js';

const WIKI_VECTOR_KEY = '__wiki__';

function norm(s) { return String(s || '').toLowerCase().trim(); }
function intersect(a, b) { const s = new Set(b); return [...new Set(a)].filter(x => s.has(x)); }

/** 노트 제목/별칭 → id 색인. [[링크]] 대상을 노트 id로 해석하는 데 쓴다. */
function buildIdIndex(notes) {
  const idByKey = new Map();
  for (const n of notes) {
    for (const key of [n.title, ...(n.aliases || [])]) {
      const k = norm(key);
      if (k && !idByKey.has(k)) idByKey.set(k, n.id);
    }
  }
  return idByKey;
}

/** [[링크]]로 이어진 인접(무방향) 그래프 */
function buildLinkAdjacency(notes, idByKey) {
  const adj = new Map();
  const add = (a, b) => {
    if (!adj.has(a)) adj.set(a, new Set());
    if (!adj.has(b)) adj.set(b, new Set());
    adj.get(a).add(b); adj.get(b).add(a);
  };
  for (const n of notes) {
    for (const link of n.links || []) {
      const tid = idByKey.get(norm(link));
      if (tid && tid !== n.id) add(n.id, tid);
    }
  }
  return adj;
}

/**
 * 링크로 이어지지 않았지만 의미가 가까운 노트 쌍을 찾는다(순수 함수).
 * @param {Array} notes  파싱된 위키 노트(id/title/tags/links/aliases/webViewLink)
 * @param {Array<{id,vector}>} vectorItems  노트 임베딩
 * @param {{minSim?:number, limit?:number, maxPerNote?:number}} [opts]
 * @returns {Array<{a, b, sim:number, sharedTags:string[], sharedLinks:string[]}>}
 */
export function findBridges(notes, vectorItems, opts = {}) {
  const { minSim = 0.5, limit = 6, maxPerNote = 2 } = opts;
  const vecById = new Map((vectorItems || []).map(v => [v.id, v.vector]));
  const idByKey = buildIdIndex(notes || []);
  const adj = buildLinkAdjacency(notes || [], idByKey);
  const withVec = (notes || []).filter(n => vecById.has(n.id));

  const pairs = [];
  for (let i = 0; i < withVec.length; i++) {
    for (let j = i + 1; j < withVec.length; j++) {
      const a = withVec[i], b = withVec[j];
      if (adj.get(a.id)?.has(b.id)) continue;               // 이미 링크됨 → 제외
      const sim = cosineSimilarity(vecById.get(a.id), vecById.get(b.id));
      if (sim < minSim) continue;
      pairs.push({
        a, b, sim,
        sharedTags: intersect((a.tags || []).map(norm), (b.tags || []).map(norm)),
        sharedLinks: intersect((a.links || []).map(norm), (b.links || []).map(norm)),
      });
    }
  }
  pairs.sort((x, y) => y.sim - x.sim);

  // 다양성: 한 노트가 결과를 독점하지 않게 등장 횟수 제한
  const seen = new Map();
  const out = [];
  for (const p of pairs) {
    if ((seen.get(p.a.id) || 0) >= maxPerNote || (seen.get(p.b.id) || 0) >= maxPerNote) continue;
    out.push(p);
    seen.set(p.a.id, (seen.get(p.a.id) || 0) + 1);
    seen.set(p.b.id, (seen.get(p.b.id) || 0) + 1);
    if (out.length >= limit) break;
  }
  return out;
}

/** 저장된 노트 임베딩으로 끊어진 연결을 찾는다. 벡터 없으면 빈 배열. */
export async function discoverBridges(opts = {}) {
  const rec = await getBookVectors(WIKI_VECTOR_KEY).catch(() => null);
  if (!rec?.items?.length) return [];
  return findBridges(getWikiIndex(), rec.items, opts);
}
