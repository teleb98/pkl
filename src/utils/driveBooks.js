/* 사용자가 Drive 브라우저(DriveBookPicker)에서 개별적으로 추가한 Drive 파일 인덱스.
   설정의 "Google Drive 서재"(단일 폴더 자동 동기화)와는 별개 — 여러 폴더를 넘나들며
   낱개/폴더 단위로 고른 파일들을 저장. 실제 PDF 본문은 다운로드하지 않고 참조만
   저장하며, PdfViewer 가 source:'drive' 책을 여는 기존 경로(Drive API 다운로드)를
   그대로 재사용한다. */
import { getBookMeta } from '../store.js';

const KEY = 'pkl_drive_books';

export function getDriveBooks() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
}

function saveRaw(list) {
  localStorage.setItem(KEY, JSON.stringify(list));
}

/** Drive files([{id,name,mimeType,size,modifiedTime,webViewLink}]) 를 인덱스에 추가 (중복 스킵) */
export function addDriveBooks(files) {
  const existing = getDriveBooks();
  const existingIds = new Set(existing.map(b => b.id));
  const additions = (files || [])
    .filter(f => !existingIds.has(f.id))
    .map(f => ({
      id: f.id,
      title: (f.name || 'untitled').replace(/\.pdf$/i, '').replace(/_/g, ' '),
      source: 'drive',
      size: f.size ? Number(f.size) : 0,
      mimeType: f.mimeType || 'application/pdf',
      webViewLink: f.webViewLink || null,
      modifiedTime: f.modifiedTime || new Date().toISOString(),
      addedAt: Date.now(),
    }));
  const merged = [...additions, ...existing];
  saveRaw(merged);
  return additions;
}

export function removeDriveBook(id) {
  const next = getDriveBooks().filter(b => b.id !== id);
  saveRaw(next);
  return next;
}

/** 인덱스 항목 → 서재 그리드용 book 객체 (Drive/로컬 책과 동일한 형태).
 *  filePath 는 driveBooks 인덱스가 아닌 getBookMeta(범용 진행률 저장소)에서 읽는다 —
 *  Electron에서 다운로드 후 PdfViewer 가 setBookMeta(id,{filePath}) 로 기록하며,
 *  이렇게 하면 폴더-동기화 Drive 책(driveFileToBook)에도 동일한 방식이 적용된다. */
export function driveBookToBook(db) {
  const meta = getBookMeta(db.id) || {};
  return {
    id: db.id,
    title: db.title,
    source: 'drive',
    size: db.size,
    mimeType: db.mimeType,
    webViewLink: db.webViewLink,
    filePath: meta.filePath || null, // Electron: 로컬 영구 사본 경로 (있으면 오프라인 접근 가능)
    status: meta.status || 'unread',
    progress: meta.progress || 0,
    lastPage: meta.lastPage || 0,
    pages: meta.pages || 0,
    highlights: meta.highlights || 0,
    notes: meta.notes || 0,
    bookmarks: meta.bookmarks || 0,
    modifiedTime: db.modifiedTime,
  };
}
