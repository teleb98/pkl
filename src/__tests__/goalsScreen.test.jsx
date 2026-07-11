import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithTheme } from './testUtils.jsx';
import { GoalsScreen } from '../screens/GoalsScreen.jsx';
import { addSession, saveGoals } from '../store.js';

const FIXED_NOW = new Date('2026-05-27T10:00:00.000Z');
const BOOK = { id: 'b1', title: '테스트 책', webViewLink: 'https://drive.google.com/file/d/b1/view' };

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('GoalsScreen — 기본 렌더링', () => {
  it('오늘 달성률 섹션이 표시된다', () => {
    renderWithTheme(<GoalsScreen lang="ko" />);
    expect(screen.getByText('오늘 달성률')).toBeInTheDocument();
  });

  it('이번 주 차트 섹션이 표시된다', () => {
    renderWithTheme(<GoalsScreen lang="ko" />);
    expect(screen.getByText('이번 주')).toBeInTheDocument();
  });

  it('월간 달력이 표시된다', () => {
    renderWithTheme(<GoalsScreen lang="ko" />);
    const monthName = FIXED_NOW.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long' });
    expect(screen.getByText(monthName)).toBeInTheDocument();
  });

  it('영문 lang으로도 렌더링된다', () => {
    renderWithTheme(<GoalsScreen lang="en" />);
    expect(screen.getByText("Today's Progress")).toBeInTheDocument();
    expect(screen.getByText('This Week')).toBeInTheDocument();
  });
});

describe('GoalsScreen — 책 없을 때', () => {
  it('"서재에서 책을 선택" 안내가 표시된다', () => {
    renderWithTheme(<GoalsScreen lang="ko" />);
    expect(screen.getByText('서재에서 책을 선택한 뒤 시작하세요')).toBeInTheDocument();
  });

  it('독서 시작 버튼이 없다', () => {
    renderWithTheme(<GoalsScreen lang="ko" />);
    expect(screen.queryByText('독서 시작')).not.toBeInTheDocument();
  });
});

describe('GoalsScreen — 책 있을 때', () => {
  it('현재 책 제목이 표시된다', () => {
    renderWithTheme(<GoalsScreen lang="ko" currentBook={BOOK} />);
    expect(screen.getAllByText('테스트 책').length).toBeGreaterThan(0);
  });

  it('독서 시작 버튼이 표시된다', () => {
    renderWithTheme(<GoalsScreen lang="ko" currentBook={BOOK} />);
    expect(screen.getByText('독서 시작')).toBeInTheDocument();
  });

  it('세션 시작 시 타이머 화면으로 전환된다', () => {
    renderWithTheme(<GoalsScreen lang="ko" currentBook={BOOK} />);
    fireEvent.click(screen.getByText('독서 시작'));
    expect(screen.getByText('세션 진행 중')).toBeInTheDocument();
    expect(screen.getByText('00:00')).toBeInTheDocument();
  });

  it('세션 취소 시 설정 화면으로 돌아온다', () => {
    renderWithTheme(<GoalsScreen lang="ko" currentBook={BOOK} />);
    fireEvent.click(screen.getByText('독서 시작'));
    fireEvent.click(screen.getByText('취소'));
    expect(screen.getByText('오늘 달성률')).toBeInTheDocument();
  });
});

describe('GoalsScreen — 오늘 달성률', () => {
  it('독서 기록이 없으면 "아직 기록 없음"이 표시된다', () => {
    renderWithTheme(<GoalsScreen lang="ko" />);
    expect(screen.getByText('아직 기록 없음')).toBeInTheDocument();
  });

  it('오늘 독서 기록이 있으면 독서 시간 레이블이 표시된다', () => {
    addSession({ bookId: 'b1', bookTitle: '테스트', minutes: 25, pages: 10 });
    renderWithTheme(<GoalsScreen lang="ko" />);
    expect(screen.getByText('독서 시간')).toBeInTheDocument();
    expect(screen.getByText('읽은 페이지')).toBeInTheDocument();
  });

  it('목표를 달성하면 "목표 달성" 배지가 표시된다', () => {
    saveGoals({ dailyMinutes: 20, dailyPages: 10 });
    vi.advanceTimersByTime(1);
    addSession({ bookId: 'b1', bookTitle: '테스트', minutes: 25, pages: 15 });
    renderWithTheme(<GoalsScreen lang="ko" />);
    expect(screen.getByText('목표 달성')).toBeInTheDocument();
  });
});

describe('GoalsScreen — 목표 설정', () => {
  it('시간 목표 버튼들이 표시된다 (15, 30, 60)', () => {
    renderWithTheme(<GoalsScreen lang="ko" />);
    // 달력 날짜와 겹칠 수 있으므로 getAllByText 사용
    expect(screen.getAllByText('15').length).toBeGreaterThan(0);
    expect(screen.getAllByText('30').length).toBeGreaterThan(0);
    expect(screen.getAllByText('60').length).toBeGreaterThan(0);
  });

  it('페이지 목표 버튼들이 표시된다 (10, 20, 30)', () => {
    renderWithTheme(<GoalsScreen lang="ko" />);
    expect(screen.getAllByText('10').length).toBeGreaterThan(0);
    expect(screen.getAllByText('20').length).toBeGreaterThan(0);
  });

  it('시간 목표 레이블 "시간"이 표시된다', () => {
    renderWithTheme(<GoalsScreen lang="ko" />);
    expect(screen.getByText('시간')).toBeInTheDocument();
  });

  it('페이지 목표 레이블 "페이지"가 표시된다', () => {
    renderWithTheme(<GoalsScreen lang="ko" />);
    // 여러 "페이지" 텍스트가 있을 수 있음
    expect(screen.getAllByText('페이지').length).toBeGreaterThan(0);
  });
});

describe('GoalsScreen — 주간 차트', () => {
  it('이번 주 독서 기록이 없으면 안내 텍스트가 표시된다', () => {
    renderWithTheme(<GoalsScreen lang="ko" />);
    expect(screen.getByText('이번 주 독서 기록이 없어요')).toBeInTheDocument();
  });

  it('독서 기록이 있으면 통계가 표시된다', () => {
    addSession({ bookId: 'b1', bookTitle: '테스트', minutes: 45, pages: 20 });
    renderWithTheme(<GoalsScreen lang="ko" />);
    expect(screen.getByText('45m')).toBeInTheDocument();
    expect(screen.getByText('총 시간')).toBeInTheDocument();
  });
});
