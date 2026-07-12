/* 책 전체 Vision 스캔 — 모든 페이지의 텍스트를 추출해 IndexedDB에 영구 저장.

   - 텍스트 레이어가 있는 페이지는 즉시 추출(무료), 없는 페이지(스캔본)만
     로컬 Vision OCR (Electron Apple Vision → 서버 Vision → Tesseract)
   - 10페이지마다 중간 저장 → 중단/재시작해도 이어서 스캔
   - 결과는 pageTextCache 에도 채워져 AI 채팅·전문 검색·어휘/퀴즈에 즉시 활용
   - hydrateBookText: 세션 시작 후 저장된 전문을 메모리 캐시로 복원 */
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/build/pdf.min.mjs';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { getCachedPdf } from './pdfCache.js';
import { reloadLocalBookFromPath } from './localBooks.js';
import { createOcr } from './ocr/index.js';
import { getBookText, saveBookText } from './bookTextDb.js';
import { setPageText, hasPageText } from '../pageTextCache.js';
import { setBookMeta } from '../store.js';

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const SAVE_EVERY = 10; // n페이지마다 중간 저장

/** 저장된 전문을 메모리 캐시(pageTextCache)로 복원. 복원한 페이지 수 반환 */
export async function hydrateBookText(bookId) {
  const rec = await getBookText(bookId);
  if (!rec?.pages) return 0;
  let n = 0;
  for (const [pageNum, text] of Object.entries(rec.pages)) {
    if (text && !hasPageText(bookId, Number(pageNum))) {
      setPageText(bookId, Number(pageNum), text);
      n++;
    }
  }
  return n;
}

async function loadPdfData(book) {
  let data = await getCachedPdf(book.id);
  if (!data && book.filePath) {
    const ok = await reloadLocalBookFromPath(book);
    if (ok) data = await getCachedPdf(book.id);
  }
  if (!data) throw new Error('pdf-not-cached');
  return data;
}

/**
 * 책 전체 스캔 (이어하기 지원).
 * @param {{id, title, filePath?}} book
 * @param {{lang?, onProgress?:(p:{page,total,scanned,ocr,engine?})=>void,
 *          shouldStop?:()=>boolean}} opts
 * @returns {{done:boolean, scannedPages:number, totalPages:number, ocrPages:number}}
 */
export async function scanFullBookText(book, { lang = 'ko', onProgress, shouldStop } = {}) {
  const data = await loadPdfData(book);
  const pdf = await getDocument({ data: data.slice(0) }).promise;

  try {
    const total = pdf.numPages;
    const existing = (await getBookText(book.id)) || {};
    const pages = { ...(existing.pages || {}) };
    let ocrFn = null; // OCR 필요 시에만 lazy 생성
    let engineUsed = null;
    let ocrPages = 0;
    let sinceSave = 0;
    let stopped = false;

    for (let i = 1; i <= total; i++) {
      if (shouldStop?.()) { stopped = true; break; }
      if (pages[i]) { // 이미 스캔됨(이어하기)
        if (!hasPageText(book.id, i)) setPageText(book.id, i, pages[i]);
        continue;
      }

      let text = '';
      let pdfPage = null;
      try {
        pdfPage = await pdf.getPage(i);
        const tc = await pdfPage.getTextContent();
        text = tc.items.map(it => it.str).join(' ').replace(/\s+/g, ' ').trim();
      } catch { /* 페이지 로드 실패 → 스킵 */ }

      // 텍스트 레이어 없음(스캔본) → 로컬 Vision OCR
      if (!text && pdfPage) {
        try {
          if (!ocrFn) {
            ocrFn = await createOcr({
              mode: 'local', lang,
              onProgress: ({ engine }) => { engineUsed = engine; },
            });
          }
          const vp = pdfPage.getViewport({ scale: 1.5 });
          const canvas = document.createElement('canvas');
          canvas.width = vp.width;
          canvas.height = vp.height;
          await pdfPage.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
          const b64 = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
          if (b64) {
            text = (await ocrFn(b64))?.trim() || '';
            if (text) ocrPages++;
          }
        } catch { /* OCR 실패 → 빈 페이지로 기록 */ }
      }

      pages[i] = text || '';
      if (text) setPageText(book.id, i, text);
      sinceSave++;
      onProgress?.({ page: i, total, scanned: Object.keys(pages).length, ocr: ocrPages, engine: engineUsed });

      if (sinceSave >= SAVE_EVERY) {
        await saveBookText(book.id, { pages, totalPages: total, scannedPages: Object.keys(pages).length, done: false, engine: engineUsed });
        sinceSave = 0;
      }
    }

    const scannedPages = Object.keys(pages).length;
    const done = !stopped && scannedPages >= total;
    await saveBookText(book.id, { pages, totalPages: total, scannedPages, done, engine: engineUsed });
    if (done) setBookMeta(book.id, { fullTextDone: true, fullTextPages: scannedPages, fullTextAt: Date.now() });
    return { done, scannedPages, totalPages: total, ocrPages };
  } finally {
    pdf.destroy?.();
  }
}
