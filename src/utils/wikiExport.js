/* 서재 → cw_wiki 볼트 내보내기(쓰기) — 완독/지식이 쌓인 책을 옵시디언 노트로.
   안전 규칙:
   - 볼트의 `rarebook/` 하위 폴더에만 쓴다(사용자 위키 본체 불가침)
   - frontmatter `rarebook_id` 로 멱등 매칭(파일명이 바뀌어도 같은 책)
   - 관리 펜스(%% rarebook:auto %%) 안쪽만 갱신 — 펜스 밖(사용자가 옵시디언에서
     덧붙인 생각)은 재내보내기에도 항상 보존
   쓰기에는 전체 drive 스코프가 필요(drive.file 은 앱 생성 파일만 접근 가능해
   기존 cw_wiki 폴더에 쓸 수 없음). 내보내기 액션에서만 요청한다. */
import { resolveFolderByPath, DEFAULT_VAULT_PATH, fetchFileText } from './driveWiki.js';
import { findOrCreateFolder, uploadFileToDrive } from './driveBackup.js';
import { getBookIndex, getBookMeta, getNotesByBook, getAllHighlightsByBook, getBookReview } from '../store.js';

export const EXPORT_SUBFOLDER = 'rarebook';
export const FENCE_START = '%% rarebook:auto:start — 이 블록은 서재가 관리합니다. 직접 수정한 내용은 다음 동기화에서 덮어써집니다 %%';
export const FENCE_END = '%% rarebook:auto:end %%';
export const WRITE_SCOPE = 'https://www.googleapis.com/auth/drive';

/** 옵시디언/드라이브 파일명으로 안전하게 */
export function sanitizeFileName(title) {
  const base = String(title || '무제').replace(/[\\/:*?"<>|#^[\]]/g, ' ').replace(/\s+/g, ' ').trim();
  return (base || '무제').slice(0, 120) + '.md';
}

/** 서재가 관리하는 펜스 블록 본문(하이라이트·메모·감상) */
export function buildManagedBlock({ highlights = [], notes = [], review = null }) {
  const parts = [];
  if (highlights.length) {
    parts.push('## 하이라이트');
    for (const h of highlights) parts.push(`- ${h.page ? `(p.${h.page}) ` : ''}"${String(h.text || '').trim()}"`);
  }
  if (notes.length) {
    parts.push('', '## 메모');
    for (const n of notes) parts.push(`- ${n.page ? `(p.${n.page}) ` : ''}${String(n.text || '').trim()}`);
  }
  if (review?.text) {
    parts.push('', '## 감상');
    if (review.rating) parts.push(`${'★'.repeat(review.rating)}${'☆'.repeat(Math.max(0, 5 - review.rating))}`);
    parts.push(String(review.text).trim());
  }
  return parts.join('\n').replace(/^\n+/, '');
}

/** 책 하나의 전체 노트 마크다운(신규 생성용) */
export function buildBookNote(book, { meta = {}, highlights = [], notes = [], review = null } = {}) {
  const topics = meta.aiTopics || [];
  const fm = [
    '---',
    `rarebook_id: ${book.id}`,
    `title: ${book.title}`,
    ...(meta.aiAuthor ? [`author: ${meta.aiAuthor}`] : []),
    `status: ${meta.status === 'done' || (meta.progress || 0) >= 100 ? '완독' : '읽는 중'}`,
    ...(review?.rating ? [`rating: ${review.rating}`] : []),
    ...(topics.length ? [`topics: [${topics.join(', ')}]`] : []),
    'source: rarebook 서재',
    '---',
  ].join('\n');

  const head = [`# ${book.title}`];
  if (meta.aiSummary) head.push('', `> [!abstract] AI 요약`, `> ${String(meta.aiSummary).trim().replace(/\n/g, '\n> ')}`);
  if (topics.length) head.push('', `**주제** · ${topics.map(t => `[[${t}]]`).join(' · ')}`);

  const managed = buildManagedBlock({ highlights, notes, review });
  const tail = [
    '', FENCE_START, managed || '(아직 기록이 없어요)', FENCE_END, '',
    '## 나의 생각', '',
    '<!-- 이 아래는 옵시디언에서 자유롭게 — 재동기화해도 보존됩니다 -->', '',
  ].join('\n');

  return `${fm}\n\n${head.join('\n')}\n${tail}`;
}

/** 기존 노트에서 펜스 안쪽만 새 블록으로 교체(펜스 밖 사용자 편집 보존).
    펜스가 없으면(사용자가 지웠으면) 문서 끝에 펜스 블록을 덧붙인다. */
export function mergeManagedBlock(existingMd, newManagedBody) {
  const src = String(existingMd || '');
  const startIdx = src.indexOf(FENCE_START);
  const endIdx = src.indexOf(FENCE_END);
  const block = `${FENCE_START}\n${newManagedBody || '(아직 기록이 없어요)'}\n${FENCE_END}`;
  if (startIdx >= 0 && endIdx > startIdx) {
    return src.slice(0, startIdx) + block + src.slice(endIdx + FENCE_END.length);
  }
  return src.replace(/\s*$/, '') + `\n\n${block}\n`;
}

/** 내보낼 책 선별 — 완독했거나, 하이라이트/메모/감상이 하나라도 있는 책 */
export function selectExportBooks() {
  return getBookIndex().filter(b => {
    const meta = getBookMeta(b.id) || {};
    if (meta.status === 'done' || (meta.progress || 0) >= 100) return true;
    return getAllHighlightsByBook(b.id).length > 0 || getNotesByBook(b.id).length > 0 || !!getBookReview(b.id)?.text;
  });
}

/** rarebook_id 로 기존 노트 찾기(펜스 병합용) — 폴더 내 md 나열 후 본문 조회 */
async function findExistingNote(token, folderId, book, fileName) {
  const q = `'${folderId}' in parents and trashed=false`;
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)&pageSize=200`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return null;
  const files = (await res.json()).files || [];
  // 1순위: 같은 파일명. 2순위: rarebook_id 매칭(이름을 바꿨을 때)
  const byName = files.find(f => f.name === fileName);
  if (byName) {
    const text = await fetchFileText(token, byName.id).catch(() => '');
    return { id: byName.id, name: byName.name, text };
  }
  for (const f of files) {
    if (!f.name?.toLowerCase().endsWith('.md')) continue;
    const text = await fetchFileText(token, f.id).catch(() => '');
    if (text.includes(`rarebook_id: ${book.id}`)) return { id: f.id, name: f.name, text };
  }
  return null;
}

/**
 * 지식이 쌓인 책들을 볼트의 rarebook/ 폴더로 내보낸다.
 * @returns {Promise<{created:number, updated:number, total:number}>}
 */
export async function exportKnowledgeToVault(token, { segments = DEFAULT_VAULT_PATH, onProgress } = {}) {
  if (!token) throw new Error('no-token');
  const vaultId = await resolveFolderByPath(token, segments);
  const folderId = await findOrCreateFolder(token, EXPORT_SUBFOLDER, vaultId);

  const books = selectExportBooks();
  let created = 0, updated = 0;
  for (let i = 0; i < books.length; i++) {
    const book = books[i];
    onProgress?.(i + 1, books.length, book.title);
    const data = {
      meta: getBookMeta(book.id) || {},
      highlights: getAllHighlightsByBook(book.id),
      notes: getNotesByBook(book.id),
      review: getBookReview(book.id),
    };
    const fileName = sanitizeFileName(book.title);
    const existing = await findExistingNote(token, folderId, book, fileName);
    const content = existing
      ? mergeManagedBlock(existing.text, buildManagedBlock(data))
      : buildBookNote(book, data);
    await uploadFileToDrive(token, folderId, existing?.name || fileName, content);
    if (existing) updated += 1; else created += 1;
  }
  return { created, updated, total: books.length };
}
