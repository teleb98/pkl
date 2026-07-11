/* 브라우저 로컬 OCR — MediaPipe LLM Inference + Gemma 4 멀티모달 (WebGPU)
   Ollama 없이 웹/태블릿에서도 Gemma 4로 OCR. 완전 온디바이스(클라우드 0).

   요구:
   - WebGPU 지원 브라우저 (navigator.gpu)
   - Gemma 4 -Web .litertlm 모델 (수 GB) — 번들 불가하므로 사용자가 경로 지정.
     설정 pkl_config.gemmaModelUrl 에 모델 URL(또는 /assets 경로) 저장.
     모델 출처: HuggingFace litert-community (gemma 3n/4 E2B·E4B -Web int4).
   - API: @mediapipe/tasks-genai LlmInference.createFromOptions({ maxNumImages })
          generateResponse([text, {imageSource: canvas}, ...]) */

let _llmPromise = null;
let _loadedModel = null;

/** WebGPU + 모델 경로가 모두 준비됐는지 */
export function isMediapipeGemmaAvailable(modelUrl) {
  return !!(typeof navigator !== 'undefined' && navigator.gpu && modelUrl);
}

/** 설정에서 Gemma 모델 URL 읽기 */
export function getGemmaModelUrl() {
  try { return JSON.parse(localStorage.getItem('pkl_config') || '{}').gemmaModelUrl || ''; }
  catch { return ''; }
}

/** LlmInference 싱글톤 (모델 로드는 수 GB·수십초 — 1회만) */
async function getLlm(modelUrl, onProgress) {
  if (_llmPromise && _loadedModel === modelUrl) return _llmPromise;
  // 모델이 바뀌면 기존 인스턴스 폐기
  if (_llmPromise && _loadedModel !== modelUrl) { await terminateMediapipeGemma(); }
  _loadedModel = modelUrl;
  _llmPromise = (async () => {
    const { FilesetResolver, LlmInference } = await import('@mediapipe/tasks-genai');
    onProgress?.(5);
    const genai = await FilesetResolver.forGenAiTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-genai/wasm'
    );
    onProgress?.(15);
    const llm = await LlmInference.createFromOptions(genai, {
      baseOptions: { modelAssetPath: modelUrl },
      maxNumImages: 1,      // OCR은 페이지 1장
      maxTokens: 2048,
      topK: 1, temperature: 0, // 결정적(OCR)
    });
    onProgress?.(100);
    return llm;
  })();
  return _llmPromise;
}

/**
 * 이미지(base64/dataURL/canvas) → 텍스트 (Gemma 4 브라우저)
 * @param {string|HTMLCanvasElement} image base64(접두사 무관) 또는 canvas
 * @param {{modelUrl?:string, lang?:string, onProgress?:(pct:number)=>void}} opts
 */
export async function ocrImageWithMediapipeGemma(image, { modelUrl, lang = 'ko', onProgress } = {}) {
  const url = modelUrl || getGemmaModelUrl();
  if (!isMediapipeGemmaAvailable(url)) throw new Error('mediapipe-gemma-unavailable');

  const llm = await getLlm(url, onProgress);

  // imageSource 는 canvas/ImageBitmap/URL 지원. base64면 이미지로 디코드.
  let imageSource = image;
  if (typeof image === 'string') {
    const dataUrl = image.startsWith('data:') ? image : `data:image/jpeg;base64,${image}`;
    imageSource = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = dataUrl;
    });
  }

  const instr = lang === 'ko'
    ? '이 이미지의 모든 텍스트를 정확히 추출하세요. 레이아웃 유지, 설명 없이 텍스트만.'
    : 'Extract all text from this image accurately. Preserve layout, text only.';

  const out = await llm.generateResponse([
    '<start_of_turn>user\n', instr, '\n', { imageSource },
    '<end_of_turn>\n<start_of_turn>model\n',
  ]);
  return (out || '').trim();
}

/** 모델 언로드 (메모리 해제) */
export async function terminateMediapipeGemma() {
  if (_llmPromise) {
    try { (await _llmPromise).close?.(); } catch { /* ignore */ }
    _llmPromise = null; _loadedModel = null;
  }
}
