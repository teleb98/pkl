import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithTheme } from './testUtils.jsx';

vi.mock('../utils/monthlyRetro.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, generateMonthlyRetro: vi.fn() };
});
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

import { AIChatScreen } from '../screens/AIChatScreen.jsx';
import { DesktopShell } from '../screens/DesktopLayout.jsx';
import { addSession } from '../store.js';
import { generateMonthlyRetro } from '../utils/monthlyRetro.js';

const CURRENT = { id: 'book-1', title: '지금 읽는 책' };

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  addSession({ bookId: 'book-1', bookTitle: '지금 읽는 책', minutes: 60, pages: 20 });
  addSession({ bookId: 'book-2', bookTitle: '이전 책', minutes: 40, pages: 15 });
});

describe('AIChatScreen(모바일) — 종합 회고 탭', () => {
  it('회고 탭 클릭 시 최근 읽은 책 후보가 체크리스트로 보인다', () => {
    renderWithTheme(<AIChatScreen lang="ko" apiKeys={{ gemini: 'k' }} currentBook={CURRENT} />);
    fireEvent.click(screen.getByText('📚 종합 회고'));
    expect(screen.getAllByText('지금 읽는 책').length).toBeGreaterThan(0); // 인사말에도 같은 제목이 등장
    expect(screen.getByText('이전 책')).toBeInTheDocument();
  });

  it('회고 생성 클릭 시 선택된 책들로 AI 를 호출하고 결과를 표시한다', async () => {
    generateMonthlyRetro.mockResolvedValue('## 공통 주제\n둘 다 성장에 관한 책입니다.');
    renderWithTheme(<AIChatScreen lang="ko" apiKeys={{ gemini: 'k' }} currentBook={CURRENT} />);
    fireEvent.click(screen.getByText('📚 종합 회고'));
    fireEvent.click(screen.getByText('2권 종합 회고 시작'));

    expect(await screen.findByText(/둘 다 성장에 관한 책입니다/)).toBeInTheDocument();
    expect(generateMonthlyRetro).toHaveBeenCalledTimes(1);
    const [books] = generateMonthlyRetro.mock.calls[0];
    expect(books.map(b => b.bookId).sort()).toEqual(['book-1', 'book-2']);
  });

  it('체크 해제하면 선택 책 수가 줄고 버튼 라벨도 바뀐다', () => {
    renderWithTheme(<AIChatScreen lang="ko" apiKeys={{ gemini: 'k' }} currentBook={CURRENT} />);
    fireEvent.click(screen.getByText('📚 종합 회고'));
    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[0]);
    expect(screen.getByText('1권 종합 회고 시작')).toBeInTheDocument();
  });

  it('읽은 기록이 없으면 안내 메시지를 보여준다', () => {
    localStorage.clear();
    renderWithTheme(<AIChatScreen lang="ko" apiKeys={{ gemini: 'k' }} currentBook={CURRENT} />);
    fireEvent.click(screen.getByText('📚 종합 회고'));
    expect(screen.getByText(/읽은 기록이 없어요/)).toBeInTheDocument();
  });
});

describe('DesktopAI(PC) — 종합 회고 탭', () => {
  it('회고 탭이 렌더되고 생성 시 AI 를 호출한다', async () => {
    generateMonthlyRetro.mockResolvedValue('# 데스크톱 회고 결과');
    renderWithTheme(
      <DesktopShell layout="pc" lang="ko" screen="ai" setScreen={() => {}} userConfig={{ apiKeys: { gemini: 'k' } }} currentBook={CURRENT} />
    );
    fireEvent.click(screen.getByText('📚 종합 회고'));
    fireEvent.click(screen.getByText('2권 종합 회고 시작'));
    expect(await screen.findByText(/데스크톱 회고 결과/)).toBeInTheDocument();
  });
});
