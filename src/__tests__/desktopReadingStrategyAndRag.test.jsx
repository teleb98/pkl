import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithTheme } from './testUtils.jsx';

vi.mock('../utils/readingStrategy.js', () => ({ generateReadingStrategy: vi.fn() }));
vi.mock('../utils/ragIndex.js', () => ({
  queryBookIndex: vi.fn(async () => []),
  formatRagContext: vi.fn(() => ''),
}));
vi.mock('../utils/ragSearch.js', () => ({
  semanticSearchAll: vi.fn(async () => []),
  formatLibraryContext: vi.fn(() => ''),
  listIndexedBooks: vi.fn(async () => []),
}));
vi.mock('../utils/ensureBookText.js', () => ({ ensureBookText: vi.fn(async () => {}) }));

import { DesktopShell } from '../screens/DesktopLayout.jsx';
import { getReadingStrategy, saveBookIndex } from '../store.js';
import { generateReadingStrategy } from '../utils/readingStrategy.js';
import { semanticSearchAll } from '../utils/ragSearch.js';
import { queryBookIndex } from '../utils/ragIndex.js';

const CURRENT = { id: 'd-book-1', title: '데스크톱 전략 테스트 책' };
const OTHER = { id: 'd-book-2', title: '이전에 읽은 책' };

const VALID_STRATEGY = {
  difficulty: '보통',
  difficultyReason: '적당히 어려움',
  dailyPageTarget: 40,
  estimatedDays: 8,
  focusAreas: ['2장 핵심 논지'],
  milestones: [{ label: '1주차', goal: '전반부 완독' }],
};

function renderShell(screen_, extra = {}) {
  return renderWithTheme(
    <DesktopShell
      layout="pc"
      lang="ko"
      screen={screen_}
      setScreen={() => {}}
      userConfig={{ apiKeys: { gemini: 'k' } }}
      currentBook={CURRENT}
      {...extra}
    />
  );
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  saveBookIndex([CURRENT, OTHER]);
  global.fetch = vi.fn(async () => ({
    ok: true,
    json: async () => ({ candidates: [{ content: { parts: [{ text: 'AI 응답' }] } }] }),
  }));
});

describe('DesktopGoals — 독서 전략 탭 (PC)', () => {
  it('전략 탭 버튼이 보이고, 클릭하면 생성 버튼이 나온다', () => {
    renderShell('goals');
    fireEvent.click(screen.getByText('📋 독서 전략'));
    expect(screen.getByText('📋 AI 독서 전략 생성')).toBeInTheDocument();
  });

  it('전략 생성 성공 시 결과를 표시하고 저장한다', async () => {
    generateReadingStrategy.mockResolvedValue(VALID_STRATEGY);
    renderShell('goals');
    fireEvent.click(screen.getByText('📋 독서 전략'));
    fireEvent.click(screen.getByText('📋 AI 독서 전략 생성'));

    expect(await screen.findByText(/난이도.*보통/)).toBeInTheDocument();
    expect(screen.getByText('40')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();
    await waitFor(() => expect(getReadingStrategy('d-book-1')?.dailyPageTarget).toBe(40));
  });

  it('전체 스캔 안 된 책이면 안내 메시지', async () => {
    generateReadingStrategy.mockRejectedValue(new Error('no-scanned-text'));
    renderShell('goals');
    fireEvent.click(screen.getByText('📋 독서 전략'));
    fireEvent.click(screen.getByText('📋 AI 독서 전략 생성'));
    expect(await screen.findByText(/전체를 스캔해주세요/)).toBeInTheDocument();
  });
});

describe('DesktopAI — 서재 전체 참고 토글 (PC)', () => {
  it('기본은 꺼짐이고, 켜면 현재 책을 제외한 다른 책들로 검색한다', async () => {
    renderShell('ai');
    expect(screen.getByText('꺼짐')).toBeInTheDocument();
    fireEvent.click(screen.getByText('서재 전체 참고'));
    expect(screen.getByText('켜짐')).toBeInTheDocument();

    const input = screen.getByPlaceholderText(/./);
    fireEvent.change(input, { target: { value: '질문입니다' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(semanticSearchAll).toHaveBeenCalled());
    const [, opts] = semanticSearchAll.mock.calls[0];
    expect(opts.bookIds).toEqual(['d-book-2']);
  });

  it('꺼짐 상태에서는 현재 책 RAG만 조회하고 서재 전체 검색은 안 한다', async () => {
    renderShell('ai');
    const input = screen.getByPlaceholderText(/./);
    fireEvent.change(input, { target: { value: '질문입니다' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(queryBookIndex).toHaveBeenCalled());
    expect(semanticSearchAll).not.toHaveBeenCalled();
  });
});
