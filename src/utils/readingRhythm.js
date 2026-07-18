/* 독서 리듬 — 서재 자체 세션 데이터로 "언제·어떻게 읽는가"를 파악해 서재 경험을
   개인화한다(크로스 서비스 아님, 서재 내부 고도화). 주 독서 시간대에 맞춰 알림
   시각을 제안하고, 세션 스타일(짧게 자주/길게 몰입)을 인사이트로 보여준다. */

const MIN_SESSIONS = 3; // 이보다 적으면 신호가 약해 리듬을 판단하지 않음

// 시간대 슬롯(로컬 시각 기준)
const SLOTS = [
  { key: 'dawn',      from: 0,  to: 5,  ko: '새벽', en: 'Dawn' },
  { key: 'morning',   from: 5,  to: 11, ko: '아침', en: 'Morning' },
  { key: 'afternoon', from: 11, to: 17, ko: '오후', en: 'Afternoon' },
  { key: 'evening',   from: 17, to: 22, ko: '저녁', en: 'Evening' },
  { key: 'night',     from: 22, to: 24, ko: '밤',   en: 'Night' },
];

function slotOf(hour) {
  return (SLOTS.find(s => hour >= s.from && hour < s.to) || SLOTS[0]).key;
}

export function slotLabel(key, lang = 'ko') {
  const s = SLOTS.find(x => x.key === key);
  return s ? (lang === 'ko' ? s.ko : s.en) : key;
}

/**
 * 세션 목록에서 독서 리듬을 계산한다(순수 함수).
 * @param {Array<{date:string, minutes?:number}>} sessions
 * @returns {{ enough:boolean, sessionCount:number, dominantSlot:string|null,
 *   suggestedTime:string|null, style:string|null, avgMinutes:number, weekendBias:string|null }}
 */
export function computeReadingRhythm(sessions) {
  const valid = (sessions || []).filter(s => s?.date && !Number.isNaN(new Date(s.date).getTime()));
  const sessionCount = valid.length;
  if (sessionCount < MIN_SESSIONS) {
    return { enough: false, sessionCount, dominantSlot: null, suggestedTime: null, style: null, avgMinutes: 0, weekendBias: null };
  }

  const slotCount = {};
  const hourCount = {};
  let weekend = 0, totalMin = 0;
  for (const s of valid) {
    const d = new Date(s.date);
    const hour = d.getHours();
    slotCount[slotOf(hour)] = (slotCount[slotOf(hour)] || 0) + 1;
    hourCount[hour] = (hourCount[hour] || 0) + 1;
    const dow = d.getDay(); // 0=일, 6=토
    if (dow === 0 || dow === 6) weekend += 1;
    totalMin += s.minutes || 0;
  }

  const dominantSlot = Object.entries(slotCount).sort((a, b) => b[1] - a[1])[0][0];
  const modalHour = Number(Object.entries(hourCount).sort((a, b) => b[1] - a[1])[0][0]);
  const suggestedTime = `${String(modalHour).padStart(2, '0')}:00`;

  const avgMinutes = Math.round(totalMin / sessionCount);
  const style = avgMinutes > 0
    ? (avgMinutes < 20 ? 'short-frequent' : avgMinutes >= 45 ? 'long-deep' : 'balanced')
    : null;

  // 주말(2/7 일수) 대비 세션 비중 — 0.45↑ 주말형, 0.2↓ 평일형
  const weekendFrac = weekend / sessionCount;
  const weekendBias = weekendFrac >= 0.45 ? 'weekend' : weekendFrac <= 0.2 ? 'weekday' : 'even';

  return { enough: true, sessionCount, dominantSlot, suggestedTime, style, avgMinutes, weekendBias };
}

export function styleLabel(style, lang = 'ko') {
  const map = {
    'short-frequent': lang === 'ko' ? '짧게 자주' : 'Short & frequent',
    'long-deep':      lang === 'ko' ? '길게 몰입' : 'Long & deep',
    'balanced':       lang === 'ko' ? '균형 잡힌' : 'Balanced',
  };
  return map[style] || style;
}
