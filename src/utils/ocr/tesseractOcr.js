/* 로컬 OCR — Tesseract.js (WASM, 완전 오프라인)
   웹·Electron·Capacitor 모두 동작. 한글(kor)+영문(eng) 기본.
   네트워크/API 키 불필요 — 책 내용이 기기를 벗어나지 않음(프라이버시).

   완전 오프라인: worker·core·언어팩을 self-host(public/)에서 로드 → CDN 의존 없음.
   - public/tesseract/  : worker.min.js, tesseract-core*.wasm(.js)
   - public/tessdata/   : eng.traineddata.gz, kor.traineddata.gz
   (없으면 tesseract.js 기본 CDN으로 폴백) */

let _workerPromise = null;

// self-host 자산 경로 (Electron file:// 와 웹 / 둘 다 동작하도록 상대/절대 처리)
const ASSET_BASE = (typeof window !== 'undefined' && window.location?.protocol === 'file:') ? './' : '/';
const SELF_HOST = {
  workerPath: `${ASSET_BASE}tesseract/worker.min.js`,
  corePath:   `${ASSET_BASE}tesseract/`,
  langPath:   `${ASSET_BASE}tessdata`,
  gzip: true,
};

/** Tesseract worker 싱글톤 (재사용으로 초기화 비용 절감) */
async function getWorker(lang, onProgress) {
  if (_workerPromise) return _workerPromise;
  _workerPromise = (async () => {
    const { createWorker } = await import('tesseract.js');
    const logger = onProgress
      ? (m) => { if (m.status === 'recognizing text') onProgress(Math.round(m.progress * 100)); }
      : undefined;
    // 1) self-host 경로 우선 (완전 오프라인). 실패 시 2) 기본 CDN 폴백.
    try {
      return await createWorker(lang, 1, { ...SELF_HOST, logger });
    } catch {
      _workerPromise = null; // 폴백 재시도 허용
      return await createWorker(lang, 1, { logger });
    }
  })();
  return _workerPromise;
}

/**
 * base64(JPEG/PNG, data: 접두사 없음) 이미지 → 텍스트
 * @param {string} base64Image
 * @param {{lang?:string, onProgress?:(pct:number)=>void}} opts
 * @returns {Promise<string>}
 */
export async function ocrImageWithTesseract(base64Image, { lang = 'kor+eng', onProgress } = {}) {
  if (!base64Image) return '';
  const worker = await getWorker(lang, onProgress);
  const dataUrl = base64Image.startsWith('data:')
    ? base64Image
    : `data:image/jpeg;base64,${base64Image}`;
  const { data } = await worker.recognize(dataUrl);
  return (data?.text || '').trim();
}

/** worker 정리 (메모리 해제) */
export async function terminateTesseract() {
  if (_workerPromise) {
    try { (await _workerPromise).terminate(); } catch { /* ignore */ }
    _workerPromise = null;
  }
}

/** Tesseract 로컬 OCR 사용 가능 여부 (항상 true — WASM은 모든 환경 동작) */
export const isTesseractAvailable = () => true;
