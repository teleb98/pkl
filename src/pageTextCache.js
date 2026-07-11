/* Holds extracted PDF text and captured page images per book.
   Written by PdfViewer; read by AI system prompts.

   Text mode  — setViewedPage / setPageText / getDocumentText
   Image mode — setPageImage / getPageImage (only current page, to limit memory) */

const _cache = {};

function _ensure(bookId) {
  if (!_cache[bookId]) _cache[bookId] = { pages: {}, viewedPage: null, pageImage: null, outline: null };
  return _cache[bookId];
}

export function setPageText(bookId, pageNum, text) {
  const c = _ensure(bookId);
  if (!c.pages[pageNum]) {
    c.pages[pageNum] = text;
  }
}

export function hasPageText(bookId, pageNum) {
  return !!_cache[bookId]?.pages?.[pageNum];
}

/* Chapter outline (from PDF bookmarks). chapters = [{ title, page }] sorted by page. */
export function setOutline(bookId, chapters) {
  const c = _ensure(bookId);
  c.outline = Array.isArray(chapters) && chapters.length ? chapters : null;
}

export function getOutline(bookId) {
  return _cache[bookId]?.outline || null;
}

/* Returns [startPage, endPage] of the chapter containing `page`, or null if no outline. */
export function getChapterRange(bookId, page) {
  const outline = _cache[bookId]?.outline;
  if (!outline?.length) return null;
  // Find the last chapter whose start page <= page
  let idx = -1;
  for (let i = 0; i < outline.length; i++) {
    if (outline[i].page <= page) idx = i; else break;
  }
  if (idx === -1) idx = 0; // page is before first chapter → use first
  const start = outline[idx].page;
  const end = idx + 1 < outline.length ? outline[idx + 1].page - 1 : null; // null = to end of book
  return { start, end, title: outline[idx].title };
}

/* Extracts cached text for pages in [startPage, endPage] (inclusive). endPage null = to last. */
export function getTextForRange(bookId, startPage, endPage, maxChars = 12000) {
  const c = _cache[bookId];
  if (!c?.pages) return null;
  const nums = Object.keys(c.pages).map(Number)
    .filter(n => n >= (startPage || 1) && (endPage == null || n <= endPage))
    .sort((a, b) => a - b);
  if (!nums.length) return null;

  let text = '';
  let count = 0;
  for (const n of nums) {
    const entry = `[p.${n}]\n${c.pages[n]}\n\n`;
    if (text.length + entry.length > maxChars) break;
    text += entry;
    count++;
  }
  if (!count) return null;
  return { text: text.trimEnd(), pageCount: count, firstPage: nums[0], lastPage: nums[count - 1] };
}

export function setViewedPage(bookId, pageNum, text) {
  const c = _ensure(bookId);
  c.viewedPage = pageNum;
  if (text && !c.pages[pageNum]) {
    c.pages[pageNum] = text;
  }
}

export function _resetForTesting() {
  Object.keys(_cache).forEach(k => delete _cache[k]);
}

/** 한 책의 추출 본문에서 query 검색 → [{ page, snippet }] (전문 검색) */
export function searchBookText(bookId, query, maxHits = 20) {
  const c = _cache[bookId];
  if (!c?.pages || !query?.trim()) return [];
  const q = query.toLowerCase();
  const hits = [];
  for (const [page, text] of Object.entries(c.pages)) {
    const lower = text.toLowerCase();
    let idx = lower.indexOf(q);
    if (idx < 0) continue;
    const start = Math.max(0, idx - 30);
    const end = Math.min(text.length, idx + q.length + 50);
    const snippet = (start > 0 ? '…' : '') + text.slice(start, end).trim() + (end < text.length ? '…' : '');
    hits.push({ page: Number(page), snippet });
    if (hits.length >= maxHits) break;
  }
  return hits.sort((a, b) => a.page - b.page);
}

/** 캐시된 모든 책의 본문에서 검색 → [{ bookId, page, snippet }] */
export function searchAllText(query, maxPerBook = 5) {
  const out = [];
  if (!query?.trim()) return out;
  for (const bookId of Object.keys(_cache)) {
    for (const h of searchBookText(bookId, query, maxPerBook)) out.push({ bookId, ...h });
  }
  return out;
}

// Stores the current page's canvas capture. Only keeps the latest (memory limit).
export function setPageImage(bookId, pageNum, base64) {
  const c = _ensure(bookId);
  c.pageImage = { pageNum, base64 };
}

export function getPageText(bookId) {
  const c = _cache[bookId];
  if (!c) return null;
  const pageNum = c.viewedPage;
  return pageNum ? { pageNum, text: c.pages[pageNum] || null } : null;
}

// Returns the most recently captured page image (only for image-based PDFs).
export function getPageImage(bookId) {
  return _cache[bookId]?.pageImage || null;
}

export function getDocumentText(bookId, maxChars = 10000) {
  const c = _cache[bookId];
  if (!c?.pages) return null;
  const nums = Object.keys(c.pages).map(Number).sort((a, b) => a - b);
  if (!nums.length) return null;

  let text = '';
  let count = 0;
  for (const n of nums) {
    const entry = `[p.${n}]\n${c.pages[n]}\n\n`;
    if (text.length + entry.length > maxChars) break;
    text += entry;
    count++;
  }

  if (!count) return null;
  return {
    text: text.trimEnd(),
    pageCount: count,
    firstPage: nums[0],
    lastPage: nums[count - 1],
  };
}
