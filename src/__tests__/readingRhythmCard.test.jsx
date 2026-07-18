import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithTheme } from './testUtils.jsx';

vi.mock('../store.js', () => ({ getSessions: vi.fn() }));

import { ReadingRhythmCard } from '../components/ReadingRhythmCard.jsx';
import { getSessions } from '../store.js';

// 특정 로컬 시각의 세션 헬퍼
function at(y, mo, d, h, min = 30) {
  return { date: new Date(y, mo - 1, d, h, 0, 0).toISOString(), minutes: min };
}

beforeEach(() => vi.clearAllMocks());

describe('ReadingRhythmCard', () => {
  it('세션이 부족하면(리듬 판단 불가) 아무것도 렌더링하지 않는다', () => {
    getSessions.mockReturnValue([at(2026, 7, 1, 21)]);
    const { container } = renderWithTheme(<ReadingRhythmCard lang="ko" currentTime="09:00" onApplyTime={() => {}} />);
    expect(container.textContent).toBe('');
  });

  it('리듬이 충분하면 주 시간대/스타일 인사이트를 보여준다', () => {
    getSessions.mockReturnValue([at(2026, 7, 1, 21, 60), at(2026, 7, 2, 21, 55), at(2026, 7, 3, 21, 50)]);
    renderWithTheme(<ReadingRhythmCard lang="ko" currentTime="09:00" onApplyTime={() => {}} />);
    expect(screen.getByText('⏰ 독서 리듬')).toBeInTheDocument();
    expect(screen.getByText('주로 저녁에')).toBeInTheDocument();
    expect(screen.getByText(/길게 몰입/)).toBeInTheDocument();
  });

  it('추천 시각이 현재 알림 시각과 다르면 버튼을 눌러 onApplyTime 을 호출한다', () => {
    getSessions.mockReturnValue([at(2026, 7, 1, 21), at(2026, 7, 2, 21), at(2026, 7, 3, 21)]);
    const onApplyTime = vi.fn();
    renderWithTheme(<ReadingRhythmCard lang="ko" currentTime="09:00" onApplyTime={onApplyTime} />);
    const btn = screen.getByText('🔔 21:00에 알림 맞추기');
    fireEvent.click(btn);
    expect(onApplyTime).toHaveBeenCalledWith('21:00');
  });

  it('추천 시각이 현재 알림 시각과 같으면 버튼을 숨긴다', () => {
    getSessions.mockReturnValue([at(2026, 7, 1, 21), at(2026, 7, 2, 21), at(2026, 7, 3, 21)]);
    renderWithTheme(<ReadingRhythmCard lang="ko" currentTime="21:00" onApplyTime={() => {}} />);
    expect(screen.queryByText(/알림 맞추기/)).toBeNull();
  });
});
