import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../aiClient.js', () => ({ callAI: vi.fn() }));

import { addSession, setBookMeta, addNote } from '../store.js';
import { callAI } from '../aiClient.js';
import { getRetroCandidates, generateMonthlyRetro } from '../utils/monthlyRetro.js';

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-07-15T00:00:00.000Z'));
});

describe('getRetroCandidates', () => {
  it('세션이 없으면 빈 배열', () => {
    expect(getRetroCandidates(30)).toEqual([]);
  });

  it('기간 내 세션이 있는 책들을 읽은 시간 합산해 반환', () => {
    addSession({ bookId: 'b1', bookTitle: '책1', minutes: 30, pages: 10 });
    addSession({ bookId: 'b1', bookTitle: '책1', minutes: 20, pages: 5 });
    addSession({ bookId: 'b2', bookTitle: '책2', minutes: 45, pages: 8 });
    const candidates = getRetroCandidates(30);
    expect(candidates).toHaveLength(2);
    const b1 = candidates.find(c => c.bookId === 'b1');
    expect(b1.minutes).toBe(50);
    expect(b1.pages).toBe(15);
  });

  it('읽은 시간이 많은 순으로 정렬한다', () => {
    addSession({ bookId: 'short', bookTitle: '짧게', minutes: 10, pages: 1 });
    addSession({ bookId: 'long', bookTitle: '길게', minutes: 100, pages: 1 });
    const candidates = getRetroCandidates(30);
    expect(candidates.map(c => c.bookId)).toEqual(['long', 'short']);
  });

  it('기간(periodDays) 밖의 세션은 제외한다', () => {
    vi.setSystemTime(new Date('2026-06-01T00:00:00.000Z'));
    addSession({ bookId: 'old', bookTitle: '오래된 책', minutes: 30, pages: 5 });
    vi.setSystemTime(new Date('2026-07-15T00:00:00.000Z'));
    addSession({ bookId: 'recent', bookTitle: '최근 책', minutes: 20, pages: 5 });
    const candidates = getRetroCandidates(7);
    expect(candidates.map(c => c.bookId)).toEqual(['recent']);
  });

  it('bookId 없는 세션(예: 목표 없이 읽기 중 미지정)은 무시한다', () => {
    addSession({ bookId: '', bookTitle: '', minutes: 10, pages: 0 });
    expect(getRetroCandidates(30)).toEqual([]);
  });
});

describe('generateMonthlyRetro', () => {
  it('책 목록이 비었으면 no-books 에러', async () => {
    await expect(generateMonthlyRetro([], { apiKeys: { gemini: 'k' } })).rejects.toThrow('no-books');
    expect(callAI).not.toHaveBeenCalled();
  });

  it('책 메타·메모·하이라이트를 포함해 AI를 호출하고 결과를 그대로 반환', async () => {
    setBookMeta('b1', { aiAuthor: '저자1', aiSummary: '요약1', aiTopics: ['주제A'] });
    addNote({ bookId: 'b1', text: '메모1', page: 1 });
    callAI.mockResolvedValue('# 회고 결과');
    const result = await generateMonthlyRetro(
      [{ bookId: 'b1', bookTitle: '책1' }],
      { lang: 'ko', apiKeys: { gemini: 'k' } },
    );
    expect(result).toBe('# 회고 결과');
    expect(callAI).toHaveBeenCalledTimes(1);
    const [apiKeys, prompt] = callAI.mock.calls[0];
    expect(apiKeys).toEqual({ gemini: 'k' });
    expect(prompt).toContain('책1');
    expect(prompt).toContain('저자1');
    expect(prompt).toContain('주제A');
  });

  it('책이 MAX_BOOKS(6권)를 넘으면 앞에서부터 잘라 프롬프트에 포함한다', async () => {
    callAI.mockResolvedValue('ok');
    const books = Array.from({ length: 8 }, (_, i) => ({ bookId: `b${i}`, bookTitle: `책${i}` }));
    await generateMonthlyRetro(books, { apiKeys: { gemini: 'k' } });
    const [, prompt] = callAI.mock.calls[0];
    expect(prompt).toContain('책5');
    expect(prompt).not.toContain('책6');
  });

  it('AI 호출 실패는 그대로 전파된다', async () => {
    callAI.mockRejectedValue(new Error('no-key'));
    await expect(generateMonthlyRetro([{ bookId: 'b1', bookTitle: '책1' }], { apiKeys: {} }))
      .rejects.toThrow('no-key');
  });
});
