import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { buildWikiVectors, semanticSearchWiki, searchWiki } from '../utils/wikiVector.js';
import { LOCAL_EMBED_MODEL, GEMINI_EMBED_MODEL, embedTextsLocal } from '../utils/embeddings.js';
import { saveBookVectors, deleteBookVectors } from '../utils/bookVectorDb.js';

const note = (over) => ({ title: '', tags: [], links: [], content: '', excerpt: '', ...over });

const NOTES = [
  note({ id: 'n1', title: '프랑스 혁명', tags: ['역사'], content: '프랑스 혁명은 1789년 시작되었고 시민이 왕정을 무너뜨렸다.' }),
  note({ id: 'n2', title: '파스타 만들기', tags: ['요리'], content: '토마토 소스와 면을 삶아 파스타를 만든다.' }),
];

beforeEach(async () => { await deleteBookVectors('__wiki__').catch(() => {}); });

describe('buildWikiVectors', () => {
  it('키가 없으면 로컬 모델로 임베딩해 저장한다', async () => {
    const res = await buildWikiVectors(NOTES, {});
    expect(res.count).toBe(2);
    expect(res.model).toBe(LOCAL_EMBED_MODEL);
  });

  it('빈 인덱스면 벡터를 지우고 0을 반환', async () => {
    await buildWikiVectors(NOTES, {});
    const res = await buildWikiVectors([], {});
    expect(res.count).toBe(0);
    expect(await semanticSearchWiki('아무거나', [], {})).toBeNull();
  });
});

describe('semanticSearchWiki', () => {
  it('질의와 의미가 가까운 노트를 찾는다(로컬 모델)', async () => {
    await buildWikiVectors(NOTES, {});
    const res = await semanticSearchWiki('프랑스 혁명은 언제 일어났나', NOTES, {});
    expect(res.length).toBeGreaterThan(0);
    expect(res[0].note.id).toBe('n1');
    expect(res[0].snippet).toBeTruthy();
  });

  it('벡터가 없으면 null (폴백 신호)', async () => {
    expect(await semanticSearchWiki('질문', NOTES, {})).toBeNull();
  });

  it('Gemini 로 색인됐는데 키가 없으면 null', async () => {
    await saveBookVectors('__wiki__', {
      model: GEMINI_EMBED_MODEL, dim: 4,
      items: [{ id: 'n1', vector: [1, 0, 0, 0] }],
    });
    expect(await semanticSearchWiki('질문', NOTES, {})).toBeNull();
  });
});

describe('searchWiki (시맨틱 → 토큰 폴백)', () => {
  it('벡터가 있으면 시맨틱 결과', async () => {
    await buildWikiVectors(NOTES, {});
    const res = await searchWiki('프랑스 혁명', NOTES, {});
    expect(res[0].note.id).toBe('n1');
  });

  it('벡터가 없으면 토큰 검색으로 폴백해도 결과를 낸다', async () => {
    const res = await searchWiki('프랑스 혁명', NOTES, {});
    expect(res.length).toBeGreaterThan(0);
    expect(res[0].note.id).toBe('n1');
  });
});
