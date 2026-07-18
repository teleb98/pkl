import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithTheme } from './testUtils.jsx';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { ThemeContext } from '../context.jsx';
import { THEMES, TYPE_PAIRS } from '../data.js';

vi.mock('../utils/readingStrategy.js', () => ({ generateReadingStrategy: vi.fn() }));

import { GoalsScreen } from '../screens/GoalsScreen.jsx';
import { getReadingStrategy } from '../store.js';
import { generateReadingStrategy } from '../utils/readingStrategy.js';

const BOOK = { id: 'b1', title: '전략 테스트 책' };

const VALID_STRATEGY = {
  difficulty: '보통',
  difficultyReason: '전문 용어가 있지만 설명이 친절함',
  dailyPageTarget: 30,
  estimatedDays: 10,
  focusAreas: ['3장의 핵심 개념'],
  milestones: [{ label: '1주차', goal: '1~5장 완독' }],
};

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

describe('GoalsScreen — 독서 전략 탭', () => {
  it('현재 책이 없으면 안내 문구를 보여준다', () => {
    renderWithTheme(<GoalsScreen lang="ko" apiKeys={{ gemini: 'k' }} />);
    fireEvent.click(screen.getByText('📋 독서 전략'));
    expect(screen.getByText(/서재에서 책을 열면/)).toBeInTheDocument();
  });

  it('현재 책이 있으면 전략 생성 버튼이 보인다', () => {
    renderWithTheme(<GoalsScreen lang="ko" currentBook={BOOK} apiKeys={{ gemini: 'k' }} />);
    fireEvent.click(screen.getByText('📋 독서 전략'));
    expect(screen.getByText('📋 AI 독서 전략 생성')).toBeInTheDocument();
  });

  it('AI 키가 없으면 생성 버튼 클릭 시 에러 안내', async () => {
    renderWithTheme(<GoalsScreen lang="ko" currentBook={BOOK} apiKeys={{}} />);
    fireEvent.click(screen.getByText('📋 독서 전략'));
    fireEvent.click(screen.getByText('📋 AI 독서 전략 생성'));
    expect(await screen.findByText(/AI 키를 설정해주세요/)).toBeInTheDocument();
    expect(generateReadingStrategy).not.toHaveBeenCalled();
  });

  it('전략 생성 성공 시 난이도·목표·마일스톤을 표시하고 저장한다', async () => {
    generateReadingStrategy.mockResolvedValue(VALID_STRATEGY);
    renderWithTheme(<GoalsScreen lang="ko" currentBook={BOOK} apiKeys={{ gemini: 'k' }} />);
    fireEvent.click(screen.getByText('📋 독서 전략'));
    fireEvent.click(screen.getByText('📋 AI 독서 전략 생성'));

    expect(await screen.findByText(/난이도.*보통/)).toBeInTheDocument();
    expect(screen.getByText('30')).toBeInTheDocument(); // dailyPageTarget
    expect(screen.getByText('10')).toBeInTheDocument(); // estimatedDays
    expect(screen.getByText('3장의 핵심 개념')).toBeInTheDocument();
    expect(screen.getByText('1~5장 완독')).toBeInTheDocument();

    // 저장 확인 — store 에 반영됐는지
    await waitFor(() => expect(getReadingStrategy('b1')?.dailyPageTarget).toBe(30));
  });

  it('전체 스캔이 안 된 책이면 안내 메시지를 보여준다', async () => {
    generateReadingStrategy.mockRejectedValue(new Error('no-scanned-text'));
    renderWithTheme(<GoalsScreen lang="ko" currentBook={BOOK} apiKeys={{ gemini: 'k' }} />);
    fireEvent.click(screen.getByText('📋 독서 전략'));
    fireEvent.click(screen.getByText('📋 AI 독서 전략 생성'));
    expect(await screen.findByText(/전체를 스캔해주세요/)).toBeInTheDocument();
  });

  it('책을 바꾸면 새 책의(없는) 전략으로 초기화된다', async () => {
    generateReadingStrategy.mockResolvedValue(VALID_STRATEGY);
    const { rerender } = renderWithTheme(<GoalsScreen lang="ko" currentBook={BOOK} apiKeys={{ gemini: 'k' }} />);
    fireEvent.click(screen.getByText('📋 독서 전략'));
    fireEvent.click(screen.getByText('📋 AI 독서 전략 생성'));
    await screen.findByText(/난이도.*보통/);

    rerender(
      <GoogleOAuthProvider clientId="test-client-id">
        <ThemeContext.Provider value={{ T: THEMES.ember, F: TYPE_PAIRS.lora }}>
          <GoalsScreen lang="ko" currentBook={{ id: 'b2', title: '다른 책' }} apiKeys={{ gemini: 'k' }} />
        </ThemeContext.Provider>
      </GoogleOAuthProvider>
    );
    expect(screen.queryByText(/난이도.*보통/)).not.toBeInTheDocument();
    expect(screen.getByText('📋 AI 독서 전략 생성')).toBeInTheDocument();
  });

  it('생성 직후(당일)에는 "시작한 지 얼마 안 됐어요" 진행 상황이 표시된다', async () => {
    generateReadingStrategy.mockResolvedValue(VALID_STRATEGY);
    renderWithTheme(<GoalsScreen lang="ko" currentBook={BOOK} apiKeys={{ gemini: 'k' }} />);
    fireEvent.click(screen.getByText('📋 독서 전략'));
    fireEvent.click(screen.getByText('📋 AI 독서 전략 생성'));
    expect(await screen.findByText(/시작한 지 얼마 안 됐어요/)).toBeInTheDocument();
  });

  it('마일스톤을 클릭하면 완료 체크되고 다시 클릭하면 해제된다', async () => {
    generateReadingStrategy.mockResolvedValue(VALID_STRATEGY);
    renderWithTheme(<GoalsScreen lang="ko" currentBook={BOOK} apiKeys={{ gemini: 'k' }} />);
    fireEvent.click(screen.getByText('📋 독서 전략'));
    fireEvent.click(screen.getByText('📋 AI 독서 전략 생성'));
    await screen.findByText('1~5장 완독');

    const milestoneBtn = screen.getByText('1~5장 완독').closest('button');
    expect(milestoneBtn).toHaveTextContent('⬜️');

    fireEvent.click(milestoneBtn);
    await waitFor(() => expect(getReadingStrategy('b1')?.milestoneDone).toEqual([true]));
    expect(milestoneBtn).toHaveTextContent('✅');

    fireEvent.click(milestoneBtn);
    await waitFor(() => expect(getReadingStrategy('b1')?.milestoneDone).toEqual([false]));
  });
});
