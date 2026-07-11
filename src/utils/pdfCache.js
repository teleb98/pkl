/* IndexedDB 기반 PDF 캐시
   - 책별 ArrayBuffer 저장 (fileId → ArrayBuffer)
   - 캐시 히트 시 네트워크 요청 없이 즉시 로드
*/

const DB_NAME = 'pkl-pdf-cache';
const STORE   = 'pdfs';
const VERSION = 1;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = e => e.target.result.createObjectStore(STORE);
    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = e => reject(e.target.error);
  });
}

export async function getCachedPdf(fileId) {
  try {
    const db = await openDB();
    return await new Promise((resolve) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(fileId);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror   = () => resolve(null);
    });
  } catch { return null; }
}

export async function cachePdf(fileId, arrayBuffer) {
  try {
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(arrayBuffer, fileId);
      tx.oncomplete = resolve;
      tx.onerror    = () => reject(tx.error);
    });
  } catch { /* 캐시 저장 실패는 무시 — 다음에 재시도 */ }
}

export async function deleteCachedPdf(fileId) {
  try {
    const db = await openDB();
    await new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(fileId);
      tx.oncomplete = resolve;
      tx.onerror    = resolve;
    });
  } catch { /* ignore */ }
}

/** 캐시 전체 크기(bytes) 반환 */
export async function getCacheInfo() {
  try {
    const db = await openDB();
    return await new Promise((resolve) => {
      let totalBytes = 0;
      let count = 0;
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).openCursor();
      req.onsuccess = e => {
        const cursor = e.target.result;
        if (cursor) {
          totalBytes += cursor.value?.byteLength || 0;
          count++;
          cursor.continue();
        } else {
          resolve({ count, totalBytes });
        }
      };
      req.onerror = () => resolve({ count: 0, totalBytes: 0 });
    });
  } catch { return { count: 0, totalBytes: 0 }; }
}

/** 모든 캐시 삭제 */
export async function clearAllCache() {
  try {
    const db = await openDB();
    await new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).clear();
      tx.oncomplete = resolve;
      tx.onerror    = resolve;
    });
  } catch { /* ignore */ }
}

/** 진행률 콜백을 받으며 Drive에서 PDF 다운로드 */
export async function downloadWithProgress(fileId, accessToken, onProgress) {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });

  if (res.status === 401 || res.status === 403) throw new Error('auth');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const contentLength = Number(res.headers.get('content-length') || 0);
  const reader = res.body.getReader();
  const chunks = [];
  let received = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    if (contentLength > 0) onProgress?.(Math.round(received / contentLength * 100));
  }

  const total = chunks.reduce((s, c) => s + c.length, 0);
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.length; }

  return merged.buffer;
}
