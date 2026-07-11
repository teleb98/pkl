import { describe, it, expect, vi, beforeEach } from 'vitest';
import { showToast, showError, subscribeToast } from '../utils/toast.js';

describe('toast — pub/sub 전역 알림', () => {
  let received;
  let unsub;
  beforeEach(() => { received = []; unsub?.(); unsub = subscribeToast((t) => received.push(t)); });

  it('showToast가 구독자에게 전달', () => {
    showToast('hello');
    expect(received).toHaveLength(1);
    expect(received[0].message).toBe('hello');
    expect(received[0].type).toBe('info');
  });

  it('type/duration 옵션 반영', () => {
    showToast('done', { type: 'success', duration: 1000 });
    expect(received[0].type).toBe('success');
    expect(received[0].duration).toBe(1000);
  });

  it('error 기본 duration이 더 김(5000)', () => {
    showToast('boom', { type: 'error' });
    expect(received[0].duration).toBe(5000);
  });

  it('showError가 재시도 액션 포함', () => {
    const retry = vi.fn();
    showError('fail', retry, '다시');
    const t = received[0];
    expect(t.type).toBe('error');
    expect(t.actionLabel).toBe('다시');
    t.onAction();
    expect(retry).toHaveBeenCalled();
  });

  it('showError onRetry 없으면 액션 라벨 없음', () => {
    showError('fail');
    expect(received[0].actionLabel).toBeUndefined();
  });

  it('각 토스트 고유 id', () => {
    showToast('a'); showToast('b');
    expect(received[0].id).not.toBe(received[1].id);
  });

  it('구독 해제 후 미수신', () => {
    unsub();
    showToast('after-unsub');
    expect(received).toHaveLength(0);
  });
});
