import { describe, it, expect } from 'vitest';
import { PLANS, PRO_PRICE_KRW, getPlan, isPro, isOnProWaitlist } from '../utils/plan.js';

describe('plan model', () => {
  it('free/pro 플랜 정의와 가격', () => {
    expect(PLANS.free.priceKRW).toBe(0);
    expect(PLANS.pro.priceKRW).toBe(PRO_PRICE_KRW);
    expect(PLANS.pro.features.length).toBeGreaterThan(0);
  });

  it('getPlan/isPro — 기본 free, plan:pro 만 pro', () => {
    expect(getPlan(undefined)).toBe('free');
    expect(getPlan({})).toBe('free');
    expect(getPlan({ plan: 'pro' })).toBe('pro');
    expect(isPro({ plan: 'pro' })).toBe(true);
    expect(isPro({ plan: 'free' })).toBe(false);
  });

  it('isOnProWaitlist — proWaitlistAt 이 있으면 true', () => {
    expect(isOnProWaitlist({})).toBe(false);
    expect(isOnProWaitlist({ proWaitlistAt: Date.now() })).toBe(true);
  });
});
