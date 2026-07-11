/* AI 분석용 책 텍스트 보장 유틸.
   pageTextCache(메모리)는 PdfViewer가 백그라운드로만 채우므로,
   - 뷰어를 거치지 않고 AI로 직접 간 경우
   - 앱 재시작으로 메모리 캐시가 사라진 경우
   책 내용이 비어 AI가 메타데이터만으로 답하게 된다.

   이 유틸은 AI 질문 직전에 호출되어, 텍스트가 없으면
   IndexedDB 캐시(로컬/Drive 공통)에서 PDF를 읽어 텍스트를 추출해 채운다.
   이미 충분히 있으면 즉시 반환(중복 추출 방지). */
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/build/pdf.min.mjs';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { getCachedPdf } from './pdfCache.js';
import { reloadLocalBookFromPath } from './localBooks.js';
import { setPageText, getDocumentText } from '../pageTextCache.js';

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

// 동시 중복 추출 방지 (같은 책에 대한 in-flight Promise 공유)
const _inflight = {};
// 이미 추출을 시도한 책 (텍스트 0인 스캔본도 포함) — 세션 내 반복 추출 방지
const _attempted = new Set();

/** 테스트/책 교체 시 추출 시도 기록 초기화 */
export function _resetEnsureState() {
  _attempted.clear();
  for (const k of Object.keys(_inflight)) delete _inflight[k];
}

/**
 * 책 텍스트가 pageTextCache 에 있도록 보장.
 * @param {{id:string, source?:string, filePath?:string}} book
 * @param {{maxPages?:number, onProgress?:(pct:number)=>void, force?:boolean}} opts
 * @returns {Promise<boolean>} 텍스트 확보 여부
 */
export async function ensureBookText(book, { maxPages = 50, onProgress, force = false } = {}) {
  if (!book?.id) return false;

  // 이미 충분한 텍스트가 있으면 skip
  if (getDocumentText(book.id)) return true;
  if (_inflight[book.id]) return _inflight[book.id];
  // 이미 추출 시도했고 텍스트가 안 나온 책(스캔본 등)은 재시도 안 함 (force 시 제외)
  if (!force && _attempted.has(book.id)) return false;

  _inflight[book.id] = (async () => {
    try {
      // 1. IndexedDB 캐시에서 PDF 가져오기 (로컬/Drive 공통)
      let buf = await getCachedPdf(book.id);

      // 2. 로컬 책인데 캐시가 비었으면 filePath 로 재로드 (Electron)
      if (!buf && book.source === 'local' && book.filePath) {
        const ok = await reloadLocalBookFromPath(book);
        if (ok) buf = await getCachedPdf(book.id);
      }
      if (!buf) return false;

      // 3. pdfjs 로 텍스트 추출 → pageTextCache 저장
      const pdf = await getDocument({ data: buf }).promise;
      const limit = Math.min(pdf.numPages, maxPages);
      for (let i = 1; i <= limit; i++) {
        try {
          const p = await pdf.getPage(i);
          const tc = await p.getTextContent();
          const text = tc.items.map(it => it.str).join(' ').replace(/\s+/g, ' ').trim();
          if (text) setPageText(book.id, i, text);
        } catch { /* 페이지 단위 실패는 건너뜀 */ }
        onProgress?.(Math.round((i / limit) * 100));
      }
      pdf.destroy();
      return !!getDocumentText(book.id);
    } catch {
      return false;
    } finally {
      delete _inflight[book.id];
      _attempted.add(book.id); // 시도 기록 (텍스트 0이어도 재시도 안 함)
    }
  })();

  return _inflight[book.id];
}
