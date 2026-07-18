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
vi.mock('../utils/lifestyleSignal.js', () => ({
  computeLocalHealthInterest: vi.fn(() => ({ score: 0, label: 'none', evidence: [] })),
  fetchCookingHealthSignal: vi.fn(async () => null),
  fetchWwwHealthSignal: vi.fn(async () => null),
  combineHealthSignals: vi.fn(() => ({ score: 0, label: 'none', sources: [] })),
}));

import { GoalsScreen } from '../screens/GoalsScreen.jsx';
import { DesktopShell } from '../screens/DesktopLayout.jsx';
import { saveBookIndex } from '../store.js';
import { recommendNextBook } from '../utils/nextBookRecommendation.js';
import { combineHealthSignals } from '../utils/lifestyleSignal.js';

const REC_RESULT = {
  items: [{ book: { id: 'rec1', title: '추천 책1' }, reason: '관심사와 이어져요' }],
  path: { enough: false, coreTopics: [], emergingTopics: [] },
};
// 지식 성장 경로가 형성된 경우
const REC_RESULT_WITH_PATH = {
  items: REC_RESULT.items,
  path: { enough: true, coreTopics: [{ topic: '역사', count: 2 }], emergingTopics: ['심리학'] },
};

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
    expect(onOpenBook).toHaveBeenCalledWith(REC_RESULT.items[0].book);
  });

  it('지식 성장 경로가 있으면 추천 위에 경로 인사이트를 함께 보여준다', async () => {
    recommendNextBook.mockResolvedValue(REC_RESULT_WITH_PATH);
    renderWithTheme(<GoalsScreen lang="ko" apiKeys={{ gemini: 'k' }} />);
    fireEvent.click(screen.getByText('📋 독서 전략'));
    fireEvent.click(screen.getByText('📖 다음 읽을 책 추천받기'));

    expect(await screen.findByText('🧭 지식 성장 경로')).toBeInTheDocument();
    expect(screen.getByText(/역사/)).toBeInTheDocument();
    expect(screen.getByText(/심리학/)).toBeInTheDocument();
  });

  it('안 읽은 책이 없으면 안내 메시지', async () => {
    recommendNextBook.mockRejectedValue(new Error('no-candidates'));
    renderWithTheme(<GoalsScreen lang="ko" apiKeys={{ gemini: 'k' }} />);
    fireEvent.click(screen.getByText('📋 독서 전략'));
    fireEvent.click(screen.getByText('📖 다음 읽을 책 추천받기'));
    expect(await screen.findByText(/안 읽은 책이 서재에 없어요/)).toBeInTheDocument();
  });

  it('라이프스타일 인사이트(건강 지향)가 감지되면 추천 호출에 healthBias 로 전달된다', async () => {
    combineHealthSignals.mockReturnValue({ score: 70, label: 'high', sources: [{ key: 'cooking', score: 70 }] });
    recommendNextBook.mockResolvedValue(REC_RESULT);
    renderWithTheme(<GoalsScreen lang="ko" apiKeys={{ gemini: 'k' }} />);
    fireEvent.click(screen.getByText('📋 독서 전략'));
    await screen.findByText('뚜렷함'); // LifestyleInsight 렌더 대기(onSignal 반영 확인)

    fireEvent.click(screen.getByText('📖 다음 읽을 책 추천받기'));
    await waitFor(() => expect(recommendNextBook).toHaveBeenCalledWith(
      expect.objectContaining({ healthBias: expect.objectContaining({ label: 'high' }) }),
    ));
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
    expect(onOpenBook).toHaveBeenCalledWith(REC_RESULT.items[0].book);
  });
});
