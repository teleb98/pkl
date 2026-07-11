// 책별 노트/하이라이트 내보내기 (시나리오 4-1)
// 한글 폰트 호환을 위해 jsPDF 대신 브라우저 인쇄 + HTML/Markdown 다운로드 방식.

function esc(s = '') {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

export function buildNotesHtml(book, notes, highlights) {
  const title = book?.title || '제목 없음';
  const author = book?.author || '';
  const today = new Date().toISOString().slice(0, 10);

  const hlBlocks = (highlights || [])
    .slice()
    .sort((a, b) => (a.page || 0) - (b.page || 0))
    .map(h => `
      <div class="entry hl" style="border-left:4px solid ${esc(h.color || '#fde047')};">
        <div class="meta">📖 p.${esc(h.page ?? '?')} · ${esc(fmtDate(h.date))}</div>
        <div class="text">${esc(h.text || '')}</div>
        ${(h.tags || []).length ? `<div class="tags">${h.tags.map(t => `<span class="tag">#${esc(t)}</span>`).join(' ')}</div>` : ''}
      </div>
    `).join('');

  const noteBlocks = (notes || [])
    .slice()
    .sort((a, b) => (a.page || 0) - (b.page || 0))
    .map(n => `
      <div class="entry note">
        <div class="meta">📝 p.${esc(n.page ?? '?')} · ${esc(fmtDate(n.date))}</div>
        <div class="text">${esc(n.text || '')}</div>
        ${(n.tags || []).length ? `<div class="tags">${n.tags.map(t => `<span class="tag">#${esc(t)}</span>`).join(' ')}</div>` : ''}
      </div>
    `).join('');

  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<title>${esc(title)} - 독서 노트</title>
<style>
  @page { size: A4; margin: 20mm; }
  body { font-family: 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif; color:#222; line-height:1.6; max-width:780px; margin:0 auto; padding:24px; }
  .cover { text-align:center; padding:60px 20px; border-bottom:2px solid #333; margin-bottom:32px; }
  .cover h1 { font-size:32px; margin:0 0 12px; }
  .cover .author { font-size:18px; color:#666; }
  .cover .stats { margin-top:24px; font-size:14px; color:#888; }
  h2 { border-bottom:1px solid #ddd; padding-bottom:6px; margin-top:32px; }
  .entry { margin:16px 0; padding:12px 16px; background:#fafafa; border-radius:6px; page-break-inside:avoid; }
  .entry.hl { background:#fffbeb; }
  .meta { font-size:12px; color:#888; margin-bottom:6px; }
  .text { font-size:15px; white-space:pre-wrap; }
  .tags { margin-top:6px; }
  .tag { display:inline-block; background:#e0e7ff; color:#3730a3; padding:2px 8px; border-radius:10px; font-size:11px; margin-right:4px; }
  .empty { color:#aaa; font-style:italic; padding:12px; }
  @media print { body { padding:0; } .no-print { display:none; } }
</style>
</head>
<body>
  <div class="cover">
    <h1>${esc(title)}</h1>
    ${author ? `<div class="author">${esc(author)}</div>` : ''}
    <div class="stats">하이라이트 ${highlights?.length || 0} · 노트 ${notes?.length || 0} · 출력일 ${esc(today)}</div>
  </div>

  <h2>📖 하이라이트</h2>
  ${hlBlocks || '<div class="empty">하이라이트가 없습니다.</div>'}

  <h2>📝 노트</h2>
  ${noteBlocks || '<div class="empty">노트가 없습니다.</div>'}
</body>
</html>`;
}

export function buildNotesMarkdown(book, notes, highlights) {
  const lines = [];
  lines.push(`# ${book?.title || '제목 없음'}`);
  if (book?.author) lines.push(`*${book.author}*`);
  lines.push('');
  lines.push(`> 하이라이트 ${highlights?.length || 0} · 노트 ${notes?.length || 0} · 출력일 ${new Date().toISOString().slice(0,10)}`);
  lines.push('');
  lines.push('## 📖 하이라이트');
  lines.push('');
  if (!highlights?.length) lines.push('_없음_');
  else for (const h of [...highlights].sort((a,b)=>(a.page||0)-(b.page||0))) {
    lines.push(`### p.${h.page ?? '?'} (${fmtDate(h.date)})`);
    lines.push(`> ${h.text || ''}`);
    if (h.tags?.length) lines.push(h.tags.map(t => `\`#${t}\``).join(' '));
    lines.push('');
  }
  lines.push('## 📝 노트');
  lines.push('');
  if (!notes?.length) lines.push('_없음_');
  else for (const n of [...notes].sort((a,b)=>(a.page||0)-(b.page||0))) {
    lines.push(`### p.${n.page ?? '?'} (${fmtDate(n.date)})`);
    lines.push(n.text || '');
    if (n.tags?.length) lines.push(n.tags.map(t => `\`#${t}\``).join(' '));
    lines.push('');
  }
  return lines.join('\n');
}

function safeFileName(s) {
  return String(s || 'book').replace(/[\\/:*?"<>|]/g, '_').slice(0, 80);
}

function downloadBlob(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadNotesAsHtml(book, notes, highlights) {
  downloadBlob(buildNotesHtml(book, notes, highlights), `${safeFileName(book?.title)}_notes.html`, 'text/html;charset=utf-8');
}

export function downloadNotesAsMarkdown(book, notes, highlights) {
  downloadBlob(buildNotesMarkdown(book, notes, highlights), `${safeFileName(book?.title)}_notes.md`, 'text/markdown;charset=utf-8');
}

// 새 창에 HTML을 띄우고 print 다이얼로그 → 사용자가 "PDF로 저장" 선택
export function printNotesAsPdf(book, notes, highlights) {
  const html = buildNotesHtml(book, notes, highlights);
  const w = window.open('', '_blank');
  if (!w) return false;
  w.document.open();
  w.document.write(html);
  w.document.close();
  setTimeout(() => { try { w.focus(); w.print(); } catch { /* user closed */ } }, 300);
  return true;
}
