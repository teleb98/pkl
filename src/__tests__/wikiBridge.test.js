import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { findBridges, discoverBridges } from '../utils/wikiBridge.js';
import { buildWikiVectors } from '../utils/wikiVector.js';
import { deleteBookVectors, saveBookVectors } from '../utils/bookVectorDb.js';
import { saveWikiIndex } from '../store.js';

const note = (over) => ({ id: 'n', title: '', tags: [], links: [], aliases: [], ...over });

// 단순·직교에 가까운 2차원 벡터로 유사도를 통제
const V = { close1: [1, 0.1], close2: [0.98, 0.15], far: [0, 1] };

describe('findBridges', () => {
  it('의미 가깝고 링크 안 된 쌍을 찾는다', () => {
    const notes = [
      note({ id: 'a', title: '자유의지', tags: ['철학'] }),
      note({ id: 'b', title: '결정론', tags: ['철학'] }),
      note({ id: 'c', title: '요리', tags: ['음식'] }),
    ];
    const vecs = [{ id: 'a', vector: V.close1 }, { id: 'b', vector: V.close2 }, { id: 'c', vector: V.far }];
    const res = findBridges(notes, vecs, { minSim: 0.8 });
    expect(res.length).toBe(1);
    expect([res[0].a.id, res[0].b.id].sort()).toEqual(['a', 'b']);
    expect(res[0].sharedTags).toContain('철학');   // 근거
  });

  it('이미 [[링크]]로 이어진 쌍은 제외한다', () => {
    const notes = [
      note({ id: 'a', title: '자유의지', links: ['결정론'] }), // a → [[결정론]]
      note({ id: 'b', title: '결정론' }),
    ];
    const vecs = [{ id: 'a', vector: V.close1 }, { id: 'b', vector: V.close2 }];
    expect(findBridges(notes, vecs, { minSim: 0.8 })).toEqual([]);
  });

  it('유사도가 낮으면 제외', () => {
    const notes = [note({ id: 'a', title: 'A' }), note({ id: 'b', title: 'B' })];
    const vecs = [{ id: 'a', vector: V.close1 }, { id: 'b', vector: V.far }];
    expect(findBridges(notes, vecs, { minSim: 0.8 })).toEqual([]);
  });

  it('벡터 없는 노트는 무시', () => {
    const notes = [note({ id: 'a' }), note({ id: 'b' }), note({ id: 'c' })];
    const vecs = [{ id: 'a', vector: V.close1 }]; // b,c 벡터 없음
    expect(findBridges(notes, vecs, { minSim: 0 })).toEqual([]);
  });

  it('한 노트가 결과를 독점하지 않도록 등장 횟수를 제한', () => {
    const notes = ['a', 'b', 'c', 'd'].map(id => note({ id, title: id }));
    const vecs = notes.map(n => ({ id: n.id, vector: [1, 0.01] })); // 모두 거의 동일
    const res = findBridges(notes, vecs, { minSim: 0.5, maxPerNote: 1, limit: 10 });
    const counts = {};
    res.forEach(p => { counts[p.a.id] = (counts[p.a.id] || 0) + 1; counts[p.b.id] = (counts[p.b.id] || 0) + 1; });
    expect(Math.max(...Object.values(counts))).toBeLessThanOrEqual(1);
  });
});

describe('discoverBridges (저장된 벡터 사용)', () => {
  beforeEach(async () => { await deleteBookVectors('__wiki__').catch(() => {}); });

  it('동기화 벡터로 끊어진 연결을 찾는다', async () => {
    const notes = [
      note({ id: 'a', title: '프랑스 혁명', tags: ['역사'], content: '프랑스 혁명은 시민 혁명이다.' }),
      note({ id: 'b', title: '시민 혁명', tags: ['역사'], content: '프랑스 혁명처럼 시민이 주도한 혁명.' }),
      note({ id: 'c', title: '파스타', tags: ['요리'], content: '면을 삶는다.' }),
    ];
    saveWikiIndex(notes);
    await buildWikiVectors(notes, {}); // 로컬 임베딩
    const res = await discoverBridges({ minSim: 0.3 });
    expect(res.length).toBeGreaterThan(0);
    const ids = [res[0].a.id, res[0].b.id].sort();
    expect(ids).toEqual(['a', 'b']);
  });

  it('벡터가 없으면 빈 배열', async () => {
    saveWikiIndex([note({ id: 'a' })]);
    expect(await discoverBridges()).toEqual([]);
  });
});
