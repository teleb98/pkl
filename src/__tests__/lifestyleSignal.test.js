import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  computeLocalHealthInterest, combineHealthSignals,
  fetchCookingHealthSignal, fetchWwwHealthSignal,
} from '../utils/lifestyleSignal.js';
import { saveBookIndex, setBookMeta } from '../store.js';

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('computeLocalHealthInterest', () => {
  it('완독/읽는 중인 책이 없으면 none/0', () => {
    expect(computeLocalHealthInterest()).toEqual({ score: 0, label: 'none', evidence: [], bookCount: 0 });
  });

  it('아직 안 읽은 책(lastPage=0, status 없음)은 분모에서 제외한다', () => {
    saveBookIndex([{ id: 'b1', title: '안읽음' }]);
    expect(computeLocalHealthInterest().bookCount).toBe(0);
  });

  it('완독한 책의 aiTopics 에 건강 키워드가 있으면 비중에 반영한다', () => {
    saveBookIndex([{ id: 'b1', title: '건강한 삶' }, { id: 'b2', title: '평범한 소설' }]);
    setBookMeta('b1', { status: 'done', aiTopics: ['웰빙', '식습관'] });
    setBookMeta('b2', { status: 'done', aiTopics: ['드라마'] });
    const res = computeLocalHealthInterest();
    expect(res.score).toBe(50);
    expect(res.label).toBe('high'); // 50% >= 40 임계값
    expect(res.evidence).toContain('건강한 삶');
  });

  it('읽는 중(lastPage>0)인 책도 관심도 계산에 포함한다', () => {
    saveBookIndex([{ id: 'b1', title: '명상 입문' }]);
    setBookMeta('b1', { lastPage: 10, aiTopics: ['명상'] });
    const res = computeLocalHealthInterest();
    expect(res.bookCount).toBe(1);
    expect(res.score).toBe(100);
  });

  it("'운동' 은 오탐 방지를 위해 키워드에서 제외됐다(문맥 모호)", () => {
    saveBookIndex([{ id: 'b1', title: '노동운동사' }]);
    setBookMeta('b1', { status: 'done', aiTopics: ['노동운동', '20세기 역사'] });
    expect(computeLocalHealthInterest().score).toBe(0);
  });
});

describe('fetchCookingHealthSignal / fetchWwwHealthSignal', () => {
  it('정상 응답이면 JSON 을 그대로 반환한다', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ score: 60, label: 'high' }) });
    const res = await fetchCookingHealthSignal();
    expect(res).toEqual({ score: 60, label: 'high' });
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('cooking.rarebook.co.kr'), { credentials: 'include' });
  });

  it('401 등 실패 응답이면 null 을 반환한다(조용히 무시)', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false });
    expect(await fetchWwwHealthSignal()).toBeNull();
  });

  it('네트워크 예외가 나도 크래시 없이 null 을 반환한다', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network down'));
    expect(await fetchCookingHealthSignal()).toBeNull();
  });
});

describe('combineHealthSignals', () => {
  it('세 신호 모두 없으면 none/0', () => {
    expect(combineHealthSignals({ pkl: null, cooking: null, www: null })).toEqual({ score: 0, label: 'none', sources: [] });
  });

  it('일부만 있어도 있는 신호로 평균을 계산한다', () => {
    const res = combineHealthSignals({ pkl: { score: 80, label: 'high' }, cooking: null, www: { score: 20, label: 'low' } });
    expect(res.score).toBe(50);
    expect(res.sources.map(s => s.key)).toEqual(['pkl', 'www']);
  });

  it('세 신호가 다 있으면 평균을 낸다', () => {
    const res = combineHealthSignals({
      pkl: { score: 90 }, cooking: { score: 60 }, www: { score: 30 },
    });
    expect(res.score).toBe(60);
    expect(res.label).toBe('high');
  });
});
