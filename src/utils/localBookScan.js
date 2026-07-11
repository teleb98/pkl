/* 로컬 책 스캔 — Drive/AI 키 없이 기기 안에서 책 정보 추출.

   흐름 (scanLocalBookMeta):
   1. IndexedDB 캐시(없으면 Electron filePath)에서 PDF 로드
   2. 앞 페이지 텍스트 레이어 추출 — 텍스트 PDF 는 OCR 불필요
   3. 텍스트가 없으면(스캔본) 앞 페이지를 렌더 → 로컬 OCR 체인
      (Electron macOS 는 Apple Vision 이 최우선 — 오프라인·한국어 고품질)
   4. AI 키가 있으면 AI 로 메타데이터 정제, 없으면 표지 휴리스틱 추출

   반환 형식은 scanBookMeta(parseMeta)와 동일 — setBookMeta 로 바로 반영. */
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/build/pdf.min.mjs';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { getCachedPdf } from './pdfCache.js';
import { reloadLocalBookFromPath } from './localBooks.js';
import { createOcr } from './ocr/index.js';
import { analyzeTextMeta, fileNameToTitle } from '../scanBook.js';

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const TEXT_PAGES = 6;   // 텍스트 레이어를 읽을 앞 페이지 수 (표지+속표지+판권)
const OCR_PAGES  = 3;   // 스캔본일 때 OCR 할 앞 페이지 수
const MIN_TEXT   = 60;  // 이보다 짧으면 스캔본으로 보고 OCR 진행

/* ── 표지 텍스트 휴리스틱 — AI 키 없이 제목/저자 추정 ─────────── */

const AUTHOR_MARK = /(지은이|지음|글쓴이|옮긴이|옮김|엮은이|엮음|저자|시집|장편소설|소설)/;
const NOISE = /^(www\.|http|ISBN|isbn|\d{10,13}$|정가|값\s?\d|페이지|목차|차례|contents?$)/i;

/** OCR/텍스트레이어 라인들에서 제목·저자 추정. 실패 필드는 null. */
export function extractCoverMeta(text, fileName = '') {
  const lines = String(text || '')
    .split('\n')
    .map(l => l.replace(/\s+/g, ' ').trim())
    .filter(l => l.length >= 2 && l.length <= 60 && !NOISE.test(l));

  let author = null;
  let authorLineIdx = -1;

  for (let i = 0; i < Math.min(lines.length, 12); i++) {
    const l = lines[i];
    // '홍길동 지음', '지은이 홍길동', '헨리 민츠버그 지음 · 김철수 옮김'
    // 주의: JS \b 는 한글 경계에서 동작하지 않음 → (?![가-힣]) lookahead 사용
    let m = l.match(/^(.{2,25}?)\s*(지은이|지음|엮음)(?![가-힣])/);
    if (m && AUTHOR_MARK.test(l)) { author = m[1].trim(); authorLineIdx = i; break; }
    m = l.match(/(?:지은이|저자|글쓴이)[:\s]+(.{2,25}?)$/);
    if (m) { author = m[1].trim(); authorLineIdx = i; break; }
    m = l.match(/\bby\s+([A-Z][\w.'-]+(?:\s+[A-Z][\w.'-]+){0,3})/);
    if (m) { author = m[1].trim(); authorLineIdx = i; break; }
  }

  // 제목: 저자 줄이 아닌 첫 번째 유효 라인 (Vision 은 위→아래 순서로 반환)
  let title = null;
  for (let i = 0; i < Math.min(lines.length, 8); i++) {
    if (i === authorLineIdx) continue;
    if (AUTHOR_MARK.test(lines[i])) continue;
    title = lines[i];
    break;
  }

  // 언어 추정: 한글 비율
  const sample = lines.slice(0, 10).join('');
  const hangul = (sample.match(/[가-힣]/g) || []).length;
  const language = sample && hangul / sample.length > 0.15 ? 'ko' : 'en';

  return {
    aiTitle: title || fileNameToTitle(fileName) || null,
    aiAuthor: author,
    aiType: 'other',
    aiLanguage: language,
    aiSummary: '',
    aiTopics: [],
    aiScanStatus: 'done',
    aiScannedAt: Date.now(),
  };
}

/* ── PDF 로드/렌더 헬퍼 ────────────────────────────────────── */

async function loadPdfData(book) {
  let data = await getCachedPdf(book.id);
  if (!data && book.filePath) {
    const ok = await reloadLocalBookFromPath(book);
    if (ok) data = await getCachedPdf(book.id);
  }
  if (!data) throw new Error('pdf-not-cached');
  return data;
}

async function renderPageToBase64(page, scale = 2) {
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const ctx = canvas.getContext('2d');
  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas.toDataURL('image/png').split(',')[1];
}

/* ── 메인: 로컬 책 스캔 ────────────────────────────────────── */

/**
 * @param {{id, title, filePath?}} book  로컬 책 (source:'local')
 * @param {{lang?, apiKeys?:{claude?,gemini?}, onProgress?:(step:string)=>void}} opts
 * @returns scanBookMeta 와 동일한 meta 객체 (+ aiScanEngine)
 */
export async function scanLocalBookMeta(book, { lang = 'ko', apiKeys = {}, onProgress } = {}) {
  const fileName = `${book.title || 'book'}.pdf`;
  onProgress?.('load');
  const data = await loadPdfData(book);
  // pdf.js 가 buffer 를 detach 하므로 복사본 전달 (원본 캐시 보존)
  const pdf = await getDocument({ data: data.slice(0) }).promise;

  try {
    // 1) 텍스트 레이어
    onProgress?.('text');
    const texts = [];
    const lastText = Math.min(TEXT_PAGES, pdf.numPages);
    for (let i = 1; i <= lastText; i++) {
      try {
        const page = await pdf.getPage(i);
        const tc = await page.getTextContent();
        const t = tc.items.map(it => it.str).join('\n').replace(/[ \t]+/g, ' ').trim();
        if (t) texts.push(t);
      } catch { /* 페이지 스킵 */ }
    }
    let extracted = texts.join('\n');
    let engine = 'text-layer';

    // 2) 스캔본 → 로컬 OCR (Apple Vision → Ollama → Tesseract)
    if (extracted.replace(/\s/g, '').length < MIN_TEXT) {
      onProgress?.('ocr');
      const ocr = await createOcr({ mode: 'local', lang });
      const ocrTexts = [];
      const lastOcr = Math.min(OCR_PAGES, pdf.numPages);
      for (let i = 1; i <= lastOcr; i++) {
        try {
          const page = await pdf.getPage(i);
          const b64 = await renderPageToBase64(page);
          const t = await ocr(b64);
          if (t) ocrTexts.push(t);
        } catch { /* 페이지 스킵 */ }
      }
      if (ocrTexts.length) {
        extracted = ocrTexts.join('\n');
        engine = 'local-vision';
      }
    }

    // 3) AI 정제(키 있으면) → 실패/무키 시 휴리스틱
    const clipped = extracted.slice(0, 6000);
    if (apiKeys.claude || apiKeys.gemini) {
      onProgress?.('ai');
      try {
        const meta = await analyzeTextMeta(clipped, { claudeKey: apiKeys.claude, geminiKey: apiKeys.gemini }, lang, fileName);
        return { ...meta, aiScanEngine: `${engine}+ai` };
      } catch { /* AI 실패 → 휴리스틱 폴백 */ }
    }
    onProgress?.('extract');
    return { ...extractCoverMeta(clipped, fileName), aiScanEngine: engine };
  } finally {
    pdf.destroy?.();
  }
}
