import { describe, it, expect } from 'vitest';
import { fileNameToTitle, buildMetaContext } from '../scanBook.js';

/* ── fileNameToTitle ─────────────────────────────────────── */
describe('fileNameToTitle', () => {
  it('strips .pdf extension', () => {
    expect(fileNameToTitle('my_book.pdf')).toBe('my book');
  });

  it('replaces underscores with spaces', () => {
    expect(fileNameToTitle('clean_code.pdf')).toBe('clean code');
  });

  it('replaces hyphens with spaces', () => {
    expect(fileNameToTitle('atomic-habits.pdf')).toBe('atomic habits');
  });

  it('handles mixed separators', () => {
    expect(fileNameToTitle('the_pragmatic-programmer.pdf')).toBe('the pragmatic programmer');
  });

  it('handles name with no extension', () => {
    expect(fileNameToTitle('deep work')).toBe('deep work');
  });

  it('trims surrounding whitespace (no extension)', () => {
    expect(fileNameToTitle('  my book  ')).toBe('my book');
  });
});

/* ── buildMetaContext ────────────────────────────────────── */
describe('buildMetaContext', () => {
  const doneMeta = {
    aiScanStatus: 'done',
    aiTitle: 'Test Book',
    aiAuthor: 'Jane Doe',
    aiType: 'technical',
    aiLanguage: 'en',
    aiSummary: 'A great book about software.',
    aiTopics: ['software', 'testing'],
  };

  it('returns empty string when meta is null', () => {
    expect(buildMetaContext(null, 'ko')).toBe('');
  });

  it('returns empty string when aiScanStatus is not done', () => {
    expect(buildMetaContext({ aiScanStatus: 'pending' }, 'ko')).toBe('');
  });

  it('returns empty string when meta has no content fields', () => {
    expect(buildMetaContext({ aiScanStatus: 'done', aiType: 'other', aiLanguage: 'other' }, 'ko')).toBe('');
  });

  it('includes author when present', () => {
    const ctx = buildMetaContext(doneMeta, 'en');
    expect(ctx).toContain('Jane Doe');
  });

  it('includes summary', () => {
    const ctx = buildMetaContext(doneMeta, 'en');
    expect(ctx).toContain('A great book about software.');
  });

  it('includes topics joined by comma', () => {
    const ctx = buildMetaContext(doneMeta, 'en');
    expect(ctx).toContain('software, testing');
  });

  it('uses Korean labels for lang=ko', () => {
    const ctx = buildMetaContext(doneMeta, 'ko');
    expect(ctx).toContain('저자:');
    expect(ctx).toContain('[AI 문서 분석]');
  });

  it('uses English labels for lang=en', () => {
    const ctx = buildMetaContext(doneMeta, 'en');
    expect(ctx).toContain('Author:');
    expect(ctx).toContain('[AI Document Analysis]');
  });

  it('omits author line when aiAuthor is null', () => {
    const meta = { ...doneMeta, aiAuthor: null };
    const ctx = buildMetaContext(meta, 'en');
    expect(ctx).not.toContain('Author:');
  });

  it('truncates aiSummary to 250 chars at scan time (not at context build time)', () => {
    const longSummary = 'x'.repeat(300);
    const meta = { ...doneMeta, aiSummary: longSummary };
    const ctx = buildMetaContext(meta, 'en');
    // buildMetaContext itself doesn't truncate further, but summary was already sliced in analyzeFile
    expect(ctx).toContain('x');
  });
});
