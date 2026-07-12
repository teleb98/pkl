/* 텍스트 임베딩 — RAG 벡터 검색용.
   - Gemini 키가 있으면 실제 의미 임베딩(text-embedding-004, 768차원)을 사용
   - 키가 없으면 로컬 해싱 트릭 임베딩(256차원)으로 완전 오프라인 폴백
     (형태소 분석기 없이도 어절 + 한글 음절 바이그램으로 어휘 중복을 포착) */

export const GEMINI_EMBED_MODEL = 'gemini-text-embedding-004';
export const LOCAL_EMBED_MODEL = 'local-hash-256';
const LOCAL_DIM = 256;

/* ── 로컬 폴백: 해싱 트릭 bag-of-tokens ──────────────────── */

function tokenize(text) {
  const t = String(text || '').toLowerCase();
  const tokens = t.split(/\s+/).filter(Boolean);
  // 한글은 공백 단위만으로는 의미 단위 포착이 약해 음절 바이그램을 추가
  const hangulOnly = t.replace(/[^가-힣]/g, '');
  for (let i = 0; i < hangulOnly.length - 1; i++) tokens.push(hangulOnly.slice(i, i + 2));
  return tokens;
}

function hashToken(tok) {
  let h = 2166136261; // FNV-1a 32bit basis
  for (let i = 0; i < tok.length; i++) {
    h ^= tok.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** 오프라인 임베딩 — 결정적(deterministic), 네트워크 불필요 */
export function embedTextsLocal(texts) {
  return texts.map((text) => {
    const vec = new Array(LOCAL_DIM).fill(0);
    for (const tok of tokenize(text)) {
      const h = hashToken(tok);
      // 부호 해싱(signed hashing) — 인덱스 충돌로 인한 편향을 완화
      vec[h % LOCAL_DIM] += (h & 0x10000) ? 1 : -1;
    }
    const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
    return vec.map(v => v / norm);
  });
}

/* ── Gemini 임베딩 (의미 기반, 고품질) ────────────────────── */

export async function embedTextsGemini(texts, apiKey) {
  const requests = texts.map(t => ({
    model: `models/text-embedding-004`,
    content: { parts: [{ text: String(t || '').slice(0, 8000) }] },
  }));
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:batchEmbedContents`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({ requests }),
    }
  );
  if (!res.ok) {
    if (res.status === 429) throw new Error('rate-limit');
    if (res.status === 401 || res.status === 403) throw new Error('invalid-key');
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `HTTP ${res.status}`);
  }
  const data = await res.json();
  return (data.embeddings || []).map(e => e.values);
}

/** 사용 가능한 최선의 방법으로 임베딩 (호출부에서 어떤 모델을 썼는지 알아야 하면 model 인자 사용) */
export async function embedTexts(texts, { geminiKey } = {}) {
  if (geminiKey) return { vectors: await embedTextsGemini(texts, geminiKey), model: GEMINI_EMBED_MODEL };
  return { vectors: embedTextsLocal(texts), model: LOCAL_EMBED_MODEL };
}

/** 코사인 유사도. 차원이 다르면(모델 불일치) -1 반환 */
export function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return -1;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
