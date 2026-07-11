import { describe, it, expect, beforeEach } from 'vitest';
import { getBookMeta, setBookMeta } from '../store.js';

/* ── Progress calculation logic ──────────────────────────── */

function calcProgress(page, total) {
  if (total <= 0) return null; // unknown total → preserve existing
  return Math.min(100, Math.round((page / total) * 100));
}

function calcStatus(progress, existingStatus) {
  if (progress === null) return 'reading';
  if (progress >= 100) return 'completed';
  return 'reading';
}

function applyAdjustPage(bookId, delta) {
  const cur = getBookMeta(bookId);
  const newPage = Math.max(1, (cur.lastPage || 0) + delta);
  const total = cur.pages || 0;
  const patch = { lastPage: newPage, status: 'reading' };
  if (total > 0) {
    patch.progress = Math.min(100, Math.round((newPage / total) * 100));
    if (patch.progress >= 100) patch.status = 'completed';
  }
  setBookMeta(bookId, patch);
}

function applySavePage(bookId, page, totalOverride) {
  if (!page || isNaN(page) || page < 1) return;
  const cur = getBookMeta(bookId);
  const total = totalOverride || cur.pages || 0;
  const patch = { lastPage: page, status: 'reading' };
  if (total > 0) {
    patch.pages = total;
    patch.progress = Math.min(100, Math.round((page / total) * 100));
    if (patch.progress >= 100) patch.status = 'completed';
  }
  setBookMeta(bookId, patch);
}

beforeEach(() => {
  localStorage.clear();
});

/* ── calcProgress helper ─────────────────────────────────── */
describe('calcProgress', () => {
  it('returns null when total is 0 (unknown)', () => {
    expect(calcProgress(10, 0)).toBeNull();
  });

  it('calculates percentage correctly', () => {
    expect(calcProgress(50, 200)).toBe(25);
    expect(calcProgress(100, 100)).toBe(100);
    expect(calcProgress(1, 3)).toBe(33);
  });

  it('caps at 100', () => {
    expect(calcProgress(150, 100)).toBe(100);
  });
});

/* ── adjustPage (via setBookMeta) ────────────────────────── */
describe('adjustPage logic', () => {
  it('increments lastPage', () => {
    setBookMeta('b1', { lastPage: 10, pages: 100 });
    applyAdjustPage('b1', +1);
    expect(getBookMeta('b1').lastPage).toBe(11);
  });

  it('decrements lastPage but not below 1', () => {
    setBookMeta('b1', { lastPage: 1, pages: 100 });
    applyAdjustPage('b1', -1);
    expect(getBookMeta('b1').lastPage).toBe(1);
  });

  it('updates progress when total is known', () => {
    setBookMeta('b1', { lastPage: 49, pages: 100 });
    applyAdjustPage('b1', +1);
    expect(getBookMeta('b1').progress).toBe(50);
  });

  it('does NOT overwrite existing progress when total is unknown', () => {
    setBookMeta('b1', { lastPage: 10, pages: 0, progress: 35 });
    applyAdjustPage('b1', +1);
    const m = getBookMeta('b1');
    expect(m.lastPage).toBe(11);
    expect(m.progress).toBe(35); // preserved
  });

  it('sets status to reading when progress < 100', () => {
    setBookMeta('b1', { lastPage: 50, pages: 200 });
    applyAdjustPage('b1', +1);
    expect(getBookMeta('b1').status).toBe('reading');
  });

  it('sets status to completed when progress reaches 100', () => {
    setBookMeta('b1', { lastPage: 199, pages: 200 });
    applyAdjustPage('b1', +1);
    const m = getBookMeta('b1');
    expect(m.status).toBe('completed');
    expect(m.progress).toBe(100);
  });
});

/* ── savePage logic ──────────────────────────────────────── */
describe('savePage logic', () => {
  it('saves lastPage and status', () => {
    applySavePage('b1', 42);
    const m = getBookMeta('b1');
    expect(m.lastPage).toBe(42);
    expect(m.status).toBe('reading');
  });

  it('calculates progress when total is provided', () => {
    applySavePage('b1', 50, 200);
    const m = getBookMeta('b1');
    expect(m.progress).toBe(25);
    expect(m.pages).toBe(200);
  });

  it('does not set progress when total is unknown', () => {
    setBookMeta('b1', { progress: 40 });
    applySavePage('b1', 55, 0);
    const m = getBookMeta('b1');
    expect(m.lastPage).toBe(55);
    expect(m.progress).toBe(40); // preserved from before
  });

  it('marks completed when page equals total', () => {
    applySavePage('b1', 300, 300);
    expect(getBookMeta('b1').status).toBe('completed');
  });

  it('uses existing pages from meta when totalOverride is 0', () => {
    setBookMeta('b1', { pages: 100 });
    applySavePage('b1', 50, 0);
    expect(getBookMeta('b1').progress).toBe(50);
  });
});

/* ── Status transitions ──────────────────────────────────── */
describe('status transitions', () => {
  it('unread → reading on first page log', () => {
    setBookMeta('b1', { status: 'unread' });
    applySavePage('b1', 1, 0);
    expect(getBookMeta('b1').status).toBe('reading');
  });

  it('reading → completed when all pages read', () => {
    setBookMeta('b1', { status: 'reading', lastPage: 299, pages: 300 });
    applyAdjustPage('b1', +1);
    expect(getBookMeta('b1').status).toBe('completed');
  });

  it('preserves completed status through metadata patches', () => {
    setBookMeta('b1', { status: 'completed', progress: 100, aiTitle: 'Done Book' });
    // Patching AI metadata should not reset status
    setBookMeta('b1', { aiScanStatus: 'done' });
    expect(getBookMeta('b1').status).toBe('completed');
  });
});
