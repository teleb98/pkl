import { describe, it, expect, beforeEach, vi } from 'vitest';

/* ────────────────────────────────────────────────────────────────
   Apple Vision 로컬 OCR + 로컬 책 정보 스캔 (macOS 비전 인식 기능)
   - macVisionOcr provider: availability 캐시 / 성공 / 실패 시 throw
   - createOcr 체인: macOS(Electron)에서 Apple Vision 이 최우선으로 시도되고
     실패 시 다음 provider 로 폴백
   - extractCoverMeta: 표지 OCR 텍스트 → 제목/저자 휴리스틱
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

import { ocrImageWithTesseract } from '../utils/ocr/tesseractOcr.js';
import {
  isMacVisionAvailable, ocrImageWithMacVision, _resetMacVisionCache,
} from '../utils/ocr/macVisionOcr.js';
import { createOcr, _resetOllamaCache } from '../utils/ocr/index.js';
import { extractCoverMeta } from '../utils/localBookScan.js';

beforeEach(() => {
  delete window.electron;
  _resetMacVisionCache();
  _resetOllamaCache();
  vi.clearAllMocks();
});

/* ── 1. macVision provider ─────────────────────────────────── */
describe('macVisionOcr provider', () => {
  it('Electron 아님(웹) → 사용 불가', async () => {
    expect(await isMacVisionAvailable()).toBe(false);
  });

  it('Electron + macOS → 사용 가능 (결과는 세션 캐시)', async () => {
    const avail = vi.fn(async () => true);
    window.electron = { macVisionAvailable: avail };
    expect(await isMacVisionAvailable()).toBe(true);
    expect(await isMacVisionAvailable()).toBe(true);
    expect(avail).toHaveBeenCalledTimes(1); // 캐시됨
  });

  it('구버전 Electron(핸들러 없음) → 사용 불가, throw 하지 않음', async () => {
    window.electron = {}; // macVisionAvailable 미노출
    expect(await isMacVisionAvailable()).toBe(false);
  });

  it('인식 성공 → 텍스트 반환', async () => {
    window.electron = { macVisionOcr: vi.fn(async () => ({ ok: true, text: '전략의 본질' })) };
    expect(await ocrImageWithMacVision('QkFTRTY0')).toBe('전략의 본질');
  });

  it('인식 실패 → throw (체인 폴백 유도)', async () => {
    window.electron = { macVisionOcr: vi.fn(async () => ({ ok: false, error: 'vision-failed' })) };
    await expect(ocrImageWithMacVision('QkFTRTY0')).rejects.toThrow('vision-failed');
  });
});

/* ── 2. createOcr 체인 통합 ────────────────────────────────── */
describe('createOcr — Apple Vision 체인 우선순위', () => {
  it('macVision 사용 가능 + 성공 → Tesseract 를 호출하지 않는다', async () => {
    window.electron = {
      macVisionAvailable: async () => true,
      macVisionOcr: vi.fn(async () => ({ ok: true, text: '비전 인식 결과' })),
    };
    const ocr = await createOcr({ mode: 'local', lang: 'ko' });
    expect(await ocr('QkFTRTY0')).toBe('비전 인식 결과');
    expect(window.electron.macVisionOcr).toHaveBeenCalledTimes(1);
    expect(ocrImageWithTesseract).not.toHaveBeenCalled();
  });

  it('macVision 실패 → Tesseract 로 폴백', async () => {
    window.electron = {
      macVisionAvailable: async () => true,
      macVisionOcr: vi.fn(async () => ({ ok: false, error: 'vision-failed' })),
    };
    const ocr = await createOcr({ mode: 'local', lang: 'ko' });
    expect(await ocr('QkFTRTY0')).toBe('tesseract-result');
    expect(ocrImageWithTesseract).toHaveBeenCalledTimes(1);
  });

  it('웹(비 Electron) → macVision 없이 기존 체인 그대로', async () => {
    const ocr = await createOcr({ mode: 'local', lang: 'ko' });
    expect(await ocr('QkFTRTY0')).toBe('tesseract-result');
  });

  it("mode 'cloud' 에서는 macVision 을 쓰지 않는다", async () => {
    window.electron = {
      macVisionAvailable: async () => true,
      macVisionOcr: vi.fn(async () => ({ ok: true, text: 'X' })),
    };
    const ocr = await createOcr({ mode: 'cloud', lang: 'ko', apiKeys: {} });
    await ocr('QkFTRTY0');
    expect(window.electron.macVisionOcr).not.toHaveBeenCalled();
  });
});

/* ── 3. 표지 휴리스틱 ──────────────────────────────────────── */
describe('extractCoverMeta — 표지 텍스트에서 제목/저자 추정', () => {
  it('한국어 표지: 제목 + "지음" 저자', () => {
    const m = extractCoverMeta('전략의 본질\n경쟁 우위를 만드는 다섯 가지 질문\n헨리 민츠버그 지음 • 김철수 옮김\n한국경제신문사');
    expect(m.aiTitle).toBe('전략의 본질');
    expect(m.aiAuthor).toBe('헨리 민츠버그');
    expect(m.aiLanguage).toBe('ko');
    expect(m.aiScanStatus).toBe('done');
  });

  it('"지은이:" 형식', () => {
    const m = extractCoverMeta('사피엔스\n지은이: 유발 하라리');
    expect(m.aiTitle).toBe('사피엔스');
    expect(m.aiAuthor).toBe('유발 하라리');
  });

  it('영문 표지: by Author', () => {
    const m = extractCoverMeta('The Lean Startup\nby Eric Ries\nCrown Business');
    expect(m.aiTitle).toBe('The Lean Startup');
    expect(m.aiAuthor).toBe('Eric Ries');
    expect(m.aiLanguage).toBe('en');
  });

  it('저자를 못 찾으면 null (지어내지 않음)', () => {
    const m = extractCoverMeta('어떤 책의 제목\n출판사 이름');
    expect(m.aiTitle).toBe('어떤 책의 제목');
    expect(m.aiAuthor).toBeNull();
  });

  it('빈 텍스트 → 파일명에서 제목 추출', () => {
    const m = extractCoverMeta('', '전략의_본질_스캔본.pdf');
    expect(m.aiTitle).toBe('전략의 본질 스캔본');
    expect(m.aiAuthor).toBeNull();
  });

  it('ISBN/URL/가격 등 노이즈 라인은 제목 후보에서 제외', () => {
    const m = extractCoverMeta('ISBN 9788901234567\nwww.publisher.co.kr\n정가 18,000원\n진짜 제목\n김작가 지음');
    expect(m.aiTitle).toBe('진짜 제목');
    expect(m.aiAuthor).toBe('김작가');
  });
});
