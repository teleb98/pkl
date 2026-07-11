import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getBookMeta, setBookMeta,
  getNotes, addNote, deleteNote,
  getHighlights, addHighlight, deleteHighlight,
  getSessions, addSession,
  getGoals, saveGoals,
  getSearchHistory, pushSearchHistory,
  getWeekStats,
} from '../store.js';

beforeEach(() => {
  localStorage.clear();
});

/* ── Book meta ───────────────────────────────────────────── */
describe('getBookMeta / setBookMeta', () => {
  it('returns empty object for unknown book', () => {
    expect(getBookMeta('missing')).toEqual({});
  });

  it('persists and retrieves meta', () => {
    setBookMeta('b1', { status: 'reading', lastPage: 42, progress: 21 });
    expect(getBookMeta('b1')).toMatchObject({ status: 'reading', lastPage: 42, progress: 21 });
  });

  it('merges patch over existing meta', () => {
    setBookMeta('b1', { status: 'reading', lastPage: 10 });
    setBookMeta('b1', { lastPage: 20, progress: 10 });
    const m = getBookMeta('b1');
    expect(m.status).toBe('reading');
    expect(m.lastPage).toBe(20);
    expect(m.progress).toBe(10);
  });

  it('does not overwrite unrelated fields', () => {
    setBookMeta('b1', { aiTitle: 'My Book', aiScanStatus: 'done' });
    setBookMeta('b1', { lastPage: 5 });
    expect(getBookMeta('b1').aiTitle).toBe('My Book');
  });

  it('isolates different book IDs', () => {
    setBookMeta('b1', { lastPage: 1 });
    setBookMeta('b2', { lastPage: 99 });
    expect(getBookMeta('b1').lastPage).toBe(1);
    expect(getBookMeta('b2').lastPage).toBe(99);
  });
});

/* ── Notes ───────────────────────────────────────────────── */
describe('notes', () => {
  it('returns empty list initially', () => {
    expect(getNotes()).toEqual([]);
  });

  it('adds a note and returns it', () => {
    const n = addNote({ bookId: 'b1', bookTitle: 'Test', text: 'hello', page: 3 });
    expect(n.text).toBe('hello');
    expect(n.bookId).toBe('b1');
    expect(n.id).toBeDefined();
    expect(getNotes()).toHaveLength(1);
  });

  it('prepends newest note', () => {
    addNote({ text: 'first' });
    addNote({ text: 'second' });
    const notes = getNotes();
    expect(notes[0].text).toBe('second');
    expect(notes[1].text).toBe('first');
  });

  it('deletes a note by id', () => {
    vi.useFakeTimers();
    const n = addNote({ text: 'to delete' });
    vi.advanceTimersByTime(1);
    addNote({ text: 'keep' });
    vi.useRealTimers();
    deleteNote(n.id);
    const notes = getNotes();
    expect(notes).toHaveLength(1);
    expect(notes[0].text).toBe('keep');
  });
});

/* ── Highlights ──────────────────────────────────────────── */
describe('highlights', () => {
  it('returns empty list initially', () => {
    expect(getHighlights()).toEqual([]);
  });

  it('adds a highlight', () => {
    const h = addHighlight({ bookId: 'b1', text: 'key phrase', color: 'yellow', page: 7 });
    expect(h.text).toBe('key phrase');
    expect(h.color).toBe('yellow');
    expect(getHighlights()).toHaveLength(1);
  });

  it('deletes a highlight by id', () => {
    vi.useFakeTimers();
    const h = addHighlight({ text: 'remove me' });
    vi.advanceTimersByTime(1);
    addHighlight({ text: 'keep me' });
    vi.useRealTimers();
    deleteHighlight(h.id);
    expect(getHighlights()).toHaveLength(1);
    expect(getHighlights()[0].text).toBe('keep me');
  });
});

/* ── Sessions ────────────────────────────────────────────── */
describe('sessions', () => {
  it('returns empty list initially', () => {
    expect(getSessions()).toEqual([]);
  });

  it('adds a session with id and date', () => {
    const s = addSession({ bookId: 'b1', bookTitle: 'Book', minutes: 30, pages: 5 });
    expect(s.minutes).toBe(30);
    expect(s.id).toBeDefined();
    expect(s.date).toBeDefined();
    expect(getSessions()).toHaveLength(1);
  });

  it('prepends newest session', () => {
    addSession({ minutes: 10 });
    addSession({ minutes: 20 });
    expect(getSessions()[0].minutes).toBe(20);
  });
});

/* ── Goals ───────────────────────────────────────────────── */
describe('goals', () => {
  it('returns defaults before any save', () => {
    const g = getGoals();
    expect(g.dailyMinutes).toBe(30);
    expect(g.dailyPages).toBe(20);
  });

  it('saves and retrieves custom goals', () => {
    saveGoals({ dailyMinutes: 60, dailyPages: 40 });
    expect(getGoals()).toEqual({ dailyMinutes: 60, dailyPages: 40 });
  });
});

/* ── Search history ──────────────────────────────────────── */
describe('search history', () => {
  it('returns empty list initially', () => {
    expect(getSearchHistory()).toEqual([]);
  });

  it('pushes a query', () => {
    pushSearchHistory('react hooks');
    expect(getSearchHistory()[0]).toBe('react hooks');
  });

  it('deduplicates and moves to front', () => {
    pushSearchHistory('a');
    pushSearchHistory('b');
    pushSearchHistory('a');
    const h = getSearchHistory();
    expect(h[0]).toBe('a');
    expect(h.filter(x => x === 'a')).toHaveLength(1);
  });

  it('ignores blank queries', () => {
    pushSearchHistory('  ');
    expect(getSearchHistory()).toHaveLength(0);
  });

  it('caps at 9 entries', () => {
    for (let i = 0; i < 12; i++) pushSearchHistory(`query${i}`);
    expect(getSearchHistory().length).toBeLessThanOrEqual(9);
  });
});

/* ── Weekly stats ────────────────────────────────────────── */
describe('getWeekStats', () => {
  it('returns zero stats with no data', () => {
    const { totalMinutes, totalPages, streak } = getWeekStats();
    expect(totalMinutes).toBe(0);
    expect(totalPages).toBe(0);
    expect(streak).toBe(0);
  });

  it('counts minutes from today', () => {
    addSession({ bookId: 'b1', bookTitle: 'B', minutes: 45, pages: 10 });
    const { totalMinutes, totalPages } = getWeekStats();
    expect(totalMinutes).toBe(45);
    expect(totalPages).toBe(10);
  });

  it('calculates streak for consecutive days', () => {
    addSession({ bookId: 'b1', bookTitle: 'B', minutes: 20, pages: 0 });
    const { streak } = getWeekStats();
    expect(streak).toBeGreaterThanOrEqual(1);
  });

  it('returns 7 weekDay entries', () => {
    const { weekDays } = getWeekStats();
    expect(weekDays).toHaveLength(7);
  });
});
