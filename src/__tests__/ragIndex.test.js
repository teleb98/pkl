import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';

/* ────────────────────────────────────────────────────────────────
   RAG 벡터 인덱스 — Vision 스캔 전문(bookTextDb)을 청크·임베딩해
   IndexedDB(bookVectorDb)에 저장하고, 질의로 관련 구절을 검색.
   ─────────────────────────────────────────────────────────────── */

import { embedTextsLocal, cosineSimilarity, GEMINI_EMBED_MODEL, LOCAL_EMBED_MODEL } from '../utils/embeddings.js';
import { chunkPages, buildBookIndex, queryBookIndex, getIndexStatus, removeBookIndex, formatRagContext } from '../utils/ragIndex.js';
import { saveBookText, deleteBookText } from '../utils/bookTextDb.js';
import { getBookVectors, saveBookVectors, deleteBookVectors } from '../utils/bookVectorDb.js';

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('embeddings — 로컬 해싱 임베딩', () => {
  it('결정적(deterministic) — 같은 텍스트는 같은 벡터', () => {
    const [a] = embedTextsLocal(['독서는 삶을 풍요롭게 한다']);
    const [b] = embedTextsLocal(['독서는 삶을 풍요롭게 한다']);
    expect(a).toEqual(b);
  });

  it('L2 정규화됨 (노름 ≈ 1)', () => {
    const [v] = embedTextsLocal(['전략의 본질과 경쟁 우위']);
    const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
    expect(norm).toBeGreaterThan(0.99);
    expect(norm).toBeLessThan(1.01);
  });

  it('의미상 겹치는 문장이 무관한 문장보다 코사인 유사도가 높다', () => {
    const [a, b, c] = embedTextsLocal([
      '전략의 본질은 경쟁 우위를 만드는 다섯 가지 질문이다',
      '전략과 경쟁 우위는 기업의 핵심 질문이다',
      '오늘 점심 메뉴는 김치찌개였다',
    ]);
    const simRelated = cosineSimilarity(a, b);
    const simUnrelated = cosineSimilarity(a, c);
    expect(simRelated).toBeGreaterThan(simUnrelated);
  });

  it('cosineSimilarity — 차원 불일치 시 -1', () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2])).toBe(-1);
  });

  it('cosineSimilarity — 영벡터는 0', () => {
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });
});

describe('embeddings — Gemini API', () => {
  it('batchEmbedContents 호출 형식과 응답 파싱', async () => {
    globalThis.fetch = vi.fn(async (url, opts) => {
      expect(url).toContain('text-embedding-004:batchEmbedContents');
      const body = JSON.parse(opts.body);
      expect(body.requests).toHaveLength(2);
      return { ok: true, json: async () => ({ embeddings: [{ values: [0.1, 0.2] }, { values: [0.3, 0.4] }] }) };
    });
    const { embedTextsGemini } = await import('../utils/embeddings.js');
    const vecs = await embedTextsGemini(['a', 'b'], 'KEY');
    expect(vecs).toEqual([[0.1, 0.2], [0.3, 0.4]]);
  });

  it('401 → invalid-key, 429 → rate-limit', async () => {
    const { embedTextsGemini } = await import('../utils/embeddings.js');
    globalThis.fetch = vi.fn(async () => ({ ok: false, status: 401, json: async () => ({}) }));
    await expect(embedTextsGemini(['a'], 'BAD')).rejects.toThrow('invalid-key');
    globalThis.fetch = vi.fn(async () => ({ ok: false, status: 429, json: async () => ({}) }));
    await expect(embedTextsGemini(['a'], 'KEY')).rejects.toThrow('rate-limit');
  });
});

describe('ragIndex.chunkPages', () => {
  it('짧은 페이지는 그대로 청크 1개, 페이지 번호 보존', () => {
    const chunks = chunkPages({ 1: '짧은 텍스트', 3: '또 다른 페이지' });
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toEqual({ page: 1, text: '짧은 텍스트' });
    expect(chunks[1].page).toBe(3);
  });

  it('긴 페이지는 겹침을 두고 여러 청크로 분할', () => {
    const longText = 'A'.repeat(1500);
    const chunks = chunkPages({ 1: longText });
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.page).toBe(1);
    // 청크 이어붙이면 원문 커버(겹침 있으므로 길이는 원문 이상)
    expect(chunks.every(c => c.text.length <= 700)).toBe(true);
  });

  it('빈 페이지/공백만 있는 페이지는 무시', () => {
    const chunks = chunkPages({ 1: '', 2: '   ', 3: '실제 내용' });
    expect(chunks).toHaveLength(1);
    expect(chunks[0].page).toBe(3);
  });

  it('페이지 순서대로 정렬(키 순서 무관하게 숫자 정렬)', () => {
    const chunks = chunkPages({ 10: 'p10', 2: 'p2', 1: 'p1' });
    expect(chunks.map(c => c.page)).toEqual([1, 2, 10]);
  });
});

describe('buildBookIndex + queryBookIndex — 로컬 임베딩 (키 없음)', () => {
  const BOOK = 'rag-book-1';

  beforeEach(async () => {
    await deleteBookText(BOOK);
    await deleteBookVectors(BOOK);
    await saveBookText(BOOK, {
      pages: {
        1: '전략의 본질은 경쟁 우위를 만드는 다섯 가지 질문을 다룬다',
        2: '오늘 점심 메뉴는 김치찌개와 된장국이었다',
        3: '경쟁 우위와 전략적 포지셔닝은 기업 성과의 핵심이다',
      },
      totalPages: 3, scannedPages: 3, done: true,
    });
  });

  it('인덱스 생성 — 청크/모델/벡터 저장', async () => {
    const progress = [];
    const res = await buildBookIndex(BOOK, { onProgress: p => progress.push(p) });
    expect(res.model).toBe(LOCAL_EMBED_MODEL);
    expect(res.chunkCount).toBe(3);

    const rec = await getBookVectors(BOOK);
    expect(rec.chunks).toHaveLength(3);
    expect(rec.chunks[0].vector.length).toBeGreaterThan(0);
    expect(progress.length).toBeGreaterThan(0);
  });

  it('스캔 텍스트 없으면 no-scanned-text', async () => {
    await expect(buildBookIndex('never-scanned')).rejects.toThrow('no-scanned-text');
  });

  it('질의와 관련 있는 페이지가 상위로 검색됨', async () => {
    await buildBookIndex(BOOK);
    const hits = await queryBookIndex(BOOK, '경쟁 우위 전략 질문', { topK: 2 });
    expect(hits.length).toBeGreaterThan(0);
    // 전략/경쟁 우위 관련 페이지(1 또는 3)가 점심 메뉴(2페이지)보다 위에 와야 함
    expect(hits[0].page).not.toBe(2);
  });

  it('인덱스 없는 책 질의 → 빈 배열', async () => {
    expect(await queryBookIndex('no-index-book', '아무 질문')).toEqual([]);
  });

  it('빈 질의 → 빈 배열', async () => {
    await buildBookIndex(BOOK);
    expect(await queryBookIndex(BOOK, '')).toEqual([]);
  });

  it('getIndexStatus — 생성 전/후', async () => {
    expect(await getIndexStatus(BOOK)).toMatchObject({ indexed: false, usable: false });
    await buildBookIndex(BOOK);
    const status = await getIndexStatus(BOOK);
    expect(status.indexed).toBe(true);
    expect(status.usable).toBe(true);
    expect(status.model).toBe(LOCAL_EMBED_MODEL);
    expect(status.chunkCount).toBe(3);
  });

  it('removeBookIndex — 삭제 후 재조회 시 없음', async () => {
    await buildBookIndex(BOOK);
    await removeBookIndex(BOOK);
    expect(await getIndexStatus(BOOK)).toMatchObject({ indexed: false });
  });
});

describe('buildBookIndex + queryBookIndex — Gemini 임베딩', () => {
  const BOOK = 'rag-book-gemini';

  beforeEach(async () => {
    await deleteBookText(BOOK);
    await deleteBookVectors(BOOK);
    await saveBookText(BOOK, { pages: { 1: '가나다', 2: '라마바' }, totalPages: 2, scannedPages: 2, done: true });
  });

  it('geminiKey 있으면 Gemini 모델로 인덱싱, 배치 호출', async () => {
    globalThis.fetch = vi.fn(async (url, opts) => {
      const body = JSON.parse(opts.body);
      return { ok: true, json: async () => ({ embeddings: body.requests.map(() => ({ values: [1, 0, 0] })) }) };
    });
    const res = await buildBookIndex(BOOK, { geminiKey: 'KEY' });
    expect(res.model).toBe(GEMINI_EMBED_MODEL);
    const rec = await getBookVectors(BOOK);
    expect(rec.chunks[0].vector).toEqual([1, 0, 0]);
  });

  it('Gemini로 색인된 책을 키 없이 질의 → 빈 배열(모델 불일치, 재색인 필요)', async () => {
    await saveBookVectors(BOOK, {
      model: GEMINI_EMBED_MODEL, dim: 3, chunkCount: 1,
      chunks: [{ page: 1, text: 'x', vector: [1, 0, 0] }], builtAt: Date.now(),
    });
    expect(await queryBookIndex(BOOK, '질문', {})).toEqual([]);
    const status = await getIndexStatus(BOOK, {});
    expect(status.indexed).toBe(true);
    expect(status.usable).toBe(false); // 키 없음 → 사용 불가, 재색인 필요
  });

  it('Gemini로 색인된 책을 키 있이 질의 → 검색 가능', async () => {
    await saveBookVectors(BOOK, {
      model: GEMINI_EMBED_MODEL, dim: 3, chunkCount: 1,
      chunks: [{ page: 5, text: '관련 발췌', vector: [1, 0, 0] }], builtAt: Date.now(),
    });
    globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ embeddings: [{ values: [1, 0, 0] }] }) }));
    const hits = await queryBookIndex(BOOK, '질문', { geminiKey: 'KEY' });
    expect(hits).toHaveLength(1);
    expect(hits[0].page).toBe(5);
    expect(hits[0].score).toBeCloseTo(1, 5);
  });
});

describe('formatRagContext', () => {
  it('빈 히트 → 빈 문자열', () => {
    expect(formatRagContext([])).toBe('');
    expect(formatRagContext(null)).toBe('');
  });

  it('페이지 번호와 함께 포맷팅', () => {
    const out = formatRagContext([{ page: 3, text: '발췌1' }, { page: 7, text: '발췌2' }], 'ko');
    expect(out).toContain('p.3');
    expect(out).toContain('발췌1');
    expect(out).toContain('p.7');
  });
});
