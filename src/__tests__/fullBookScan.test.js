import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';

/* ────────────────────────────────────────────────────────────────
   책 전체 Vision 스캔 — IndexedDB 영구 저장(bookTextDb) + 하이드레이션
   pdf.js 는 모킹 (페이지별 텍스트 레이어/이미지 시나리오 제어)
   ─────────────────────────────────────────────────────────────── */

// pdf.js 모킹: 5페이지 — 1,2p 텍스트 레이어, 3~5p 스캔본(텍스트 없음)
const PAGE_TEXTS = { 1: '1장 서론입니다', 2: '2장 본문입니다', 3: '', 4: '', 5: '' };
vi.mock('pdfjs-dist/build/pdf.min.mjs', () => ({
  GlobalWorkerOptions: {},
  getDocument: () => ({
    promise: Promise.resolve({
      numPages: 5,
      destroy: () => {},
      getPage: async (n) => ({
        getTextContent: async () => ({ items: PAGE_TEXTS[n] ? [{ str: PAGE_TEXTS[n] }] : [] }),
        getViewport: () => ({ scale: 1.5, width: 100, height: 140 }),
        render: () => ({ promise: Promise.resolve() }),
      }),
    }),
  }),
}));
vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: 'worker-url' }));
vi.mock('../utils/pdfCache.js', () => ({
  getCachedPdf: vi.fn(async () => new ArrayBuffer(8)),
  cachePdf: vi.fn(),
  deleteCachedPdf: vi.fn(),
}));
// OCR 체인 모킹 — 스캔본 페이지 인식 결과
const ocrMock = vi.fn(async () => 'OCR 인식 텍스트');
vi.mock('../utils/ocr/index.js', () => ({
  createOcr: vi.fn(async () => ocrMock),
}));

import { scanFullBookText, hydrateBookText } from '../utils/fullBookScan.js';
import { getBookText, saveBookText, deleteBookText } from '../utils/bookTextDb.js';
import { getDocumentText, hasPageText, _resetForTesting } from '../pageTextCache.js';
import { getBookMeta } from '../store.js';

// canvas 모킹 (jsdom 은 getContext 미구현)
beforeEach(() => {
  localStorage.clear();
  _resetForTesting();
  ocrMock.mockClear();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({});
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,QkFTRTY0');
});

const BOOK = { id: 'book-1', title: '테스트 책' };

describe('bookTextDb — IndexedDB 영구 저장', () => {
  it('저장/조회/삭제 라운드트립', async () => {
    await deleteBookText('db-test');
    expect(await getBookText('db-test')).toBeNull();
    await saveBookText('db-test', { pages: { 1: '가나다' }, totalPages: 1, scannedPages: 1, done: true });
    const rec = await getBookText('db-test');
    expect(rec.pages[1]).toBe('가나다');
    expect(rec.done).toBe(true);
    expect(rec.updatedAt).toBeGreaterThan(0);
    await deleteBookText('db-test');
    expect(await getBookText('db-test')).toBeNull();
  });
});

describe('scanFullBookText — 전체 스캔', () => {
  it('텍스트 레이어 + 스캔본 OCR 을 합쳐 전체 페이지 저장', async () => {
    await deleteBookText(BOOK.id);
    const progress = [];
    const res = await scanFullBookText(BOOK, { lang: 'ko', onProgress: p => progress.push(p) });

    expect(res.done).toBe(true);
    expect(res.totalPages).toBe(5);
    expect(res.scannedPages).toBe(5);
    expect(res.ocrPages).toBe(3); // 3~5p 만 OCR
    expect(ocrMock).toHaveBeenCalledTimes(3);

    // IndexedDB 에 영구 저장
    const rec = await getBookText(BOOK.id);
    expect(rec.done).toBe(true);
    expect(rec.pages[1]).toBe('1장 서론입니다');
    expect(rec.pages[4]).toBe('OCR 인식 텍스트');

    // 메모리 캐시도 채워짐 → AI/검색 즉시 활용
    expect(getDocumentText(BOOK.id).text).toContain('1장 서론입니다');
    expect(getBookMeta(BOOK.id).fullTextDone).toBe(true);
    expect(progress.length).toBe(5);
  });

  it('중단 후 재시작하면 이어서 스캔 (이미 된 페이지 OCR 재실행 안 함)', async () => {
    await deleteBookText(BOOK.id);
    // 2페이지 진행 후 중단
    let count = 0;
    const res1 = await scanFullBookText(BOOK, { lang: 'ko', shouldStop: () => count++ >= 2 });
    expect(res1.done).toBe(false);
    expect(res1.scannedPages).toBe(2);

    ocrMock.mockClear();
    _resetForTesting();
    const res2 = await scanFullBookText(BOOK, { lang: 'ko' });
    expect(res2.done).toBe(true);
    expect(res2.scannedPages).toBe(5);
    expect(ocrMock).toHaveBeenCalledTimes(3); // 남은 스캔본 3페이지만
  });

  it('PDF 캐시가 없으면 pdf-not-cached', async () => {
    const { getCachedPdf } = await import('../utils/pdfCache.js');
    getCachedPdf.mockResolvedValueOnce(null);
    await expect(scanFullBookText({ id: 'nope', title: 'x' }, {})).rejects.toThrow('pdf-not-cached');
  });
});

describe('hydrateBookText — 재시작 후 복원', () => {
  it('저장된 전문을 메모리 캐시로 복원', async () => {
    await saveBookText('book-h', { pages: { 1: '복원될 텍스트', 2: '둘째 장' }, totalPages: 2, scannedPages: 2, done: true });
    expect(hasPageText('book-h', 1)).toBe(false);
    const n = await hydrateBookText('book-h');
    expect(n).toBe(2);
    expect(getDocumentText('book-h').text).toContain('복원될 텍스트');
    // 이미 복원된 상태에서 재호출 → 0
    expect(await hydrateBookText('book-h')).toBe(0);
  });

  it('저장 기록 없는 책 → 0', async () => {
    expect(await hydrateBookText('unknown-book')).toBe(0);
  });
});
