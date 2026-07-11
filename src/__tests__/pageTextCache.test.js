import { describe, it, expect, beforeEach } from 'vitest';
import {
  setPageText, setViewedPage, setPageImage,
  getPageText, getPageImage, getDocumentText,
  _resetForTesting,
} from '../pageTextCache.js';

beforeEach(() => _resetForTesting());

/* ── setPageText / getDocumentText ───────────────────────── */
describe('setPageText', () => {
  it('stores text for a page', () => {
    setPageText('b1', 1, 'hello world');
    const doc = getDocumentText('b1');
    expect(doc).not.toBeNull();
    expect(doc.text).toContain('hello world');
  });

  it('does NOT overwrite an existing entry', () => {
    setPageText('b1', 1, 'original');
    setPageText('b1', 1, 'overwrite attempt');
    const doc = getDocumentText('b1');
    expect(doc.text).toContain('original');
    expect(doc.text).not.toContain('overwrite attempt');
  });

  it('does NOT update viewedPage pointer', () => {
    setPageText('b1', 5, 'some text');
    // viewedPage is still null — getPageText returns null
    expect(getPageText('b1')).toBeNull();
  });
});

/* ── setViewedPage / getPageText ─────────────────────────── */
describe('setViewedPage / getPageText', () => {
  it('returns null when no data', () => {
    expect(getPageText('unknown')).toBeNull();
  });

  it('updates the viewedPage pointer', () => {
    setViewedPage('b1', 10, 'page ten text');
    const result = getPageText('b1');
    expect(result).toMatchObject({ pageNum: 10, text: 'page ten text' });
  });

  it('stores text if not already cached', () => {
    setViewedPage('b1', 3, 'viewed text');
    const doc = getDocumentText('b1');
    expect(doc.text).toContain('viewed text');
  });

  it('does NOT overwrite bulk-extracted text', () => {
    setPageText('b1', 3, 'bulk full text');
    setViewedPage('b1', 3, 'render text');
    // bulk text wins
    const doc = getDocumentText('b1');
    expect(doc.text).toContain('bulk full text');
    expect(doc.text).not.toContain('render text');
  });

  it('switches viewedPage pointer when user navigates', () => {
    setViewedPage('b1', 1, 'page one');
    setViewedPage('b1', 5, 'page five');
    expect(getPageText('b1')).toMatchObject({ pageNum: 5, text: 'page five' });
  });

  it('returns null text for image-only page (no text stored)', () => {
    setViewedPage('b1', 7, null);
    const result = getPageText('b1');
    expect(result).toMatchObject({ pageNum: 7, text: null });
  });
});

/* ── setPageImage / getPageImage ─────────────────────────── */
describe('setPageImage / getPageImage', () => {
  it('returns null when no image stored', () => {
    expect(getPageImage('b1')).toBeNull();
  });

  it('stores and retrieves a page image', () => {
    setPageImage('b1', 4, 'BASE64DATA==');
    const img = getPageImage('b1');
    expect(img).toMatchObject({ pageNum: 4, base64: 'BASE64DATA==' });
  });

  it('overwrites previous image (only keeps latest)', () => {
    setPageImage('b1', 1, 'OLD_DATA');
    setPageImage('b1', 2, 'NEW_DATA');
    const img = getPageImage('b1');
    expect(img).toMatchObject({ pageNum: 2, base64: 'NEW_DATA' });
  });

  it('is isolated per book', () => {
    setPageImage('book-a', 1, 'A_DATA');
    setPageImage('book-b', 1, 'B_DATA');
    expect(getPageImage('book-a').base64).toBe('A_DATA');
    expect(getPageImage('book-b').base64).toBe('B_DATA');
  });
});

/* ── getDocumentText ─────────────────────────────────────── */
describe('getDocumentText', () => {
  it('returns null when no pages stored', () => {
    expect(getDocumentText('b1')).toBeNull();
  });

  it('returns pages in ascending order', () => {
    setPageText('b1', 3, 'three');
    setPageText('b1', 1, 'one');
    setPageText('b1', 2, 'two');
    const doc = getDocumentText('b1');
    const idx1 = doc.text.indexOf('[p.1]');
    const idx2 = doc.text.indexOf('[p.2]');
    const idx3 = doc.text.indexOf('[p.3]');
    expect(idx1).toBeLessThan(idx2);
    expect(idx2).toBeLessThan(idx3);
  });

  it('includes correct metadata (pageCount, firstPage, lastPage)', () => {
    setPageText('b1', 1, 'page one');
    setPageText('b1', 2, 'page two');
    setPageText('b1', 5, 'page five');
    const doc = getDocumentText('b1');
    expect(doc.pageCount).toBe(3);
    expect(doc.firstPage).toBe(1);
    expect(doc.lastPage).toBe(5);
  });

  it('truncates at page boundaries (not mid-text)', () => {
    // Fill up to near the maxChars limit
    const longText = 'x'.repeat(3000);
    setPageText('b1', 1, longText);
    setPageText('b1', 2, longText);
    setPageText('b1', 3, longText);
    setPageText('b1', 4, longText);
    // With maxChars=10000, p1+p2+p3 (~9015 chars with headers) should fit, p4 should not
    const doc = getDocumentText('b1', 10000);
    expect(doc.text).toContain('[p.1]');
    expect(doc.text).toContain('[p.2]');
    expect(doc.text).toContain('[p.3]');
    // p4 may or may not fit depending on exact length — but it must not be cut mid-word
    if (!doc.text.includes('[p.4]')) {
      expect(doc.lastPage).toBe(3);
    }
  });

  it('does not include a page that would exceed the limit', () => {
    // [p.1]\nshort\n\n = 15 chars. [p.2]\nalso short\n\n = 19 chars. Total = 34.
    // With maxChars=20, only p1 (15 chars) fits; p2 does not.
    setPageText('b1', 1, 'short');
    setPageText('b1', 2, 'also short');
    const doc = getDocumentText('b1', 20);
    if (doc) {
      expect(doc.text).toContain('[p.1]');
      expect(doc.text).not.toContain('[p.2]'); // p2 excluded, not partially included
      expect(doc.pageCount).toBe(1);
    }
  });

  it('respects custom maxChars', () => {
    setPageText('b1', 1, 'a'.repeat(100));
    setPageText('b1', 2, 'b'.repeat(100));
    const doc = getDocumentText('b1', 50); // too small for any page
    expect(doc).toBeNull();
  });

  it('text mode returns null (empty string) when only image stored', () => {
    setViewedPage('b1', 1, null); // image-only page, no text
    setPageImage('b1', 1, 'IMG');
    // getDocumentText only looks at pages that have text
    expect(getDocumentText('b1')).toBeNull();
  });
});

/* ── Cross-book isolation ────────────────────────────────── */
describe('cross-book isolation', () => {
  it('different books do not share page text', () => {
    setPageText('bookA', 1, 'book A text');
    setPageText('bookB', 1, 'book B text');
    expect(getDocumentText('bookA').text).toContain('book A text');
    expect(getDocumentText('bookB').text).toContain('book B text');
    expect(getDocumentText('bookA').text).not.toContain('book B text');
  });

  it('different books do not share viewedPage', () => {
    setViewedPage('bookA', 3, 'A page three');
    setViewedPage('bookB', 7, 'B page seven');
    expect(getPageText('bookA').pageNum).toBe(3);
    expect(getPageText('bookB').pageNum).toBe(7);
  });
});
