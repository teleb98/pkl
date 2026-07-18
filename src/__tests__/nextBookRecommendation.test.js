import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../aiClient.js', () => ({ callAI: vi.fn() }));

import { saveBookIndex, setBookMeta } from '../store.js';
import { callAI } from '../aiClient.js';
import { getUnreadCandidates, recommendNextBook } from '../utils/nextBookRecommendation.js';

const BOOKS = [
  { id: 'unread1', title: '안 읽은 책1' },
  { id: 'unread2', title: '안 읽은 책2' },
  { id: 'reading', title: '읽는 중인 책' },
  { id: 'done', title: '완독한 책' },
];

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  saveBookIndex(BOOKS);
  setBookMeta('reading', { lastPage: 50 });
  setBookMeta('done', { status: 'done' });
});

describe('getUnreadCandidates', () => {
  it('진행 없고 완독 아닌 책만 반환한다', () => {
    const ids = getUnreadCandidates().map(b => b.id).sort();
    expect(ids).toEqual(['unread1', 'unread2']);
  });

  it('progress>=100 도 완독으로 취급해 제외한다', () => {
    setBookMeta('unread1', { progress: 100 });
    const ids = getUnreadCandidates().map(b => b.id);
    expect(ids).not.toContain('unread1');
  });
});

describe('recommendNextBook', () => {
  it('안 읽은 책이 없으면 no-candidates 에러', async () => {
    saveBookIndex([{ id: 'done1', title: '완독' }]);
    setBookMeta('done1', { status: 'done' });
    await expect(recommendNextBook({ apiKeys: { gemini: 'k' } })).rejects.toThrow('no-candidates');
    expect(callAI).not.toHaveBeenCalled();
  });

  it('AI 응답을 인덱스로 후보와 매칭해 반환한다', async () => {
    callAI.mockResolvedValue('[{"index": 2, "reason": "관심사와 잘 맞아요"}]');
    const result = await recommendNextBook({ lang: 'ko', apiKeys: { gemini: 'k' } });
    expect(result).toHaveLength(1);
    expect(result[0].book.title).toBe('안 읽은 책2');
    expect(result[0].reason).toBe('관심사와 잘 맞아요');
  });

  it('여러 권 추천도 순서대로 매칭한다', async () => {
    callAI.mockResolvedValue('[{"index": 1, "reason": "이유1"}, {"index": 2, "reason": "이유2"}]');
    const result = await recommendNextBook({ apiKeys: { gemini: 'k' } });
    expect(result.map(r => r.book.id)).toEqual(['unread1', 'unread2']);
  });

  it('코드펜스로 감싼 JSON 도 파싱한다', async () => {
    callAI.mockResolvedValue('```json\n[{"index": 1, "reason": "이유"}]\n```');
    const result = await recommendNextBook({ apiKeys: { gemini: 'k' } });
    expect(result[0].book.id).toBe('unread1');
  });

  it('범위 밖 인덱스는 무시하고, 유효한 항목만 남긴다', async () => {
    callAI.mockResolvedValue('[{"index": 99, "reason": "무효"}, {"index": 1, "reason": "유효"}]');
    const result = await recommendNextBook({ apiKeys: { gemini: 'k' } });
    expect(result).toHaveLength(1);
    expect(result[0].book.id).toBe('unread1');
  });

  it('JSON 이 아예 없는 응답이나 전부 무효한 인덱스는 에러', async () => {
    callAI.mockResolvedValue('추천할 수 없습니다');
    await expect(recommendNextBook({ apiKeys: { gemini: 'k' } })).rejects.toThrow('invalid-ai-response');

    callAI.mockResolvedValue('[{"index": 99, "reason": "x"}]');
    await expect(recommendNextBook({ apiKeys: { gemini: 'k' } })).rejects.toThrow('invalid-ai-response');
  });

  it('AI 호출 실패는 그대로 전파', async () => {
    callAI.mockRejectedValue(new Error('no-key'));
    await expect(recommendNextBook({ apiKeys: {} })).rejects.toThrow('no-key');
  });
});
