/* IndexedDB 기반 책 벡터(임베딩) 저장소 — RAG 검색 인덱스의 영구 보관.
   bookTextDb(전문 텍스트)와 별도 DB로 분리 — 벡터 삭제/재색인이
   원문 텍스트에 영향을 주지 않게 한다.

   레코드: bookId → { model, dim, chunkCount, chunks:[{page,text,vector}], builtAt } */

const DB_NAME = 'pkl-book-vectors';
const STORE   = 'vectors';
const VERSION = 1;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = e => e.target.result.createObjectStore(STORE);
    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = e => reject(e.target.error);
  });
}

export async function getBookVectors(bookId) {
  try {
    const db = await openDB();
    return await new Promise((resolve) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(bookId);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror   = () => resolve(null);
    });
  } catch { return null; }
}

export async function saveBookVectors(bookId, record) {
  try {
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(record, bookId);
      tx.oncomplete = resolve;
      tx.onerror    = () => reject(tx.error);
    });
    return true;
  } catch { return false; }
}

export async function deleteBookVectors(bookId) {
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
