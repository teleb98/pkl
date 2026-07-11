import { describe, it, expect, beforeEach, vi } from 'vitest';

/* ────────────────────────────────────────────────────────────────
   OCR provider 선택/폴백 검증 (createOcr)
   - mode(auto/local/cloud) 별 provider 체인 구성
   - 앞 provider 빈 결과/실패 시 다음으로 폴백
   각 provider 모듈을 모킹하여 호출 순서/조건 검증.
   ─────────────────────────────────────────────────────────────── */

const tesseractMock = vi.fn(async () => '');
const ollamaMock = vi.fn(async () => '');
const ollamaAvailMock = vi.fn(async () => false);
const visionMock = vi.fn(async () => '');

vi.mock('../utils/ocr/tesseractOcr.js', () => ({
  ocrImageWithTesseract: (...a) => tesseractMock(...a),
}));
vi.mock('../utils/ocr/ollamaOcr.js', () => ({
  ocrImageWithOllama: (...a) => ollamaMock(...a),
  isOllamaAvailable: (...a) => ollamaAvailMock(...a),
  listOllamaVisionModels: async () => [],
  pickBestVisionModel: async () => 'gemma4:e4b',
}));
vi.mock('../utils/cloudVisionOcr.js', () => ({
  ocrImageWithVision: (...a) => visionMock(...a),
}));

const mpMock = vi.fn(async () => '');
const mpAvailMock = vi.fn(() => false);
const gemmaUrlMock = vi.fn(() => '');
vi.mock('../utils/ocr/mediapipeGemmaOcr.js', () => ({
  ocrImageWithMediapipeGemma: (...a) => mpMock(...a),
  isMediapipeGemmaAvailable: (...a) => mpAvailMock(...a),
  getGemmaModelUrl: (...a) => gemmaUrlMock(...a),
}));

import { createOcr, ocrPossible, _resetOllamaCache } from '../utils/ocr/index.js';

beforeEach(() => {
  vi.clearAllMocks();
  _resetOllamaCache();
  tesseractMock.mockResolvedValue('');
  ollamaMock.mockResolvedValue('');
  ollamaAvailMock.mockResolvedValue(false);
  visionMock.mockResolvedValue('');
  mpMock.mockResolvedValue('');
  mpAvailMock.mockReturnValue(false);
  gemmaUrlMock.mockReturnValue('');
});

describe('createOcr — mode 별 provider 체인', () => {
  it('local 모드: Tesseract 사용, 클라우드 호출 안 함', async () => {
    tesseractMock.mockResolvedValue('local text');
    const ocr = await createOcr({ mode: 'local', apiKeys: { vision: 'k' }, lang: 'ko' });
    const r = await ocr('img');
    expect(r).toBe('local text');
    expect(tesseractMock).toHaveBeenCalled();
    expect(visionMock).not.toHaveBeenCalled(); // 로컬 모드는 클라우드 금지
  });

  it('cloud 모드: Tesseract 호출 안 하고 Vision 사용', async () => {
    visionMock.mockResolvedValue('cloud text');
    const ocr = await createOcr({ mode: 'cloud', apiKeys: { vision: 'k' }, lang: 'ko' });
    const r = await ocr('img');
    expect(r).toBe('cloud text');
    expect(tesseractMock).not.toHaveBeenCalled();
    expect(visionMock).toHaveBeenCalled();
  });

  it('auto 모드: Tesseract 먼저, 결과 있으면 클라우드 안 감', async () => {
    tesseractMock.mockResolvedValue('auto local');
    const ocr = await createOcr({ mode: 'auto', apiKeys: { vision: 'k' }, lang: 'ko' });
    const r = await ocr('img');
    expect(r).toBe('auto local');
    expect(visionMock).not.toHaveBeenCalled();
  });

  it('auto 모드: Tesseract 빈 결과 → Vision 폴백', async () => {
    tesseractMock.mockResolvedValue('');       // 로컬 실패
    visionMock.mockResolvedValue('vision ok');
    const ocr = await createOcr({ mode: 'auto', apiKeys: { vision: 'k' }, lang: 'ko' });
    const r = await ocr('img');
    expect(r).toBe('vision ok');
    expect(tesseractMock).toHaveBeenCalled();
    expect(visionMock).toHaveBeenCalled();
  });
});

describe('createOcr — Ollama 우선순위', () => {
  it('Ollama 사용 가능 + auto: Ollama 먼저', async () => {
    ollamaAvailMock.mockResolvedValue(true);
    ollamaMock.mockResolvedValue('gemma text');
    const ocr = await createOcr({ mode: 'auto', apiKeys: {}, lang: 'ko' });
    const r = await ocr('img');
    expect(r).toBe('gemma text');
    expect(ollamaMock).toHaveBeenCalled();
    expect(tesseractMock).not.toHaveBeenCalled(); // Ollama 성공 시 Tesseract 불필요
  });

  it('Ollama 실패 → Tesseract 폴백', async () => {
    ollamaAvailMock.mockResolvedValue(true);
    ollamaMock.mockRejectedValue(new Error('ollama-model-missing'));
    tesseractMock.mockResolvedValue('tess fallback');
    const ocr = await createOcr({ mode: 'auto', apiKeys: {}, lang: 'ko' });
    const r = await ocr('img');
    expect(r).toBe('tess fallback');
  });

  it('cloud 모드: Ollama 가용해도 사용 안 함', async () => {
    ollamaAvailMock.mockResolvedValue(true);
    visionMock.mockResolvedValue('cloud');
    const ocr = await createOcr({ mode: 'cloud', apiKeys: { vision: 'k' }, lang: 'ko' });
    await ocr('img');
    expect(ollamaMock).not.toHaveBeenCalled();
  });
});

describe('createOcr — 브라우저 Gemma 4 (MediaPipe/WebGPU)', () => {
  it('WebGPU+모델URL 있으면 auto에서 Gemma 우선, Tesseract보다 먼저', async () => {
    gemmaUrlMock.mockReturnValue('https://hf.co/model.litertlm');
    mpAvailMock.mockReturnValue(true);
    mpMock.mockResolvedValue('gemma browser text');
    const ocr = await createOcr({ mode: 'auto', apiKeys: {}, lang: 'ko' });
    const r = await ocr('img');
    expect(r).toBe('gemma browser text');
    expect(mpMock).toHaveBeenCalled();
    expect(tesseractMock).not.toHaveBeenCalled();
  });

  it('모델URL 없으면 MediaPipe 미사용 → Tesseract', async () => {
    gemmaUrlMock.mockReturnValue('');
    mpAvailMock.mockReturnValue(false);
    tesseractMock.mockResolvedValue('tess');
    const ocr = await createOcr({ mode: 'local', apiKeys: {}, lang: 'ko' });
    const r = await ocr('img');
    expect(r).toBe('tess');
    expect(mpMock).not.toHaveBeenCalled();
  });

  it('Gemma 실패 시 Tesseract 폴백', async () => {
    gemmaUrlMock.mockReturnValue('https://hf.co/m.litertlm');
    mpAvailMock.mockReturnValue(true);
    mpMock.mockRejectedValue(new Error('webgpu-fail'));
    tesseractMock.mockResolvedValue('tess fallback');
    const ocr = await createOcr({ mode: 'local', apiKeys: {}, lang: 'ko' });
    expect(await ocr('img')).toBe('tess fallback');
  });

  it('cloud 모드: Gemma 가용해도 미사용', async () => {
    gemmaUrlMock.mockReturnValue('https://hf.co/m.litertlm');
    mpAvailMock.mockReturnValue(true);
    visionMock.mockResolvedValue('cloud');
    const ocr = await createOcr({ mode: 'cloud', apiKeys: { vision: 'k' }, lang: 'ko' });
    await ocr('img');
    expect(mpMock).not.toHaveBeenCalled();
  });
});

describe('createOcr — AI Vision(callAI) 폴백', () => {
  it('auto + vision키 없고 claude만: callAI 사용', async () => {
    const callAI = vi.fn(async () => 'ai vision text');
    tesseractMock.mockResolvedValue(''); // 로컬 실패
    const ocr = await createOcr({ mode: 'auto', apiKeys: { claude: 'c' }, lang: 'ko', callAI });
    const r = await ocr('img');
    expect(r).toBe('ai vision text');
    expect(callAI).toHaveBeenCalled();
  });

  it('모든 provider 실패 시 빈 문자열', async () => {
    const ocr = await createOcr({ mode: 'auto', apiKeys: {}, lang: 'ko' });
    expect(await ocr('img')).toBe('');
  });
});

describe('ocrPossible', () => {
  it('local/auto 는 항상 가능 (Tesseract)', () => {
    expect(ocrPossible('local', {})).toBe(true);
    expect(ocrPossible('auto', {})).toBe(true);
  });
  it('cloud 는 키 있어야 가능', () => {
    expect(ocrPossible('cloud', {})).toBe(false);
    expect(ocrPossible('cloud', { vision: 'k' })).toBe(true);
    expect(ocrPossible('cloud', { gemini: 'g' })).toBe(true);
  });
});
