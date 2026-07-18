/* cw_wiki 볼트(Google Drive) 읽기 전용 연동 — Backups/cw_wiki 경로를 찾아 하위 .md를
   재귀 수집하고 파싱해 서재의 위키 인덱스를 만든다. 기존 drive.readonly 스코프만 사용
   (사용자 위키를 절대 쓰지 않음). 쓰기(서재→볼트 내보내기)는 별도 스코프·플로우로 분리. */
import { parseNote } from './wikiParse.js';

export const DEFAULT_VAULT_PATH = ['Backups', 'cw_wiki'];
const MD_MIME = new Set(['text/markdown', 'text/x-markdown', 'text/plain']);

class WikiDriveError extends Error {
  constructor(message, code) { super(message); this.name = 'WikiDriveError'; this.code = code; }
}

async function driveGet(token, url) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) throw new WikiDriveError('auth-expired', 'auth-expired');
    throw new WikiDriveError(`HTTP ${res.status}`, 'http-error');
  }
  return res;
}

/** parent 폴더 안에서 이름이 name 인 하위 폴더 id (대소문자 무시 폴백) */
async function findChildFolder(token, parentId, name) {
  const q = `mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`;
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)&pageSize=200`;
  const data = await (await driveGet(token, url)).json();
  const files = data.files || [];
  return (files.find(f => f.name === name)
    || files.find(f => f.name?.toLowerCase() === String(name).toLowerCase())
    || null);
}

/** ['Backups','cw_wiki'] 경로를 root부터 따라가 최종 폴더 id 반환. 없으면 에러. */
export async function resolveFolderByPath(token, segments = DEFAULT_VAULT_PATH) {
  let parentId = 'root';
  for (const seg of segments) {
    const folder = await findChildFolder(token, parentId, seg);
    if (!folder) throw new WikiDriveError(`폴더를 찾을 수 없습니다: ${seg}`, 'folder-not-found');
    parentId = folder.id;
  }
  return parentId;
}

function isMarkdown(f) {
  return f.name?.toLowerCase().endsWith('.md') || MD_MIME.has(f.mimeType);
}

/** folderId 이하의 .md 파일을 재귀 수집(하위 폴더 포함). maxNotes 로 상한. */
export async function listMarkdownFiles(token, folderId, { maxNotes = 400 } = {}) {
  const out = [];
  const stack = [{ id: folderId, path: '' }];
  while (stack.length && out.length < maxNotes) {
    const { id, path } = stack.pop();
    let pageToken = null;
    do {
      const q = `'${id}' in parents and trashed=false`;
      const url = new URL('https://www.googleapis.com/drive/v3/files');
      url.searchParams.set('q', q);
      url.searchParams.set('fields', 'nextPageToken,files(id,name,mimeType,modifiedTime,webViewLink)');
      url.searchParams.set('pageSize', '200');
      if (pageToken) url.searchParams.set('pageToken', pageToken);
      const data = await (await driveGet(token, url.toString())).json();
      for (const f of data.files || []) {
        if (f.mimeType === 'application/vnd.google-apps.folder') {
          stack.push({ id: f.id, path: path ? `${path}/${f.name}` : f.name });
        } else if (isMarkdown(f)) {
          out.push({ id: f.id, name: f.name, path, modifiedTime: f.modifiedTime, webViewLink: f.webViewLink });
        }
      }
      pageToken = data.nextPageToken || null;
    } while (pageToken && out.length < maxNotes);
  }
  return out.slice(0, maxNotes);
}

/** 파일 본문(텍스트) 다운로드 */
export async function fetchFileText(token, fileId) {
  const res = await driveGet(token, `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`);
  return res.text();
}

/**
 * 볼트를 스캔해 파싱된 위키 인덱스를 만든다.
 * @returns {Promise<{ folderId, notes:Array, count:number, truncated:boolean }>}
 */
export async function syncWikiIndex(token, { segments = DEFAULT_VAULT_PATH, maxNotes = 400 } = {}) {
  if (!token) throw new WikiDriveError('no-token', 'no-token');
  const folderId = await resolveFolderByPath(token, segments);
  const files = await listMarkdownFiles(token, folderId, { maxNotes });
  const notes = [];
  for (const f of files) {
    let text = '';
    try { text = await fetchFileText(token, f.id); } catch { continue; } // 개별 실패는 건너뜀
    const parsed = parseNote(f.name, text);
    notes.push({ id: f.id, name: f.name, path: f.path, webViewLink: f.webViewLink, modifiedTime: f.modifiedTime, ...parsed });
  }
  return { folderId, notes, count: notes.length, truncated: files.length >= maxNotes };
}

export { WikiDriveError };
