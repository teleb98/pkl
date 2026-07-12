import { describe, it, expect, beforeEach, vi } from 'vitest';

/* ────────────────────────────────────────────────────────────────
   독서 알림 실제 스케줄링 — 설정만 있고 실제로 안 울리던 기능을 고정.
   shouldFireReminder: 순수 판정 로직. checkAndFireReminder: 실제 발행+dedupe.
   ─────────────────────────────────────────────────────────────── */

import { saveNotificationSettings } from '../store.js';
import { shouldFireReminder, checkAndFireReminder, getLastFiredDate } from '../utils/readingReminder.js';

function at(dateStr, hhmm) {
  return new Date(`${dateStr}T${hhmm}:00`);
}

beforeEach(() => {
  localStorage.clear();
  delete globalThis.Notification;
});

describe('shouldFireReminder — 순수 판정', () => {
  it('비활성화면 false', () => {
    expect(shouldFireReminder(at('2026-07-12', '22:00'), { enabled: false, time: '21:00' }, null)).toBe(false);
  });

  it('설정 시각 이전이면 false', () => {
    expect(shouldFireReminder(at('2026-07-12', '20:59'), { enabled: true, time: '21:00' }, null)).toBe(false);
  });

  it('설정 시각 이후면 true (오늘 미발행)', () => {
    expect(shouldFireReminder(at('2026-07-12', '21:00'), { enabled: true, time: '21:00' }, null)).toBe(true);
    expect(shouldFireReminder(at('2026-07-12', '23:59'), { enabled: true, time: '21:00' }, null)).toBe(true);
  });

  it('오늘 이미 발행됐으면 false (하루 1회 제한)', () => {
    expect(shouldFireReminder(at('2026-07-12', '22:00'), { enabled: true, time: '21:00' }, '2026-07-12')).toBe(false);
  });

  it('어제 발행됐고 오늘이면 다시 true', () => {
    expect(shouldFireReminder(at('2026-07-12', '21:30'), { enabled: true, time: '21:00' }, '2026-07-11')).toBe(true);
  });

  it('time 형식이 잘못되면 false (크래시 방지)', () => {
    expect(shouldFireReminder(at('2026-07-12', '22:00'), { enabled: true, time: 'bad' }, null)).toBe(false);
  });

  it('설정 자체가 없으면 false', () => {
    expect(shouldFireReminder(new Date(), null, null)).toBe(false);
  });
});

describe('checkAndFireReminder — 실제 발행 + dedupe', () => {
  it('Notification 미지원 환경 → false, 에러 없음', () => {
    expect(checkAndFireReminder(at('2026-07-12', '22:00'))).toBe(false);
  });

  it('권한 없으면 발행 안 함', () => {
    globalThis.Notification = vi.fn();
    globalThis.Notification.permission = 'default';
    saveNotificationSettings({ enabled: true, time: '21:00' });
    expect(checkAndFireReminder(at('2026-07-12', '22:00'))).toBe(false);
    expect(globalThis.Notification).not.toHaveBeenCalled();
  });

  it('권한 허용 + 시각 지남 → Notification 생성, 발행일 기록', () => {
    globalThis.Notification = vi.fn();
    globalThis.Notification.permission = 'granted';
    saveNotificationSettings({ enabled: true, time: '21:00' });

    const fired = checkAndFireReminder(at('2026-07-12', '21:05'));
    expect(fired).toBe(true);
    expect(globalThis.Notification).toHaveBeenCalledTimes(1);
    expect(globalThis.Notification.mock.calls[0][0]).toBe('PKL');
    expect(getLastFiredDate()).toBe('2026-07-12');
  });

  it('같은 날 두 번 호출해도 한 번만 발행', () => {
    globalThis.Notification = vi.fn();
    globalThis.Notification.permission = 'granted';
    saveNotificationSettings({ enabled: true, time: '21:00' });

    checkAndFireReminder(at('2026-07-12', '21:05'));
    const secondFired = checkAndFireReminder(at('2026-07-12', '23:00'));
    expect(secondFired).toBe(false);
    expect(globalThis.Notification).toHaveBeenCalledTimes(1);
  });

  it('Notification 생성자가 던져도 크래시 없이 발행일은 기록됨', () => {
    globalThis.Notification = vi.fn(() => { throw new Error('permission revoked mid-flight'); });
    globalThis.Notification.permission = 'granted';
    saveNotificationSettings({ enabled: true, time: '21:00' });
    expect(() => checkAndFireReminder(at('2026-07-12', '21:05'))).not.toThrow();
    expect(getLastFiredDate()).toBe('2026-07-12');
  });
});
