/* Drive 책의 Electron 로컬 영구 사본 관리 — PdfViewer가 새로 다운로드할 때만
   자동으로 로컬 파일을 만들어주는데, 이미 IndexedDB 에 캐시된(과거에 연) 책은
   그 경로를 타지 않아 계속 온라인 전용으로 남는다. 이 유틸은:
   1) 상세 화면에서 명시적으로 "오프라인 사본 만들기"를 트리거하는 기능
   2) 서재에서 책을 제거할 때 drive-books/ 안의 로컬 사본도 함께 지우는 기능
   을 제공한다. */
import { isElectron } from './localBooks.js';
import { getCachedPdf, cachePdf, downloadWithProgress } from './pdfCache.js';
import { setBookMeta, getBookMeta } from '../store.js';

function getDriveToken() {
  try {
    const cfg = JSON.parse(localStorage.getItem('pkl_config') || 'null');
    const token = cfg?.driveAccessToken || cfg?.googleUser?.accessToken;
    if (!token) return null;
    const expiresAt = cfg?.driveTokenExpiresAt;
    if (expiresAt && Date.now() > expiresAt) return null;
    return token;
  } catch { return null; }
}

/** Electron이고 아직 로컬 영구 사본이 없는 Drive 책인지 */
export function needsLocalCopy(book) {
  return isElectron() && book?.source === 'drive' && !getBookMeta(book?.id)?.filePath;
}

/**
 * 이미 캐시된(또는 새로 받아야 하는) Drive 책을 실제 로컬 파일로 저장.
 * IndexedDB 캐시가 있으면 그걸 쓰고, 없으면 Drive 에서 새로 받는다(토큰 필요).
 * @returns {{ok:true, path:string, alreadyExists?:true} | never} 실패 시 throw
 */
export async function ensureDriveLocalCopy(book, { onProgress } = {}) {
  if (!isElectron()) throw new Error('electron-only');
  if (getBookMeta(book.id)?.filePath) return { ok: true, alreadyExists: true, path: getBookMeta(book.id).filePath };

  let buf = await getCachedPdf(book.id);
  if (!buf) {
    const token = getDriveToken();
    if (!token) throw new Error('auth');
    buf = await downloadWithProgress(book.id, token, onProgress);
    cachePdf(book.id, buf);
  }
  // pdf.js 등 다른 소비자가 나중에 같은 버퍼를 detach 할 수 있으니 방어적으로 복사본 전달
  const copy = buf.slice(0);
  const res = await window.electron.saveDrivePdf(`${book.id}.pdf`, copy);
  if (!res?.ok) throw new Error(res?.error || 'save-failed');
  setBookMeta(book.id, { filePath: res.path });
  return { ok: true, path: res.path };
}

/** 서재에서 Drive 책을 제거할 때 로컬 사본 파일도 함께 정리(고아 파일 방지) */
export async function deleteDriveLocalCopy(book) {
  if (!isElectron()) return;
  const filePath = getBookMeta(book?.id)?.filePath;
  if (!filePath) return;
  try { await window.electron.deleteDrivePdf(filePath); } catch { /* 파일이 이미 없어도 무시 */ }
}
