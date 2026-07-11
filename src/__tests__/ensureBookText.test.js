import { describe, it, expect, beforeEach, vi } from 'vitest';

/* ────────────────────────────────────────────────────────────────
   ensureBookText — AI 분석용 책 텍스트 보장 유틸 검증
   "뷰어 안 거치고 AI로 직행 / 앱 재시작 후"에도 캐시 PDF에서
   텍스트를 추출해 pageTextCache 를 채우는지.
   pdfjs / pdfCache / pageTextCache 를 모킹.
   ─────────────────────────────────────────────────────────────── */

// pdfjs mock — 페이지별 텍스트를 가진 가짜 PDF
const _pdfPages = {
  1: 'Quantum mechanics introduction.',
  2: 'Schrodinger equation describes evolution.',
  3: '', // 빈 페이지 (텍스트 없음)
};
const getDocumentMock = vi.fn();
vi.mock('pdfjs-dist/build/pdf.min.mjs', () => ({
  getDocument: (...args) => getDocumentMock(...args),
  GlobalWorkerOptions: { workerSrc: '' },
}));
vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: '' }));

// pdfCache mock
const _idb = {};
vi.mock('../utils/pdfCache.js', () => ({
  getCachedPdf: vi.fn(async (id) => _idb[id] ?? null),
  cachePdf:     vi.fn(async (id, buf) => { _idb[id] = buf; }),
}));

// localBooks.reloadLocalBookFromPath mock
const reloadMock = vi.fn(async () => false);
vi.mock('../utils/localBooks.js', () => ({
  reloadLocalBookFromPath: (...a) => reloadMock(...a),
}));

// pageTextCache — 실제 구현 사용 (메모리 캐시 동작 검증)
import { ensureBookText, _resetEnsureState } from '../utils/ensureBookText.js';
import { getDocumentText, _resetForTesting } from '../pageTextCache.js';
import { getCachedPdf, cachePdf } from '../utils/pdfCache.js';

function makeMockPdf(pages = _pdfPages, numPages = 3) {
  return {
    numPages,
    getPage: vi.fn(async (n) => ({
      getTextContent: async () => ({
        items: (pages[n] || '').split(' ').filter(Boolean).map(str => ({ str })),
      }),
    })),
    destroy: vi.fn(),
  };
}

beforeEach(() => {
  Object.keys(_idb).forEach(k => delete _idb[k]);
  _resetForTesting?.();
  _resetEnsureState();
  reloadMock.mockReset().mockResolvedValue(false);
  getDocumentMock.mockReset();
  vi.clearAllMocks();
});

describe('ensureBookText — 기본 추출', () => {
  it('id 없으면 false', async () => {
    expect(await ensureBookText(null)).toBe(false);
    expect(await ensureBookText({})).toBe(false);
  });

  it('캐시 PDF에서 텍스트 추출 → pageTextCache 채움', async () => {
    _idb['book-1'] = new ArrayBuffer(100);
    getDocumentMock.mockReturnValue({ promise: Promise.resolve(makeMockPdf()) });

    const ok = await ensureBookText({ id: 'book-1', source: 'local' });
    expect(ok).toBe(true);

    const doc = getDocumentText('book-1');
    expect(doc).not.toBeNull();
    expect(doc.text).toContain('Quantum');
    expect(doc.text).toContain('Schrodinger');
  });

  it('이미 텍스트가 있으면 재추출 안 함 (getDocument 미호출)', async () => {
    _idb['book-2'] = new ArrayBuffer(100);
    getDocumentMock.mockReturnValue({ promise: Promise.resolve(makeMockPdf()) });

    await ensureBookText({ id: 'book-2', source: 'local' });
    expect(getDocumentMock).toHaveBeenCalledTimes(1);

    // 두 번째 호출은 캐시 히트 → getDocument 추가 호출 없음
    await ensureBookText({ id: 'book-2', source: 'local' });
    expect(getDocumentMock).toHaveBeenCalledTimes(1);
  });

  it('캐시에 PDF 없으면 false (추출 불가)', async () => {
    const ok = await ensureBookText({ id: 'missing', source: 'local' });
    expect(ok).toBe(false);
    expect(getDocumentText('missing')).toBeNull();
  });
});

describe('ensureBookText — 로컬 filePath 재로드', () => {
  it('캐시 없지만 filePath 있으면 reloadLocalBookFromPath 후 추출', async () => {
    // 첫 getCachedPdf=null → reload 성공 시 캐시 채워짐
    reloadMock.mockImplementation(async (book) => {
      _idb[book.id] = new ArrayBuffer(50);
      return true;
    });
    getDocumentMock.mockReturnValue({ promise: Promise.resolve(makeMockPdf()) });

    const ok = await ensureBookText({ id: 'book-3', source: 'local', filePath: '/x/q.pdf' });
    expect(reloadMock).toHaveBeenCalled();
    expect(ok).toBe(true);
    expect(getDocumentText('book-3').text).toContain('Quantum');
  });

  it('reload 실패하면 false', async () => {
    reloadMock.mockResolvedValue(false);
    const ok = await ensureBookText({ id: 'book-4', source: 'local', filePath: '/x/none.pdf' });
    expect(ok).toBe(false);
  });
});

describe('ensureBookText — 견고성', () => {
  it('maxPages 로 추출 페이지 제한', async () => {
    _idb['big'] = new ArrayBuffer(100);
    const pdf = makeMockPdf(_pdfPages, 100);
    getDocumentMock.mockReturnValue({ promise: Promise.resolve(pdf) });

    await ensureBookText({ id: 'big', source: 'local' }, { maxPages: 2 });
    // getPage 는 최대 2회만
    expect(pdf.getPage).toHaveBeenCalledTimes(2);
  });

  it('getDocument reject 시 false (에러 삼킴)', async () => {
    _idb['bad'] = new ArrayBuffer(100);
    getDocumentMock.mockReturnValue({ promise: Promise.reject(new Error('parse fail')) });

    const ok = await ensureBookText({ id: 'bad', source: 'local' });
    expect(ok).toBe(false);
  });

  it('동시 호출 시 in-flight 공유 (getDocument 1회)', async () => {
    _idb['concurrent'] = new ArrayBuffer(100);
    let resolvePdf;
    getDocumentMock.mockReturnValue({ promise: new Promise(r => { resolvePdf = r; }) });

    const p1 = ensureBookText({ id: 'concurrent', source: 'local' });
    const p2 = ensureBookText({ id: 'concurrent', source: 'local' });
    resolvePdf(makeMockPdf());
    await Promise.all([p1, p2]);

    expect(getDocumentMock).toHaveBeenCalledTimes(1);
  });

  it('onProgress 콜백 호출', async () => {
    _idb['prog'] = new ArrayBuffer(100);
    getDocumentMock.mockReturnValue({ promise: Promise.resolve(makeMockPdf(_pdfPages, 2)) });
    const onProgress = vi.fn();

    await ensureBookText({ id: 'prog', source: 'local' }, { onProgress });
    expect(onProgress).toHaveBeenCalled();
    expect(onProgress).toHaveBeenLastCalledWith(100);
  });

  it('스캔본(텍스트 0): 한 번 시도 후 재추출 안 함 (개선)', async () => {
    _idb['scan'] = new ArrayBuffer(100);
    // 모든 페이지가 빈 텍스트인 스캔본
    getDocumentMock.mockReturnValue({ promise: Promise.resolve(makeMockPdf({ 1: '', 2: '' }, 2)) });

    const ok1 = await ensureBookText({ id: 'scan', source: 'local' });
    expect(ok1).toBe(false); // 텍스트 없음
    expect(getDocumentMock).toHaveBeenCalledTimes(1);

    // 두 번째 AI 질문 — 재추출하지 않음 (시도 기록됨)
    const ok2 = await ensureBookText({ id: 'scan', source: 'local' });
    expect(ok2).toBe(false);
    expect(getDocumentMock).toHaveBeenCalledTimes(1); // 추가 호출 없음
  });

  it('force:true 면 스캔본도 재시도', async () => {
    _idb['scan2'] = new ArrayBuffer(100);
    getDocumentMock.mockReturnValue({ promise: Promise.resolve(makeMockPdf({ 1: '' }, 1)) });

    await ensureBookText({ id: 'scan2', source: 'local' });
    expect(getDocumentMock).toHaveBeenCalledTimes(1);
    await ensureBookText({ id: 'scan2', source: 'local' }, { force: true });
    expect(getDocumentMock).toHaveBeenCalledTimes(2); // 강제 재시도
  });
});
