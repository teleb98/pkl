import { describe, it, expect, beforeEach, vi } from 'vitest';

/* ────────────────────────────────────────────────────────────────
   Drive 책 로컬 영구 사본 관리 —
   1) 이미 IndexedDB 에 캐시된(과거에 연) 책도 명시적으로 로컬 파일 저장 가능
   2) 서재에서 제거 시 drive-books/ 안의 로컬 사본 파일도 함께 정리
   ─────────────────────────────────────────────────────────────── */

vi.mock('../utils/localBooks.js', () => ({ isElectron: vi.fn(() => false) }));
vi.mock('../utils/pdfCache.js', () => ({
  getCachedPdf: vi.fn(async () => null),
  cachePdf: vi.fn(),
  downloadWithProgress: vi.fn(async () => new ArrayBuffer(8)),
}));

import { isElectron } from '../utils/localBooks.js';
import { getCachedPdf, cachePdf, downloadWithProgress } from '../utils/pdfCache.js';
import { setBookMeta, getBookMeta } from '../store.js';
import { needsLocalCopy, ensureDriveLocalCopy, deleteDriveLocalCopy } from '../utils/driveLocalCopy.js';

const BOOK = { id: 'drive-1', source: 'drive', title: 'x' };

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  delete window.electron;
  isElectron.mockReturnValue(false);
});

describe('needsLocalCopy', () => {
  it('비Electron → false', () => {
    expect(needsLocalCopy(BOOK)).toBe(false);
  });

  it('Electron + drive 책 + filePath 없음 → true', () => {
    isElectron.mockReturnValue(true);
    expect(needsLocalCopy(BOOK)).toBe(true);
  });

  it('이미 filePath 있으면 → false', () => {
    isElectron.mockReturnValue(true);
    setBookMeta(BOOK.id, { filePath: '/x.pdf' });
    expect(needsLocalCopy(BOOK)).toBe(false);
  });

  it('로컬 책(source=local)은 대상 아님', () => {
    isElectron.mockReturnValue(true);
    expect(needsLocalCopy({ id: 'l1', source: 'local' })).toBe(false);
  });
});

describe('ensureDriveLocalCopy', () => {
  it('비Electron → electron-only 에러', async () => {
    await expect(ensureDriveLocalCopy(BOOK)).rejects.toThrow('electron-only');
  });

  it('이미 filePath 있으면 재작업 없이 alreadyExists', async () => {
    isElectron.mockReturnValue(true);
    setBookMeta(BOOK.id, { filePath: '/existing.pdf' });
    const res = await ensureDriveLocalCopy(BOOK);
    expect(res).toEqual({ ok: true, alreadyExists: true, path: '/existing.pdf' });
    expect(getCachedPdf).not.toHaveBeenCalled();
  });

  it('IndexedDB 캐시 있으면 재다운로드 없이 저장', async () => {
    isElectron.mockReturnValue(true);
    getCachedPdf.mockResolvedValueOnce(new ArrayBuffer(16));
    window.electron = { saveDrivePdf: vi.fn(async () => ({ ok: true, path: '/saved.pdf' })) };

    const res = await ensureDriveLocalCopy(BOOK);
    expect(res).toEqual({ ok: true, path: '/saved.pdf' });
    expect(downloadWithProgress).not.toHaveBeenCalled();
    expect(window.electron.saveDrivePdf).toHaveBeenCalledWith('drive-1.pdf', expect.any(ArrayBuffer));
    expect(getBookMeta(BOOK.id).filePath).toBe('/saved.pdf');
  });

  it('캐시 없으면 Drive 다운로드 후 저장 (토큰 필요)', async () => {
    isElectron.mockReturnValue(true);
    localStorage.setItem('pkl_config', JSON.stringify({ driveAccessToken: 'tok' }));
    window.electron = { saveDrivePdf: vi.fn(async () => ({ ok: true, path: '/dl.pdf' })) };

    const res = await ensureDriveLocalCopy(BOOK);
    expect(downloadWithProgress).toHaveBeenCalled();
    expect(cachePdf).toHaveBeenCalled();
    expect(res.path).toBe('/dl.pdf');
  });

  it('캐시도 없고 토큰도 없으면 auth 에러', async () => {
    isElectron.mockReturnValue(true);
    await expect(ensureDriveLocalCopy(BOOK)).rejects.toThrow('auth');
  });

  it('saveDrivePdf 실패하면 그 에러를 전달', async () => {
    isElectron.mockReturnValue(true);
    getCachedPdf.mockResolvedValueOnce(new ArrayBuffer(8));
    window.electron = { saveDrivePdf: vi.fn(async () => ({ ok: false, error: 'disk-full' })) };
    await expect(ensureDriveLocalCopy(BOOK)).rejects.toThrow('disk-full');
  });
});

describe('deleteDriveLocalCopy', () => {
  it('비Electron → no-op', async () => {
    await expect(deleteDriveLocalCopy(BOOK)).resolves.toBeUndefined();
  });

  it('filePath 없으면 삭제 호출 안 함', async () => {
    isElectron.mockReturnValue(true);
    window.electron = { deleteDrivePdf: vi.fn() };
    await deleteDriveLocalCopy(BOOK);
    expect(window.electron.deleteDrivePdf).not.toHaveBeenCalled();
  });

  it('filePath 있으면 삭제 IPC 호출', async () => {
    isElectron.mockReturnValue(true);
    setBookMeta(BOOK.id, { filePath: '/to-delete.pdf' });
    window.electron = { deleteDrivePdf: vi.fn(async () => ({ ok: true })) };
    await deleteDriveLocalCopy(BOOK);
    expect(window.electron.deleteDrivePdf).toHaveBeenCalledWith('/to-delete.pdf');
  });

  it('삭제 실패해도 크래시 없음', async () => {
    isElectron.mockReturnValue(true);
    setBookMeta(BOOK.id, { filePath: '/x.pdf' });
    window.electron = { deleteDrivePdf: vi.fn(async () => { throw new Error('fs error'); }) };
    await expect(deleteDriveLocalCopy(BOOK)).resolves.toBeUndefined();
  });
});
