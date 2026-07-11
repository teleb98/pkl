import { describe, it, expect, beforeEach } from 'vitest';
import {
  getReadQueue, saveReadQueue, addToQueue, removeFromQueue, moveQueueItem,
  getBadges, awardBadge, checkAndAwardBadges, BADGE_DEFS,
  getNotificationSettings, saveNotificationSettings,
  computeReadingSpeed, estimateCompletion,
  addSession, getSessions, getBookMeta, setBookMeta,
} from '../store.js';

beforeEach(() => localStorage.clear());

/* ── 3-4: 읽기 대기열 ───────────────────────────────────── */
describe('getReadQueue', () => {
  it('빈 배열 반환 (초기 상태)', () => {
    expect(getReadQueue()).toEqual([]);
  });

  it('저장된 대기열 반환', () => {
    localStorage.setItem('pkl_read_queue', JSON.stringify([{ id: 'b1', title: '책1' }]));
    expect(getReadQueue()).toHaveLength(1);
    expect(getReadQueue()[0].title).toBe('책1');
  });

  it('잘못된 JSON → 빈 배열', () => {
    localStorage.setItem('pkl_read_queue', 'bad{');
    expect(getReadQueue()).toEqual([]);
  });
});

describe('addToQueue', () => {
  it('새 책을 대기열에 추가', () => {
    const q = addToQueue({ id: 'b1', title: '책1' });
    expect(q).toHaveLength(1);
    expect(q[0]).toMatchObject({ id: 'b1', title: '책1' });
  });

  it('이미 있는 책은 중복 추가 안 함', () => {
    addToQueue({ id: 'b1', title: '책1' });
    const q = addToQueue({ id: 'b1', title: '책1' });
    expect(q).toHaveLength(1);
  });

  it('여러 책 순서대로 추가됨', () => {
    addToQueue({ id: 'b1', title: '첫 번째' });
    addToQueue({ id: 'b2', title: '두 번째' });
    const q = getReadQueue();
    expect(q[0].title).toBe('첫 번째');
    expect(q[1].title).toBe('두 번째');
  });

  it('addedAt 타임스탬프 설정', () => {
    const q = addToQueue({ id: 'b1', title: '책' });
    expect(typeof q[0].addedAt).toBe('number');
  });
});

describe('removeFromQueue', () => {
  it('지정된 책을 대기열에서 제거', () => {
    addToQueue({ id: 'b1', title: '책1' });
    addToQueue({ id: 'b2', title: '책2' });
    const q = removeFromQueue('b1');
    expect(q).toHaveLength(1);
    expect(q[0].id).toBe('b2');
  });

  it('없는 id 제거 시 오류 없음', () => {
    addToQueue({ id: 'b1', title: '책1' });
    const q = removeFromQueue('nonexistent');
    expect(q).toHaveLength(1);
  });

  it('마지막 책 제거 후 빈 배열', () => {
    addToQueue({ id: 'b1', title: '책1' });
    expect(removeFromQueue('b1')).toEqual([]);
  });
});

describe('moveQueueItem', () => {
  beforeEach(() => {
    addToQueue({ id: 'b1', title: '첫째' });
    addToQueue({ id: 'b2', title: '둘째' });
    addToQueue({ id: 'b3', title: '셋째' });
  });

  it('위로 이동 (up)', () => {
    const q = moveQueueItem('b2', 'up');
    expect(q[0].id).toBe('b2');
    expect(q[1].id).toBe('b1');
  });

  it('아래로 이동 (down)', () => {
    const q = moveQueueItem('b2', 'down');
    expect(q[1].id).toBe('b3');
    expect(q[2].id).toBe('b2');
  });

  it('첫 번째 항목을 더 위로 이동 → 변화 없음', () => {
    const q = moveQueueItem('b1', 'up');
    expect(q[0].id).toBe('b1');
  });

  it('마지막 항목을 더 아래로 이동 → 변화 없음', () => {
    const q = moveQueueItem('b3', 'down');
    expect(q[2].id).toBe('b3');
  });
});

/* ── 3-5: 배지 ──────────────────────────────────────────── */
describe('BADGE_DEFS', () => {
  it('streak7, streak30, streak100 정의 존재', () => {
    expect(BADGE_DEFS.streak7).toBeDefined();
    expect(BADGE_DEFS.streak30).toBeDefined();
    expect(BADGE_DEFS.streak100).toBeDefined();
  });

  it('book1, book10, book50 정의 존재', () => {
    expect(BADGE_DEFS.book1).toBeDefined();
    expect(BADGE_DEFS.book10).toBeDefined();
    expect(BADGE_DEFS.book50).toBeDefined();
  });

  it('각 배지에 ko/en 레이블과 emoji 포함', () => {
    Object.values(BADGE_DEFS).forEach(def => {
      expect(def.ko).toBeTruthy();
      expect(def.en).toBeTruthy();
      expect(def.emoji).toBeTruthy();
    });
  });
});

describe('awardBadge', () => {
  it('배지 추가', () => {
    const badges = awardBadge('streak7', '7일', '🔥');
    expect(badges).toHaveLength(1);
    expect(badges[0]).toMatchObject({ id: 'streak7', emoji: '🔥' });
  });

  it('중복 배지는 추가되지 않음', () => {
    awardBadge('streak7', '7일', '🔥');
    const badges = awardBadge('streak7', '7일', '🔥');
    expect(badges).toHaveLength(1);
  });

  it('다른 배지들은 각각 추가', () => {
    awardBadge('streak7', '7일', '🔥');
    awardBadge('book1', '첫 완독', '📖');
    expect(getBadges()).toHaveLength(2);
  });

  it('earnedAt 타임스탬프 기록', () => {
    const badges = awardBadge('streak7', '7일', '🔥');
    expect(typeof badges[0].earnedAt).toBe('number');
  });
});

describe('checkAndAwardBadges', () => {
  it('streak 7 이상이면 streak7 배지 수여', () => {
    checkAndAwardBadges(7, 0);
    expect(getBadges().some(b => b.id === 'streak7')).toBe(true);
  });

  it('streak 30 이상이면 streak7+streak30 배지 수여', () => {
    checkAndAwardBadges(30, 0);
    const badges = getBadges();
    expect(badges.some(b => b.id === 'streak7')).toBe(true);
    expect(badges.some(b => b.id === 'streak30')).toBe(true);
  });

  it('totalBooks 1 이상이면 book1 배지', () => {
    checkAndAwardBadges(0, 1);
    expect(getBadges().some(b => b.id === 'book1')).toBe(true);
  });

  it('totalBooks 10 이상이면 book1+book10 배지', () => {
    checkAndAwardBadges(0, 10);
    const badges = getBadges();
    expect(badges.some(b => b.id === 'book1')).toBe(true);
    expect(badges.some(b => b.id === 'book10')).toBe(true);
  });

  it('streak 6 → 배지 없음', () => {
    checkAndAwardBadges(6, 0);
    expect(getBadges()).toHaveLength(0);
  });

  it('중복 호출해도 배지 중복 없음', () => {
    checkAndAwardBadges(7, 1);
    checkAndAwardBadges(7, 1);
    const badges = getBadges();
    const ids = badges.map(b => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

/* ── 3-2: 알림 설정 ─────────────────────────────────────── */
describe('getNotificationSettings', () => {
  it('기본값 반환 (enabled:false, time:"21:00")', () => {
    expect(getNotificationSettings()).toEqual({ enabled: false, time: '21:00' });
  });

  it('저장된 설정 반환', () => {
    localStorage.setItem('pkl_notification_settings', JSON.stringify({ enabled: true, time: '20:00' }));
    expect(getNotificationSettings()).toEqual({ enabled: true, time: '20:00' });
  });

  it('잘못된 JSON → 기본값', () => {
    localStorage.setItem('pkl_notification_settings', 'broken{');
    expect(getNotificationSettings()).toEqual({ enabled: false, time: '21:00' });
  });
});

describe('saveNotificationSettings', () => {
  it('설정 저장 후 복원', () => {
    saveNotificationSettings({ enabled: true, time: '08:30' });
    expect(getNotificationSettings()).toEqual({ enabled: true, time: '08:30' });
  });

  it('토글 저장', () => {
    saveNotificationSettings({ enabled: false, time: '21:00' });
    saveNotificationSettings({ enabled: true, time: '21:00' });
    expect(getNotificationSettings().enabled).toBe(true);
  });
});

/* ── 3-3: 독서 속도 트래커 ──────────────────────────────── */
describe('computeReadingSpeed', () => {
  it('세션 없을 때 null 반환', () => {
    expect(computeReadingSpeed()).toBeNull();
  });

  it('pages 없는 세션만 있을 때 null', () => {
    addSession({ bookId: 'b1', bookTitle: '책', minutes: 30, pages: 0 });
    expect(computeReadingSpeed()).toBeNull();
  });

  it('유효한 세션에서 속도 계산', () => {
    addSession({ bookId: 'b1', bookTitle: '책', minutes: 30, pages: 30 });
    const speed = computeReadingSpeed();
    expect(speed).not.toBeNull();
    expect(speed.pagesPerMin).toBeCloseTo(1.0);
  });

  it('복수 세션 누적 평균', () => {
    addSession({ bookId: 'b1', bookTitle: '책', minutes: 20, pages: 40 }); // 2p/min
    addSession({ bookId: 'b1', bookTitle: '책', minutes: 20, pages: 20 }); // 1p/min
    const speed = computeReadingSpeed();
    // total: 60p / 40m = 1.5p/min
    expect(speed.pagesPerMin).toBeCloseTo(1.5);
    expect(speed.sessionCount).toBe(2);
  });

  it('반환 객체에 pagesPerMin, totalMinutes, totalPages, sessionCount 포함', () => {
    addSession({ bookId: 'b1', bookTitle: '책', minutes: 10, pages: 20 });
    const speed = computeReadingSpeed();
    expect(speed).toHaveProperty('pagesPerMin');
    expect(speed).toHaveProperty('totalMinutes');
    expect(speed).toHaveProperty('totalPages');
    expect(speed).toHaveProperty('sessionCount');
  });
});

describe('estimateCompletion', () => {
  it('속도 데이터 없을 때 null', () => {
    setBookMeta('b1', { pages: 300, lastPage: 100 });
    expect(estimateCompletion('b1')).toBeNull();
  });

  it('책 메타 없을 때 null', () => {
    addSession({ bookId: 'b1', bookTitle: '책', minutes: 30, pages: 30 });
    expect(estimateCompletion('b2')).toBeNull();
  });

  it('완독 시 null (남은 페이지 없음)', () => {
    addSession({ bookId: 'b1', bookTitle: '책', minutes: 30, pages: 30 });
    setBookMeta('b1', { pages: 100, lastPage: 100 });
    expect(estimateCompletion('b1')).toBeNull();
  });

  it('정상 계산: remaining, minutesLeft, daysLeft 반환', () => {
    addSession({ bookId: 'b1', bookTitle: '책', minutes: 30, pages: 30 }); // 1p/min
    setBookMeta('b1', { pages: 200, lastPage: 100 });
    const est = estimateCompletion('b1');
    expect(est).not.toBeNull();
    expect(est.remaining).toBe(100);
    expect(est.minutesLeft).toBeGreaterThan(0);
    expect(est.daysLeft).toBeGreaterThan(0);
  });
});

/* ── round-trip: 대기열 전체 흐름 ──────────────────────── */
describe('읽기 대기열 round-trip', () => {
  it('추가 → 순서변경 → 완독 후 제거', () => {
    addToQueue({ id: 'b1', title: '책1' });
    addToQueue({ id: 'b2', title: '책2' });
    addToQueue({ id: 'b3', title: '책3' });

    expect(getReadQueue()).toHaveLength(3);

    moveQueueItem('b3', 'up'); // b3 → 2번째
    expect(getReadQueue()[1].id).toBe('b3');

    removeFromQueue('b1'); // 완독 후 제거
    expect(getReadQueue()).toHaveLength(2);
    expect(getReadQueue().some(b => b.id === 'b1')).toBe(false);
  });
});
