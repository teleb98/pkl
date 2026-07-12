import { describe, it, expect, beforeEach, vi } from 'vitest';

/* ────────────────────────────────────────────────────────────────
   컬렉션·단어장 Drive 동기화 — 이전에는 아예 백업 대상이 아니라 기기
   변경/재설치 시 사라지던 데이터. 합집합(union) 병합으로 데이터 손실 없이
   동기화(정밀 last-write-wins 대신 안전한 기본값).
   ─────────────────────────────────────────────────────────────── */

import { createCollection, getCollections, addVocabularyEntry, getVocabulary } from '../store.js';
import { unionCollections, unionVocabulary, syncLibraryDataWithDrive } from '../utils/librarySync.js';

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('unionCollections', () => {
  it('겹치지 않는 컬렉션은 모두 유지', () => {
    const local = [{ id: 'c1', name: '읽고싶은책', bookIds: ['b1'] }];
    const remote = [{ id: 'c2', name: '완독', bookIds: ['b2'] }];
    const merged = unionCollections(local, remote);
    expect(merged.map(c => c.id).sort()).toEqual(['c1', 'c2']);
  });

  it('같은 id 컬렉션은 bookIds 를 합집합으로 병합 (양쪽 추가분 보존)', () => {
    const local = [{ id: 'c1', name: '읽고싶은책', bookIds: ['b1', 'b2'] }];
    const remote = [{ id: 'c1', name: '읽고싶은책', bookIds: ['b2', 'b3'] }];
    const merged = unionCollections(local, remote);
    expect(merged).toHaveLength(1);
    expect(merged[0].bookIds.sort()).toEqual(['b1', 'b2', 'b3']);
  });

  it('local/remote 가 비어도 크래시 없음', () => {
    expect(unionCollections(null, null)).toEqual([]);
    expect(unionCollections([], undefined)).toEqual([]);
  });
});

describe('unionVocabulary', () => {
  it('겹치지 않는 단어는 모두 유지', () => {
    const local = [{ id: 'v1', word: 'apple' }];
    const remote = [{ id: 'v2', word: 'banana' }];
    expect(unionVocabulary(local, remote)).toHaveLength(2);
  });

  it('같은 id 는 중복 제거', () => {
    const local = [{ id: 'v1', word: 'apple' }];
    const remote = [{ id: 'v1', word: 'apple' }];
    expect(unionVocabulary(local, remote)).toHaveLength(1);
  });

  it('다른 id 라도 같은 단어(대소문자 무시)는 중복 제거 — 양쪽 기기에서 독립적으로 같은 단어를 추가한 경우', () => {
    const local = [{ id: 'v1', word: 'Apple' }];
    const remote = [{ id: 'v2', word: 'apple' }];
    expect(unionVocabulary(local, remote)).toHaveLength(1);
  });
});

describe('syncLibraryDataWithDrive', () => {
  it('토큰 없으면 no-token 에러', async () => {
    await expect(syncLibraryDataWithDrive(null)).rejects.toThrow('no-token');
  });

  it('원격 데이터와 병합 후 로컬 저장 + 업로드', async () => {
    createCollection({ name: '내 컬렉션' });
    addVocabularyEntry({ word: '로컬단어', definition: '뜻1' });

    let uploaded = null;
    globalThis.fetch = vi.fn(async (url, opts) => {
      // 디코딩 후 매칭 — encodeURIComponent 가 '='→'%3D' 로 바꾸므로 원문 그대로 비교하면 어긋난다.
      // 폴더 존재 확인은 mimeType 마커로 구분(파일ID 'folder-id' 문자열에 'folder' 가 포함돼 오매칭 방지).
      const u = decodeURIComponent(String(url));
      if (u.includes('google-apps.folder')) return { ok: true, json: async () => ({ files: [{ id: 'folder-id' }] }) };
      if (u.includes(`name='library-data.json'`)) return { ok: true, json: async () => ({ files: [] }) };
      if (opts?.method === 'POST' && u.includes('uploadType=multipart')) {
        uploaded = JSON.parse(opts.body.split('\r\n').find(l => l.startsWith('{"collections"')) || '{}');
        return { ok: true, json: async () => ({ id: 'new-file' }) };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    });

    const res = await syncLibraryDataWithDrive('TOKEN');
    expect(res.collections).toBe(1);
    expect(res.vocabulary).toBe(1);
    // 로컬 store 는 그대로(이미 최신) — 반영 후 재조회해도 동일해야 함
    expect(getCollections()).toHaveLength(1);
    expect(getVocabulary()).toHaveLength(1);
    // Drive 에 업로드된 스냅샷도 로컬 데이터를 반영해야 함
    expect(uploaded.collections[0].name).toBe('내 컬렉션');
    expect(uploaded.vocabulary[0].word).toBe('로컬단어');
  });

  it('원격에만 있던 컬렉션/단어가 로컬에도 반영됨', async () => {
    globalThis.fetch = vi.fn(async (url, opts) => {
      const u = decodeURIComponent(String(url));
      if (u.includes('google-apps.folder')) return { ok: true, json: async () => ({ files: [{ id: 'folder-id' }] }) };
      if (u.includes(`name='library-data.json'`)) return { ok: true, json: async () => ({ files: [{ id: 'existing-file' }] }) };
      if (u.includes('alt=media')) {
        return {
          ok: true,
          json: async () => ({
            collections: [{ id: 'remote-c1', name: '원격컬렉션', bookIds: ['b1'] }],
            vocabulary: [{ id: 'remote-v1', word: '원격단어', definition: '뜻' }],
          }),
        };
      }
      if (opts?.method === 'PATCH') return { ok: true, json: async () => ({}) };
      return { ok: false, status: 404, json: async () => ({}) };
    });

    await syncLibraryDataWithDrive('TOKEN');
    expect(getCollections().some(c => c.name === '원격컬렉션')).toBe(true);
    expect(getVocabulary().some(v => v.word === '원격단어')).toBe(true);
  });

  it('401 → DriveError(status 401)', async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: false, status: 401, json: async () => ({}) }));
    await expect(syncLibraryDataWithDrive('BAD')).rejects.toMatchObject({ status: 401 });
  });
});
