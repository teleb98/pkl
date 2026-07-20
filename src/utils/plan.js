/* 서재 요금제(freemium) — 결제(PG)는 연말 사업자등록 후 제공 예정이라, 지금은
   플랜 정의 + 업그레이드 "시나리오"(출시 알림 신청)만 구현한다. 기존 무료 기능은
   그대로 두고(회귀 없음), Pro의 가치 제안·대기자 등록만 붙인다. */

export const PRO_PRICE_KRW = 4900;

export const PLANS = {
  free: {
    id: 'free',
    name: 'Free',
    priceKRW: 0,
    tagline: '내 API 키로 시작하는 개인 서재',
    features: [
      '내 AI 키 연결(BYOK)로 AI 대화·추천',
      '무제한 로컬 독서 · PDF 뷰어',
      '지식 노트 · 하이라이트 · 단어장',
      'Google Drive 백업 · PDF 업로드',
      'cw_wiki(옵시디언) 연결 · 가져오기',
    ],
  },
  pro: {
    id: 'pro',
    name: '서재 Pro',
    priceKRW: PRO_PRICE_KRW,
    tagline: '키 없이, rarebook AI로 지식을 고도화',
    features: [
      'rarebook 제공 AI — 내 키 없이 바로 사용',
      'Gemini 시맨틱 색인 무제한(위키·책)',
      '지식 고도화 도구 — 공백·연결·심화문답·정착복습·MOC',
      'PDF Drive 자동 백업 · 우선 처리',
      '우선 고객 지원',
    ],
  },
};

/** 현재 플랜 id. 결제 연동 전까지는 항상 'free'(관리자 수동 부여만 'pro'). */
export function getPlan(userConfig) {
  return userConfig?.plan === 'pro' ? 'pro' : 'free';
}

export function isPro(userConfig) {
  return getPlan(userConfig) === 'pro';
}

/** Pro 출시 알림(대기자) 신청 여부 */
export function isOnProWaitlist(userConfig) {
  return !!userConfig?.proWaitlistAt;
}
