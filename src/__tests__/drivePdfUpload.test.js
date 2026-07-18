import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../utils/pdfCache.js', () => ({ getCachedPdf: vi.fn() }));

import { uploadPdfToDrive, uploadBooksToDrive, ensurePdfFolder } from '../utils/drivePdfUpload.js';
import { getCachedPdf } from '../utils/pdfCache.js';

const FOLDER = 'application/vnd.google-apps.folder';

/* MyLibrary/books 구조를 흉내내는 fetch 목 — 업로드 호출을 기록 */
function mockDrive({ existingPdfName = null } = {}) {
  const uploads = [];
  const fetchImpl = vi.fn(async (url, init = {}) => {
    const u = String(url);
    const method = (init.method || 'GET').toUpperCase();
    if (u.includes('upload/drive')) {
      uploads.push({ url: u, method, contentType: init.headers?.['Content-Type'] || '' });
      return { ok: true, status: 200, json: async () => ({ id: 'up1', webViewLink: 'https://d/up1' }) };
    }
    if (method === 'POST') {   // 폴더 생성
      const meta = JSON.parse(init.body);
      return { ok: true, status: 200, json: async () => ({ id: `dir_${meta.name}` }) };
    }
    const q = decodeURIComponent(((u.match(/[?&]q=([^&]+)/) || [])[1] || '').replace(/\+/g, ' '));
    if (q.includes(`mimeType='${FOLDER}'`)) {
      // 폴더 조회 — 항상 없음 → 생성 경로
      return { ok: true, status: 200, json: async () => ({ files: [] }) };
    }
    // 파일 이름 조회
    const nm = (q.match(/name='((?:[^'\\]|\\.)*)'/) || [])[1];
    const hit = existingPdfName && nm === existingPdfName;
    return { ok: true, status: 200, json: async () => ({ files: hit ? [{ id: 'old1' }] : [] }) };
  });
  return { fetchImpl, uploads };
}

beforeEach(() => vi.clearAllMocks());

describe('ensurePdfFolder', () => {
  it('MyLibrary → books 순으로 폴더를 확보한다', async () => {
    const { fetchImpl } = mockDrive();
    globalThis.fetch = fetchImpl;
    const id = await ensurePdfFolder('tok');
    expect(id).toBe('dir_books');
  });
});

describe('uploadPdfToDrive', () => {
  it('신규 파일은 multipart 로 생성한다(application/pdf)', async () => {
    const { fetchImpl, uploads } = mockDrive();
    globalThis.fetch = fetchImpl;
    const res = await uploadPdfToDrive('tok', { fileName: '책.pdf', arrayBuffer: new ArrayBuffer(8) });
    expect(res.updated).toBe(false);
    expect(uploads[0].method).toBe('POST');
    expect(uploads[0].url).toContain('uploadType=multipart');
  });

  it('같은 이름이 있으면 PATCH 로 갱신한다', async () => {
    const { fetchImpl, uploads } = mockDrive({ existingPdfName: '책.pdf' });
    globalThis.fetch = fetchImpl;
    const res = await uploadPdfToDrive('tok', { fileName: '책.pdf', arrayBuffer: new ArrayBuffer(8) });
    expect(res.updated).toBe(true);
    expect(uploads[0].method).toBe('PATCH');
    expect(uploads[0].contentType).toBe('application/pdf');
  });
});

describe('uploadBooksToDrive', () => {
  it('캐시된 책은 업로드, 캐시 없는 책은 실패로 센다', async () => {
    const { fetchImpl, uploads } = mockDrive();
    globalThis.fetch = fetchImpl;
    getCachedPdf.mockImplementation(async (id) => (id === 'b1' ? new ArrayBuffer(8) : null));

    const res = await uploadBooksToDrive('tok', [{ id: 'b1', title: '있음' }, { id: 'b2', title: '캐시없음' }]);
    expect(res).toEqual({ done: 1, failed: 1, total: 2 });
    expect(uploads.length).toBe(1);
  });

  it('토큰이 없으면 에러', async () => {
    await expect(uploadBooksToDrive('', [])).rejects.toThrow('no-token');
  });
});
