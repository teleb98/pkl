// Scenario 4-5: Google Drive 자동 백업
// 실제 Drive API v3를 이용해 메모·하이라이트를 Markdown으로 업로드

/* ── Drive API 헬퍼 ──────────────────────────────────────── */

/** 폴더 ID 찾기. 없으면 생성 후 ID 반환 */
export async function findOrCreateFolder(token, folderName, parentId = null) {
  const parentQ = parentId ? ` and '${parentId}' in parents` : ` and 'root' in parents`;
  const q = `mimeType='application/vnd.google-apps.folder' and name='${folderName}' and trashed=false${parentQ}`;
  const listRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)&pageSize=1`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!listRes.ok) throw new DriveError(`폴더 조회 실패 (${listRes.status})`, listRes.status);
  const listData = await listRes.json();
  if (listData.files?.length > 0) return listData.files[0].id;

  // 없으면 생성
  const meta = { name: folderName, mimeType: 'application/vnd.google-apps.folder' };
  if (parentId) meta.parents = [parentId];
  const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(meta),
  });
  if (!createRes.ok) throw new DriveError(`폴더 생성 실패 (${createRes.status})`, createRes.status);
  const created = await createRes.json();
  return created.id;
}

/**
 * 파일 업로드 (multipart).
 * 동일 이름 파일이 folderID 안에 이미 있으면 업데이트, 없으면 새로 생성.
 */
export async function uploadFileToDrive(token, folderId, fileName, content) {
  const existingId = await findFileInFolder(token, folderId, fileName);

  const blob = new Blob([content], { type: 'text/markdown' });
  const meta = existingId
    ? {}  // 업데이트 시 metadata 별도
    : { name: fileName, mimeType: 'text/markdown', parents: [folderId] };

  if (existingId) {
    // PATCH (파일 내용 업데이트)
    const res = await fetch(
      `https://www.googleapis.com/upload/drive/v3/files/${existingId}?uploadType=media`,
      {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'text/markdown' },
        body: blob,
      }
    );
    if (!res.ok) throw new DriveError(`파일 업데이트 실패 (${res.status})`, res.status);
    return { id: existingId, updated: true };
  }

  // 새 파일 multipart upload
  const boundary = 'pkl_boundary_' + Date.now();
  const multipart = [
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
    JSON.stringify(meta),
    `\r\n--${boundary}\r\nContent-Type: text/markdown\r\n\r\n`,
    content,
    `\r\n--${boundary}--`,
  ].join('');

  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: multipart,
    }
  );
  if (!res.ok) throw new DriveError(`파일 업로드 실패 (${res.status})`, res.status);
  const data = await res.json();
  return { id: data.id, updated: false };
}

/** 폴더 내 파일 이름으로 찾기 → ID 반환, 없으면 null */
async function findFileInFolder(token, folderId, fileName) {
  const q = `name='${fileName.replace(/'/g, "\\'")}' and '${folderId}' in parents and trashed=false`;
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)&pageSize=1`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) return null;
  const data = await res.json();
  return data.files?.[0]?.id || null;
}

/* ── Markdown 빌더 ──────────────────────────────────────── */

export function buildBackupMarkdown(book, notes, highlights) {
  const now = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const lines = [
    `# ${book.title}`,
    book.author ? `**저자:** ${book.author}` : '',
    `**백업:** ${now}  `,
    `**메모:** ${notes.length}개 | **하이라이트:** ${highlights.length}개`,
    '',
    '---',
    '',
  ].filter(l => l !== null);

  if (highlights.length > 0) {
    lines.push('## 하이라이트\n');
    highlights.forEach(h => {
      lines.push(`> ${h.text}`);
      if (h.page) lines.push(`> — p.${h.page}`);
      lines.push('');
    });
  }

  if (notes.length > 0) {
    lines.push('## 메모\n');
    notes.forEach(n => {
      const page = n.page ? ` (p.${n.page})` : '';
      lines.push(`### ${n.text.slice(0, 40)}${page}`);
      lines.push('');
      lines.push(n.text);
      if (n.tags?.length) lines.push(`\n*태그: ${n.tags.join(', ')}*`);
      lines.push('');
    });
  }

  return lines.join('\n');
}

/* ── 단일 책 백업 ────────────────────────────────────────── */

export async function backupBookToDrive(token, book, notes, highlights) {
  const pklFolderId = await findOrCreateFolder(token, 'PKL');
  const backupFolderId = await findOrCreateFolder(token, 'backups', pklFolderId);

  const safe = book.title.replace(/[\\/:*?"<>|]/g, '_').slice(0, 60);
  const fileName = `${safe}_notes.md`;
  const content = buildBackupMarkdown(book, notes, highlights);

  const result = await uploadFileToDrive(token, backupFolderId, fileName, content);
  return { ...result, fileName, bookId: book.id };
}

/* ── 전체 백업 ───────────────────────────────────────────── */

/**
 * 모든 책의 메모/하이라이트를 Drive에 백업.
 * @param {string} token  - drive.file scope 토큰
 * @param {Array}  books  - 백업할 책 목록 [{id, title, author}]
 * @param {Function} getNotesForBook - (bookId) => notes[]
 * @param {Function} getHighlightsForBook - (bookId) => highlights[]
 * @returns {{ succeeded: string[], failed: string[] }}
 */
export async function backupAllToDrive(token, books, getNotesForBook, getHighlightsForBook) {
  const succeeded = [];
  const failed = [];

  for (const book of books) {
    try {
      const notes = getNotesForBook(book.id);
      const highlights = getHighlightsForBook(book.id);
      if (notes.length === 0 && highlights.length === 0) continue; // 기록 없는 책 스킵
      await backupBookToDrive(token, book, notes, highlights);
      succeeded.push(book.id);
    } catch (e) {
      failed.push(book.id);
    }
  }

  return { succeeded, failed };
}

/* ── 커스텀 에러 ─────────────────────────────────────────── */

export class DriveError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'DriveError';
    this.status = status;
  }
}
