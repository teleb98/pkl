import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/* ────────────────────────────────────────────────────────────────
   네이티브 플랫폼 분기 검증
   - isElectron / isCapacitor / usesNativePicker
   - addLocalBooksNative 가 환경에 맞는 추가 함수로 라우팅
   웹/Electron/Capacitor 3개 환경을 window 전역으로 시뮬레이션.
   ─────────────────────────────────────────────────────────────── */

const _idbStore = {};
vi.mock('../utils/pdfCache.js', () => ({
  cachePdf:        vi.fn(async (id, buf) => { _idbStore[id] = buf; }),
  getCachedPdf:    vi.fn(async (id) => _idbStore[id] ?? null),
  deleteCachedPdf: vi.fn(async (id) => { delete _idbStore[id]; }),
}));

// @capawesome/capacitor-file-picker 동적 import 모킹
const _pickResult = { files: [] };
vi.mock('@capawesome/capacitor-file-picker', () => ({
  FilePicker: { pickFiles: vi.fn(async () => _pickResult) },
}));

import {
  isElectron, isCapacitor, usesNativePicker,
  addLocalBooksNative, addLocalBooksCapacitor, getLocalBooks,
} from '../utils/localBooks.js';

function clearEnv() {
  delete window.electron;
  delete window.Capacitor;
}

describe('환경 감지 — isElectron / isCapacitor / usesNativePicker', () => {
  beforeEach(() => { clearEnv(); localStorage.clear(); });
  afterEach(() => clearEnv());

  it('아무 전역도 없으면 (웹) 모두 false', () => {
    expect(isElectron()).toBe(false);
    expect(isCapacitor()).toBe(false);
    expect(usesNativePicker()).toBe(false);
  });

  it('window.electron 있으면 isElectron + usesNativePicker true', () => {
    window.electron = { openPdfDialog: () => {} };
    expect(isElectron()).toBe(true);
    expect(isCapacitor()).toBe(false);
    expect(usesNativePicker()).toBe(true);
  });

  it('Capacitor.isNativePlatform()===true 면 isCapacitor + usesNativePicker true', () => {
    window.Capacitor = { isNativePlatform: () => true };
    expect(isCapacitor()).toBe(true);
    expect(isElectron()).toBe(false);
    expect(usesNativePicker()).toBe(true);
  });

  it('Capacitor.isNativePlatform()===false (웹뷰 아님) 이면 isCapacitor false', () => {
    window.Capacitor = { isNativePlatform: () => false };
    expect(isCapacitor()).toBe(false);
    expect(usesNativePicker()).toBe(false);
  });

  it('구버전 Capacitor.isNative 플래그도 인식', () => {
    window.Capacitor = { isNative: true };
    expect(isCapacitor()).toBe(true);
  });
});

describe('addLocalBooksNative — 환경별 라우팅', () => {
  beforeEach(() => {
    clearEnv(); localStorage.clear();
    Object.keys(_idbStore).forEach(k => delete _idbStore[k]);
    _pickResult.files = [];
    vi.clearAllMocks();
  });
  afterEach(() => clearEnv());

  it('웹 환경에서는 빈 배열 반환 (네이티브 피커 없음)', async () => {
    const r = await addLocalBooksNative();
    expect(r).toEqual([]);
  });

  it('Electron 환경에서는 openPdfDialog 경유', async () => {
    window.electron = {
      openPdfDialog: vi.fn(async () => [{ path: '/x/a.pdf', name: 'a.pdf', size: 1000 }]),
      readPdf: vi.fn(async () => ({ ok: true, buffer: new ArrayBuffer(1000) })),
    };
    const r = await addLocalBooksNative();
    expect(window.electron.openPdfDialog).toHaveBeenCalled();
    expect(r).toHaveLength(1);
    expect(r[0].source).toBe('local');
    expect(r[0].filePath).toBe('/x/a.pdf');
  });

  it('Capacitor 환경에서는 FilePicker 경유', async () => {
    window.Capacitor = { isNativePlatform: () => true };
    // base64 "JVBERi0=" = "%PDF-" 비슷한 더미
    _pickResult.files = [{ name: 'book.pdf', size: 2048, data: btoa('PDFDATA') }];
    const r = await addLocalBooksCapacitor();
    expect(r).toHaveLength(1);
    expect(r[0].title).toBe('book');
    expect(r[0].source).toBe('local');
    expect(getLocalBooks()).toHaveLength(1);
  });
});

describe('addLocalBooksCapacitor — base64/blob 변환', () => {
  beforeEach(() => {
    clearEnv(); localStorage.clear();
    Object.keys(_idbStore).forEach(k => delete _idbStore[k]);
    _pickResult.files = [];
    vi.clearAllMocks();
    window.Capacitor = { isNativePlatform: () => true };
  });
  afterEach(() => clearEnv());

  it('선택 취소(빈 files)면 빈 배열', async () => {
    _pickResult.files = [];
    expect(await addLocalBooksCapacitor()).toEqual([]);
  });

  it('base64 data → ArrayBuffer 캐시 저장', async () => {
    const { cachePdf } = await import('../utils/pdfCache.js');
    _pickResult.files = [{ name: 'doc.pdf', size: 7, data: btoa('PDFDATA') }];
    const r = await addLocalBooksCapacitor();
    expect(cachePdf).toHaveBeenCalledOnce();
    const [, buf] = cachePdf.mock.calls[0];
    expect(buf).toBeInstanceOf(ArrayBuffer);
    expect(buf.byteLength).toBe(7);
    expect(r[0].cached).toBe(true);
  });

  it('blob 경로도 처리', async () => {
    const blob = { arrayBuffer: async () => new ArrayBuffer(16) };
    _pickResult.files = [{ name: 'b.pdf', size: 16, blob }];
    const r = await addLocalBooksCapacitor();
    expect(r[0].cached).toBe(true);
    expect(r[0].size).toBe(16);
  });

  it('여러 파일 모두 추가', async () => {
    _pickResult.files = [
      { name: 'a.pdf', size: 3, data: btoa('AAA') },
      { name: 'b.pdf', size: 3, data: btoa('BBB') },
    ];
    const r = await addLocalBooksCapacitor();
    expect(r).toHaveLength(2);
    expect(getLocalBooks()).toHaveLength(2);
  });

  it('data/blob 둘 다 없으면 추가 안 함 (열 수 없는 책 방지)', async () => {
    _pickResult.files = [{ name: 'broken.pdf', size: 100 }]; // data 없음
    const r = await addLocalBooksCapacitor();
    expect(r).toHaveLength(0);
    expect(getLocalBooks()).toHaveLength(0);
  });

  it('일부만 데이터 있으면 유효한 것만 추가', async () => {
    _pickResult.files = [
      { name: 'ok.pdf', size: 3, data: btoa('OK1') },
      { name: 'bad.pdf', size: 100 }, // data 없음 → skip
    ];
    const r = await addLocalBooksCapacitor();
    expect(r).toHaveLength(1);
    expect(r[0].title).toBe('ok');
  });
});
