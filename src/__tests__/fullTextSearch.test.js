import { describe, it, expect, beforeEach } from 'vitest';
import { setPageText, searchBookText, searchAllText, _resetForTesting } from '../pageTextCache.js';

describe('전문(본문) 검색 — searchBookText / searchAllText', () => {
  beforeEach(() => {
    _resetForTesting();
    setPageText('book-a', 1, 'Quantum mechanics describes the wave function.');
    setPageText('book-a', 2, 'The Schrodinger equation governs time evolution.');
    setPageText('book-b', 5, '양자역학은 파동함수로 입자를 기술한다.');
  });

  it('단일 책 본문에서 매칭 페이지+스니펫', () => {
    const hits = searchBookText('book-a', 'Schrodinger');
    expect(hits).toHaveLength(1);
    expect(hits[0].page).toBe(2);
    expect(hits[0].snippet).toContain('Schrodinger');
  });

  it('대소문자 무시', () => {
    expect(searchBookText('book-a', 'QUANTUM')).toHaveLength(1);
  });

  it('한글 본문 검색', () => {
    const hits = searchBookText('book-b', '파동함수');
    expect(hits).toHaveLength(1);
    expect(hits[0].page).toBe(5);
  });

  it('스니펫에 앞뒤 말줄임표(…)', () => {
    setPageText('long', 1, 'x'.repeat(100) + 'TARGET' + 'y'.repeat(100));
    const [h] = searchBookText('long', 'TARGET');
    expect(h.snippet.startsWith('…')).toBe(true);
    expect(h.snippet.endsWith('…')).toBe(true);
    expect(h.snippet).toContain('TARGET');
  });

  it('매칭 없으면 빈 배열', () => {
    expect(searchBookText('book-a', 'zzzznotfound')).toEqual([]);
  });

  it('빈 쿼리는 빈 배열', () => {
    expect(searchBookText('book-a', '  ')).toEqual([]);
    expect(searchAllText('')).toEqual([]);
  });

  it('searchAllText: 모든 책 횡단 + bookId 포함', () => {
    const all = searchAllText('a'); // 여러 책에 'a' 포함
    expect(all.length).toBeGreaterThan(0);
    expect(all[0]).toHaveProperty('bookId');
    expect(all[0]).toHaveProperty('page');
    expect(all[0]).toHaveProperty('snippet');
  });

  it('maxHits 제한', () => {
    setPageText('many', 1, 'a a a a a a a a a a');
    // 한 페이지엔 첫 매칭만(페이지 단위) → maxPerBook은 페이지 수 제한
    const hits = searchBookText('many', 'a', 1);
    expect(hits.length).toBeLessThanOrEqual(1);
  });
});
