import { describe, it, expect } from 'vitest';
import { computeReadingRhythm, slotLabel, styleLabel } from '../utils/readingRhythm.js';

// 특정 로컬 시각/요일의 ISO 문자열 생성 헬퍼
function at(y, mo, d, h, min = 30) {
  return { date: new Date(y, mo - 1, d, h, 0, 0).toISOString(), minutes: min };
}

describe('computeReadingRhythm', () => {
  it('세션이 최소 개수(3) 미만이면 enough=false', () => {
    const res = computeReadingRhythm([at(2026, 7, 1, 21), at(2026, 7, 2, 21)]);
    expect(res.enough).toBe(false);
    expect(res.sessionCount).toBe(2);
    expect(res.suggestedTime).toBeNull();
  });

  it('날짜가 유효하지 않은 세션은 제외한다', () => {
    const res = computeReadingRhythm([
      at(2026, 7, 1, 21), at(2026, 7, 2, 21), at(2026, 7, 3, 21),
      { date: 'not-a-date', minutes: 10 }, { minutes: 5 },
    ]);
    expect(res.sessionCount).toBe(3);
  });

  it('주 독서 시간대와 알림 추천 시각(최빈 시각)을 계산한다', () => {
    const res = computeReadingRhythm([
      at(2026, 7, 1, 21), at(2026, 7, 2, 21), at(2026, 7, 3, 21), at(2026, 7, 4, 9),
    ]);
    expect(res.enough).toBe(true);
    expect(res.dominantSlot).toBe('evening'); // 21시 = 저녁 슬롯 3회
    expect(res.suggestedTime).toBe('21:00');  // 최빈 시각 21시
  });

  it('시간대 슬롯 경계 — 아침/오후/저녁/밤/새벽', () => {
    const mk = (h) => computeReadingRhythm([at(2026, 7, 1, h), at(2026, 7, 2, h), at(2026, 7, 3, h)]).dominantSlot;
    expect(mk(2)).toBe('dawn');
    expect(mk(8)).toBe('morning');
    expect(mk(14)).toBe('afternoon');
    expect(mk(19)).toBe('evening');
    expect(mk(23)).toBe('night');
  });

  it('세션 스타일 — 짧게 자주 / 길게 몰입 / 균형', () => {
    const shortF = computeReadingRhythm([at(2026, 7, 1, 21, 10), at(2026, 7, 2, 21, 12), at(2026, 7, 3, 21, 8)]);
    expect(shortF.style).toBe('short-frequent');

    const longD = computeReadingRhythm([at(2026, 7, 1, 21, 60), at(2026, 7, 2, 21, 50), at(2026, 7, 3, 21, 70)]);
    expect(longD.style).toBe('long-deep');

    const bal = computeReadingRhythm([at(2026, 7, 1, 21, 30), at(2026, 7, 2, 21, 35), at(2026, 7, 3, 21, 25)]);
    expect(bal.style).toBe('balanced');
  });

  it('주말/평일 편향을 판정한다', () => {
    // 2026-07-04(토), 07-05(일), 07-11(토) → 전부 주말
    const weekendRes = computeReadingRhythm([at(2026, 7, 4, 21), at(2026, 7, 5, 21), at(2026, 7, 11, 21)]);
    expect(weekendRes.weekendBias).toBe('weekend');

    // 2026-07-06(월)~07-08(수) → 전부 평일
    const weekdayRes = computeReadingRhythm([at(2026, 7, 6, 21), at(2026, 7, 7, 21), at(2026, 7, 8, 21)]);
    expect(weekdayRes.weekendBias).toBe('weekday');
  });

  it('slotLabel / styleLabel 한국어·영어', () => {
    expect(slotLabel('evening', 'ko')).toBe('저녁');
    expect(slotLabel('evening', 'en')).toBe('Evening');
    expect(styleLabel('short-frequent', 'ko')).toBe('짧게 자주');
    expect(styleLabel('long-deep', 'en')).toBe('Long & deep');
  });
});
