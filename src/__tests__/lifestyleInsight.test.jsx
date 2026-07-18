import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithTheme } from './testUtils.jsx';

vi.mock('../utils/lifestyleSignal.js', () => ({
  computeLocalHealthInterest: vi.fn(),
  fetchCookingHealthSignal: vi.fn(),
  fetchWwwHealthSignal: vi.fn(),
  combineHealthSignals: vi.fn(),
}));

import { LifestyleInsight } from '../components/LifestyleInsight.jsx';
import {
  computeLocalHealthInterest, fetchCookingHealthSignal, fetchWwwHealthSignal, combineHealthSignals,
} from '../utils/lifestyleSignal.js';

beforeEach(() => vi.clearAllMocks());

describe('LifestyleInsight', () => {
  it('종합 신호가 none 이면 아무것도 렌더링하지 않는다', async () => {
    computeLocalHealthInterest.mockReturnValue({ score: 0, label: 'none', evidence: [] });
    fetchCookingHealthSignal.mockResolvedValue(null);
    fetchWwwHealthSignal.mockResolvedValue(null);
    combineHealthSignals.mockReturnValue({ score: 0, label: 'none', sources: [] });

    const onSignal = vi.fn();
    const { container } = renderWithTheme(<LifestyleInsight lang="ko" onSignal={onSignal} />);
    await waitFor(() => expect(onSignal).toHaveBeenCalled());
    expect(container.textContent).toBe('');
  });

  it('종합 신호가 있으면 라벨과 소스별 배지를 렌더링하고 onSignal 을 호출한다', async () => {
    computeLocalHealthInterest.mockReturnValue({ score: 60, label: 'medium', evidence: ['건강한 삶'] });
    fetchCookingHealthSignal.mockResolvedValue({ score: 40, label: 'medium', evidence: [] });
    fetchWwwHealthSignal.mockResolvedValue(null);
    combineHealthSignals.mockReturnValue({
      score: 50, label: 'high',
      sources: [{ key: 'pkl', score: 60 }, { key: 'cooking', score: 40 }],
    });

    const onSignal = vi.fn();
    renderWithTheme(<LifestyleInsight lang="ko" onSignal={onSignal} />);

    expect(await screen.findByText('뚜렷함')).toBeInTheDocument();
    expect(screen.getByText('서재 60%')).toBeInTheDocument();
    expect(screen.getByText('부엌 40%')).toBeInTheDocument();
    expect(onSignal).toHaveBeenCalledWith(expect.objectContaining({ label: 'high' }));
  });

  it('cooking/www 신호 조회가 실패해도(null) pkl 로컬 신호만으로 렌더링한다', async () => {
    computeLocalHealthInterest.mockReturnValue({ score: 80, label: 'high', evidence: [] });
    fetchCookingHealthSignal.mockResolvedValue(null);
    fetchWwwHealthSignal.mockResolvedValue(null);
    combineHealthSignals.mockReturnValue({ score: 80, label: 'high', sources: [{ key: 'pkl', score: 80 }] });

    renderWithTheme(<LifestyleInsight lang="ko" onSignal={() => {}} />);
    expect(await screen.findByText('서재 80%')).toBeInTheDocument();
  });
});
