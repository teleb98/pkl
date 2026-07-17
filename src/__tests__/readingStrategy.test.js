import { describe, it, expect, vi, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';

vi.mock('../aiClient.js', () => ({ callAI: vi.fn() }));

import { saveBookText } from '../utils/bookTextDb.js';
import { callAI } from '../aiClient.js';
import { sampleBookText, generateReadingStrategy } from '../utils/readingStrategy.js';

const VALID_JSON = JSON.stringify({
  difficulty: '보통',
  difficultyReason: '전문 용어가 있지만 설명이 친절함',
  dailyPageTarget: 25,
  estimatedDays: 12,
  focusAreas: ['3장의 핵심 개념', '저자의 반론 부분'],
  milestones: [{ label: '1주차', goal: '1~5장 완독' }],
});

beforeEach(() => vi.clearAllMocks());

describe('sampleBookText', () => {
  it('페이지가 없으면 빈 문자열 셋을 반환', () => {
    expect(sampleBookText({})).toEqual({ beginning: '', middle: '', end: '' });
    expect(sampleBookText(undefined)).toEqual({ beginning: '', middle: '', end: '' });
  });

  it('초·중·후반 페이지를 페이지 번호 순으로 뽑는다', () => {
    const pages = { 1: 'A', 5: 'B', 10: 'C', 15: 'D', 20: 'E' };
    const s = sampleBookText(pages);
    expect(s.beginning).toBe('A');
    expect(s.end).toBe('E');
    expect(['B', 'C']).toContain(s.middle); // 중앙 인덱스 반올림 허용
  });

  it('페이지가 1개뿐이면 세 구간 모두 그 페이지를 쓴다', () => {
    const s = sampleBookText({ 7: '유일한 페이지' });
    expect(s).toEqual({ beginning: '유일한 페이지', middle: '유일한 페이지', end: '유일한 페이지' });
  });
});

describe('generateReadingStrategy', () => {
  it('전체 스캔 텍스트가 없으면 no-scanned-text 에러', async () => {
    await expect(generateReadingStrategy({ id: 'no-scan' }, { apiKeys: { gemini: 'k' } }))
      .rejects.toThrow('no-scanned-text');
    expect(callAI).not.toHaveBeenCalled();
  });

  it('정상 응답을 파싱해 전략 객체로 반환', async () => {
    await saveBookText('book-1', { pages: { 1: '서론', 50: '본론', 100: '결론' }, totalPages: 100, scannedPages: 3, done: true });
    callAI.mockResolvedValue(VALID_JSON);
    const strategy = await generateReadingStrategy({ id: 'book-1', title: '테스트북' }, { lang: 'ko', apiKeys: { gemini: 'k' }, remainingPages: 300 });
    expect(strategy.dailyPageTarget).toBe(25);
    expect(strategy.estimatedDays).toBe(12);
    expect(strategy.focusAreas).toHaveLength(2);
    expect(strategy.milestones[0]).toMatchObject({ label: '1주차' });
  });

  it('AI가 코드펜스로 감싼 JSON도 파싱한다', async () => {
    await saveBookText('book-2', { pages: { 1: '내용' }, totalPages: 10, scannedPages: 1, done: false });
    callAI.mockResolvedValue('```json\n' + VALID_JSON + '\n```');
    const strategy = await generateReadingStrategy({ id: 'book-2' }, { apiKeys: { claude: 'k' } });
    expect(strategy.dailyPageTarget).toBe(25);
  });

  it('필수 필드(dailyPageTarget/estimatedDays) 없는 응답은 에러', async () => {
    await saveBookText('book-3', { pages: { 1: '내용' }, totalPages: 10, scannedPages: 1, done: false });
    callAI.mockResolvedValue('{"difficulty":"쉬움"}');
    await expect(generateReadingStrategy({ id: 'book-3' }, { apiKeys: { gemini: 'k' } }))
      .rejects.toThrow('invalid-ai-response');
  });

  it('JSON 이 아예 없는 응답은 에러', async () => {
    await saveBookText('book-4', { pages: { 1: '내용' }, totalPages: 10, scannedPages: 1, done: false });
    callAI.mockResolvedValue('죄송하지만 답변할 수 없습니다');
    await expect(generateReadingStrategy({ id: 'book-4' }, { apiKeys: { gemini: 'k' } }))
      .rejects.toThrow('invalid-ai-response');
  });

  it('AI 키가 없으면 callAI 가 no-key 에러를 던지고 그대로 전파', async () => {
    await saveBookText('book-5', { pages: { 1: '내용' }, totalPages: 10, scannedPages: 1, done: false });
    callAI.mockRejectedValue(new Error('no-key'));
    await expect(generateReadingStrategy({ id: 'book-5' }, { apiKeys: {} }))
      .rejects.toThrow('no-key');
  });
});
