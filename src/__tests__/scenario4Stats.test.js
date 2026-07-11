import { describe, it, expect, beforeEach, vi } from 'vitest';
import { addSession, getMonthStats, getYearStats } from '../store.js';
import {
  fmtMinutes, monthName, STATS_THEMES, renderStatsCard, downloadStatsCard,
} from '../utils/statsCard.js';

beforeEach(() => localStorage.clear());

/* ── getMonthStats ─────────────────────────────────────── */
describe('getMonthStats', () => {
  it('데이터 없으면 0 반환', () => {
    const s = getMonthStats(2026, 5);
    expect(s.totalMinutes).toBe(0);
    expect(s.totalPages).toBe(0);
    expect(s.activeDays).toBe(0);
    expect(s.sessionCount).toBe(0);
  });

  it('해당 월의 세션만 집계', () => {
    addSession({ bookId: 'b1', bookTitle: 'A', date: '2026-05-10T10:00:00Z', minutes: 30, pages: 20 });
    addSession({ bookId: 'b1', bookTitle: 'A', date: '2026-06-01T10:00:00Z', minutes: 60, pages: 40 });
    const s = getMonthStats(2026, 5);
    expect(s.totalMinutes).toBe(30);
    expect(s.totalPages).toBe(20);
    expect(s.sessionCount).toBe(1);
  });

  it('여러 세션 합산', () => {
    addSession({ bookId: 'b1', bookTitle: 'A', date: '2026-05-01T00:00:00Z', minutes: 20, pages: 10 });
    addSession({ bookId: 'b2', bookTitle: 'B', date: '2026-05-02T00:00:00Z', minutes: 40, pages: 30 });
    const s = getMonthStats(2026, 5);
    expect(s.totalMinutes).toBe(60);
    expect(s.totalPages).toBe(40);
    expect(s.activeDays).toBe(2);
  });

  it('year, month 필드 반환', () => {
    const s = getMonthStats(2026, 3);
    expect(s.year).toBe(2026);
    expect(s.month).toBe(3);
  });

  it('dayBars 길이 = 해당 월 일 수', () => {
    const s28 = getMonthStats(2026, 2); // 28일
    const s31 = getMonthStats(2026, 5); // 31일
    expect(s28.dayBars).toHaveLength(28);
    expect(s31.dayBars).toHaveLength(31);
  });

  it('dayBars에 일별 분 집계', () => {
    addSession({ bookId: 'b1', bookTitle: 'A', date: '2026-05-15T00:00:00Z', minutes: 45, pages: 20 });
    const s = getMonthStats(2026, 5);
    const day15 = s.dayBars.find(b => b.day === 15);
    expect(day15.minutes).toBe(45);
  });

  it('totalNotes, totalHighlights 포함', () => {
    const s = getMonthStats(2026, 5);
    expect(s).toHaveProperty('totalNotes');
    expect(s).toHaveProperty('totalHighlights');
  });
});

/* ── getYearStats ──────────────────────────────────────── */
describe('getYearStats', () => {
  it('year 필드', () => {
    expect(getYearStats(2026).year).toBe(2026);
  });

  it('12개 월 요약 포함', () => {
    expect(getYearStats(2026).months).toHaveLength(12);
  });

  it('월간 합계가 연간 합계에 포함', () => {
    addSession({ bookId: 'b1', bookTitle: 'A', date: '2026-03-10T00:00:00Z', minutes: 50, pages: 30 });
    addSession({ bookId: 'b1', bookTitle: 'A', date: '2026-07-05T00:00:00Z', minutes: 70, pages: 50 });
    const y = getYearStats(2026);
    expect(y.totalMinutes).toBe(120);
    expect(y.totalPages).toBe(80);
  });

  it('데이터 없으면 모두 0', () => {
    const y = getYearStats(2025);
    expect(y.totalMinutes).toBe(0);
    expect(y.totalPages).toBe(0);
    expect(y.completedBooks).toBe(0);
  });
});

/* ── fmtMinutes ────────────────────────────────────────── */
describe('fmtMinutes', () => {
  it('0 → "0h"', () => expect(fmtMinutes(0)).toBe('0h'));
  it('null → "0h"', () => expect(fmtMinutes(null)).toBe('0h'));
  it('30분', () => expect(fmtMinutes(30)).toBe('30m'));
  it('60분 → "1h"', () => expect(fmtMinutes(60)).toBe('1h'));
  it('90분 → "1h 30m"', () => expect(fmtMinutes(90)).toBe('1h 30m'));
  it('120분 → "2h"', () => expect(fmtMinutes(120)).toBe('2h'));
  it('정각 아닌 큰 값', () => expect(fmtMinutes(185)).toBe('3h 5m'));
});

/* ── monthName ─────────────────────────────────────────── */
describe('monthName', () => {
  it('한국어 월 이름', () => {
    expect(monthName(1, 'ko')).toBe('1월');
    expect(monthName(12, 'ko')).toBe('12월');
  });

  it('영문 월 이름', () => {
    expect(monthName(1, 'en')).toBe('Jan');
    expect(monthName(12, 'en')).toBe('Dec');
  });
});

/* ── STATS_THEMES ──────────────────────────────────────── */
describe('STATS_THEMES', () => {
  it('night, warm, forest 정의', () => {
    expect(STATS_THEMES.night).toBeDefined();
    expect(STATS_THEMES.warm).toBeDefined();
    expect(STATS_THEMES.forest).toBeDefined();
  });

  it('모든 테마에 bg/surface/accent/text 포함', () => {
    Object.values(STATS_THEMES).forEach(t => {
      expect(t.bg).toMatch(/^#/);
      expect(t.surface).toMatch(/^#/);
      expect(t.accent).toMatch(/^#/);
      expect(t.text).toMatch(/^#/);
    });
  });
});

/* ── renderStatsCard (Canvas mock) ────────────────────── */
describe('renderStatsCard', () => {
  function makeMockCanvas() {
    const ctx = {
      fillStyle: '', font: '', textBaseline: '', strokeStyle: '', lineWidth: 0,
      fillRect: vi.fn(), fillText: vi.fn(),
      beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(),
      stroke: vi.fn(), closePath: vi.fn(), quadraticCurveTo: vi.fn(), fill: vi.fn(),
      measureText: vi.fn(s => ({ width: String(s).length * 14 })),
      createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
      setLineDash: vi.fn(),
    };
    return { canvas: { width: 0, height: 0, getContext: vi.fn(() => ctx) }, ctx };
  }

  it('canvas 크기 1080×1080', () => {
    const { canvas } = makeMockCanvas();
    renderStatsCard(canvas, getMonthStats(2026, 5), { theme: 'night' });
    expect(canvas.width).toBe(1080);
    expect(canvas.height).toBe(1080);
  });

  it('fillText에 통계 레이블 포함', () => {
    const { canvas, ctx } = makeMockCanvas();
    addSession({ bookId: 'b1', bookTitle: 'A', date: '2026-05-10T00:00:00Z', minutes: 60, pages: 30 });
    renderStatsCard(canvas, getMonthStats(2026, 5), { theme: 'night', lang: 'ko' });
    const texts = ctx.fillText.mock.calls.map(c => String(c[0]));
    expect(texts.some(t => t.includes('독서'))).toBe(true);
    expect(texts.some(t => t.includes('PKL') || t.includes('Personal'))).toBe(true);
  });

  it('알 수 없는 theme → 기본(night)으로 fallback', () => {
    const { canvas } = makeMockCanvas();
    expect(() => renderStatsCard(canvas, getMonthStats(2026, 5), { theme: 'alien' })).not.toThrow();
  });

  it('month label 출력 (2026 · 5월)', () => {
    const { canvas, ctx } = makeMockCanvas();
    renderStatsCard(canvas, getMonthStats(2026, 5), { theme: 'night', lang: 'ko' });
    const texts = ctx.fillText.mock.calls.map(c => String(c[0]));
    expect(texts.some(t => t.includes('5월') || t.includes('2026'))).toBe(true);
  });
});

/* ── downloadStatsCard ─────────────────────────────────── */
describe('downloadStatsCard', () => {
  it('파일명에 연-월 포함', async () => {
    const blob = new Blob(['fake'], { type: 'image/png' });
    let downloadedAs = null;
    const origCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation(tag => {
      const el = origCreate(tag);
      if (tag === 'canvas') {
        el.getContext = () => ({
          fillStyle: '', font: '', textBaseline: '', strokeStyle: '', lineWidth: 0,
          fillRect: () => {}, fillText: () => {}, beginPath: () => {},
          moveTo: () => {}, lineTo: () => {}, stroke: () => {},
          closePath: () => {}, quadraticCurveTo: () => {}, fill: () => {},
          measureText: s => ({ width: String(s).length * 14 }),
          setLineDash: () => {},
        });
        el.toBlob = cb => cb(blob);
      }
      if (tag === 'a') { el.click = () => { downloadedAs = el.download; }; }
      return el;
    });
    global.URL.createObjectURL = vi.fn(() => 'blob:test');
    global.URL.revokeObjectURL = vi.fn();

    await downloadStatsCard(getMonthStats(2026, 5), { theme: 'night' });
    expect(downloadedAs).toContain('2026-05');
    expect(downloadedAs).toContain('.png');
    vi.restoreAllMocks();
  });
});
