/* 로컬 PDF 관리 — File API + IndexedDB 캐시
   book 스키마: { id, title, source:'local', size, addedAt, filePath? }
   Electron: filePath 로 재열기 시 네이티브 파일 읽기
   Capacitor(iPad/Android 태블릿): 파일 선택 후 IndexedDB 캐시에 저장
*/
import { cachePdf, deleteCachedPdf } from './pdfCache.js';

const LOCAL_INDEX_KEY = 'pkl_local_books';

/** Electron 데스크톱 환경 여부 */
export const isElectron = () => !!window.electron;

/** Capacitor(iOS/Android 네이티브) 환경 여부 */
export const isCapacitor = () =>
  !!(window.Capacitor?.isNativePlatform?.() ?? window.Capacitor?.isNative);

export function getLocalBooks() {
  try { return JSON.parse(localStorage.getItem(LOCAL_INDEX_KEY) || '[]'); } catch { return []; }
}

function saveLocalBooks(books) {
  localStorage.setItem(LOCAL_INDEX_KEY, JSON.stringify(books));
}

/** 이름+크기 기반 안정적 ID */
function makeId(name, size) {
  const raw = `${name}::${size}`;
  let h = 0;
  for (let i = 0; i < raw.length; i++) h = (Math.imul(31, h) + raw.charCodeAt(i)) | 0;
  return `local-${Math.abs(h).toString(36)}`;
}

/**
 * [Web] File 객체 → 앱에 추가 (IndexedDB 캐시)
 */
export async function addLocalBook(file) {
  const id = makeId(file.name, file.size);
  const title = file.name.replace(/\.pdf$/i, '').replace(/_/g, ' ');
  const arrayBuffer = await file.arrayBuffer();
  await cachePdf(id, arrayBuffer);

  const book = { id, title, source: 'local', size: file.size, addedAt: Date.now() };
  const books = getLocalBooks().filter(b => b.id !== id);
  books.unshift(book);
  saveLocalBooks(books);
  return book;
}

/**
 * [Electron] 네이티브 파일 선택 다이얼로그 호출 → 선택된 파일들을 추가
 * filePath 를 저장해, 캐시 만료 시 자동 재로딩 가능
 */
export async function addLocalBooksElectron() {
  const files = await window.electron.openPdfDialog(); // [{path, name, size}]
  if (!files?.length) return [];
  const results = [];
  for (const f of files) {
    const id = makeId(f.name, f.size);
    const title = f.name.replace(/\.pdf$/i, '').replace(/_/g, ' ');

    // 네이티브 파일 읽기
    const res = await window.electron.readPdf(f.path);
    if (res.ok) await cachePdf(id, res.buffer);

    const book = {
      id,
      title,
      source: 'local',
      size: f.size,
      filePath: f.path, // Electron 전용: 재로딩을 위해 경로 보존
      addedAt: Date.now(),
      cached: res.ok,
    };

    const books = getLocalBooks().filter(b => b.id !== id);
    books.unshift(book);
    saveLocalBooks(books);
    results.push(book);
  }
  return results;
}

/**
 * [Capacitor / iPad·Android 태블릿] 네이티브 파일 선택 → IndexedDB 캐시 저장
 * file-picker 로 PDF 선택, base64 또는 blob → ArrayBuffer 변환 후 캐시.
 */
export async function addLocalBooksCapacitor() {
  const { FilePicker } = await import('@capawesome/capacitor-file-picker');
  const result = await FilePicker.pickFiles({
    types: ['application/pdf'],
    multiple: true,
    readData: true, // base64 data 함께 반환
  });
  const files = result?.files || [];
  if (!files.length) return [];

  const out = [];
  for (const f of files) {
    const name = f.name || 'document.pdf';
    const size = f.size || 0;
    const id = makeId(name, size);
    const title = name.replace(/\.pdf$/i, '').replace(/_/g, ' ');

    // base64 → ArrayBuffer
    let arrayBuffer = null;
    if (f.data) {
      const bin = atob(f.data);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      arrayBuffer = bytes.buffer;
    } else if (f.blob) {
      arrayBuffer = await f.blob.arrayBuffer();
    }
    // data/blob 둘 다 없어 캐시 불가하면 추가하지 않음 (열 수 없는 책 방지).
    // Capacitor는 filePath 보존이 불가(보안 스코프)하므로 캐시 실패 시 복구 수단 없음.
    if (!arrayBuffer) continue;
    await cachePdf(id, arrayBuffer);

    const book = {
      id, title, source: 'local',
      size: size || arrayBuffer.byteLength || 0,
      addedAt: Date.now(),
      cached: true,
    };
    const books = getLocalBooks().filter(b => b.id !== id);
    books.unshift(book);
    saveLocalBooks(books);
    out.push(book);
  }
  return out;
}

/** 환경에 맞는 로컬 PDF 추가 진입점 (Electron / Capacitor 공통) */
export async function addLocalBooksNative() {
  if (isElectron()) return addLocalBooksElectron();
  if (isCapacitor()) return addLocalBooksCapacitor();
  return [];
}

/** 네이티브(Electron/Capacitor) 환경에서 네이티브 파일 선택을 쓰는지 */
export const usesNativePicker = () => isElectron() || isCapacitor();

/**
 * [Electron] 캐시에서 책이 사라졌을 때 filePath 로 재로드
 */
export async function reloadLocalBookFromPath(book) {
  if (!isElectron() || !book.filePath) return false;
  const res = await window.electron.readPdf(book.filePath);
  if (!res.ok) return false;
  await cachePdf(book.id, res.buffer);
  // cached 플래그 업데이트
  const books = getLocalBooks().map(b => b.id === book.id ? { ...b, cached: true } : b);
  saveLocalBooks(books);
  return true;
}

/** 로컬 책 삭제 (인덱스 + 캐시) */
export async function removeLocalBook(bookId) {
  const books = getLocalBooks().filter(b => b.id !== bookId);
  saveLocalBooks(books);
  await deleteCachedPdf(bookId);
}

/** Electron 메뉴 이벤트(menu:openPdf) 구독 헬퍼 */
export function onElectronMenuOpenPdf(callback) {
  if (!isElectron()) return () => {};
  window.electron.on('menu:openPdf', callback);
  return () => window.electron.off('menu:openPdf', callback);
}

/** 파일 크기를 읽기 쉬운 문자열로 */
export function fmtFileSize(bytes) {
  if (!bytes) return '';
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${(bytes / 1024).toFixed(0)} KB`;
}
