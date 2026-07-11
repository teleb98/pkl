import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, waitFor, fireEvent } from '@testing-library/react';
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
vi.mock('../utils/pdfCache.js', () => ({
  getCachedPdf:         vi.fn(() => Promise.resolve(null)),
  cachePdf:             vi.fn(() => Promise.resolve()),
  downloadWithProgress: vi.fn(() => Promise.resolve(new ArrayBuffer(8))),
}));
vi.mock('../aiClient.js', () => ({ callAI: vi.fn(() => Promise.resolve('')) }));
vi.mock('../utils/cloudVisionOcr.js', () => ({ ocrImageWithVision: vi.fn(() => Promise.resolve('')) }));

import { getDocument, TextLayer } from 'pdfjs-dist/build/pdf.min.mjs';
import { PdfViewer } from '../components/PdfViewer.jsx';

/* ── Helpers ─────────────────────────────────────────────── */
const T = THEMES.ember;
const F = TYPE_PAIRS.lora;

function renderViewer(props = {}) {
  const { container } = render(
    <ThemeContext.Provider value={{ T, F }}>
      <PdfViewer fileId="file123" page={1} lang="ko" {...props} />
    </ThemeContext.Provider>
  );
  return container;
}

function makeMockPdf() {
  const mockPage = {
    getViewport: vi.fn().mockReturnValue({ width: 595, height: 842, scale: 1, transform: [1,0,0,1,0,0] }),
    render:      vi.fn().mockReturnValue({ promise: Promise.resolve(), cancel: vi.fn() }),
    getTextContent:    vi.fn().mockResolvedValue({ items: [{ str: 'Sample' }] }),
    streamTextContent: vi.fn().mockReturnValue({}),
  };
  return {
    numPages: 10,
    getPage:      vi.fn().mockResolvedValue(mockPage),
    getOutline:   vi.fn().mockResolvedValue([]),
    getDestination: vi.fn().mockResolvedValue([]),
    getPageIndex:   vi.fn().mockResolvedValue(0),
    destroy:      vi.fn(),
  };
}

function makeMockLoadingTask(pdf) {
  return { onProgress: null, promise: Promise.resolve(pdf), destroy: vi.fn() };
}

function setupToken() {
  localStorage.setItem('pkl_config', JSON.stringify({ driveAccessToken: 'tok' }));
}

// Wait for the containerRef div (appears after status='ready')
async function waitForViewer(container) {
  await waitFor(() => {
    const el = container.querySelector('[style*="background: rgb(85, 85, 85)"]');
    expect(el).not.toBeNull();
    return el;
  });
  return container.querySelector('[style*="background: rgb(85, 85, 85)"]');
}

beforeEach(() => {
  localStorage.clear();
  _resetForTesting();
  vi.clearAllMocks();
  TextLayer.mockImplementation(function() {
    this.render  = vi.fn().mockResolvedValue(undefined);
    this.cancel  = vi.fn();
  });
  // Reset window.innerWidth — use try/catch in case another test file made it non-configurable
  try {
    Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true, configurable: true });
  } catch { window.innerWidth = 1024; }
});

/* ── 휠 이벤트 — 경계 감지 페이지 전환 ─────────────────── */
describe('wheel event — boundary-based page navigation', () => {
  it('페이지 중간에서 휠 다운 → onPageChange 미호출 (자연 스크롤)', async () => {
    setupToken();
    const onPageChange = vi.fn();
    getDocument.mockReturnValue(makeMockLoadingTask(makeMockPdf()));

    const container = renderViewer({ onPageChange });
    const viewerEl = await waitForViewer(container);

    Object.defineProperty(viewerEl, 'scrollTop',    { value: 50,  configurable: true });
    Object.defineProperty(viewerEl, 'scrollHeight', { value: 800, configurable: true });
    Object.defineProperty(viewerEl, 'clientHeight', { value: 600, configurable: true });

    fireEvent.wheel(viewerEl, { deltaY: 120 });
    expect(onPageChange).not.toHaveBeenCalled();
  });

  it('페이지 맨 위에서 휠 업 → onPageChange(-1) 호출 (이전 페이지)', async () => {
    setupToken();
    const onPageChange = vi.fn();
    getDocument.mockReturnValue(makeMockLoadingTask(makeMockPdf()));

    const container = renderViewer({ onPageChange });
    const viewerEl = await waitForViewer(container);

    Object.defineProperty(viewerEl, 'scrollTop',    { value: 0,   configurable: true });
    Object.defineProperty(viewerEl, 'scrollHeight', { value: 600, configurable: true });
    Object.defineProperty(viewerEl, 'clientHeight', { value: 600, configurable: true });

    fireEvent.wheel(viewerEl, { deltaY: -120 });
    expect(onPageChange).toHaveBeenCalledWith(-1);
    expect(onPageChange).toHaveBeenCalledTimes(1); // 정확히 1번만
  });

  it('페이지 맨 아래에서 휠 다운 → onPageChange(+1) 호출 (다음 페이지)', async () => {
    setupToken();
    const onPageChange = vi.fn();
    getDocument.mockReturnValue(makeMockLoadingTask(makeMockPdf()));

    const container = renderViewer({ onPageChange });
    const viewerEl = await waitForViewer(container);

    // writable:true — 핸들러 내 el.scrollTop=0 리셋을 허용
    Object.defineProperty(viewerEl, 'scrollTop',    { value: 200, configurable: true, writable: true });
    Object.defineProperty(viewerEl, 'scrollHeight', { value: 800, configurable: true, writable: true });
    Object.defineProperty(viewerEl, 'clientHeight', { value: 600, configurable: true, writable: true });

    fireEvent.wheel(viewerEl, { deltaY: 120 });
    expect(onPageChange).toHaveBeenCalledWith(+1);
    expect(onPageChange).toHaveBeenCalledTimes(1); // 정확히 1번만
  });

  it('연속 휠 이벤트 → 렌더 완료 전까지 1번만 호출 (다중 점프 방지)', async () => {
    setupToken();
    const onPageChange = vi.fn();
    getDocument.mockReturnValue(makeMockLoadingTask(makeMockPdf()));

    const container = renderViewer({ onPageChange });
    const viewerEl = await waitForViewer(container);

    // writable:true — 핸들러 내 el.scrollTop=0 리셋을 허용
    Object.defineProperty(viewerEl, 'scrollTop',    { value: 200, configurable: true, writable: true });
    Object.defineProperty(viewerEl, 'scrollHeight', { value: 800, configurable: true, writable: true });
    Object.defineProperty(viewerEl, 'clientHeight', { value: 600, configurable: true, writable: true });

    // 빠르게 여러 번 휠 이벤트 발생 (렌더 완료 전)
    fireEvent.wheel(viewerEl, { deltaY: 120 });
    fireEvent.wheel(viewerEl, { deltaY: 120 });
    fireEvent.wheel(viewerEl, { deltaY: 120 });
    fireEvent.wheel(viewerEl, { deltaY: 120 });

    // 첫 번째 이벤트만 처리 (렌더 완료 전 나머지는 changingPageRef로 차단)
    expect(onPageChange).toHaveBeenCalledTimes(1);
    expect(onPageChange).toHaveBeenCalledWith(+1);
  });
});

/* ── 터치 스와이프 정상 동작 ─────────────────────────────── */
describe('touch swipe — page navigation', () => {
  it('left swipe (dx = -100) → onPageChange(+1)', async () => {
    setupToken();
    const onPageChange = vi.fn();
    getDocument.mockReturnValue(makeMockLoadingTask(makeMockPdf()));

    const container = renderViewer({ onPageChange });
    const viewerEl = await waitForViewer(container);

    fireEvent.touchStart(viewerEl, { touches: [{ clientX: 400, clientY: 300 }] });
    fireEvent.touchEnd(viewerEl, { changedTouches: [{ clientX: 300, clientY: 303 }] });

    expect(onPageChange).toHaveBeenCalledWith(+1);
  });

  it('right swipe (dx = +100) → onPageChange(-1)', async () => {
    setupToken();
    const onPageChange = vi.fn();
    getDocument.mockReturnValue(makeMockLoadingTask(makeMockPdf()));

    const container = renderViewer({ onPageChange });
    const viewerEl = await waitForViewer(container);

    fireEvent.touchStart(viewerEl, { touches: [{ clientX: 200, clientY: 300 }] });
    fireEvent.touchEnd(viewerEl, { changedTouches: [{ clientX: 300, clientY: 303 }] });

    expect(onPageChange).toHaveBeenCalledWith(-1);
  });

  it('large left swipe (dx = -200) → onPageChange(+1)', async () => {
    setupToken();
    const onPageChange = vi.fn();
    getDocument.mockReturnValue(makeMockLoadingTask(makeMockPdf()));

    const container = renderViewer({ onPageChange });
    const viewerEl = await waitForViewer(container);

    fireEvent.touchStart(viewerEl, { touches: [{ clientX: 500, clientY: 300 }] });
    fireEvent.touchEnd(viewerEl, { changedTouches: [{ clientX: 300, clientY: 302 }] });

    expect(onPageChange).toHaveBeenCalledWith(+1);
  });
});

/* ── 스와이프 무시 케이스 ────────────────────────────────── */
describe('touch swipe — ignored cases', () => {
  it('short swipe (dx = 40px) → no navigation', async () => {
    setupToken();
    const onPageChange = vi.fn();
    getDocument.mockReturnValue(makeMockLoadingTask(makeMockPdf()));

    const container = renderViewer({ onPageChange });
    const viewerEl = await waitForViewer(container);

    fireEvent.touchStart(viewerEl, { touches: [{ clientX: 300, clientY: 300 }] });
    fireEvent.touchEnd(viewerEl, { changedTouches: [{ clientX: 260, clientY: 302 }] }); // dx=-40

    expect(onPageChange).not.toHaveBeenCalled();
  });

  it('exact threshold (dx = 60px) → no navigation (must exceed 60)', async () => {
    setupToken();
    const onPageChange = vi.fn();
    getDocument.mockReturnValue(makeMockLoadingTask(makeMockPdf()));

    const container = renderViewer({ onPageChange });
    const viewerEl = await waitForViewer(container);

    fireEvent.touchStart(viewerEl, { touches: [{ clientX: 360, clientY: 300 }] });
    fireEvent.touchEnd(viewerEl, { changedTouches: [{ clientX: 300, clientY: 302 }] }); // dx=-60 (not > 60)

    expect(onPageChange).not.toHaveBeenCalled();
  });

  it('vertical swipe (dy > dx) → no navigation when NOT at boundary', async () => {
    setupToken();
    const onPageChange = vi.fn();
    getDocument.mockReturnValue(makeMockLoadingTask(makeMockPdf()));

    const container = renderViewer({ onPageChange });
    const viewerEl = await waitForViewer(container);

    // 페이지 중간(경계 아님)으로 스크롤 상태 설정
    Object.defineProperty(viewerEl, 'scrollTop',    { value: 100, configurable: true });
    Object.defineProperty(viewerEl, 'scrollHeight', { value: 800, configurable: true });
    Object.defineProperty(viewerEl, 'clientHeight', { value: 600, configurable: true });

    fireEvent.touchStart(viewerEl, { touches: [{ clientX: 300, clientY: 200 }] });
    fireEvent.touchEnd(viewerEl, { changedTouches: [{ clientX: 220, clientY: 100 }] }); // dx=-80, dy=-100

    expect(onPageChange).not.toHaveBeenCalled();
  });

  it('diagonal swipe (dy ~= dx) → no navigation (not 1.5x dominant)', async () => {
    setupToken();
    const onPageChange = vi.fn();
    getDocument.mockReturnValue(makeMockLoadingTask(makeMockPdf()));

    const container = renderViewer({ onPageChange });
    const viewerEl = await waitForViewer(container);

    // dx=-80, dy=-60 → Math.abs(dx) = 80, Math.abs(dy)*1.5 = 90 → 80 < 90 → ignored
    fireEvent.touchStart(viewerEl, { touches: [{ clientX: 300, clientY: 200 }] });
    fireEvent.touchEnd(viewerEl, { changedTouches: [{ clientX: 220, clientY: 140 }] });

    expect(onPageChange).not.toHaveBeenCalled();
  });

  it('swipe starting from LEFT edge (<30px) → no navigation (browser back gesture)', async () => {
    setupToken();
    const onPageChange = vi.fn();
    getDocument.mockReturnValue(makeMockLoadingTask(makeMockPdf()));

    const container = renderViewer({ onPageChange });
    const viewerEl = await waitForViewer(container);

    fireEvent.touchStart(viewerEl, { touches: [{ clientX: 15, clientY: 300 }] }); // from left edge
    fireEvent.touchEnd(viewerEl, { changedTouches: [{ clientX: 120, clientY: 302 }] }); // right swipe dx=+105

    expect(onPageChange).not.toHaveBeenCalled();
  });

  it('swipe starting from RIGHT edge (>innerWidth-30) → no navigation', async () => {
    setupToken();
    const onPageChange = vi.fn();
    getDocument.mockReturnValue(makeMockLoadingTask(makeMockPdf()));

    const container = renderViewer({ onPageChange });
    const viewerEl = await waitForViewer(container);

    // window.innerWidth = 1024, edge = >994
    fireEvent.touchStart(viewerEl, { touches: [{ clientX: 1010, clientY: 300 }] });
    fireEvent.touchEnd(viewerEl, { changedTouches: [{ clientX: 900, clientY: 302 }] }); // dx=-110

    expect(onPageChange).not.toHaveBeenCalled();
  });
});

/* ── 터치 리스너가 status='ready' 이후 등록됨 ──────────── */
describe('touch listener lifecycle', () => {
  it('touch events work after PDF loads (status changes to ready)', async () => {
    setupToken();
    const onPageChange = vi.fn();
    getDocument.mockReturnValue(makeMockLoadingTask(makeMockPdf()));

    const container = renderViewer({ onPageChange });

    // Before PDF loads: loading state — no containerRef div
    expect(container.querySelector('[style*="background: rgb(85, 85, 85)"]')).toBeNull();

    // After PDF loads: container div appears, listeners attached
    const viewerEl = await waitForViewer(container);
    expect(viewerEl).not.toBeNull();

    // Touch should now work
    fireEvent.touchStart(viewerEl, { touches: [{ clientX: 400, clientY: 300 }] });
    fireEvent.touchEnd(viewerEl, { changedTouches: [{ clientX: 300, clientY: 302 }] });

    expect(onPageChange).toHaveBeenCalledWith(+1);
  });

  it('onPageChange callback update is reflected in swipe handler', async () => {
    setupToken();
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    getDocument.mockReturnValue(makeMockLoadingTask(makeMockPdf()));

    const { rerender } = render(
      <ThemeContext.Provider value={{ T, F }}>
        <PdfViewer fileId="file123" page={1} lang="ko" onPageChange={cb1} />
      </ThemeContext.Provider>
    );

    await waitFor(() =>
      expect(document.querySelector('[style*="background: rgb(85, 85, 85)"]')).not.toBeNull()
    );

    // Update the callback
    rerender(
      <ThemeContext.Provider value={{ T, F }}>
        <PdfViewer fileId="file123" page={1} lang="ko" onPageChange={cb2} />
      </ThemeContext.Provider>
    );

    const viewerEl = document.querySelector('[style*="background: rgb(85, 85, 85)"]');
    fireEvent.touchStart(viewerEl, { touches: [{ clientX: 400, clientY: 300 }] });
    fireEvent.touchEnd(viewerEl, { changedTouches: [{ clientX: 300, clientY: 302 }] });

    expect(cb1).not.toHaveBeenCalled();
    expect(cb2).toHaveBeenCalledWith(+1);
  });
});

/* ── onPageChange 미설정 시 오류 없음 ───────────────────── */
describe('onPageChange not provided', () => {
  it('swipe without onPageChange does not throw', async () => {
    setupToken();
    getDocument.mockReturnValue(makeMockLoadingTask(makeMockPdf()));

    const container = renderViewer(); // no onPageChange
    const viewerEl = await waitForViewer(container);

    expect(() => {
      fireEvent.touchStart(viewerEl, { touches: [{ clientX: 400, clientY: 300 }] });
      fireEvent.touchEnd(viewerEl, { changedTouches: [{ clientX: 300, clientY: 302 }] });
    }).not.toThrow();
  });
});

/* ── 페이지 전환 후 스크롤 위치 + 2초 호흡 ─────────────── */
describe('page transition — scroll position & cooldown', () => {
  it('다음 페이지로 이동 시 scrollTop=0 (상단)', async () => {
    setupToken();
    getDocument.mockReturnValue(makeMockLoadingTask(makeMockPdf()));

    const { rerender, container } = render(
      <ThemeContext.Provider value={{ T, F }}>
        <PdfViewer fileId="file1" page={1} lang="ko" onPageChange={vi.fn()} />
      </ThemeContext.Provider>
    );
    const viewerEl = await waitForViewer(container);

    let scrollTopValue = 200;
    Object.defineProperty(viewerEl, 'scrollTop', {
      get: () => scrollTopValue,
      set: v => { scrollTopValue = v; },
      configurable: true,
    });
    Object.defineProperty(viewerEl, 'scrollHeight', { value: 800, configurable: true, writable: true });
    Object.defineProperty(viewerEl, 'clientHeight', { value: 600, configurable: true, writable: true });

    // page=2로 변경 (다음 페이지)
    rerender(
      <ThemeContext.Provider value={{ T, F }}>
        <PdfViewer fileId="file1" page={2} lang="ko" onPageChange={vi.fn()} />
      </ThemeContext.Provider>
    );

    await new Promise(r => setTimeout(r, 50));
    expect(scrollTopValue).toBe(0);
  });

  it('이전 페이지로 이동 시 scrollTop=scrollHeight (하단)', async () => {
    setupToken();
    getDocument.mockReturnValue(makeMockLoadingTask(makeMockPdf()));

    const { rerender, container } = render(
      <ThemeContext.Provider value={{ T, F }}>
        <PdfViewer fileId="file1" page={3} lang="ko" onPageChange={vi.fn()} />
      </ThemeContext.Provider>
    );
    const viewerEl = await waitForViewer(container);

    let scrollTopValue = 0;
    Object.defineProperty(viewerEl, 'scrollTop', {
      get: () => scrollTopValue,
      set: v => { scrollTopValue = v; },
      configurable: true,
    });
    Object.defineProperty(viewerEl, 'scrollHeight', { value: 800, configurable: true, writable: true });
    Object.defineProperty(viewerEl, 'clientHeight', { value: 600, configurable: true, writable: true });

    rerender(
      <ThemeContext.Provider value={{ T, F }}>
        <PdfViewer fileId="file1" page={2} lang="ko" onPageChange={vi.fn()} />
      </ThemeContext.Provider>
    );

    await new Promise(r => setTimeout(r, 50));
    expect(scrollTopValue).toBe(800);
  });

  it('휠로 페이지 전환 후 2초 이내 추가 휠 차단', async () => {
    setupToken();
    const onPageChange = vi.fn();
    getDocument.mockReturnValue(makeMockLoadingTask(makeMockPdf()));

    const container = renderViewer({ onPageChange });
    const viewerEl = await waitForViewer(container);

    Object.defineProperty(viewerEl, 'scrollTop',    { value: 200, configurable: true, writable: true });
    Object.defineProperty(viewerEl, 'scrollHeight', { value: 800, configurable: true, writable: true });
    Object.defineProperty(viewerEl, 'clientHeight', { value: 600, configurable: true, writable: true });

    fireEvent.wheel(viewerEl, { deltaY: 120 });
    expect(onPageChange).toHaveBeenCalledTimes(1);

    // 즉시 추가 휠 → changingPageRef=true 이므로 차단
    fireEvent.wheel(viewerEl, { deltaY: 120 });
    fireEvent.wheel(viewerEl, { deltaY: 120 });
    expect(onPageChange).toHaveBeenCalledTimes(1);
  });
});

/* ── 세로 스와이프 경계 감지 (모바일) ─────────────────────── */
describe('vertical scroll boundary — mobile page navigation', () => {
  function setScrollState(el, { scrollTop, scrollHeight, clientHeight }) {
    Object.defineProperty(el, 'scrollTop',    { value: scrollTop,    configurable: true });
    Object.defineProperty(el, 'scrollHeight', { value: scrollHeight, configurable: true });
    Object.defineProperty(el, 'clientHeight', { value: clientHeight, configurable: true });
  }

  it('맨 아래 + 위로 스와이프(dy=-100) → onPageChange(+1)', async () => {
    setupToken();
    const onPageChange = vi.fn();
    getDocument.mockReturnValue(makeMockLoadingTask(makeMockPdf()));

    const container = renderViewer({ onPageChange });
    const viewerEl = await waitForViewer(container);
    setScrollState(viewerEl, { scrollTop: 200, scrollHeight: 800, clientHeight: 600 }); // at bottom

    fireEvent.touchStart(viewerEl, { touches: [{ clientX: 300, clientY: 400 }] });
    fireEvent.touchEnd(viewerEl, { changedTouches: [{ clientX: 305, clientY: 300 }] }); // dy=-100 (위로)

    expect(onPageChange).toHaveBeenCalledWith(+1);
  });

  it('맨 위 + 아래로 스와이프(dy=+100) → onPageChange(-1)', async () => {
    setupToken();
    const onPageChange = vi.fn();
    getDocument.mockReturnValue(makeMockLoadingTask(makeMockPdf()));

    const container = renderViewer({ onPageChange });
    const viewerEl = await waitForViewer(container);
    setScrollState(viewerEl, { scrollTop: 0, scrollHeight: 800, clientHeight: 600 }); // at top

    fireEvent.touchStart(viewerEl, { touches: [{ clientX: 300, clientY: 200 }] });
    fireEvent.touchEnd(viewerEl, { changedTouches: [{ clientX: 305, clientY: 300 }] }); // dy=+100 (아래로)

    expect(onPageChange).toHaveBeenCalledWith(-1);
  });

  it('페이지 중간(경계 아님) + 세로 스와이프 → 페이지 전환 없음', async () => {
    setupToken();
    const onPageChange = vi.fn();
    getDocument.mockReturnValue(makeMockLoadingTask(makeMockPdf()));

    const container = renderViewer({ onPageChange });
    const viewerEl = await waitForViewer(container);
    setScrollState(viewerEl, { scrollTop: 100, scrollHeight: 800, clientHeight: 600 }); // mid page

    fireEvent.touchStart(viewerEl, { touches: [{ clientX: 300, clientY: 400 }] });
    fireEvent.touchEnd(viewerEl, { changedTouches: [{ clientX: 305, clientY: 290 }] }); // dy=-110

    expect(onPageChange).not.toHaveBeenCalled();
  });

  it('세로 이동이 80px 미만이면 경계에서도 전환 없음', async () => {
    setupToken();
    const onPageChange = vi.fn();
    getDocument.mockReturnValue(makeMockLoadingTask(makeMockPdf()));

    const container = renderViewer({ onPageChange });
    const viewerEl = await waitForViewer(container);
    setScrollState(viewerEl, { scrollTop: 0, scrollHeight: 600, clientHeight: 600 }); // at top

    fireEvent.touchStart(viewerEl, { touches: [{ clientX: 300, clientY: 200 }] });
    fireEvent.touchEnd(viewerEl, { changedTouches: [{ clientX: 302, clientY: 260 }] }); // dy=+60 (< 80)

    expect(onPageChange).not.toHaveBeenCalled();
  });

  it('가로+세로 혼합(가로 우세) → 가로 스와이프 처리', async () => {
    setupToken();
    const onPageChange = vi.fn();
    getDocument.mockReturnValue(makeMockLoadingTask(makeMockPdf()));

    const container = renderViewer({ onPageChange });
    const viewerEl = await waitForViewer(container);
    setScrollState(viewerEl, { scrollTop: 0, scrollHeight: 600, clientHeight: 600 });

    // dx=-100, dy=+50 → 가로 우세 → 가로 스와이프 처리 (좌→다음)
    fireEvent.touchStart(viewerEl, { touches: [{ clientX: 400, clientY: 300 }] });
    fireEvent.touchEnd(viewerEl, { changedTouches: [{ clientX: 300, clientY: 350 }] });

    expect(onPageChange).toHaveBeenCalledWith(+1); // horizontal swipe wins
  });
});
