/* Drive의 PKL 폴더에 작은 JSON 파일 하나를 찾기/받기/쓰기 — progressSync.js와
   librarySync.js가 공유하는 최소 헬퍼. driveBackup.js의 findOrCreateFolder와
   함께 쓰인다(백업용 markdown 업로드와는 별개 경로). */
import { DriveError } from './driveBackup.js';

export async function findDriveFile(token, folderId, fileName) {
  const q = `name='${fileName}' and '${folderId}' in parents and trashed=false`;
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)&pageSize=1`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new DriveError(`파일 조회 실패 (${res.status})`, res.status);
  const data = await res.json();
  return data.files?.[0]?.id || null;
}

/** 없으면 {} 반환(에러로 취급하지 않음 — 최초 동기화 상황) */
export async function downloadDriveJson(token, folderId, fileName) {
  const fileId = await findDriveFile(token, folderId, fileName);
  if (!fileId) return {};
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return {};
  try { return await res.json(); } catch { return {}; }
}

export async function uploadDriveJson(token, folderId, fileName, data) {
  const fileId = await findDriveFile(token, folderId, fileName);
  const body = JSON.stringify(data);

  if (fileId) {
    const res = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body,
    });
    if (!res.ok) throw new DriveError(`업로드 실패 (${res.status})`, res.status);
    return;
  }

  const boundary = 'pkl_json_' + Date.now();
  const meta = { name: fileName, mimeType: 'application/json', parents: [folderId] };
  const multipart = [
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
    JSON.stringify(meta),
    `\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n`,
    body,
    `\r\n--${boundary}--`,
  ].join('');
  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
    body: multipart,
  });
  if (!res.ok) throw new DriveError(`파일 생성 실패 (${res.status})`, res.status);
}
