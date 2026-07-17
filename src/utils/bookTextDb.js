/* IndexedDB 기반 책 전문(全文) 저장소 — 전체 Vision 스캔 결과의 영구 보관.
   pageTextCache(메모리)는 앱 재시작 시 사라지므로, 전체 스캔한 텍스트를
   여기 저장해 두고 세션 시작 시 하이드레이션한다.

   레코드: bookId → { pages: { [pageNum]: text }, totalPages, scannedPages,
                      done, engine, updatedAt } */

const DB_NAME = 'pkl-book-text';
const STORE   = 'texts';
const VERSION = 1;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = e => e.target.result.createObjectStore(STORE);
    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = e => reject(e.target.error);
  });
}

/** 저장된 전문 레코드 조회 (없으면 null) */
export async function getBookText(bookId) {
  try {
    const db = await openDB();
    return await new Promise((resolve) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(bookId);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror   = () => resolve(null);
    });
  } catch { return null; }
}

/** 전문 레코드 저장(부분 저장 포함 — 스캔 중간 저장/이어하기용) */
export async function saveBookText(bookId, record) {
  try {
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put({ ...record, updatedAt: Date.now() }, bookId);
      tx.oncomplete = resolve;
      tx.onerror    = () => reject(tx.error);
    });
    return true;
  } catch { return false; }
}

/**
 * 뷰어의 단일 페이지 Vision 인식 결과를 전문 저장소에 합친다.
 * 기존에는 단일 페이지 인식이 pageTextCache(메모리, 앱 재시작 시 소실)에만
 * 저장되고 bookTextDb(RAG 인덱스의 원천)에는 반영되지 않아, "인식은 됐지만
 * RAG로 검색할 수 없는" 텍스트가 생겼다. 페이지 단위로도 즉시 bookTextDb에
 * 반영해 RAG 인덱스가 이를 따라잡을 수 있게 한다.
 */
export async function mergePageText(bookId, pageNum, text) {
  if (!text?.trim()) return null;
  const existing = await getBookText(bookId);
  const pages = { ...(existing?.pages || {}), [pageNum]: text };
  const record = {
    pages,
    totalPages: existing?.totalPages || 0,
    scannedPages: Object.keys(pages).length,
    done: existing?.done || false,
    engine: existing?.engine || 'vision',
  };
  await saveBookText(bookId, record);
  return record;
}

export async function deleteBookText(bookId) {
  try {
    const db = await openDB();
    await new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(bookId);
      tx.oncomplete = resolve;
      tx.onerror    = resolve;
    });
  } catch { /* ignore */ }
}
