import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { ThemeContext } from '../context.jsx';
import { THEMES, TYPE_PAIRS } from '../data.js';
import { _resetForTesting } from '../pageTextCache.js';

/* ────────────────────────────────────────────────────────────────
   Drive 파일 로컬 영구 접근 (Electron) — PdfViewer 가
   1) book.filePath 가 있으면 Drive 토큰/네트워크 없이 그 파일에서 바로 로드
   2) 로컬 사본이 없어 네트워크로 새로 받으면, Electron 에서 실제 파일로도
      저장해 filePath 를 store 에 기록(다음부터 오프라인 로드 가능)
   ─────────────────────────────────────────────────────────────── */

vi.mock('pdfjs-dist/build/pdf.min.mjs', () => ({
  getDocument: vi.fn(),
  GlobalWorkerOptions: { workerSrc: '' },
  TextLayer: vi.fn(),
}));
vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: '' }));
vi.mock('../utils/pdfCache.js', () => ({
  getCachedPdf:        vi.fn(() => Promise.resolve(null)),
  cachePdf:            vi.fn(() => Promise.resolve()),
  downloadWithProgress: vi.fn(() => Promise.resolve(new ArrayBuffer(8))),
}));
vi.mock('../aiClient.js', () => ({ callAI: vi.fn(() => Promise.resolve('')) }));
vi.mock('../utils/cloudVisionOcr.js', () => ({ ocrImageWithVision: vi.fn(() => Promise.resolve('')) }));
vi.mock('../utils/localBooks.js', () => ({
  isElectron: vi.fn(() => false),
  reloadLocalBookFromPath: vi.fn(() => Promise.resolve(false)),
}));
const setBookMetaMock = vi.fn();
vi.mock('../store.js', () => ({ setBookMeta: (...a) => setBookMetaMock(...a) }));

import { getDocument, TextLayer } from 'pdfjs-dist/build/pdf.min.mjs';
import { getCachedPdf, cachePdf, downloadWithProgress } from '../utils/pdfCache.js';
import { isElectron } from '../utils/localBooks.js';
import { PdfViewer } from '../components/PdfViewer.jsx';

const T = THEMES.ember;
const F = TYPE_PAIRS.lora;

function renderViewer(props = {}) {
  return render(
    <ThemeContext.Provider value={{ T, F }}>
      <PdfViewer fileId="drive-file-1" page={1} lang="ko" source="drive" {...props} />
    </ThemeContext.Provider>
  );
}

function makeMockLoadingTask(pdf) {
  return { onProgress: null, promise: Promise.resolve(pdf), destroy: vi.fn() };
}

function makeMockPdf(pages = 3) {
  const mockPage = {
    getViewport: vi.fn().mockReturnValue({ width: 600, height: 800, scale: 1, transform: [1, 0, 0, 1, 0, 0] }),
    render: vi.fn().mockReturnValue({ promise: Promise.resolve(), cancel: vi.fn() }),
    getTextContent: vi.fn().mockResolvedValue({ items: [{ str: 'hi' }] }),
    streamTextContent: vi.fn().mockReturnValue({ getReader: vi.fn() }),
  };
  return {
    numPages: pages,
    getPage: vi.fn().mockResolvedValue(mockPage),
    getOutline: vi.fn().mockResolvedValue([]),
    getDestination: vi.fn().mockResolvedValue([]),
    getPageIndex: vi.fn().mockResolvedValue(0),
    destroy: vi.fn(),
  };
}

function setupToken(token = 'test-token') {
  localStorage.setItem('pkl_config', JSON.stringify({ driveAccessToken: token }));
}

beforeEach(() => {
  localStorage.clear();
  _resetForTesting();
  vi.clearAllMocks();
  setBookMetaMock.mockReset();
  delete window.electron;
  isElectron.mockReturnValue(false);
  TextLayer.mockImplementation(function () {
    this.render = vi.fn().mockResolvedValue(undefined);
    this.cancel = vi.fn();
  });
  getDocument.mockReturnValue(makeMockLoadingTask(makeMockPdf()));
});

describe('Drive 책 — Electron 로컬 사본(filePath)에서 오프라인 로드', () => {
  it('filePath 가 있고 읽기 성공 → 토큰 없이도 로드, downloadWithProgress 미호출', async () => {
    isElectron.mockReturnValue(true);
    window.electron = {
      readPdf: vi.fn(async () => ({ ok: true, buffer: new ArrayBuffer(32) })),
      saveDrivePdf: vi.fn(),
    };
    // 토큰 설정 안 함 — 로컬 사본만으로 열려야 함
    renderViewer({ book: { id: 'drive-file-1', filePath: '/Users/x/Library/.../drive-books/drive-file-1.pdf' } });

    await waitFor(() => expect(getDocument).toHaveBeenCalled());
    expect(window.electron.readPdf).toHaveBeenCalledWith('/Users/x/Library/.../drive-books/drive-file-1.pdf');
    expect(downloadWithProgress).not.toHaveBeenCalled();
    expect(cachePdf).toHaveBeenCalledWith('drive-file-1', expect.any(ArrayBuffer));
  });

  it('filePath 읽기 실패 + 토큰 없음 → auth 에러(재연결 필요)', async () => {
    isElectron.mockReturnValue(true);
    window.electron = { readPdf: vi.fn(async () => ({ ok: false, error: 'ENOENT' })), saveDrivePdf: vi.fn() };

    const { getByText } = renderViewer({ book: { id: 'drive-file-1', filePath: '/gone.pdf' } });
    await waitFor(() => expect(getByText(/Drive 인증이 만료/)).toBeTruthy());
    expect(downloadWithProgress).not.toHaveBeenCalled();
  });

  it('filePath 읽기 실패 + 토큰 있음 → 네트워크 다운로드로 폴백', async () => {
    isElectron.mockReturnValue(true);
    setupToken();
    window.electron = { readPdf: vi.fn(async () => ({ ok: false, error: 'ENOENT' })), saveDrivePdf: vi.fn(async () => ({ ok: true, path: '/new/path.pdf' })) };

    renderViewer({ book: { id: 'drive-file-1', filePath: '/gone.pdf' } });
    await waitFor(() => expect(downloadWithProgress).toHaveBeenCalled());
    await waitFor(() => expect(getDocument).toHaveBeenCalled());
  });

  it('비Electron 환경에서는 filePath가 있어도 무시하고 기존 토큰 경로 사용', async () => {
    isElectron.mockReturnValue(false);
    setupToken();
    renderViewer({ book: { id: 'drive-file-1', filePath: '/should/be/ignored.pdf' } });
    await waitFor(() => expect(downloadWithProgress).toHaveBeenCalled());
  });
});

describe('Drive 책 — 신규 다운로드 후 Electron 로컬 영구 저장', () => {
  it('Electron + source=drive + filePath 없음 → 다운로드 성공 시 saveDrivePdf 호출, 성공하면 setBookMeta(filePath) 기록', async () => {
    isElectron.mockReturnValue(true);
    setupToken();
    const saveDrivePdf = vi.fn(async () => ({ ok: true, path: '/Users/x/drive-books/drive-file-1.pdf' }));
    window.electron = { readPdf: vi.fn(), saveDrivePdf };

    renderViewer({ book: { id: 'drive-file-1' } }); // filePath 없음 → 다운로드 경로
    await waitFor(() => expect(downloadWithProgress).toHaveBeenCalled());
    await waitFor(() => expect(saveDrivePdf).toHaveBeenCalled());

    expect(saveDrivePdf.mock.calls[0][0]).toBe('drive-file-1.pdf');
    expect(saveDrivePdf.mock.calls[0][1]).toBeInstanceOf(ArrayBuffer);

    await waitFor(() => expect(setBookMetaMock).toHaveBeenCalledWith('drive-file-1', { filePath: '/Users/x/drive-books/drive-file-1.pdf' }));
  });

  it('saveDrivePdf 실패해도 뷰어 로딩 자체는 정상 진행(치명적이지 않음)', async () => {
    isElectron.mockReturnValue(true);
    setupToken();
    window.electron = { readPdf: vi.fn(), saveDrivePdf: vi.fn(async () => ({ ok: false, error: 'disk-full' })) };

    renderViewer({ book: { id: 'drive-file-1' } });
    await waitFor(() => expect(getDocument).toHaveBeenCalled());
    expect(setBookMetaMock).not.toHaveBeenCalled();
  });

  it('비Electron 환경에서는 다운로드 후 saveDrivePdf 를 시도하지 않음', async () => {
    isElectron.mockReturnValue(false);
    setupToken();
    renderViewer({ book: { id: 'drive-file-1' } });
    await waitFor(() => expect(downloadWithProgress).toHaveBeenCalled());
    await waitFor(() => expect(getDocument).toHaveBeenCalled());
    expect(setBookMetaMock).not.toHaveBeenCalled();
  });

  it('source=local 인 책은 saveDrivePdf 경로를 타지 않음(로컬 전용 로직 유지)', async () => {
    isElectron.mockReturnValue(true);
    const { reloadLocalBookFromPath } = await import('../utils/localBooks.js');
    reloadLocalBookFromPath.mockResolvedValueOnce(true);
    getCachedPdf.mockResolvedValueOnce(null).mockResolvedValueOnce(new ArrayBuffer(8));
    const saveDrivePdf = vi.fn();
    window.electron = { readPdf: vi.fn(), saveDrivePdf };

    renderViewer({ source: 'local', book: { id: 'drive-file-1', filePath: '/local/book.pdf' } });
    await waitFor(() => expect(getDocument).toHaveBeenCalled());
    expect(saveDrivePdf).not.toHaveBeenCalled();
  });
});
