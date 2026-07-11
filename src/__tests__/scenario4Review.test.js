import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getBookReview, saveBookReview } from '../store.js';
import {
  buildReviewPrompt,
  wrapText,
  CARD_THEMES,
  renderReviewCard,
  downloadReviewCard,
} from '../utils/reviewCard.js';

beforeEach(() => localStorage.clear());

/* ── store: 책 리뷰 영속성 ─────────────────────────────── */
describe('getBookReview', () => {
  it('저장된 리뷰 없을 때 null', () => {
    expect(getBookReview('b1')).toBeNull();
  });

  it('잘못된 JSON → null', () => {
    localStorage.setItem('pkl_book_review_b1', 'broken{');
    expect(getBookReview('b1')).toBeNull();
  });

  it('책별로 격리됨', () => {
    saveBookReview('b1', { text: '리뷰A', rating: 5, theme: 'warm' });
    expect(getBookReview('b1')?.text).toBe('리뷰A');
    expect(getBookReview('b2')).toBeNull();
  });
});

describe('saveBookReview', () => {
  it('저장 후 복원', () => {
    saveBookReview('b1', { text: '좋은 책', rating: 4, theme: 'ocean' });
    const r = getBookReview('b1');
    expect(r).toMatchObject({ text: '좋은 책', rating: 4, theme: 'ocean' });
    expect(typeof r.updatedAt).toBe('number');
  });

  it('덮어쓰기 동작', () => {
    saveBookReview('b1', { text: '버전1', rating: 3, theme: 'warm' });
    saveBookReview('b1', { text: '버전2', rating: 5, theme: 'rose' });
    expect(getBookReview('b1').text).toBe('버전2');
    expect(getBookReview('b1').rating).toBe(5);
  });

  it('부분 업데이트 — 기존 필드 유지', () => {
    saveBookReview('b1', { text: '초안', rating: 4, theme: 'warm' });
    saveBookReview('b1', { text: '수정' });
    const r = getBookReview('b1');
    expect(r.text).toBe('수정');
    expect(r.rating).toBe(4); // 유지
    expect(r.theme).toBe('warm'); // 유지
  });
});

/* ── 프롬프트 빌더 ─────────────────────────────────────── */
describe('buildReviewPrompt', () => {
  it('한국어 프롬프트 — 제목, 메모, 하이라이트 포함', () => {
    const p = buildReviewPrompt(
      { title: '예제 책', author: '저자' },
      [{ text: '메모1' }, { text: '메모2' }],
      [{ text: '강조1' }],
      'ko'
    );
    expect(p).toContain('예제 책');
    expect(p).toContain('저자');
    expect(p).toContain('메모1');
    expect(p).toContain('강조1');
    expect(p).toContain('2~3문장');
  });

  it('영문 프롬프트', () => {
    const p = buildReviewPrompt({ title: 'Book', author: 'Author' }, [], [], 'en');
    expect(p).toContain('Book');
    expect(p).toContain('Author');
    expect(p).toContain('sincere');
  });

  it('메모/하이라이트 없을 때 안내 문구', () => {
    const p = buildReviewPrompt({ title: '책' }, [], [], 'ko');
    expect(p).toContain('특별한 메모');
  });

  it('메모는 최대 10개까지만', () => {
    const notes = Array.from({ length: 30 }, (_, i) => ({ text: `메모${i}` }));
    const p = buildReviewPrompt({ title: '책' }, notes, [], 'ko');
    expect(p).toContain('메모0');
    expect(p).toContain('메모9');
    expect(p).not.toContain('메모15');
  });
});

/* ── 텍스트 줄바꿈 ─────────────────────────────────────── */
describe('wrapText', () => {
  // Canvas ctx.measureText 모킹: 글자 수 * 10
  const mockCtx = {
    measureText: (s) => ({ width: s.length * 10 }),
  };

  it('짧은 텍스트 1줄', () => {
    const lines = wrapText(mockCtx, '짧음', 200);
    expect(lines).toEqual(['짧음']);
  });

  it('너비 초과 시 줄바꿈', () => {
    const lines = wrapText(mockCtx, '가나다라마바사아자차카타파하', 50); // 5글자=50
    expect(lines.length).toBeGreaterThan(1);
  });

  it('빈 문자열 → 빈 줄 처리', () => {
    expect(wrapText(mockCtx, '', 100)).toEqual(['']);
  });

  it('줄바꿈 문자 처리', () => {
    const lines = wrapText(mockCtx, '첫줄\n둘째줄', 1000);
    expect(lines).toEqual(['첫줄', '둘째줄']);
  });

  it('영문 단어 단위 줄바꿈', () => {
    const lines = wrapText(mockCtx, 'hello world foo bar', 60); // ~6글자
    expect(lines.length).toBeGreaterThan(1);
    // 단어가 통째로 보존
    expect(lines.some(l => l.includes('hello'))).toBe(true);
  });
});

/* ── CARD_THEMES ──────────────────────────────────────── */
describe('CARD_THEMES', () => {
  it('warm, ocean, forest, rose, ink 정의 존재', () => {
    expect(CARD_THEMES.warm).toBeDefined();
    expect(CARD_THEMES.ocean).toBeDefined();
    expect(CARD_THEMES.forest).toBeDefined();
    expect(CARD_THEMES.rose).toBeDefined();
    expect(CARD_THEMES.ink).toBeDefined();
  });

  it('모든 테마에 from/to/ink/accent 색상 정의', () => {
    Object.values(CARD_THEMES).forEach(t => {
      expect(t.from).toMatch(/^#/);
      expect(t.to).toMatch(/^#/);
      expect(t.ink).toMatch(/^#/);
      expect(t.accent).toMatch(/^#/);
    });
  });
});

/* ── renderReviewCard (Canvas mock) ───────────────────── */
describe('renderReviewCard', () => {
  function makeMockCanvas() {
    const ctx = {
      fillStyle: '', font: '', textBaseline: '', strokeStyle: '', lineWidth: 0,
      fillRect: vi.fn(),
      fillText: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      measureText: vi.fn((s) => ({ width: String(s).length * 20 })),
      createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    };
    const canvas = { width: 0, height: 0, getContext: vi.fn(() => ctx) };
    return { canvas, ctx };
  }

  it('canvas 크기 1080x1080 설정', () => {
    const { canvas } = makeMockCanvas();
    renderReviewCard(canvas, { book: { title: '책' }, review: '좋은 책', theme: 'warm', stats: {} });
    expect(canvas.width).toBe(1080);
    expect(canvas.height).toBe(1080);
  });

  it('책 제목과 리뷰가 fillText로 그려짐', () => {
    const { canvas, ctx } = makeMockCanvas();
    renderReviewCard(canvas, { book: { title: '제목A', author: '저자A' }, review: '리뷰내용', theme: 'warm', stats: {} });
    const calls = ctx.fillText.mock.calls.map(c => c[0]);
    expect(calls.some(s => String(s).includes('제목A'))).toBe(true);
    expect(calls.some(s => String(s).includes('저자A'))).toBe(true);
    expect(calls.some(s => String(s).includes('리뷰내용'))).toBe(true);
  });

  it('통계 (pages/notes/highlights) 표시', () => {
    const { canvas, ctx } = makeMockCanvas();
    renderReviewCard(canvas, {
      book: { title: '책' },
      review: 'r',
      theme: 'warm',
      stats: { pages: 320, notes: 5, highlights: 12 },
    });
    const calls = ctx.fillText.mock.calls.map(c => String(c[0]));
    expect(calls.some(s => s.includes('320p'))).toBe(true);
    expect(calls.some(s => s.includes('5'))).toBe(true);
    expect(calls.some(s => s.includes('12'))).toBe(true);
  });

  it('PKL 워터마크 포함', () => {
    const { canvas, ctx } = makeMockCanvas();
    renderReviewCard(canvas, { book: { title: '책' }, review: 'r', theme: 'warm', stats: {} });
    const calls = ctx.fillText.mock.calls.map(c => String(c[0]));
    expect(calls.some(s => s.includes('Personal Knowledge Library'))).toBe(true);
  });

  it('알 수 없는 테마는 warm으로 fallback', () => {
    const { canvas } = makeMockCanvas();
    expect(() => renderReviewCard(canvas, { book: { title: '책' }, review: 'r', theme: 'nonexistent', stats: {} })).not.toThrow();
  });
});

/* ── downloadReviewCard ────────────────────────────────── */
describe('downloadReviewCard', () => {
  it('파일명에 책 제목 + _review.png', async () => {
    const blob = new Blob(['fake'], { type: 'image/png' });
    let downloadedAs = null;

    const origCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      const el = origCreate(tag);
      if (tag === 'canvas') {
        el.getContext = () => ({
          fillStyle: '', font: '', textBaseline: '', strokeStyle: '', lineWidth: 0,
          fillRect: () => {}, fillText: () => {},
          beginPath: () => {}, moveTo: () => {}, lineTo: () => {}, stroke: () => {},
          measureText: (s) => ({ width: String(s).length * 20 }),
          createLinearGradient: () => ({ addColorStop: () => {} }),
        });
        el.toBlob = (cb) => cb(blob);
      }
      if (tag === 'a') {
        el.click = () => { downloadedAs = el.download; };
      }
      return el;
    });

    global.URL.createObjectURL = vi.fn(() => 'blob:test');
    global.URL.revokeObjectURL = vi.fn();

    await downloadReviewCard({ book: { title: '나의 책' }, review: 'r', theme: 'warm', stats: {} });
    expect(downloadedAs).toBe('나의 책_review.png');

    vi.restoreAllMocks();
  });
});
