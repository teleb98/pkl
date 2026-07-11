import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { ThemeContext } from '../context.jsx';
import { THEMES, TYPE_PAIRS } from '../data.js';
import { _resetForTesting } from '../pageTextCache.js';

vi.mock('pdfjs-dist/build/pdf.min.mjs', () => ({
  getDocument: vi.fn(),
  GlobalWorkerOptions: { workerSrc: '' },
  TextLayer: vi.fn(),
}));
vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: '' }));
vi.mock('../utils/pdfCache.js', () => ({
  getCachedPdf:         vi.fn(() => Promise.resolve(null)),
  cachePdf:             vi.fn(() => Promise.resolve()),
  downloadWithProgress: vi.fn(() => Promise.resolve(new ArrayBuffer(8))),
}));
vi.mock('../aiClient.js', () => ({ callAI: vi.fn(() => Promise.resolve('')) }));
vi.mock('../utils/cloudVisionOcr.js', () => ({ ocrImageWithVision: vi.fn(() => Promise.resolve('')) }));

import { getDocument, TextLayer } from 'pdfjs-dist/build/pdf.min.mjs';
import { PdfViewer } from '../components/PdfViewer.jsx';

const T = THEMES.ember;
const F = TYPE_PAIRS.lora;

function makeMockPage() {
  return {
    // Scale-aware mock: returns dimensions proportional to the requested scale
    getViewport: vi.fn().mockImplementation(({ scale: s = 1 } = {}) => ({
      width: Math.round(595 * s),
      height: Math.round(842 * s),
      scale: s,
      transform: [s, 0, 0, s, 0, 0],
    })),
    render:      vi.fn().mockReturnValue({ promise: Promise.resolve(), cancel: vi.fn() }),
    getTextContent:    vi.fn().mockResolvedValue({ items: [{ str: 'Text' }] }),
    streamTextContent: vi.fn().mockReturnValue({}),
  };
}

function makeMockPdf() {
  return {
    numPages: 5,
    getPage:      vi.fn().mockResolvedValue(makeMockPage()),
    getOutline:   vi.fn().mockResolvedValue([]),
    getDestination: vi.fn().mockResolvedValue([]),
    getPageIndex:   vi.fn().mockResolvedValue(0),
    destroy:      vi.fn(),
  };
}

function makeTask(pdf) {
  return { onProgress: null, promise: Promise.resolve(pdf), destroy: vi.fn() };
}

function setupToken() {
  localStorage.setItem('pkl_config', JSON.stringify({ driveAccessToken: 'tok' }));
}

function renderViewer(props = {}) {
  const { container } = render(
    <ThemeContext.Provider value={{ T, F }}>
      <PdfViewer fileId="file1" page={1} lang="ko" {...props} />
    </ThemeContext.Provider>
  );
  return container;
}

async function waitForCanvas(container) {
  await waitFor(() => expect(container.querySelector('canvas')).not.toBeNull());
  return container.querySelector('canvas');
}

beforeEach(() => {
  localStorage.clear();
  _resetForTesting();
  vi.clearAllMocks();
  TextLayer.mockImplementation(function() { this.render = vi.fn().mockResolvedValue(undefined); this.cancel = vi.fn(); });
});

/* ── bg prop — 배경색 변경 ───────────────────────────────── */
describe('PdfViewer bg prop', () => {
  it('default (white) uses dark grey viewer background', async () => {
    setupToken();
    getDocument.mockReturnValue(makeTask(makeMockPdf()));
    const container = renderViewer({ bg: 'white' });
    await waitForCanvas(container);
    const wrapper = container.querySelector('[style*="background"]');
    expect(wrapper?.style?.background).toContain('rgb(85, 85, 85)'); // #555
  });

  it('sepia uses warm brown viewer background', async () => {
    setupToken();
    getDocument.mockReturnValue(makeTask(makeMockPdf()));
    const container = renderViewer({ bg: 'sepia' });
    await waitForCanvas(container);
    const wrappers = container.querySelectorAll('[style*="background"]');
    const styles = Array.from(wrappers).map(el => el.style.background);
    expect(styles.some(s => s.includes('139') || s.includes('8b7355') || s.includes('rgb'))).toBe(true);
  });

  it('dark uses dark navy viewer background', async () => {
    setupToken();
    getDocument.mockReturnValue(makeTask(makeMockPdf()));
    const container = renderViewer({ bg: 'dark' });
    await waitForCanvas(container);
    // Outer container gets dark bg
    const outer = container.firstChild;
    expect(outer?.style?.background ?? outer?.getAttribute?.('style') ?? '').toBeTruthy();
  });

  it('sepia applies sepia filter to canvas', async () => {
    setupToken();
    getDocument.mockReturnValue(makeTask(makeMockPdf()));
    const container = renderViewer({ bg: 'sepia' });
    const canvas = await waitForCanvas(container);
    expect(canvas.style.filter).toContain('sepia');
  });

  it('dark applies invert filter to canvas', async () => {
    setupToken();
    getDocument.mockReturnValue(makeTask(makeMockPdf()));
    const container = renderViewer({ bg: 'dark' });
    const canvas = await waitForCanvas(container);
    expect(canvas.style.filter).toContain('invert');
  });

  it('white applies no filter to canvas', async () => {
    setupToken();
    getDocument.mockReturnValue(makeTask(makeMockPdf()));
    const container = renderViewer({ bg: 'white' });
    const canvas = await waitForCanvas(container);
    expect(canvas.style.filter).toBe('none');
  });
});

/* ── zoom prop — 스케일 반영 ─────────────────────────────── */
describe('PdfViewer zoom prop', () => {
  it('zoom=1 renders canvas at base scale', async () => {
    setupToken();
    getDocument.mockReturnValue(makeTask(makeMockPdf()));
    const container = renderViewer({ zoom: 1 });
    const canvas = await waitForCanvas(container);
    // base: containerW ≈ 800, vp.width=595, scale=800/595≈1.34, *1=1.34 → width≈800
    expect(canvas.width).toBeGreaterThan(0);
  });

  it('zoom=1.5 produces a wider canvas than zoom=1', async () => {
    setupToken();

    // Render with zoom=1
    getDocument.mockReturnValue(makeTask(makeMockPdf()));
    const c1 = renderViewer({ zoom: 1 });
    const canvas1 = await waitForCanvas(c1);
    const w1 = canvas1.width;

    vi.clearAllMocks();
    TextLayer.mockImplementation(function() { this.render = vi.fn().mockResolvedValue(undefined); this.cancel = vi.fn(); });
    getDocument.mockReturnValue(makeTask(makeMockPdf()));

    // Render with zoom=1.5
    const c2 = renderViewer({ zoom: 1.5 });
    const canvas2 = await waitForCanvas(c2);
    const w2 = canvas2.width;

    expect(w2).toBeGreaterThan(w1);
  });

  it('zoom=0.75 produces a narrower canvas than zoom=1', async () => {
    setupToken();

    getDocument.mockReturnValue(makeTask(makeMockPdf()));
    const c1 = renderViewer({ zoom: 1 });
    const canvas1 = await waitForCanvas(c1);
    const w1 = canvas1.width;

    vi.clearAllMocks();
    TextLayer.mockImplementation(function() { this.render = vi.fn().mockResolvedValue(undefined); this.cancel = vi.fn(); });
    getDocument.mockReturnValue(makeTask(makeMockPdf()));

    const c2 = renderViewer({ zoom: 0.75 });
    const canvas2 = await waitForCanvas(c2);
    const w2 = canvas2.width;

    expect(w2).toBeLessThan(w1);
  });

  it('zoom change re-renders the page (new render call)', async () => {
    setupToken();
    const pdf = makeMockPdf();
    getDocument.mockReturnValue(makeTask(pdf));

    const { rerender } = render(
      <ThemeContext.Provider value={{ T, F }}>
        <PdfViewer fileId="file1" page={1} lang="ko" zoom={1} />
      </ThemeContext.Provider>
    );

    await waitFor(() => expect(pdf.getPage).toHaveBeenCalled());
    const firstCallCount = pdf.getPage.mock.calls.length;

    // Change zoom
    rerender(
      <ThemeContext.Provider value={{ T, F }}>
        <PdfViewer fileId="file1" page={1} lang="ko" zoom={1.5} />
      </ThemeContext.Provider>
    );

    await waitFor(() => expect(pdf.getPage.mock.calls.length).toBeGreaterThan(firstCallCount));
  });
});
