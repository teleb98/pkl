import { getWeekStats, getSessions } from '../store.js';

export function getWeeklyCoachData() {
  const weekStats = getWeekStats();
  const sessions = getSessions();

  // Last 7 days of sessions
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const weekSessions = sessions.filter(s => s.date >= sevenDaysAgo);

  // Group by day — s.date 는 전체 ISO 타임스탬프이므로 일자(YYYY-MM-DD)로 잘라야 함
  const dailyByDate = {};
  weekSessions.forEach(s => {
    const day = s.date.slice(0, 10);
    if (!dailyByDate[day]) dailyByDate[day] = [];
    dailyByDate[day].push(s);
  });

  // Count days with reading
  const readDays = Object.keys(dailyByDate).filter(date => {
    const daySessions = dailyByDate[date];
    return daySessions.reduce((s, x) => s + (x.minutes || 0), 0) > 0;
  }).length;

  // Daily stats
  const dailyStats = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const dateStr = d.toISOString().slice(0, 10);
    const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
    const daySessions = dailyByDate[dateStr] || [];
    const minutes = daySessions.reduce((s, x) => s + (x.minutes || 0), 0);
    const pages = daySessions.reduce((s, x) => s + (x.pages || 0), 0);
    dailyStats.push({ date: dateStr, dayName, minutes, pages, sessions: daySessions.length });
  }

  return {
    totalMinutes: weekStats.totalMinutes,
    totalPages: weekStats.totalPages,
    readDays,
    streak: weekStats.streak,
    dailyStats: dailyStats.reverse(),
  };
}

export function generateCoachPrompt(lang, coachData) {
  const { totalMinutes, totalPages, readDays, streak, dailyStats } = coachData;

  const dailyBreakdown = dailyStats
    .map(d => `${d.dayName}: ${d.minutes}분${d.pages > 0 ? ` (${d.pages}페이지)` : ''}`)
    .join('\n');

  if (lang === 'ko') {
    return `당신의 지난주 독서 패턴을 분석하고 개선 제안을 해주세요.

지난 7일 통계:
- 총 읽기 시간: ${totalMinutes}분
- 총 읽은 페이지: ${totalPages}페이지
- 읽은 날: ${readDays}일
- 현재 스트릭: ${streak}일

일별 패턴:
${dailyBreakdown}

위 데이터를 바탕으로:
1. 현재 독서 습관의 강점 (1문장)
2. 개선할 점 (1문장)
3. 다음주 목표 제안 (1문장)

총 3문장으로 간결하게 작성해주세요.`;
  }

  return `Analyze my reading pattern from last week and suggest improvements.

Last 7 days stats:
- Total reading time: ${totalMinutes} minutes
- Total pages read: ${totalPages}
- Days read: ${readDays} days
- Current streak: ${streak} days

Daily breakdown:
${dailyBreakdown}

Based on the data above:
1. Strength of current reading habit (1 sentence)
2. Area for improvement (1 sentence)
3. Suggested goal for next week (1 sentence)

Write concisely in 3 sentences total.`;
}
