import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithTheme } from './testUtils.jsx';

vi.mock('../utils/nextBookRecommendation.js', () => ({ recommendNextBook: vi.fn() }));
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

import { GoalsScreen } from '../screens/GoalsScreen.jsx';
import { DesktopShell } from '../screens/DesktopLayout.jsx';
import { saveBookIndex } from '../store.js';
import { recommendNextBook } from '../utils/nextBookRecommendation.js';

const REC_RESULT = [
  { book: { id: 'rec1', title: '추천 책1' }, reason: '관심사와 이어져요' },
];

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  saveBookIndex([{ id: 'rec1', title: '추천 책1' }]);
});

describe('GoalsScreen(모바일) — 다음 읽을 책 추천', () => {
  it('책이 열려있지 않으면 추천 버튼이 보인다', () => {
    renderWithTheme(<GoalsScreen lang="ko" apiKeys={{ gemini: 'k' }} />);
    fireEvent.click(screen.getByText('📋 독서 전략'));
    expect(screen.getByText('📖 다음 읽을 책 추천받기')).toBeInTheDocument();
  });

  it('AI 키 없으면 클릭 시 에러 안내', async () => {
    renderWithTheme(<GoalsScreen lang="ko" apiKeys={{}} />);
    fireEvent.click(screen.getByText('📋 독서 전략'));
    fireEvent.click(screen.getByText('📖 다음 읽을 책 추천받기'));
    expect(await screen.findByText(/AI 키를 설정해주세요/)).toBeInTheDocument();
    expect(recommendNextBook).not.toHaveBeenCalled();
  });

  it('추천 성공 시 책과 이유, 열기 버튼을 보여준다', async () => {
    recommendNextBook.mockResolvedValue(REC_RESULT);
    const onOpenBook = vi.fn();
    renderWithTheme(<GoalsScreen lang="ko" apiKeys={{ gemini: 'k' }} onOpenBook={onOpenBook} />);
    fireEvent.click(screen.getByText('📋 독서 전략'));
    fireEvent.click(screen.getByText('📖 다음 읽을 책 추천받기'));

    expect(await screen.findByText('추천 책1')).toBeInTheDocument();
    expect(screen.getByText('관심사와 이어져요')).toBeInTheDocument();
    fireEvent.click(screen.getByText('열기'));
    expect(onOpenBook).toHaveBeenCalledWith(REC_RESULT[0].book);
  });

  it('안 읽은 책이 없으면 안내 메시지', async () => {
    recommendNextBook.mockRejectedValue(new Error('no-candidates'));
    renderWithTheme(<GoalsScreen lang="ko" apiKeys={{ gemini: 'k' }} />);
    fireEvent.click(screen.getByText('📋 독서 전략'));
    fireEvent.click(screen.getByText('📖 다음 읽을 책 추천받기'));
    expect(await screen.findByText(/안 읽은 책이 서재에 없어요/)).toBeInTheDocument();
  });
});

describe('DesktopGoals(PC) — 다음 읽을 책 추천', () => {
  it('추천 성공 시 책을 보여주고 열기를 누르면 onOpenBook 이 호출된다', async () => {
    recommendNextBook.mockResolvedValue(REC_RESULT);
    const onOpenBook = vi.fn();
    renderWithTheme(
      <DesktopShell layout="pc" lang="ko" screen="goals" setScreen={() => {}} userConfig={{ apiKeys: { gemini: 'k' } }} onOpenBook={onOpenBook} />
    );
    fireEvent.click(screen.getByText('📋 독서 전략'));
    fireEvent.click(screen.getByText('📖 다음 읽을 책 추천받기'));

    expect(await screen.findByText('추천 책1')).toBeInTheDocument();
    fireEvent.click(screen.getByText('열기'));
    expect(onOpenBook).toHaveBeenCalledWith(REC_RESULT[0].book);
  });
});
