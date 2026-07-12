/* 읽은 위치(진행률)만 Drive에 동기화 — 메모/하이라이트 백업(driveBackup.js)과는
   별개의 작은 JSON 파일(PKL/progress.json)로, "어디까지 읽었는지"만 기기 간에
   공유한다. 같은 drive.file 스코프 writeToken 을 재사용한다.

   동기화 규칙: 필드별이 아니라 책 단위로 updatedAt 이 더 최신인 쪽 전체를 채택
   (last-write-wins). 리모트가 더 최신이면 로컬 store 에 반영 후, 반영된 최신
   상태 전체를 다시 업로드해 Drive 쪽도 항상 로컬과 동일하게 맞춘다. */
import { getBookIndex, getBookMeta, setBookMeta } from '../store.js';
import { getLocalBooks } from './localBooks.js';
import { getDriveBooks } from './driveBooks.js';
import { findOrCreateFolder } from './driveBackup.js';
import { downloadDriveJson, uploadDriveJson } from './driveJsonSync.js';

const PROGRESS_FILE = 'progress.json';

function collectKnownBooks() {
  const map = new Map();
  for (const b of getBookIndex()) map.set(b.id, b.title);
  for (const b of getLocalBooks()) map.set(b.id, b.title);
  for (const b of getDriveBooks()) map.set(b.id, b.title);
  return map;
}

/** 현재 로컬에 저장된, 진행 기록이 있는 책들의 진행률 스냅샷 */
export function collectProgressRecords() {
  const known = collectKnownBooks();
  const records = {};
  for (const [id, title] of known) {
    const meta = getBookMeta(id);
    if (!meta || (meta.progress == null && meta.lastPage == null && !meta.status)) continue;
    records[id] = {
      title,
      status: meta.status || 'unread',
      progress: meta.progress || 0,
      lastPage: meta.lastPage || 0,
      pages: meta.pages || 0,
      updatedAt: meta.updatedAt || 0,
    };
  }
  return records;
}

/** 원격 레코드 중 로컬보다 최신인 것만 로컬 store 에 반영. 반영된 책 수 반환 */
export function mergeRemoteProgress(remote) {
  let applied = 0;
  for (const [id, r] of Object.entries(remote || {})) {
    const localUpdatedAt = getBookMeta(id)?.updatedAt || 0;
    if ((r.updatedAt || 0) > localUpdatedAt) {
      setBookMeta(id, {
        status: r.status, progress: r.progress, lastPage: r.lastPage, pages: r.pages,
        updatedAt: r.updatedAt, // 명시적으로 전달 — setBookMeta 가 현재시각으로 덮어쓰지 않도록
      });
      applied++;
    }
  }
  return applied;
}

/**
 * Drive와 읽은 위치를 양방향 동기화: 원격 → 로컬 반영 → 병합된 스냅샷을 다시 업로드.
 * @returns {{pulled:number, total:number}} 로컬에 반영된 책 수 / 전체 동기화 대상 책 수
 */
export async function syncProgressWithDrive(token) {
  if (!token) throw new Error('no-token');
  const folderId = await findOrCreateFolder(token, 'PKL');
  const remote = await downloadDriveJson(token, folderId, PROGRESS_FILE);
  const pulled = mergeRemoteProgress(remote);
  const merged = collectProgressRecords();
  await uploadDriveJson(token, folderId, PROGRESS_FILE, merged);
  return { pulled, total: Object.keys(merged).length };
}
