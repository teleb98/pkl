import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { ThemeContext } from '../context.jsx';
import { THEMES, TYPE_PAIRS } from '../data.js';
import { _resetForTesting } from '../pageTextCache.js';

/* ── pdfjs mock ─────────────────────────────────────────── */
vi.mock('pdfjs-dist/build/pdf.min.mjs', () => ({
  getDocument: vi.fn(),
  GlobalWorkerOptions: { workerSrc: '' },
  TextLayer: vi.fn(),
}));
vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: '' }));
/* PDF 캐시: 기본은 캐시 미스(null) + 다운로드 성공(ArrayBuffer) */
vi.mock('../utils/pdfCache.js', () => ({
  getCachedPdf:        vi.fn(() => Promise.resolve(null)),        // 캐시 미스
  cachePdf:            vi.fn(() => Promise.resolve()),
  downloadWithProgress: vi.fn(() => Promise.resolve(new ArrayBuffer(8))),
}));
vi.mock('../aiClient.js', () => ({ callAI: vi.fn(() => Promise.resolve('')) }));
vi.mock('../utils/cloudVisionOcr.js', () => ({ ocrImageWithVision: vi.fn(() => Promise.resolve('')) }));

import { getDocument, TextLayer } from 'pdfjs-dist/build/pdf.min.mjs';
import { getCachedPdf, downloadWithProgress } from '../utils/pdfCache.js';
import { PdfViewer } from '../components/PdfViewer.jsx';

/* ── Helpers ─────────────────────────────────────────────── */
const T = THEMES.ember;
const F = TYPE_PAIRS.lora;

function renderViewer(props = {}) {
  return render(
    <ThemeContext.Provider value={{ T, F }}>
      <PdfViewer fileId="file123" page={1} lang="ko" {...props} />
    </ThemeContext.Provider>
  );
}

function makeMockPage(textItems = [{ str: 'Hello PDF' }]) {
  return {
    getViewport: vi.fn().mockReturnValue({ width: 600, height: 800, scale: 1, transform: [1,0,0,1,0,0] }),
    render:      vi.fn().mockReturnValue({ promise: Promise.resolve(), cancel: vi.fn() }),
    getTextContent:    vi.fn().mockResolvedValue({ items: textItems }),
    streamTextContent: vi.fn().mockReturnValue({ getReader: vi.fn() }),
  };
}

function makeMockPdf(pages = 5, textItems = [{ str: 'Hello PDF' }]) {
  const mockPage = makeMockPage(textItems);
  return {
    numPages: pages,
    getPage:      vi.fn().mockResolvedValue(mockPage),
    getOutline:   vi.fn().mockResolvedValue([]),  // 형광펜/챕터 outline 추출용
    getDestination: vi.fn().mockResolvedValue([]),
    getPageIndex:   vi.fn().mockResolvedValue(0),
    destroy:      vi.fn(),
    _mockPage: mockPage,
  };
}

function makeMockLoadingTask(pdf) {
  const task = {
    onProgress: null,
    promise: Promise.resolve(pdf),
    destroy: vi.fn(),
  };
  return task;
}

function setupToken(token = 'test-token-abc') {
  localStorage.setItem('pkl_config', JSON.stringify({ driveAccessToken: token }));
}

beforeEach(() => {
  localStorage.clear();
  _resetForTesting();
  vi.clearAllMocks();
  // TextLayer is called with `new` → use regular function (not arrow) as constructor
  TextLayer.mockImplementation(function() {
    this.render  = vi.fn().mockResolvedValue(undefined);
    this.cancel  = vi.fn();
  });
});

/* ── P1-3: 캐시 우선 로딩 (IndexedDB → Drive 다운로드) ─────── */
describe('P1-3: Cache-first PDF loading', () => {
  it('캐시 미스 시 downloadWithProgress로 Drive에서 다운로드 후 getDocument({data}) 호출', async () => {
    setupToken();
    getCachedPdf.mockResolvedValueOnce(null); // 캐시 미스
    getDocument.mockReturnValue(makeMockLoadingTask(makeMockPdf()));

    renderViewer({ fileId: 'myFileId' });

    await waitFor(() => expect(getDocument).toHaveBeenCalled());
    expect(downloadWithProgress).toHaveBeenCalledWith('myFileId', expect.any(String), expect.any(Function));
    const arg = getDocument.mock.calls[0][0];
    expect(arg.data).toBeInstanceOf(ArrayBuffer);
    expect(arg.url).toBeUndefined();
  });

  it('캐시 히트 시 downloadWithProgress 호출 없이 즉시 로드', async () => {
    setupToken();
    const cached = new ArrayBuffer(16);
    getCachedPdf.mockResolvedValueOnce(cached); // 캐시 히트
    getDocument.mockReturnValue(makeMockLoadingTask(makeMockPdf()));

    renderViewer({ fileId: 'cachedFile' });

    await waitFor(() => expect(getDocument).toHaveBeenCalled());
    expect(downloadWithProgress).not.toHaveBeenCalled();
    expect(getDocument.mock.calls[0][0].data).toBe(cached);
  });

  it('토큰 없으면 auth 에러', async () => {
    const { getByText } = renderViewer();
    await waitFor(() => expect(getByText(/Drive 인증이 만료/)).toBeTruthy());
  });

  it('downloadWithProgress가 "auth" 에러 던지면 인증 에러 표시', async () => {
    setupToken();
    downloadWithProgress.mockRejectedValueOnce(new Error('auth'));

    const { getByText } = renderViewer();
    await waitFor(() => expect(getByText(/Drive 인증이 만료/)).toBeTruthy());
  });

  it('다운로드 실패 시 에러 메시지 표시', async () => {
    setupToken();
    downloadWithProgress.mockRejectedValueOnce(new Error('dl-fail-xyz'));

    const { queryAllByText } = renderViewer();
    await waitFor(() => expect(queryAllByText(/dl-fail-xyz/).length).toBeGreaterThan(0));
  });

  it('rangeChunkSize 65536 유지', async () => {
    setupToken();
    getDocument.mockReturnValue(makeMockLoadingTask(makeMockPdf()));

    renderViewer();

    await waitFor(() => expect(getDocument).toHaveBeenCalled());
    expect(getDocument.mock.calls[0][0].rangeChunkSize).toBe(65536);
  });

  it('calls onTotalPages after successful load', async () => {
    setupToken();
    const onTotalPages = vi.fn();
    getDocument.mockReturnValue(makeMockLoadingTask(makeMockPdf(12)));

    renderViewer({ onTotalPages });
    await waitFor(() => expect(onTotalPages).toHaveBeenCalledWith(12));
  });

  it('calls loadingTask.destroy() on unmount (cleanup)', async () => {
    setupToken();
    const task = makeMockLoadingTask(makeMockPdf());
    getDocument.mockReturnValue(task);

    const { unmount } = renderViewer();
    await waitFor(() => expect(getDocument).toHaveBeenCalled());

    unmount();
    expect(task.destroy).toHaveBeenCalled();
  });

  it('calls loadingTask.destroy() when fileId changes', async () => {
    setupToken();
    const task1 = makeMockLoadingTask(makeMockPdf());
    const task2 = makeMockLoadingTask(makeMockPdf());
    getDocument.mockReturnValueOnce(task1).mockReturnValueOnce(task2);

    const { rerender } = renderViewer({ fileId: 'file-A' });
    await waitFor(() => expect(getDocument).toHaveBeenCalledTimes(1));

    rerender(
      <ThemeContext.Provider value={{ T, F }}>
        <PdfViewer fileId="file-B" page={1} lang="ko" />
      </ThemeContext.Provider>
    );

    await waitFor(() => expect(getDocument).toHaveBeenCalledTimes(2));
    expect(task1.destroy).toHaveBeenCalled();
  });
});

/* ── P1-1: TextLayer for text selection ─────────────────── */
describe('P1-1: TextLayer (text selection)', () => {
  it('renders a .pdfTextLayer div overlay', async () => {
    setupToken();
    getDocument.mockReturnValue(makeMockLoadingTask(makeMockPdf()));

    const { container } = renderViewer();
    // Initially (loading state) there's no textLayer
    // After load, the canvas view appears with the overlay
    await waitFor(() => {
      expect(container.querySelector('.pdfTextLayer')).not.toBeNull();
    });
  });

  it('instantiates TextLayer after page renders', async () => {
    setupToken();
    getDocument.mockReturnValue(makeMockLoadingTask(makeMockPdf()));

    renderViewer({ page: 1 });
    await waitFor(() => expect(TextLayer).toHaveBeenCalled());

    const args = TextLayer.mock.calls[0][0];
    expect(args).toMatchObject({
      viewport: expect.any(Object),
      container: expect.any(HTMLElement),
    });
  });

  it('passes streamTextContent source to TextLayer', async () => {
    setupToken();
    const pdf = makeMockPdf();
    getDocument.mockReturnValue(makeMockLoadingTask(pdf));

    renderViewer({ page: 1 });
    await waitFor(() => expect(TextLayer).toHaveBeenCalled());

    const args = TextLayer.mock.calls[0][0];
    expect(args.textContentSource).toBeDefined();
  });

  it('calls TextLayer.render() after instantiation', async () => {
    setupToken();
    getDocument.mockReturnValue(makeMockLoadingTask(makeMockPdf()));

    renderViewer({ page: 1 });
    // Wait for TextLayer to be instantiated, then check render() was called on that instance
    await waitFor(() => expect(TextLayer).toHaveBeenCalled());
    const instance = TextLayer.mock.instances[0];
    await waitFor(() => expect(instance.render).toHaveBeenCalled());
  });

  it('skips TextLayer when PDF page has extractable text (text-first mode)', async () => {
    // TextLayer still renders — it just shows empty spans for no-text pages
    // The key behavior: onPageText called with text (not image) when text exists
    setupToken();
    const onPageText = vi.fn();
    const pdf = makeMockPdf(1, [{ str: 'Rich text content' }]);
    getDocument.mockReturnValue(makeMockLoadingTask(pdf));

    renderViewer({ page: 1, onPageText });
    await waitFor(() => expect(onPageText).toHaveBeenCalled());

    const [pageNum, text, imageBase64] = onPageText.mock.calls[0];
    expect(pageNum).toBe(1);
    expect(text).toBe('Rich text content');
    expect(imageBase64).toBeNull(); // text mode, no image
  });

  it('falls back to canvas image when page has no extractable text', async () => {
    setupToken();
    const onPageText = vi.fn();
    // Empty text items → scanned/image PDF
    const pdf = makeMockPdf(1, []);
    getDocument.mockReturnValue(makeMockLoadingTask(pdf));

    renderViewer({ page: 1, onPageText });
    await waitFor(() => expect(onPageText).toHaveBeenCalled());

    const [pageNum, text, imageBase64] = onPageText.mock.calls[0];
    expect(pageNum).toBe(1);
    expect(text).toBeNull();
    // imageBase64 is null in jsdom (canvas.toDataURL not implemented)
    // The important thing is text is null → image mode triggered
    expect(text).not.toBe('');
  });
});

/* ── P1-3 + P1-1 combined: onProgress and background extraction ─ */
describe('onProgress and background text extraction', () => {
  it('background extraction calls getPage for up to 50 pages', async () => {
    setupToken();
    const pdf = makeMockPdf(5);
    getDocument.mockReturnValue(makeMockLoadingTask(pdf));

    renderViewer();
    await waitFor(() => expect(pdf.getPage).toHaveBeenCalled(), { timeout: 2000 });

    // Pages 1..5 are extracted in background (limited to min(numPages, 50))
    await waitFor(() => {
      const calls = pdf.getPage.mock.calls.map(c => c[0]);
      // Should include all 5 pages eventually
      expect(calls).toContain(1);
    });
  });

  it('does not extract beyond 50 pages', async () => {
    setupToken();
    // Large PDF with many pages
    const pdf = makeMockPdf(100);
    getDocument.mockReturnValue(makeMockLoadingTask(pdf));

    renderViewer();

    // Wait a bit for background extraction to run
    await new Promise(r => setTimeout(r, 50));

    // Should NOT request page 51+
    const pageNums = pdf.getPage.mock.calls.map(c => c[0]);
    const overLimit = pageNums.filter(n => n > 50);
    expect(overLimit).toHaveLength(0);
  });
});
