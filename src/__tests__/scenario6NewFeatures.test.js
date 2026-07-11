import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  setPageText, hasPageText, setOutline, getOutline,
  getChapterRange, getTextForRange, getDocumentText, _resetForTesting,
} from '../pageTextCache.js';
import {
  getPdfAnnotations, addPdfAnnotation, deletePdfAnnotation,
} from '../store.js';
import { ocrImageWithVision } from '../utils/cloudVisionOcr.js';

/* ════════════════════════════════════════════════════════════════
   Scenario 6 — 신규 기능 테스트
   챕터 범위 / 범위 텍스트 추출 / PDF 형광펜 주석 / Cloud Vision OCR
   ════════════════════════════════════════════════════════════════ */

// ── 챕터 범위 & 범위 텍스트 추출 ─────────────────────────────
describe('PageTextCache — 챕터 범위 & 범위 텍스트', () => {
  beforeEach(() => _resetForTesting());

  describe('setOutline / getOutline', () => {
    it('목차를 저장하고 반환한다', () => {
      const chapters = [{ title: '1장', page: 1 }, { title: '2장', page: 20 }];
      setOutline('b1', chapters);
      expect(getOutline('b1')).toEqual(chapters);
    });

    it('빈 배열은 null 로 정규화한다', () => {
      setOutline('b1', []);
      expect(getOutline('b1')).toBeNull();
    });

    it('목차 없는 책은 null 반환', () => {
      expect(getOutline('unknown')).toBeNull();
    });
  });

  describe('getChapterRange', () => {
    beforeEach(() => {
      setOutline('b1', [
        { title: '1장 서론', page: 1 },
        { title: '2장 본론', page: 20 },
        { title: '3장 결론', page: 50 },
      ]);
    });

    it('중간 챕터 — 시작/끝/제목이 올바르다', () => {
      const r = getChapterRange('b1', 25);
      expect(r.start).toBe(20);
      expect(r.end).toBe(49); // 다음 챕터 시작 - 1
      expect(r.title).toBe('2장 본론');
    });

    it('마지막 챕터 — end 가 null (책 끝까지)', () => {
      const r = getChapterRange('b1', 60);
      expect(r.start).toBe(50);
      expect(r.end).toBeNull();
      expect(r.title).toBe('3장 결론');
    });

    it('첫 챕터 시작 페이지에서 첫 챕터를 반환한다', () => {
      const r = getChapterRange('b1', 1);
      expect(r.start).toBe(1);
      expect(r.title).toBe('1장 서론');
    });

    it('목차 없으면 null 반환 (호출부에서 ±10p 폴백)', () => {
      expect(getChapterRange('noOutline', 30)).toBeNull();
    });
  });

  describe('getTextForRange', () => {
    beforeEach(() => {
      for (let p = 1; p <= 30; p++) setPageText('b1', p, `페이지 ${p} 내용`);
    });

    it('지정 범위 페이지만 추출한다', () => {
      const r = getTextForRange('b1', 5, 8);
      expect(r.text).toContain('페이지 5');
      expect(r.text).toContain('페이지 8');
      expect(r.text).not.toContain('페이지 4');
      expect(r.text).not.toContain('페이지 9');
      expect(r.firstPage).toBe(5);
      expect(r.lastPage).toBe(8);
    });

    it('endPage null 이면 끝까지 추출한다', () => {
      const r = getTextForRange('b1', 28, null);
      expect(r.text).toContain('페이지 28');
      expect(r.text).toContain('페이지 30');
    });

    it('캐시에 없는 범위는 null', () => {
      expect(getTextForRange('b1', 100, 110)).toBeNull();
    });
  });

  describe('hasPageText — OCR 스킵 판단', () => {
    it('텍스트 있는 페이지는 true', () => {
      setPageText('b1', 3, '내용');
      expect(hasPageText('b1', 3)).toBe(true);
    });

    it('텍스트 없는 페이지는 false (OCR 대상)', () => {
      expect(hasPageText('b1', 99)).toBe(false);
    });
  });

  describe('getDocumentText — 전체 폴백', () => {
    it('범위 추출 실패 시 전체 캐시를 반환한다', () => {
      setPageText('b1', 1, '첫 페이지');
      setPageText('b1', 2, '둘째 페이지');
      const doc = getDocumentText('b1');
      expect(doc.text).toContain('첫 페이지');
      expect(doc.pageCount).toBe(2);
    });
  });
});

// ── PDF 형광펜 주석 ───────────────────────────────────────────
describe('PDF 형광펜 주석 (store)', () => {
  beforeEach(() => localStorage.clear());

  it('주석을 추가하고 가져온다', () => {
    const entry = addPdfAnnotation({
      bookId: 'b1', pageNum: 5,
      rects: [{ x: 10, y: 20, w: 100, h: 14 }],
      color: '#FFD54F', text: '강조 문장',
    });
    expect(entry.id).toBeTruthy();
    expect(entry.pageNum).toBe(5);
    expect(getPdfAnnotations('b1')[0].text).toBe('강조 문장');
  });

  it('여러 주석은 최신순으로 쌓인다 (unshift)', () => {
    addPdfAnnotation({ bookId: 'b1', pageNum: 1, rects: [], text: '첫째' });
    addPdfAnnotation({ bookId: 'b1', pageNum: 2, rects: [], text: '둘째' });
    const all = getPdfAnnotations('b1');
    expect(all[0].text).toBe('둘째');
    expect(all).toHaveLength(2);
  });

  it('연속 추가 시 id 가 충돌하지 않는다 (timestamp+random)', () => {
    const e1 = addPdfAnnotation({ bookId: 'b1', pageNum: 1, rects: [], text: 'A' });
    const e2 = addPdfAnnotation({ bookId: 'b1', pageNum: 2, rects: [], text: 'B' });
    expect(e1.id).not.toBe(e2.id);
  });

  it('id 로 주석을 삭제한다', () => {
    const e1 = addPdfAnnotation({ bookId: 'b1', pageNum: 1, rects: [], text: 'A' });
    addPdfAnnotation({ bookId: 'b1', pageNum: 2, rects: [], text: 'B' });
    const remaining = deletePdfAnnotation('b1', e1.id);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].text).toBe('B');
  });

  it('책별로 주석이 분리 저장된다', () => {
    addPdfAnnotation({ bookId: 'b1', pageNum: 1, rects: [], text: 'book1' });
    addPdfAnnotation({ bookId: 'b2', pageNum: 1, rects: [], text: 'book2' });
    expect(getPdfAnnotations('b1')).toHaveLength(1);
    expect(getPdfAnnotations('b2')).toHaveLength(1);
  });

  it('color 기본값은 #FFD54F (노란색)', () => {
    const e = addPdfAnnotation({ bookId: 'b1', pageNum: 1, rects: [] });
    expect(e.color).toBe('#FFD54F');
  });

  it('주석 없는 책은 빈 배열 반환', () => {
    expect(getPdfAnnotations('empty')).toEqual([]);
  });
});

// ── Cloud Vision OCR ──────────────────────────────────────────
describe('Cloud Vision OCR (ocrImageWithVision)', () => {
  afterEach(() => vi.restoreAllMocks());

  const mockFetch = (impl) => { global.fetch = vi.fn(impl); };

  it('정상 응답에서 추출 텍스트를 반환한다', async () => {
    mockFetch(async () => ({
      ok: true,
      json: async () => ({ responses: [{ fullTextAnnotation: { text: '추출된 본문' } }] }),
    }));
    expect(await ocrImageWithVision('B64', 'KEY')).toBe('추출된 본문');
  });

  it('요청에 base64 이미지와 DOCUMENT_TEXT_DETECTION 포함', async () => {
    let captured;
    mockFetch(async (url, opts) => {
      captured = { url, body: JSON.parse(opts.body) };
      return { ok: true, json: async () => ({ responses: [{ fullTextAnnotation: { text: 'x' } }] }) };
    });
    await ocrImageWithVision('IMGDATA', 'MYKEY');
    expect(captured.url).toContain('key=MYKEY');
    expect(captured.body.requests[0].image.content).toBe('IMGDATA');
    expect(captured.body.requests[0].features[0].type).toBe('DOCUMENT_TEXT_DETECTION');
  });

  it('텍스트 없는 페이지는 빈 문자열', async () => {
    mockFetch(async () => ({ ok: true, json: async () => ({ responses: [{}] }) }));
    expect(await ocrImageWithVision('D', 'K')).toBe('');
  });

  it('401/403 → invalid-key 에러', async () => {
    mockFetch(async () => ({ ok: false, status: 403 }));
    await expect(ocrImageWithVision('D', 'BAD')).rejects.toThrow('invalid-key');
  });

  it('429 → rate-limit 에러', async () => {
    mockFetch(async () => ({ ok: false, status: 429 }));
    await expect(ocrImageWithVision('D', 'K')).rejects.toThrow('rate-limit');
  });

  it('기타 HTTP 오류 → "Vision API {status}" 에러', async () => {
    mockFetch(async () => ({ ok: false, status: 500 }));
    await expect(ocrImageWithVision('D', 'K')).rejects.toThrow('Vision API 500');
  });

  it('앞뒤 공백을 트림한다', async () => {
    mockFetch(async () => ({
      ok: true,
      json: async () => ({ responses: [{ fullTextAnnotation: { text: '  여백  ' } }] }),
    }));
    expect(await ocrImageWithVision('D', 'K')).toBe('여백');
  });
});
