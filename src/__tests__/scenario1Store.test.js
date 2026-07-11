import { describe, it, expect, beforeEach } from 'vitest';
import {
  getBookmarks, toggleBookmark, isBookmarked,
  getReaderSettings, saveReaderSettings,
} from '../store.js';

beforeEach(() => localStorage.clear());

/* ── getBookmarks ────────────────────────────────────────── */
describe('getBookmarks', () => {
  it('returns empty array when no bookmarks', () => {
    expect(getBookmarks('b1')).toEqual([]);
  });

  it('returns saved bookmark array', () => {
    localStorage.setItem('pkl_bookmarks_b1', JSON.stringify([3, 7, 15]));
    expect(getBookmarks('b1')).toEqual([3, 7, 15]);
  });

  it('returns empty array on invalid JSON', () => {
    localStorage.setItem('pkl_bookmarks_b1', 'invalid{');
    expect(getBookmarks('b1')).toEqual([]);
  });

  it('is isolated per book', () => {
    localStorage.setItem('pkl_bookmarks_bookA', JSON.stringify([1]));
    expect(getBookmarks('bookB')).toEqual([]);
    expect(getBookmarks('bookA')).toEqual([1]);
  });
});

/* ── toggleBookmark ──────────────────────────────────────── */
describe('toggleBookmark', () => {
  it('adds page when not bookmarked', () => {
    const result = toggleBookmark('b1', 10);
    expect(result).toContain(10);
  });

  it('removes page when already bookmarked', () => {
    toggleBookmark('b1', 10);
    const result = toggleBookmark('b1', 10);
    expect(result).not.toContain(10);
  });

  it('stores multiple bookmarks in sorted order', () => {
    toggleBookmark('b1', 15);
    toggleBookmark('b1', 3);
    toggleBookmark('b1', 8);
    expect(getBookmarks('b1')).toEqual([3, 8, 15]);
  });

  it('persists after toggle', () => {
    toggleBookmark('b1', 5);
    expect(getBookmarks('b1')).toContain(5);
  });

  it('removes only the target page, preserving others', () => {
    toggleBookmark('b1', 3);
    toggleBookmark('b1', 7);
    toggleBookmark('b1', 7); // remove 7
    expect(getBookmarks('b1')).toEqual([3]);
    expect(getBookmarks('b1')).not.toContain(7);
  });

  it('returns updated array after add', () => {
    const result = toggleBookmark('b1', 42);
    expect(Array.isArray(result)).toBe(true);
    expect(result).toContain(42);
  });

  it('returns updated array after remove', () => {
    toggleBookmark('b1', 42);
    const result = toggleBookmark('b1', 42);
    expect(Array.isArray(result)).toBe(true);
    expect(result).not.toContain(42);
  });

  it('is isolated per book', () => {
    toggleBookmark('bookA', 5);
    toggleBookmark('bookB', 10);
    expect(getBookmarks('bookA')).toEqual([5]);
    expect(getBookmarks('bookB')).toEqual([10]);
  });
});

/* ── isBookmarked ────────────────────────────────────────── */
describe('isBookmarked', () => {
  it('returns false when no bookmarks', () => {
    expect(isBookmarked('b1', 5)).toBe(false);
  });

  it('returns true after bookmarking', () => {
    toggleBookmark('b1', 5);
    expect(isBookmarked('b1', 5)).toBe(true);
  });

  it('returns false after un-bookmarking', () => {
    toggleBookmark('b1', 5);
    toggleBookmark('b1', 5);
    expect(isBookmarked('b1', 5)).toBe(false);
  });

  it('returns false for a non-bookmarked page', () => {
    toggleBookmark('b1', 3);
    expect(isBookmarked('b1', 7)).toBe(false);
  });
});

/* ── getReaderSettings ───────────────────────────────────── */
describe('getReaderSettings', () => {
  it('returns default { bg: "white", zoom: 1 } when nothing saved', () => {
    expect(getReaderSettings()).toEqual({ bg: 'white', zoom: 1 });
  });

  it('returns saved settings', () => {
    localStorage.setItem('pkl_reader_settings', JSON.stringify({ bg: 'sepia', zoom: 1.25 }));
    expect(getReaderSettings()).toEqual({ bg: 'sepia', zoom: 1.25 });
  });

  it('returns defaults on invalid JSON', () => {
    localStorage.setItem('pkl_reader_settings', '???invalid');
    expect(getReaderSettings()).toEqual({ bg: 'white', zoom: 1 });
  });
});

/* ── saveReaderSettings ──────────────────────────────────── */
describe('saveReaderSettings', () => {
  it('persists bg and zoom', () => {
    saveReaderSettings({ bg: 'dark', zoom: 1.5 });
    expect(getReaderSettings()).toEqual({ bg: 'dark', zoom: 1.5 });
  });

  it('can switch bg from sepia to dark', () => {
    saveReaderSettings({ bg: 'sepia', zoom: 1 });
    saveReaderSettings({ bg: 'dark', zoom: 1 });
    expect(getReaderSettings().bg).toBe('dark');
  });

  it('preserves all fields when updating one', () => {
    saveReaderSettings({ bg: 'sepia', zoom: 1.25 });
    expect(getReaderSettings()).toMatchObject({ bg: 'sepia', zoom: 1.25 });
  });

  it('round-trip: save → clear → restore defaults', () => {
    saveReaderSettings({ bg: 'dark', zoom: 0.75 });
    localStorage.removeItem('pkl_reader_settings');
    expect(getReaderSettings()).toEqual({ bg: 'white', zoom: 1 });
  });
});
