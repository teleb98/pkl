import { describe, it, expect, beforeEach } from 'vitest';
import {
  getCollections, createCollection, renameCollection, deleteCollection,
  addBookToCollection, removeBookFromCollection, getCollectionsByBook,
} from '../store.js';

beforeEach(() => localStorage.clear());

/* ── getCollections ────────────────────────────────────── */
describe('getCollections', () => {
  it('빈 배열 반환 (초기)', () => {
    expect(getCollections()).toEqual([]);
  });

  it('잘못된 JSON → 빈 배열', () => {
    localStorage.setItem('pkl_collections', 'bad{');
    expect(getCollections()).toEqual([]);
  });
});

/* ── createCollection ─────────────────────────────────── */
describe('createCollection', () => {
  it('컬렉션 추가 후 반환', () => {
    const list = createCollection({ name: '철학' });
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ name: '철학', emoji: '📚', bookIds: [] });
  });

  it('emoji 지정 가능', () => {
    const list = createCollection({ name: '과학', emoji: '🔬' });
    expect(list[0].emoji).toBe('🔬');
  });

  it('빈 이름은 생성 안 함', () => {
    expect(createCollection({ name: '' })).toEqual([]);
    expect(createCollection({ name: '   ' })).toEqual([]);
  });

  it('이름 trim 처리', () => {
    const list = createCollection({ name: '  자기계발  ' });
    expect(list[0].name).toBe('자기계발');
  });

  it('고유 id와 createdAt 설정', () => {
    const a = createCollection({ name: 'A' });
    const b = createCollection({ name: 'B' });
    expect(a[0].id).not.toBe(b[1].id);
    expect(typeof a[0].createdAt).toBe('number');
  });

  it('여러 개 누적', () => {
    createCollection({ name: '첫째' });
    createCollection({ name: '둘째' });
    createCollection({ name: '셋째' });
    expect(getCollections()).toHaveLength(3);
  });
});

/* ── renameCollection ─────────────────────────────────── */
describe('renameCollection', () => {
  it('이름 변경', () => {
    createCollection({ name: '원본' });
    const id = getCollections()[0].id;
    renameCollection(id, { name: '변경됨' });
    expect(getCollections()[0].name).toBe('변경됨');
  });

  it('emoji 변경', () => {
    createCollection({ name: 'A', emoji: '📚' });
    const id = getCollections()[0].id;
    renameCollection(id, { emoji: '🔥' });
    expect(getCollections()[0].emoji).toBe('🔥');
  });

  it('빈 이름은 무시', () => {
    createCollection({ name: '원본' });
    const id = getCollections()[0].id;
    renameCollection(id, { name: '   ' });
    expect(getCollections()[0].name).toBe('원본');
  });

  it('없는 id → 오류 없음', () => {
    createCollection({ name: 'A' });
    renameCollection('nonexistent', { name: 'X' });
    expect(getCollections()[0].name).toBe('A');
  });
});

/* ── deleteCollection ─────────────────────────────────── */
describe('deleteCollection', () => {
  it('컬렉션 삭제', () => {
    createCollection({ name: 'A' });
    createCollection({ name: 'B' });
    const id = getCollections()[0].id;
    deleteCollection(id);
    expect(getCollections()).toHaveLength(1);
    expect(getCollections()[0].name).toBe('B');
  });

  it('없는 id → 오류 없음', () => {
    createCollection({ name: 'A' });
    deleteCollection('nope');
    expect(getCollections()).toHaveLength(1);
  });
});

/* ── addBookToCollection ──────────────────────────────── */
describe('addBookToCollection', () => {
  it('책 id 추가', () => {
    createCollection({ name: 'C' });
    const cid = getCollections()[0].id;
    addBookToCollection(cid, 'book1');
    expect(getCollections()[0].bookIds).toEqual(['book1']);
  });

  it('중복 추가 안 함', () => {
    createCollection({ name: 'C' });
    const cid = getCollections()[0].id;
    addBookToCollection(cid, 'book1');
    addBookToCollection(cid, 'book1');
    expect(getCollections()[0].bookIds).toEqual(['book1']);
  });

  it('여러 책 순서대로', () => {
    createCollection({ name: 'C' });
    const cid = getCollections()[0].id;
    addBookToCollection(cid, 'a');
    addBookToCollection(cid, 'b');
    addBookToCollection(cid, 'c');
    expect(getCollections()[0].bookIds).toEqual(['a', 'b', 'c']);
  });

  it('없는 컬렉션 → 변화 없음', () => {
    createCollection({ name: 'C' });
    addBookToCollection('nope', 'book1');
    expect(getCollections()[0].bookIds).toEqual([]);
  });
});

/* ── removeBookFromCollection ─────────────────────────── */
describe('removeBookFromCollection', () => {
  it('책 id 제거', () => {
    createCollection({ name: 'C' });
    const cid = getCollections()[0].id;
    addBookToCollection(cid, 'a');
    addBookToCollection(cid, 'b');
    removeBookFromCollection(cid, 'a');
    expect(getCollections()[0].bookIds).toEqual(['b']);
  });

  it('없는 책 id → 오류 없음', () => {
    createCollection({ name: 'C' });
    const cid = getCollections()[0].id;
    addBookToCollection(cid, 'a');
    removeBookFromCollection(cid, 'nope');
    expect(getCollections()[0].bookIds).toEqual(['a']);
  });
});

/* ── getCollectionsByBook ─────────────────────────────── */
describe('getCollectionsByBook', () => {
  it('책이 속한 컬렉션들 반환', () => {
    createCollection({ name: 'A' });
    createCollection({ name: 'B' });
    createCollection({ name: 'C' });
    const [a, b, c] = getCollections();
    addBookToCollection(a.id, 'book1');
    addBookToCollection(c.id, 'book1');
    addBookToCollection(b.id, 'book2');

    const result = getCollectionsByBook('book1');
    expect(result).toHaveLength(2);
    expect(result.map(c => c.name).sort()).toEqual(['A', 'C']);
  });

  it('책이 어디도 없으면 빈 배열', () => {
    createCollection({ name: 'A' });
    expect(getCollectionsByBook('nothere')).toEqual([]);
  });
});

/* ── round-trip ───────────────────────────────────────── */
describe('round-trip — 컬렉션 전체 흐름', () => {
  it('생성 → 책 추가 → 이름 변경 → 책 제거 → 삭제', () => {
    createCollection({ name: '철학', emoji: '🧠' });
    const id = getCollections()[0].id;

    addBookToCollection(id, 'plato');
    addBookToCollection(id, 'nietzsche');
    expect(getCollections()[0].bookIds).toHaveLength(2);

    renameCollection(id, { name: '서양 철학', emoji: '📜' });
    expect(getCollections()[0].name).toBe('서양 철학');
    expect(getCollections()[0].emoji).toBe('📜');

    removeBookFromCollection(id, 'plato');
    expect(getCollections()[0].bookIds).toEqual(['nietzsche']);

    deleteCollection(id);
    expect(getCollections()).toHaveLength(0);
  });

  it('여러 컬렉션에 같은 책이 들어갈 수 있음', () => {
    createCollection({ name: 'A' });
    createCollection({ name: 'B' });
    const [a, b] = getCollections();
    addBookToCollection(a.id, 'shared');
    addBookToCollection(b.id, 'shared');
    expect(getCollectionsByBook('shared')).toHaveLength(2);
  });
});
