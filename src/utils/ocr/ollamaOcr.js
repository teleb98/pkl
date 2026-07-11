/* 고품질 로컬 OCR — Ollama + Gemma 4 멀티모달 (데스크톱/Electron 권장)
   사용자 PC의 Ollama 로컬 서버(http://127.0.0.1:11434)에 이미지를 보내
   Gemma 4 비전 모델로 텍스트 추출. 표·수식·복잡 레이아웃·손글씨에 강함.

   Gemma 4 비전 태그(Ollama): gemma4:e2b, gemma4:e4b(권장), gemma4:12b, 26b, 31b
   (E2B/E4B = 엣지용 2B/4B 멀티모달. OCR엔 e4b 균형 최적)
   전제: 사용자가 `ollama pull gemma4:e4b`. 미설치 시 isOllamaAvailable()===false → 폴백. */

const OLLAMA_HOST = 'http://127.0.0.1:11434';
const DEFAULT_MODEL = 'gemma4:e4b'; // Gemma 4 비전, 4B 엣지 균형. 설정에서 변경 가능

// 설치된 모델 중 OCR 우선순위 (앞일수록 우선)
const VISION_PRIORITY = [
  /^gemma4:(e4b|e2b|12b)/i,   // Gemma 4 멀티모달 (최우선)
  /^gemma4/i,
  /^gemma3/i,                 // 구버전 폴백
  /llama3.2-vision|llava|minicpm-v|moondream/i,
];
const VISION_RE = /gemma4|gemma3|llava|llama3.2-vision|minicpm-v|moondream/i;

/** Ollama 로컬 서버가 떠 있는지 (짧은 타임아웃) */
export async function isOllamaAvailable(timeoutMs = 800) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(`${OLLAMA_HOST}/api/tags`, { signal: ctrl.signal });
    clearTimeout(t);
    return res.ok;
  } catch { return false; }
}

/** 설치된 비전 가능 모델 목록 (gemma4 우선) */
export async function listOllamaVisionModels() {
  try {
    const res = await fetch(`${OLLAMA_HOST}/api/tags`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.models || []).map(m => m.name).filter(n => VISION_RE.test(n));
  } catch { return []; }
}

/** 설치된 모델 중 OCR에 가장 적합한 것 선택 (Gemma 4 우선). 없으면 null */
export async function pickBestVisionModel() {
  const models = await listOllamaVisionModels();
  if (!models.length) return null;
  for (const re of VISION_PRIORITY) {
    const hit = models.find(m => re.test(m));
    if (hit) return hit;
  }
  return models[0];
}

/**
 * base64 이미지 → 텍스트 (Ollama Gemma 4 비전)
 * @param {string} base64Image  base64 (data: 접두사 없음)
 * @param {{model?:string, lang?:string}} opts
 * @returns {Promise<string>}
 */
export async function ocrImageWithOllama(base64Image, { model = DEFAULT_MODEL, lang = 'ko' } = {}) {
  if (!base64Image) return '';
  const clean = base64Image.startsWith('data:') ? base64Image.split(',')[1] : base64Image;
  const prompt = lang === 'ko'
    ? '이 이미지의 모든 텍스트를 정확히 추출하세요. 레이아웃을 최대한 유지하고, 설명 없이 텍스트만 출력하세요.'
    : 'Extract all text from this image accurately. Preserve layout, output text only without commentary.';

  const res = await fetch(`${OLLAMA_HOST}/api/generate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt,
      images: [clean],
      stream: false,
      options: { temperature: 0 }, // OCR은 결정적이어야
    }),
  });
  if (!res.ok) {
    if (res.status === 404) throw new Error('ollama-model-missing'); // 모델 미설치
    throw new Error(`ollama-${res.status}`);
  }
  const data = await res.json();
  return (data.response || '').trim();
}
