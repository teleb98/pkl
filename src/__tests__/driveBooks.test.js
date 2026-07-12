import { describe, it, expect, beforeEach, vi } from 'vitest';

/* ────────────────────────────────────────────────────────────────
   Drive 폴더 탐색기(DriveBookPicker) 지원 유틸
   - driveApi.listDriveChildren: 폴더/PDF 분리, 페이지네이션, 401→auth-expired
   - driveBooks: 수동 추가 인덱스(중복 스킵, 삭제, book 객체 매핑)
   ─────────────────────────────────────────────────────────────── */

import { listDriveChildren } from '../utils/driveApi.js';
import { getDriveBooks, addDriveBooks, removeDriveBook, driveBookToBook } from '../utils/driveBooks.js';
import { setBookMeta } from '../store.js';

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('driveApi.listDriveChildren', () => {
  it('폴더/PDF 를 분리해서 반환', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        files: [
          { id: 'f1', name: '하위폴더', mimeType: 'application/vnd.google-apps.folder' },
          { id: 'p1', name: '책1.pdf', mimeType: 'application/pdf', size: '1024' },
          { id: 'p2', name: '책2', mimeType: 'application/octet-stream' }, // 확장자로만 판별
        ],
      }),
    }));
    // '책2'는 .pdf 확장자가 없으므로 제외되어야 함
    const { folders, pdfs } = await listDriveChildren('tok', 'root');
    expect(folders).toHaveLength(1);
    expect(folders[0].name).toBe('하위폴더');
    expect(pdfs).toHaveLength(1);
    expect(pdfs[0].id).toBe('p1');
  });

  it('.pdf 확장자만 있어도 PDF 로 인식', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ files: [{ id: 'p3', name: '문서.PDF', mimeType: 'application/octet-stream' }] }),
    }));
    const { pdfs } = await listDriveChildren('tok', 'root');
    expect(pdfs).toHaveLength(1);
  });

  it('페이지네이션 — nextPageToken 을 따라가며 모두 수집', async () => {
    let call = 0;
    globalThis.fetch = vi.fn(async () => {
      call++;
      if (call === 1) {
        return { ok: true, json: async () => ({ files: [{ id: 'p1', name: 'a.pdf', mimeType: 'application/pdf' }], nextPageToken: 'tok2' }) };
      }
      return { ok: true, json: async () => ({ files: [{ id: 'p2', name: 'b.pdf', mimeType: 'application/pdf' }] }) };
    });
    const { pdfs } = await listDriveChildren('tok', 'root');
    expect(call).toBe(2);
    expect(pdfs.map(p => p.id)).toEqual(['p1', 'p2']);
  });

  it('401/403 → auth-expired', async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: false, status: 401, json: async () => ({}) }));
    await expect(listDriveChildren('tok', 'root')).rejects.toThrow('auth-expired');
  });

  it('기타 오류는 서버 메시지를 그대로 전달', async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: false, status: 500, json: async () => ({ error: { message: 'boom' } }) }));
    await expect(listDriveChildren('tok', 'root')).rejects.toThrow('boom');
  });
});

describe('driveBooks — 수동 추가 인덱스', () => {
  const FILE = { id: 'd1', name: '전략의_본질.pdf', mimeType: 'application/pdf', size: '2048', modifiedTime: '2026-01-01T00:00:00Z', webViewLink: 'https://drive/x' };

  it('빈 인덱스에서 시작', () => {
    expect(getDriveBooks()).toEqual([]);
  });

  it('추가 → 파일명에서 확장자/언더스코어 정리된 제목', () => {
    const added = addDriveBooks([FILE]);
    expect(added).toHaveLength(1);
    expect(added[0].title).toBe('전략의 본질');
    expect(added[0].source).toBe('drive');
    expect(getDriveBooks()).toHaveLength(1);
  });

  it('중복 추가 시 스킵 (반환값은 신규분만)', () => {
    addDriveBooks([FILE]);
    const second = addDriveBooks([FILE]);
    expect(second).toHaveLength(0);
    expect(getDriveBooks()).toHaveLength(1);
  });

  it('여러 파일 동시 추가', () => {
    addDriveBooks([FILE, { ...FILE, id: 'd2', name: '책2.pdf' }]);
    expect(getDriveBooks()).toHaveLength(2);
  });

  it('삭제', () => {
    addDriveBooks([FILE]);
    removeDriveBook('d1');
    expect(getDriveBooks()).toEqual([]);
  });

  it('driveBookToBook — store 진행률과 병합', () => {
    addDriveBooks([FILE]);
    setBookMeta('d1', { status: 'reading', progress: 42, lastPage: 10 });
    const book = driveBookToBook(getDriveBooks()[0]);
    expect(book.id).toBe('d1');
    expect(book.source).toBe('drive');
    expect(book.status).toBe('reading');
    expect(book.progress).toBe(42);
    expect(book.webViewLink).toBe('https://drive/x');
  });

  it('진행 기록 없으면 기본값(unread/0)', () => {
    addDriveBooks([FILE]);
    const book = driveBookToBook(getDriveBooks()[0]);
    expect(book.status).toBe('unread');
    expect(book.progress).toBe(0);
  });
});
