import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

/* ────────────────────────────────────────────────────────────────
   테스트 대상
   1. pdfCache.js    — IndexedDB 캐시 계층 (mock)
   2. localBooks.js  — 로컬 파일 관리 (addLocalBook / removeLocalBook / getLocalBooks)
   3. PdfViewer 로컬 소스 분기 — source='local' 시 캐시 히트/미스 동작
   ─────────────────────────────────────────────────────────────── */

/* ── IndexedDB 전체 mock ─────────────────────────────────────── */
const _idbStore = {};

vi.mock('../utils/pdfCache.js', () => ({
  cachePdf:           vi.fn(async (id, buf) => { _idbStore[id] = buf; }),
  getCachedPdf:       vi.fn(async (id) => _idbStore[id] ?? null),
  deleteCachedPdf:    vi.fn(async (id) => { delete _idbStore[id]; }),
  downloadWithProgress: vi.fn(async (_fileId, _token, onProgress) => {
    onProgress?.(50);
    onProgress?.(100);
    return new ArrayBuffer(1024); // 가짜 1KB PDF
  }),
  getCacheInfo:    vi.fn(async () => ({ count: Object.keys(_idbStore).length, totalBytes: 0 })),
  clearAllCache:   vi.fn(async () => { Object.keys(_idbStore).forEach(k => delete _idbStore[k]); }),
}));

import { cachePdf, getCachedPdf, deleteCachedPdf } from '../utils/pdfCache.js';
import { getLocalBooks, addLocalBook, removeLocalBook, fmtFileSize } from '../utils/localBooks.js';

/* ── 헬퍼: 가짜 File 객체 ─────────────────────────────────────── */
function fakeFile(name = 'sample.pdf', sizeBytes = 2 * 1024 * 1024) {
  const buf = new ArrayBuffer(sizeBytes);
  const file = new File([buf], name, { type: 'application/pdf' });
  return file;
}

/* ─────────────────────────────────────────────────────────────── */
describe('pdfCache (IndexedDB mock) — 기본 캐시 동작', () => {
  beforeEach(() => { Object.keys(_idbStore).forEach(k => delete _idbStore[k]); });

  it('cachePdf 호출 후 getCachedPdf 로 ArrayBuffer를 꺼낼 수 있다', async () => {
    const buf = new ArrayBuffer(512);
    await cachePdf('book-1', buf);
    const result = await getCachedPdf('book-1');
    expect(result).toBe(buf);
    expect(result.byteLength).toBe(512);
  });

  it('존재하지 않는 id 는 null 을 반환한다', async () => {
    expect(await getCachedPdf('nonexistent')).toBeNull();
  });

  it('deleteCachedPdf 후에는 null 이 반환된다', async () => {
    await cachePdf('book-2', new ArrayBuffer(256));
    await deleteCachedPdf('book-2');
    expect(await getCachedPdf('book-2')).toBeNull();
  });

  it('같은 id 로 덮어쓰면 최신 버퍼로 교체된다', async () => {
    await cachePdf('book-3', new ArrayBuffer(100));
    const newer = new ArrayBuffer(200);
    await cachePdf('book-3', newer);
    expect(await getCachedPdf('book-3')).toBe(newer);
  });
});

/* ─────────────────────────────────────────────────────────────── */
describe('localBooks — 로컬 PDF 추가/조회/삭제', () => {
  beforeEach(() => {
    localStorage.clear();
    Object.keys(_idbStore).forEach(k => delete _idbStore[k]);
    vi.clearAllMocks();
  });

  it('addLocalBook 이 File 을 받아 IndexedDB 에 저장한다', async () => {
    const file = fakeFile('철학의 위안.pdf', 3 * 1024 * 1024);
    await addLocalBook(file);
    expect(cachePdf).toHaveBeenCalledOnce();
    const [savedId, savedBuf] = cachePdf.mock.calls[0];
    expect(savedId).toMatch(/^local-/);
    expect(savedBuf).toBeInstanceOf(ArrayBuffer);
  });

  it('addLocalBook 후 getLocalBooks 에 책이 추가된다', async () => {
    const file = fakeFile('논어.pdf');
    await addLocalBook(file);
    const books = getLocalBooks();
    expect(books).toHaveLength(1);
    expect(books[0].title).toBe('논어');
    expect(books[0].source).toBe('local');
    expect(books[0].size).toBeGreaterThan(0);
  });

  it('동일 파일을 두 번 추가해도 중복 없이 1개만 남는다', async () => {
    const file = fakeFile('논어.pdf', 1024);
    await addLocalBook(file);
    await addLocalBook(file); // 재추가
    expect(getLocalBooks()).toHaveLength(1);
  });

  it('여러 파일을 추가하면 최신순으로 정렬된다', async () => {
    await addLocalBook(fakeFile('첫 번째.pdf', 1000));
    await addLocalBook(fakeFile('두 번째.pdf', 2000));
    const books = getLocalBooks();
    expect(books[0].title).toBe('두 번째');
    expect(books[1].title).toBe('첫 번째');
  });

  it('addLocalBook 에서 반환된 book.id 가 캐시 key 와 동일하다', async () => {
    const file = fakeFile('test.pdf');
    const book = await addLocalBook(file);
    const cachedBuf = await getCachedPdf(book.id);
    expect(cachedBuf).not.toBeNull();
  });

  it('removeLocalBook 은 인덱스 + IndexedDB 캐시를 모두 삭제한다', async () => {
    const book = await addLocalBook(fakeFile('삭제할책.pdf'));
    expect(getLocalBooks()).toHaveLength(1);

    await removeLocalBook(book.id);
    expect(getLocalBooks()).toHaveLength(0);
    expect(deleteCachedPdf).toHaveBeenCalledWith(book.id);
  });

  it('removeLocalBook 으로 해당 책만 삭제되고 나머지는 유지된다', async () => {
    const b1 = await addLocalBook(fakeFile('A.pdf', 1000));
    const b2 = await addLocalBook(fakeFile('B.pdf', 2000));
    await removeLocalBook(b1.id);
    const remaining = getLocalBooks();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe(b2.id);
    expect(remaining[0].title).toBe('B');
  });

  it('다른 이름이지만 같은 크기이면 다른 id 를 가진다', async () => {
    const b1 = await addLocalBook(fakeFile('책A.pdf', 1024));
    const b2 = await addLocalBook(fakeFile('책B.pdf', 1024)); // 크기 같음, 이름 다름
    expect(b1.id).not.toBe(b2.id);
  });

  it('같은 이름이지만 크기가 다르면 다른 id 를 가진다', async () => {
    const b1 = await addLocalBook(fakeFile('공통.pdf', 1000));
    const b2 = await addLocalBook(fakeFile('공통.pdf', 2000));
    expect(b1.id).not.toBe(b2.id);
  });
});

/* ─────────────────────────────────────────────────────────────── */
describe('fmtFileSize — 크기 표시 형식', () => {
  it('1MB 이상은 MB 단위로 소수점 1자리', () => {
    expect(fmtFileSize(2.5 * 1024 * 1024)).toBe('2.5 MB');
    expect(fmtFileSize(1024 * 1024)).toBe('1.0 MB');
  });

  it('1MB 미만은 KB 단위로 정수', () => {
    expect(fmtFileSize(512 * 1024)).toBe('512 KB');
    expect(fmtFileSize(1024)).toBe('1 KB');
  });

  it('0 / falsy 는 빈 문자열', () => {
    expect(fmtFileSize(0)).toBe('');
    expect(fmtFileSize(null)).toBe('');
  });
});

/* ─────────────────────────────────────────────────────────────── */
describe('로컬 책 시나리오 — 전체 플로우 시뮬레이션', () => {
  beforeEach(() => {
    localStorage.clear();
    Object.keys(_idbStore).forEach(k => delete _idbStore[k]);
    vi.clearAllMocks();
  });

  it('[A] 파일 추가 → 캐시 확인 → 즉시 로드 가능', async () => {
    // 1. 사용자가 로컬 PDF 추가
    const file = fakeFile('샘플논문.pdf', 500 * 1024);
    const book = await addLocalBook(file);

    // 2. 인덱스에 등록되어 있는지 확인
    const books = getLocalBooks();
    expect(books.some(b => b.id === book.id)).toBe(true);
    expect(books[0].source).toBe('local');

    // 3. 캐시에 ArrayBuffer 가 저장되어 있는지 확인 (= 뷰어가 즉시 로드 가능)
    const cached = await getCachedPdf(book.id);
    expect(cached).not.toBeNull();
    expect(cached).toBeInstanceOf(ArrayBuffer);
  });

  it('[B] Drive 책 첫 열기 → 다운로드 → 캐시 저장 → 재열기 시 다운로드 없음', async () => {
    const { downloadWithProgress } = await import('../utils/pdfCache.js');

    const DRIVE_ID = 'drive-file-abc';

    // 첫 열기: 캐시 없음 → 다운로드
    let cached = await getCachedPdf(DRIVE_ID);
    expect(cached).toBeNull();

    const buf = await downloadWithProgress(DRIVE_ID, 'fake-token', () => {});
    await cachePdf(DRIVE_ID, buf);

    // 이후 열기: 캐시에서 즉시 로드 (downloadWithProgress 재호출 없음)
    const cached2 = await getCachedPdf(DRIVE_ID);
    expect(cached2).not.toBeNull();
    expect(downloadWithProgress).toHaveBeenCalledOnce(); // 최초 1회만 다운로드
  });

  it('[C] 로컬 책 삭제 후 재추가하면 뷰어에서 다시 로드 가능', async () => {
    const file = fakeFile('재추가테스트.pdf', 100 * 1024);
    const book = await addLocalBook(file);
    const originalId = book.id;

    // 삭제
    await removeLocalBook(book.id);
    expect(await getCachedPdf(originalId)).toBeNull();

    // 재추가 (같은 파일이면 같은 id → 캐시 복원)
    await addLocalBook(file);
    const restored = await getCachedPdf(originalId);
    expect(restored).not.toBeNull();
  });

  it('[D] Drive 책 캐시 + 로컬 책이 id 공간 충돌 없이 공존한다', async () => {
    const localBook = await addLocalBook(fakeFile('local.pdf', 1024));
    await cachePdf('drive-xyz', new ArrayBuffer(2048));

    // 서로 다른 id 공간
    expect(localBook.id).toMatch(/^local-/);
    expect('drive-xyz').not.toMatch(/^local-/);

    // 각각 독립적으로 조회 가능
    expect(await getCachedPdf(localBook.id)).not.toBeNull();
    expect(await getCachedPdf('drive-xyz')).not.toBeNull();
  });

  it('[E] 같은 PDF를 여러 번 추가해도 캐시는 최신 버전으로 유지된다', async () => {
    const file = fakeFile('중복추가.pdf', 1024);
    await addLocalBook(file);
    await addLocalBook(file); // 재추가

    // cachePdf 는 2번 호출되지만 인덱스에는 1개
    expect(getLocalBooks()).toHaveLength(1);
    expect(cachePdf).toHaveBeenCalledTimes(2);
  });
});

/* ─────────────────────────────────────────────────────────────── */
describe('PdfViewer source 분기 시뮬레이션 (unit 수준)', () => {
  /* PdfViewer 컴포넌트를 직접 렌더하지 않고
     source 분기 로직과 동일한 조건을 단위 수준에서 검증 */

  beforeEach(() => {
    Object.keys(_idbStore).forEach(k => delete _idbStore[k]);
    vi.clearAllMocks();
  });

  async function simulatePdfLoad({ source, fileId, hasDriveToken }) {
    const isLocal = source === 'local';
    const token = hasDriveToken ? 'fake-token' : null;

    if (!isLocal && !token) return { status: 'error', errMsg: 'auth' };

    const cached = await getCachedPdf(fileId);

    if (cached) return { status: 'ready', fromCache: true };
    if (isLocal) return { status: 'error', errMsg: 'local-missing' };

    // Drive 다운로드 시뮬레이션
    const { downloadWithProgress } = await import('../utils/pdfCache.js');
    const buf = await downloadWithProgress(fileId, token, () => {});
    await cachePdf(fileId, buf);
    return { status: 'ready', fromCache: false };
  }

  it('로컬 + 캐시 있음 → status:ready, fromCache:true', async () => {
    await cachePdf('local-abc', new ArrayBuffer(1024));
    const r = await simulatePdfLoad({ source: 'local', fileId: 'local-abc', hasDriveToken: false });
    expect(r.status).toBe('ready');
    expect(r.fromCache).toBe(true);
  });

  it('로컬 + 캐시 없음 → status:error, errMsg:local-missing', async () => {
    const r = await simulatePdfLoad({ source: 'local', fileId: 'local-gone', hasDriveToken: false });
    expect(r.status).toBe('error');
    expect(r.errMsg).toBe('local-missing');
  });

  it('Drive + 토큰 없음 → status:error, errMsg:auth', async () => {
    const r = await simulatePdfLoad({ source: 'drive', fileId: 'drive-xyz', hasDriveToken: false });
    expect(r.status).toBe('error');
    expect(r.errMsg).toBe('auth');
  });

  it('Drive + 캐시 있음 → 다운로드 없이 status:ready', async () => {
    await cachePdf('drive-cached', new ArrayBuffer(2048));
    const r = await simulatePdfLoad({ source: 'drive', fileId: 'drive-cached', hasDriveToken: true });
    const { downloadWithProgress } = await import('../utils/pdfCache.js');
    expect(r.status).toBe('ready');
    expect(r.fromCache).toBe(true);
    expect(downloadWithProgress).not.toHaveBeenCalled();
  });

  it('Drive + 캐시 없음 → 다운로드 후 status:ready, 캐시 저장', async () => {
    const r = await simulatePdfLoad({ source: 'drive', fileId: 'drive-new', hasDriveToken: true });
    const { downloadWithProgress } = await import('../utils/pdfCache.js');
    expect(r.status).toBe('ready');
    expect(r.fromCache).toBe(false);
    expect(downloadWithProgress).toHaveBeenCalledOnce();
    // 이후 같은 파일은 캐시 히트
    const r2 = await simulatePdfLoad({ source: 'drive', fileId: 'drive-new', hasDriveToken: true });
    expect(r2.fromCache).toBe(true);
    expect(downloadWithProgress).toHaveBeenCalledOnce(); // 추가 호출 없음
  });
});
