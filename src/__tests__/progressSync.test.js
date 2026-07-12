import { describe, it, expect, beforeEach, vi } from 'vitest';

/* ────────────────────────────────────────────────────────────────
   읽은 위치(진행률) 전용 Drive 동기화 — 메모/하이라이트 백업과는 별개로
   "어디까지 읽었는지"만 작은 JSON(PKL/progress.json)으로 동기화.
   ─────────────────────────────────────────────────────────────── */

import { setBookMeta, getBookMeta, saveBookIndex } from '../store.js';
import { collectProgressRecords, mergeRemoteProgress, syncProgressWithDrive } from '../utils/progressSync.js';

function seedLocalBooks(list) { localStorage.setItem('pkl_local_books', JSON.stringify(list)); }
function seedDriveBooks(list) { localStorage.setItem('pkl_drive_books', JSON.stringify(list)); }

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('collectProgressRecords', () => {
  it('진행 기록이 있는 책만 포함', () => {
    saveBookIndex([{ id: 'b1', title: '책1' }, { id: 'b2', title: '책2' }]);
    setBookMeta('b1', { status: 'reading', progress: 40, lastPage: 20 });
    const records = collectProgressRecords();
    expect(Object.keys(records)).toEqual(['b1']);
    expect(records.b1).toMatchObject({ title: '책1', status: 'reading', progress: 40, lastPage: 20 });
    expect(records.b1.updatedAt).toBeGreaterThan(0);
  });

  it('localBooks / driveBooks 인덱스의 책도 포함', () => {
    seedLocalBooks([{ id: 'l1', title: '로컬책' }]);
    seedDriveBooks([{ id: 'd1', title: 'Drive책' }]);
    setBookMeta('l1', { progress: 10 });
    setBookMeta('d1', { progress: 20 });
    const records = collectProgressRecords();
    expect(records.l1.title).toBe('로컬책');
    expect(records.d1.title).toBe('Drive책');
  });

  it('알려지지 않은(서재에 없는) 책 id는 제외', () => {
    setBookMeta('orphan', { progress: 50 });
    expect(collectProgressRecords()).toEqual({});
  });
});

describe('mergeRemoteProgress — last-write-wins', () => {
  it('원격이 더 최신이면 로컬에 반영', () => {
    saveBookIndex([{ id: 'b1', title: '책1' }]);
    setBookMeta('b1', { progress: 10, lastPage: 5, updatedAt: 1000 });
    const applied = mergeRemoteProgress({ b1: { status: 'reading', progress: 80, lastPage: 40, pages: 200, updatedAt: 2000 } });
    expect(applied).toBe(1);
    const meta = getBookMeta('b1');
    expect(meta.progress).toBe(80);
    expect(meta.lastPage).toBe(40);
    expect(meta.updatedAt).toBe(2000); // 원격 타임스탬프 그대로 — 지금 시각으로 덮이지 않음
  });

  it('로컬이 더 최신이면 무시', () => {
    saveBookIndex([{ id: 'b1', title: '책1' }]);
    setBookMeta('b1', { progress: 90, updatedAt: 5000 });
    const applied = mergeRemoteProgress({ b1: { progress: 10, updatedAt: 1000 } });
    expect(applied).toBe(0);
    expect(getBookMeta('b1').progress).toBe(90);
  });

  it('로컬에 없는 새 책은 그대로 반영', () => {
    const applied = mergeRemoteProgress({ new1: { status: 'completed', progress: 100, lastPage: 300, updatedAt: 999 } });
    expect(applied).toBe(1);
    expect(getBookMeta('new1').status).toBe('completed');
  });

  it('빈/undefined 입력은 안전하게 처리', () => {
    expect(mergeRemoteProgress(undefined)).toBe(0);
    expect(mergeRemoteProgress({})).toBe(0);
  });
});

describe('syncProgressWithDrive', () => {
  it('토큰 없으면 no-token 에러', async () => {
    await expect(syncProgressWithDrive(null)).rejects.toThrow('no-token');
  });

  it('원격 파일 없음 → 폴더 생성 후 로컬 스냅샷을 새로 업로드', async () => {
    saveBookIndex([{ id: 'b1', title: '책1' }]);
    setBookMeta('b1', { progress: 30, lastPage: 15 });

    const calls = [];
    globalThis.fetch = vi.fn(async (url, opts) => {
      calls.push({ url: String(url), method: opts?.method || 'GET' });
      // 1) findOrCreateFolder: 폴더 조회 → 없음 → 생성
      if (String(url).includes('q=') && String(url).includes('folder')) {
        return { ok: true, json: async () => ({ files: [] }) };
      }
      if (opts?.method === 'POST' && String(url).endsWith('/files')) {
        return { ok: true, json: async () => ({ id: 'folder-id' }) };
      }
      // 2) progress.json 조회 → 없음
      if (String(url).includes(`name='progress.json'`)) {
        return { ok: true, json: async () => ({ files: [] }) };
      }
      // 3) 신규 업로드 (multipart POST)
      if (opts?.method === 'POST' && String(url).includes('uploadType=multipart')) {
        return { ok: true, json: async () => ({ id: 'new-file-id' }) };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    });

    const res = await syncProgressWithDrive('TOKEN');
    expect(res.pulled).toBe(0);
    expect(res.total).toBe(1);
    expect(calls.some(c => c.method === 'POST' && c.url.includes('uploadType=multipart'))).toBe(true);
  });

  it('원격 진행률이 더 최신이면 로컬에 반영 후 병합 스냅샷을 업로드(PATCH)', async () => {
    saveBookIndex([{ id: 'b1', title: '책1' }]);
    setBookMeta('b1', { progress: 10, lastPage: 5, updatedAt: 1000 });

    let uploadedBody = null;
    globalThis.fetch = vi.fn(async (url, opts) => {
      const u = String(url);
      if (u.includes('folder') && u.includes('q=')) return { ok: true, json: async () => ({ files: [{ id: 'folder-id' }] }) };
      if (u.includes(`name='progress.json'`)) return { ok: true, json: async () => ({ files: [{ id: 'existing-file' }] }) };
      if (u.includes('alt=media')) {
        return { ok: true, json: async () => ({ b1: { status: 'reading', progress: 77, lastPage: 33, pages: 100, updatedAt: 9999 } }) };
      }
      if (opts?.method === 'PATCH') {
        uploadedBody = JSON.parse(opts.body);
        return { ok: true, json: async () => ({}) };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    });

    const res = await syncProgressWithDrive('TOKEN');
    expect(res.pulled).toBe(1);
    expect(getBookMeta('b1').progress).toBe(77);
    expect(uploadedBody.b1.progress).toBe(77); // 병합된 최신 상태가 다시 업로드됨
  });

  it('401 → DriveError(status 401)', async () => {
    saveBookIndex([{ id: 'b1', title: '책1' }]);
    setBookMeta('b1', { progress: 1 });
    globalThis.fetch = vi.fn(async () => ({ ok: false, status: 401, json: async () => ({}) }));
    await expect(syncProgressWithDrive('BAD')).rejects.toMatchObject({ status: 401 });
  });
});
