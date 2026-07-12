import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

/* ────────────────────────────────────────────────────────────────
   자동 진행률 동기화 스케줄러 — 세션 종료(즉시) / 페이지 이동(디바운스)
   양쪽에서 공유하는 단일 트리거. 짧은 간격의 반복 호출을 디바운스로
   합치는지, 설정이 꺼져 있으면 아무 일도 안 하는지 검증.
   ─────────────────────────────────────────────────────────────── */

vi.mock('../utils/progressSync.js', () => ({
  syncProgressWithDrive: vi.fn(async () => ({ pulled: 1, total: 5 })),
}));
vi.mock('../utils/librarySync.js', () => ({
  syncLibraryDataWithDrive: vi.fn(async () => ({ collections: 1, vocabulary: 2 })),
}));

import { saveBackupSettings, getProgressSyncLog } from '../store.js';
import { syncProgressWithDrive } from '../utils/progressSync.js';
import { syncLibraryDataWithDrive } from '../utils/librarySync.js';
import { scheduleProgressAutoSync, cancelScheduledProgressAutoSync } from '../utils/autoProgressSync.js';

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  vi.useFakeTimers();
});
afterEach(() => {
  cancelScheduledProgressAutoSync();
  vi.useRealTimers();
});

describe('scheduleProgressAutoSync', () => {
  it('autoProgressSync 꺼짐 → 아무 것도 실행 안 함', async () => {
    saveBackupSettings({ autoProgressSync: false, writeToken: 'TOKEN' });
    scheduleProgressAutoSync(1000);
    await vi.advanceTimersByTimeAsync(5000);
    expect(syncProgressWithDrive).not.toHaveBeenCalled();
  });

  it('토큰 없음 → 아무 것도 실행 안 함', async () => {
    saveBackupSettings({ autoProgressSync: true, writeToken: null });
    scheduleProgressAutoSync(1000);
    await vi.advanceTimersByTimeAsync(5000);
    expect(syncProgressWithDrive).not.toHaveBeenCalled();
  });

  it('켜져 있고 토큰 있으면 delay 후 실행, 진행률+라이브러리 둘 다 동기화', async () => {
    saveBackupSettings({ autoProgressSync: true, writeToken: 'TOKEN' });
    scheduleProgressAutoSync(1000);
    await vi.advanceTimersByTimeAsync(1000);
    expect(syncProgressWithDrive).toHaveBeenCalledWith('TOKEN');
    expect(syncLibraryDataWithDrive).toHaveBeenCalledWith('TOKEN');
  });

  it('delay 전에 여러 번 호출하면 마지막 호출 기준으로 한 번만 실행(디바운스)', async () => {
    saveBackupSettings({ autoProgressSync: true, writeToken: 'TOKEN' });
    scheduleProgressAutoSync(1000);
    await vi.advanceTimersByTimeAsync(500);
    scheduleProgressAutoSync(1000); // 재예약 — 타이머 리셋
    await vi.advanceTimersByTimeAsync(500);
    expect(syncProgressWithDrive).not.toHaveBeenCalled(); // 아직 1000ms 안 지남(리셋됐으므로)
    await vi.advanceTimersByTimeAsync(500);
    expect(syncProgressWithDrive).toHaveBeenCalledTimes(1);
  });

  it('delay=0 이면 즉시(다음 틱) 실행 — 세션 종료용', async () => {
    saveBackupSettings({ autoProgressSync: true, writeToken: 'TOKEN' });
    scheduleProgressAutoSync(0);
    await vi.advanceTimersByTimeAsync(0);
    expect(syncProgressWithDrive).toHaveBeenCalledTimes(1);
  });

  it('성공 시 진행률 동기화 로그에 auto:true 로 기록', async () => {
    saveBackupSettings({ autoProgressSync: true, writeToken: 'TOKEN' });
    scheduleProgressAutoSync(0);
    await vi.advanceTimersByTimeAsync(0);
    const log = getProgressSyncLog();
    expect(log[0]).toMatchObject({ status: 'ok', pulled: 1, total: 5, auto: true });
  });

  it('실패해도 크래시 없이 에러 로그만 남김', async () => {
    syncProgressWithDrive.mockRejectedValueOnce(new Error('network down'));
    saveBackupSettings({ autoProgressSync: true, writeToken: 'TOKEN' });
    scheduleProgressAutoSync(0);
    await vi.advanceTimersByTimeAsync(0);
    const log = getProgressSyncLog();
    expect(log[0]).toMatchObject({ status: 'error', error: 'network down', auto: true });
  });

  it('라이브러리 동기화만 실패해도 진행률 동기화는 ok 로 기록(부가 기능 실패 격리)', async () => {
    syncLibraryDataWithDrive.mockRejectedValueOnce(new Error('library sync failed'));
    saveBackupSettings({ autoProgressSync: true, writeToken: 'TOKEN' });
    scheduleProgressAutoSync(0);
    await vi.advanceTimersByTimeAsync(0);
    const log = getProgressSyncLog();
    expect(log[0].status).toBe('ok');
  });
});
