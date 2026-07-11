/* OCR provider 통합 — 설정/환경/키에 따라 최적 엔진 선택.

   우선순위 (ocrMode 설정 기준):
   - 'auto'  (기본): Apple Vision(macOS) → Ollama(있으면) → Tesseract 로컬 → Cloud Vision → AI Vision
   - 'local' : 로컬만 (Apple Vision → Ollama → Tesseract). 클라우드 전송 안 함(프라이버시)
   - 'cloud' : Cloud Vision → AI Vision (기존 동작, 고정확)

   모든 provider 공통 입력: base64 이미지(데이터 URL 접두사 없음) → 텍스트 */
import { ocrImageWithMacVision, isMacVisionAvailable } from './macVisionOcr.js';
import { ocrImageWithTesseract } from './tesseractOcr.js';
import { ocrImageWithOllama, isOllamaAvailable, pickBestVisionModel } from './ollamaOcr.js';
import { ocrImageWithMediapipeGemma, isMediapipeGemmaAvailable, getGemmaModelUrl } from './mediapipeGemmaOcr.js';
import { ocrImageWithVision } from '../cloudVisionOcr.js';

// Ollama 가용성은 자주 안 바뀌므로 1회 캐시 (세션)
let _ollamaCache = null;
async function ollamaReady() {
  if (_ollamaCache === null) _ollamaCache = await isOllamaAvailable();
  return _ollamaCache;
}
export function _resetOllamaCache() { _ollamaCache = null; }

/**
 * 환경에 맞는 OCR provider 체인을 만들어, 각 이미지를 순서대로 시도.
 * @param {{ mode?:'auto'|'local'|'cloud', apiKeys?:object, lang?:string, callAI?:Function }} cfg
 * @returns {Promise<(base64:string)=>Promise<string>>} ocr(base64) 함수
 */
export async function createOcr({ mode = 'auto', apiKeys = {}, lang = 'ko', callAI, onProgress } = {}) {
  const tlang = lang === 'ko' ? 'kor+eng' : 'eng';
  const hasVision = !!apiKeys.vision;
  const hasAi = !!(apiKeys.claude || apiKeys.gemini);
  const useOllama = (mode === 'auto' || mode === 'local') && await ollamaReady();
  // 엔진 내부 진행률 보고 헬퍼 (모델 로드/인식 % + 엔진 이름)
  const prog = (engine) => onProgress ? (pct) => onProgress({ engine, pct }) : undefined;

  // provider 체인 구성 (앞에서부터 시도, 빈 결과/실패 시 다음)
  const chain = [];
  // Apple Vision (Electron macOS): 즉시·오프라인·한국어 고품질 → 로컬 체인 최우선
  if ((mode === 'auto' || mode === 'local') && await isMacVisionAvailable()) {
    chain.push(async (b64) => ocrImageWithMacVision(b64));
  }
  if (useOllama) {
    // 설치된 비전 모델 중 최적(Gemma 4 우선) 자동 선택. 없으면 기본 태그.
    const model = (await pickBestVisionModel()) || undefined;
    chain.push(async (b64) => ocrImageWithOllama(b64, { lang, model }));
  }
  // 브라우저 Gemma 4 (WebGPU + 모델 URL 설정 시) — Ollama 없는 웹/태블릿용 고품질 로컬
  const gemmaUrl = getGemmaModelUrl();
  if ((mode === 'auto' || mode === 'local') && isMediapipeGemmaAvailable(gemmaUrl)) {
    chain.push(async (b64) => ocrImageWithMediapipeGemma(b64, { modelUrl: gemmaUrl, lang, onProgress: prog('Gemma') }));
  }
  if (mode === 'auto' || mode === 'local') {
    chain.push(async (b64) => ocrImageWithTesseract(b64, { lang: tlang, onProgress: prog('Tesseract') }));
  }
  if (mode === 'auto' || mode === 'cloud') {
    if (hasVision) chain.push(async (b64) => ocrImageWithVision(b64, apiKeys.vision));
    if (hasAi && callAI) {
      const sys = lang === 'ko' ? 'OCR 전문가입니다. 이미지에서 텍스트를 그대로 추출하세요.' : 'You are an OCR expert. Extract text verbatim.';
      const usr = lang === 'ko' ? '이 페이지의 텍스트를 정확히 추출하세요. 텍스트만 출력.' : 'Extract all text. Output text only.';
      chain.push(async (b64) => callAI(apiKeys, sys, [], usr, b64));
    }
  }

  return async function ocr(base64) {
    for (const fn of chain) {
      try {
        const text = (await fn(base64))?.trim();
        if (text) return text;
      } catch { /* 다음 provider 로 폴백 */ }
    }
    return '';
  };
}

/** OCR이 가능한 환경인지 (로컬 Tesseract는 항상 가능 → 늘 true) */
export function ocrPossible(mode = 'auto', apiKeys = {}) {
  if (mode === 'cloud') return !!(apiKeys.vision || apiKeys.claude || apiKeys.gemini);
  return true; // local/auto 는 Tesseract 로 항상 가능
}

export { ocrImageWithMacVision, isMacVisionAvailable } from './macVisionOcr.js';
export { ocrImageWithTesseract } from './tesseractOcr.js';
export { ocrImageWithOllama, isOllamaAvailable, listOllamaVisionModels } from './ollamaOcr.js';
export { ocrImageWithMediapipeGemma, isMediapipeGemmaAvailable, getGemmaModelUrl } from './mediapipeGemmaOcr.js';
