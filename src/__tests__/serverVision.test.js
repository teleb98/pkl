import { describe, it, expect, beforeEach, vi } from 'vitest';

/* ────────────────────────────────────────────────────────────────
   서버 Vision OCR (자가호스팅 Mac /api/vision-ocr) + 뷰어 텍스트 인식
   - serverVisionOcr provider: 가용성 확인/캐시, 성공, 실패 시 throw
   - createOcr 체인: Electron Vision > 서버 Vision > Tesseract 우선순위
   - pageTextCache.setPageText force 덮어쓰기 (재인식 지원)
   ─────────────────────────────────────────────────────────────── */

vi.mock('../utils/ocr/tesseractOcr.js', () => ({
  ocrImageWithTesseract: vi.fn(async () => 'tesseract-result'),
}));
vi.mock('../utils/ocr/ollamaOcr.js', () => ({
  ocrImageWithOllama: vi.fn(async () => 'ollama-result'),
  isOllamaAvailable: vi.fn(async () => false),
  pickBestVisionModel: vi.fn(async () => null),
  listOllamaVisionModels: vi.fn(async () => []),
}));
vi.mock('../utils/ocr/mediapipeGemmaOcr.js', () => ({
  ocrImageWithMediapipeGemma: vi.fn(async () => ''),
  isMediapipeGemmaAvailable: () => false,
  getGemmaModelUrl: () => '',
}));

import {
  isServerVisionAvailable, ocrImageWithServerVision, _resetServerVisionCache,
} from '../utils/ocr/serverVisionOcr.js';
import { _resetMacVisionCache } from '../utils/ocr/macVisionOcr.js';
import { createOcr, _resetOllamaCache } from '../utils/ocr/index.js';
import { setPageText, getPageText, setViewedPage, _resetForTesting } from '../pageTextCache.js';

function mockFetch(handler) {
  global.fetch = vi.fn(handler);
}

beforeEach(() => {
  delete window.electron;
  _resetServerVisionCache();
  _resetMacVisionCache();
  _resetOllamaCache();
  _resetForTesting();
  vi.clearAllMocks();
  mockFetch(async () => { throw new Error('network'); });
});

/* ── 1. serverVision provider ─────────────────────────────── */
describe('serverVisionOcr provider', () => {
  it('서버가 available 응답 → 사용 가능 (세션 캐시)', async () => {
    mockFetch(async () => ({ ok: true, json: async () => ({ ok: true, available: true }) }));
    expect(await isServerVisionAvailable()).toBe(true);
    expect(await isServerVisionAvailable()).toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('서버 미지원(404/미배포) → 사용 불가, throw 하지 않음', async () => {
    mockFetch(async () => ({ ok: false, status: 404, json: async () => ({}) }));
    expect(await isServerVisionAvailable()).toBe(false);
  });

  it('네트워크 실패(Electron file:// 등) → 사용 불가', async () => {
    expect(await isServerVisionAvailable()).toBe(false);
  });

  it('인식 성공 → 텍스트 반환', async () => {
    mockFetch(async (url, opts) => {
      expect(url).toBe('/api/vision-ocr');
      expect(opts.method).toBe('POST');
      expect(JSON.parse(opts.body).image).toBe('QkFTRTY0');
      return { ok: true, json: async () => ({ ok: true, text: '전략의 본질' }) };
    });
    expect(await ocrImageWithServerVision('QkFTRTY0')).toBe('전략의 본질');
  });

  it('인식 실패(422) → throw (체인 폴백 유도)', async () => {
    mockFetch(async () => ({ ok: false, status: 422, json: async () => ({ ok: false, error: 'vision-failed' }) }));
    await expect(ocrImageWithServerVision('QkFTRTY0')).rejects.toThrow('vision-failed');
  });
});

/* ── 2. 체인 우선순위 ─────────────────────────────────────── */
describe('createOcr — 서버 Vision 체인 통합', () => {
  it('웹 + 서버 Vision 가용 → 서버 Vision 사용 (Tesseract 미호출)', async () => {
    mockFetch(async (url, opts) => {
      if (!opts || opts.method === 'GET' || !opts.method) return { ok: true, json: async () => ({ ok: true, available: true }) };
      return { ok: true, json: async () => ({ ok: true, text: '서버 비전 결과' }) };
    });
    const ocr = await createOcr({ mode: 'local', lang: 'ko' });
    expect(await ocr('QkFTRTY0')).toBe('서버 비전 결과');
    const { ocrImageWithTesseract } = await import('../utils/ocr/tesseractOcr.js');
    expect(ocrImageWithTesseract).not.toHaveBeenCalled();
  });

  it('Electron macVision 가용 시 서버 Vision 대신 macVision 사용', async () => {
    window.electron = {
      macVisionAvailable: async () => true,
      macVisionOcr: vi.fn(async () => ({ ok: true, text: '네이티브 비전' })),
    };
    const ocr = await createOcr({ mode: 'local', lang: 'ko' });
    expect(await ocr('QkFTRTY0')).toBe('네이티브 비전');
    // 서버 가용성 확인 fetch 자체가 불필요 (else-if)
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('서버 Vision 실패 → Tesseract 폴백', async () => {
    mockFetch(async (url, opts) => {
      if (!opts || !opts.method || opts.method === 'GET') return { ok: true, json: async () => ({ ok: true, available: true }) };
      return { ok: false, status: 500, json: async () => ({ ok: false, error: 'boom' }) };
    });
    const ocr = await createOcr({ mode: 'local', lang: 'ko' });
    expect(await ocr('QkFTRTY0')).toBe('tesseract-result');
  });
});

/* ── 3. 재인식(force) 캐시 덮어쓰기 ───────────────────────── */
describe('pageTextCache.setPageText — force 덮어쓰기', () => {
  it('기본은 기존 텍스트 보존, force 는 덮어씀', () => {
    setViewedPage('b1', 3, '원본 텍스트');
    setPageText('b1', 3, '무시되어야 함');
    expect(getPageText('b1').text).toBe('원본 텍스트');
    setPageText('b1', 3, '비전 재인식 결과', { force: true });
    expect(getPageText('b1').text).toBe('비전 재인식 결과');
  });
});
