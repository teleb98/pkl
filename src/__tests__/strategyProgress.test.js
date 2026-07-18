import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  saveReadingStrategy, getReadingStrategy, updateReadingStrategy,
  toggleStrategyMilestone, getStrategyProgress, setBookMeta,
} from '../store.js';

const STRATEGY = {
  difficulty: '보통', difficultyReason: '이유',
  dailyPageTarget: 20, estimatedDays: 10,
  focusAreas: ['영역1'],
  milestones: [{ label: '1주차', goal: '목표1' }, { label: '2주차', goal: '목표2' }],
};

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-07-01T00:00:00.000Z'));
});
afterEach(() => vi.useRealTimers());

describe('saveReadingStrategy — 진행률 기준점 고정', () => {
  it('현재 lastPage/pages 를 startingPage/totalPages 로 스탬프한다', () => {
    setBookMeta('b1', { lastPage: 15, pages: 300 });
    const saved = saveReadingStrategy('b1', STRATEGY);
    expect(saved.startingPage).toBe(15);
    expect(saved.totalPages).toBe(300);
    expect(saved.generatedAt).toBe(Date.now());
  });

  it('책 메타가 없으면 startingPage 0, totalPages null', () => {
    const saved = saveReadingStrategy('b2', STRATEGY);
    expect(saved.startingPage).toBe(0);
    expect(saved.totalPages).toBeNull();
  });

  it('milestoneDone 배열을 milestones 개수만큼 false 로 초기화', () => {
    const saved = saveReadingStrategy('b3', STRATEGY);
    expect(saved.milestoneDone).toEqual([false, false]);
  });
});

describe('updateReadingStrategy / toggleStrategyMilestone', () => {
  it('부분 갱신은 generatedAt/startingPage 를 건드리지 않는다', () => {
    setBookMeta('b4', { lastPage: 10, pages: 200 });
    const saved = saveReadingStrategy('b4', STRATEGY);
    vi.setSystemTime(new Date('2026-07-05T00:00:00.000Z')); // 시간 경과
    updateReadingStrategy('b4', { milestoneDone: [true, false] });
    const after = getReadingStrategy('b4');
    expect(after.generatedAt).toBe(saved.generatedAt);
    expect(after.startingPage).toBe(10);
    expect(after.milestoneDone).toEqual([true, false]);
  });

  it('toggleStrategyMilestone 은 해당 인덱스만 뒤집는다', () => {
    saveReadingStrategy('b5', STRATEGY);
    toggleStrategyMilestone('b5', 1);
    expect(getReadingStrategy('b5').milestoneDone).toEqual([false, true]);
    toggleStrategyMilestone('b5', 1);
    expect(getReadingStrategy('b5').milestoneDone).toEqual([false, false]);
  });

  it('전략이 없으면 null 반환하고 크래시하지 않는다', () => {
    expect(updateReadingStrategy('none', { x: 1 })).toBeNull();
    expect(toggleStrategyMilestone('none', 0)).toBeNull();
  });
});

describe('getStrategyProgress', () => {
  it('전략이 없으면 null', () => {
    expect(getStrategyProgress('none')).toBeNull();
  });

  it('생성 당일(daysElapsed=0)은 justStarted', () => {
    setBookMeta('b6', { lastPage: 0, pages: 300 });
    saveReadingStrategy('b6', STRATEGY);
    const p = getStrategyProgress('b6');
    expect(p.daysElapsed).toBe(0);
    expect(p.status).toBe('justStarted');
  });

  it('목표 페이스대로 읽으면 onTrack', () => {
    setBookMeta('b7', { lastPage: 0, pages: 300 });
    saveReadingStrategy('b7', STRATEGY); // dailyPageTarget=20
    vi.setSystemTime(new Date('2026-07-04T00:00:00.000Z')); // 3일 경과
    setBookMeta('b7', { lastPage: 60 }); // 정확히 3*20=60p
    const p = getStrategyProgress('b7');
    expect(p.daysElapsed).toBe(3);
    expect(p.pagesRead).toBe(60);
    expect(p.expectedPages).toBe(60);
    expect(p.status).toBe('onTrack');
  });

  it('하루치 이상 앞서 있으면 ahead', () => {
    setBookMeta('b8', { lastPage: 0, pages: 300 });
    saveReadingStrategy('b8', STRATEGY);
    vi.setSystemTime(new Date('2026-07-03T00:00:00.000Z')); // 2일 경과, 기대 40p
    setBookMeta('b8', { lastPage: 90 }); // 하루치(20p) 이상 초과 달성
    expect(getStrategyProgress('b8').status).toBe('ahead');
  });

  it('하루치 이상 뒤처지면 behind', () => {
    setBookMeta('b9', { lastPage: 0, pages: 300 });
    saveReadingStrategy('b9', STRATEGY);
    vi.setSystemTime(new Date('2026-07-04T00:00:00.000Z')); // 3일 경과, 기대 60p
    setBookMeta('b9', { lastPage: 10 }); // 하루치 이상 미달
    expect(getStrategyProgress('b9').status).toBe('behind');
  });

  it('남은 페이지·목표 페이스 기준 예상 잔여일을 계산한다', () => {
    setBookMeta('b10', { lastPage: 100, pages: 300 });
    saveReadingStrategy('b10', STRATEGY); // target 20p/day, 남은 200p
    const p = getStrategyProgress('b10');
    expect(p.remainingPages).toBe(200);
    expect(p.projectedDaysLeft).toBe(10);
  });

  it('milestoneDone 을 그대로 전달한다', () => {
    setBookMeta('b11', { lastPage: 0, pages: 100 });
    saveReadingStrategy('b11', STRATEGY);
    toggleStrategyMilestone('b11', 0);
    expect(getStrategyProgress('b11').milestoneDone).toEqual([true, false]);
  });
});
