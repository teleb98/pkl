import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithTheme } from './testUtils.jsx';
import { PlanSheet } from '../components/PlanSheet.jsx';

describe('PlanSheet', () => {
  it('무료/Pro 요금제와 가격을 비교로 보여준다', () => {
    renderWithTheme(<PlanSheet lang="ko" userConfig={{}} onUpdateConfig={() => {}} onClose={() => {}} />);
    expect(screen.getByText('Free')).toBeInTheDocument();
    expect(screen.getAllByText('서재 Pro').length).toBeGreaterThan(0);
    expect(screen.getByText('무료')).toBeInTheDocument();
    expect(screen.getAllByText(/4,900/).length).toBeGreaterThan(0);
    expect(screen.getByText(/현재/)).toBeInTheDocument(); // free 가 현재 플랜
  });

  it('출시 알림 신청 → proWaitlistAt 저장 + 확인 메시지', () => {
    const onUpdateConfig = vi.fn();
    renderWithTheme(<PlanSheet lang="ko" userConfig={{}} onUpdateConfig={onUpdateConfig} onClose={() => {}} />);

    fireEvent.click(screen.getByText(/출시 알림 신청/));
    expect(onUpdateConfig).toHaveBeenCalledWith(expect.objectContaining({ proWaitlistAt: expect.any(Number) }));
    expect(screen.getByText(/출시 알림을 신청했어요/)).toBeInTheDocument();
  });

  it('이미 대기자면 확인 메시지로 시작한다', () => {
    renderWithTheme(<PlanSheet lang="ko" userConfig={{ proWaitlistAt: Date.now() }} onUpdateConfig={() => {}} onClose={() => {}} />);
    expect(screen.getByText(/출시 알림을 신청했어요/)).toBeInTheDocument();
    expect(screen.queryByText(/출시 알림 신청/)).toBeNull();
  });

  it('결제는 준비 중임을 명시한다', () => {
    renderWithTheme(<PlanSheet lang="ko" userConfig={{}} onUpdateConfig={() => {}} onClose={() => {}} />);
    expect(screen.getByText(/카드 결제는 준비 중/)).toBeInTheDocument();
  });
});
