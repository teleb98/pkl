/* 서재에 추가한 로컬 PDF를 Google Drive 에 업로드 — MyLibrary/books/ 폴더에
   원본 PDF 를 백업해 다른 기기에서도 열 수 있게 한다. drive.file 스코프면 충분
   (앱이 만든 폴더·파일만 접근). 같은 이름 파일은 갱신(중복 생성 없음). */
import { findOrCreateFolder, DriveError } from './driveBackup.js';
import { getCachedPdf } from './pdfCache.js';

export const PDF_FOLDER_PARENT = 'MyLibrary';
export const PDF_FOLDER_NAME = 'books';
export const PDF_UPLOAD_SCOPE = 'https://www.googleapis.com/auth/drive.file';

/** MyLibrary/books 폴더 id 확보(없으면 생성) */
export async function ensurePdfFolder(token) {
  const parent = await findOrCreateFolder(token, PDF_FOLDER_PARENT);
  return findOrCreateFolder(token, PDF_FOLDER_NAME, parent);
}

async function findPdfInFolder(token, folderId, fileName) {
  const q = `name='${fileName.replace(/'/g, "\\'")}' and '${folderId}' in parents and trashed=false`;
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)&pageSize=1`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) return null;
  return (await res.json()).files?.[0]?.id || null;
}

/**
 * PDF 바이너리 하나를 업로드(같은 이름이면 갱신).
 * @returns {Promise<{id:string, updated:boolean, webViewLink?:string}>}
 */
export async function uploadPdfToDrive(token, { fileName, arrayBuffer, folderId }) {
  const dir = folderId || await ensurePdfFolder(token);
  const existingId = await findPdfInFolder(token, dir, fileName);

  if (existingId) {
    const res = await fetch(
      `https://www.googleapis.com/upload/drive/v3/files/${existingId}?uploadType=media`,
      { method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/pdf' }, body: new Blob([arrayBuffer], { type: 'application/pdf' }) }
    );
    if (!res.ok) throw new DriveError(`PDF 업데이트 실패 (${res.status})`, res.status);
    return { id: existingId, updated: true };
  }

  // 신규 — multipart (메타 JSON + PDF 바이너리)
  const boundary = 'pkl_pdf_' + Date.now();
  const meta = { name: fileName, mimeType: 'application/pdf', parents: [dir] };
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`,
    new Blob([arrayBuffer]),
    `\r\n--${boundary}--`,
  ]);
  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink',
    { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${boundary}` }, body }
  );
  if (!res.ok) throw new DriveError(`PDF 업로드 실패 (${res.status})`, res.status);
  const data = await res.json();
  return { id: data.id, updated: false, webViewLink: data.webViewLink };
}

/**
 * 추가된 책들의 캐시된 PDF 를 순서대로 업로드.
 * 캐시가 없는 책(바이너리 회수 불가)은 건너뛰고 실패로 센다.
 * @param {Array<{id,title}>} books
 * @returns {Promise<{done:number, failed:number, total:number}>}
 */
export async function uploadBooksToDrive(token, books, { onProgress } = {}) {
  if (!token) throw new Error('no-token');
  const folderId = await ensurePdfFolder(token);
  let done = 0, failed = 0;
  for (let i = 0; i < (books || []).length; i++) {
    const b = books[i];
    onProgress?.(i + 1, books.length, b.title);
    try {
      const buf = await getCachedPdf(b.id);
      if (!buf) { failed += 1; continue; }
      await uploadPdfToDrive(token, { fileName: `${b.title}.pdf`, arrayBuffer: buf, folderId });
      done += 1;
    } catch {
      failed += 1;
    }
  }
  return { done, failed, total: (books || []).length };
}
