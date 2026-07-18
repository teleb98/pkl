/* 라이프스타일 인사이트 — "건강 지향" 축.
   서재(pkl) 자체 관심도(완독/읽는 중인 책의 aiTopics)를 로컬에서 계산하고,
   rarebook 패밀리(부엌·서점)의 동일 축 신호를 rb_session 쿠키로 교차 조회해
   하나의 종합 인사이트로 합친다. 세 서비스 중 하나라도 실패해도 나머지로 계속 진행한다. */
import { getBookIndex, getBookMeta } from '../store.js';

const COOKING_URL = 'https://cooking.rarebook.co.kr/api/lifestyle/health-signal';
const WWW_URL = 'https://rarebook.co.kr/member/health-signal';

// '운동'은 '민주화운동'처럼 문맥에 따라 뜻이 갈려 제외 — www/cooking과 동일한 원칙
const HEALTH_KEYWORDS = ['건강', '웰빙', '영양', '다이어트', '피트니스', '명상', '수면', '요가', '헬스', '의학'];

function isHealthTopic(topic) {
  return HEALTH_KEYWORDS.some(kw => topic.includes(kw));
}

function labelOf(score) {
  if (score >= 40) return 'high';
  if (score >= 15) return 'medium';
  if (score > 0) return 'low';
  return 'none';
}

/** 서재 자체 데이터(로컬)로 계산하는 건강 지향 신호 — 완독/읽는 중인 책의 aiTopics 기준. */
export function computeLocalHealthInterest() {
  const engaged = getBookIndex()
    .map(book => ({ book, meta: getBookMeta(book.id) || {} }))
    .filter(({ meta }) => (meta.lastPage || 0) > 0 || meta.status === 'done');

  const total = engaged.length;
  if (total === 0) return { score: 0, label: 'none', evidence: [], bookCount: 0 };

  const matched = engaged.filter(({ meta }) => (meta.aiTopics || []).some(isHealthTopic));
  const score = Math.round((matched.length / total) * 100);
  const evidence = matched.slice(0, 5).map(({ book }) => book.title);
  return { score, label: labelOf(score), evidence, bookCount: total };
}

async function fetchSignal(url) {
  try {
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null; // 네트워크 실패·미로그인·CORS 등 — 조용히 무시하고 나머지로 계속 진행
  }
}

/** 부엌(cooking)의 건강 지향 신호를 rb_session 쿠키로 교차 조회. */
export function fetchCookingHealthSignal() {
  return fetchSignal(COOKING_URL);
}

/** 서점(www)의 건강 지향 신호를 rb_session 쿠키로 교차 조회. */
export function fetchWwwHealthSignal() {
  return fetchSignal(WWW_URL);
}

/**
 * 서재(로컬)·부엌·서점 세 신호를 하나의 종합 인사이트로 합친다.
 * 일부가 null(조회 실패)이어도 있는 것만으로 계산한다. 전부 없으면 label='none'.
 */
export function combineHealthSignals({ pkl, cooking, www }) {
  const sources = [
    pkl && { key: 'pkl', ...pkl },
    cooking && { key: 'cooking', ...cooking },
    www && { key: 'www', ...www },
  ].filter(Boolean);

  if (!sources.length) return { score: 0, label: 'none', sources: [] };

  const avgScore = Math.round(sources.reduce((s, x) => s + x.score, 0) / sources.length);
  return { score: avgScore, label: labelOf(avgScore), sources };
}
