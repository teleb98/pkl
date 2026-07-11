// 독서 통계 공유 이미지 (시나리오 4-4)
// 월간 인포그래픽: bar chart + 숫자 통계 → 1080×1080 PNG

const FONT = '"Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", sans-serif';

/* ── 테마 ────────────────────────────────────────────────── */
export const STATS_THEMES = {
  night: { bg: '#0f172a', surface: '#1e293b', accent: '#38bdf8', text: '#f1f5f9', sub: '#94a3b8', bar: '#38bdf8', barDim: '#1e3a5f' },
  warm:  { bg: '#1c1007', surface: '#2d1d0e', accent: '#fb923c', text: '#fef3c7', sub: '#d97706', bar: '#fb923c', barDim: '#3b1c08' },
  forest:{ bg: '#052e16', surface: '#14532d', accent: '#4ade80', text: '#f0fdf4', sub: '#86efac', bar: '#4ade80', barDim: '#14532d' },
};

/* ── 시간 포맷 ───────────────────────────────────────────── */
export function fmtMinutes(min) {
  if (!min || min <= 0) return '0h';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
}

/* ── 월 이름 ─────────────────────────────────────────────── */
export function monthName(m, lang = 'ko') {
  if (lang === 'ko') return `${m}월`;
  const names = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return names[m - 1] || '';
}

/* ── 실제 Canvas 렌더 ────────────────────────────────────── */
export function renderStatsCard(canvas, stats, { theme = 'night', lang = 'ko' } = {}) {
  const W = 1080, H = 1080;
  canvas.width  = W;
  canvas.height = H;

  const T = STATS_THEMES[theme] || STATS_THEMES.night;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas; // jsdom / headless 환경
  const ko = lang === 'ko';

  // 배경
  ctx.fillStyle = T.bg;
  ctx.fillRect(0, 0, W, H);

  // 모서리 둥근 카드 배경
  roundRect(ctx, 40, 40, W - 80, H - 80, 32, T.surface);

  // ── 헤더 ────────────────────────────────────────────────
  ctx.fillStyle = T.accent;
  ctx.font = `700 30px ${FONT}`;
  ctx.textBaseline = 'top';
  ctx.fillText('📊 ' + (ko ? '독서 통계' : 'Reading Stats'), 90, 90);

  ctx.fillStyle = T.sub;
  ctx.font = `500 24px ${FONT}`;
  const label = stats.month
    ? `${stats.year} · ${monthName(stats.month, lang)}`
    : `${stats.year}`;
  ctx.fillText(label, 90, 132);

  // ── 핵심 수치 4개 ───────────────────────────────────────
  const kpis = [
    { icon: '⏱️', value: fmtMinutes(stats.totalMinutes), label: ko ? '총 독서 시간' : 'Reading time' },
    { icon: '📄', value: (stats.totalPages || 0).toLocaleString(), label: ko ? '읽은 페이지' : 'Pages read' },
    { icon: '📚', value: String(stats.completedBooks || 0), label: ko ? '완독' : 'Books done' },
    { icon: '📅', value: String(stats.activeDays || 0), label: ko ? '독서한 날' : 'Active days' },
  ];

  const kpiW = (W - 80 - 80) / 4; // 카드 내 4분할
  kpis.forEach((k, i) => {
    const x = 80 + i * kpiW;
    const y = 196;

    // 아이콘
    ctx.fillStyle = T.text;
    ctx.font = `44px sans-serif`;
    ctx.textBaseline = 'top';
    ctx.fillText(k.icon, x + 16, y + 10);

    // 숫자
    ctx.fillStyle = T.accent;
    ctx.font = `700 48px ${FONT}`;
    ctx.fillText(k.value, x + 16, y + 72);

    // 레이블
    ctx.fillStyle = T.sub;
    ctx.font = `400 20px ${FONT}`;
    ctx.fillText(k.label, x + 16, y + 130);
  });

  // ── 구분선 ──────────────────────────────────────────────
  ctx.strokeStyle = T.barDim;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(90, 370);
  ctx.lineTo(W - 90, 370);
  ctx.stroke();

  // ── 바 차트 ─────────────────────────────────────────────
  const bars = stats.dayBars || stats.months?.map((m, i) => ({ day: i + 1, minutes: m.totalMinutes })) || [];
  const barCount = bars.length;
  const chartX = 90, chartY = 400, chartW = W - 180, chartH = 420;
  const maxVal = Math.max(1, ...bars.map(b => b.minutes));
  const barW = Math.max(4, (chartW / barCount) - 3);
  const gap = chartW / barCount - barW;

  // Y축 가이드라인 (3개)
  [0.33, 0.66, 1].forEach(ratio => {
    const y = chartY + chartH * (1 - ratio);
    ctx.strokeStyle = T.barDim;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 6]);
    ctx.beginPath();
    ctx.moveTo(chartX, y);
    ctx.lineTo(chartX + chartW, y);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = T.sub;
    ctx.font = `400 16px ${FONT}`;
    ctx.textBaseline = 'middle';
    const minutes = Math.round(maxVal * ratio);
    ctx.fillText(fmtMinutes(minutes), chartX + chartW + 8, y);
  });

  // 막대
  bars.forEach((b, i) => {
    const barH = Math.max(4, (b.minutes / maxVal) * chartH);
    const x = chartX + i * (barW + gap);
    const y = chartY + chartH - barH;

    // 막대 색 (값 있으면 accent, 없으면 dim)
    ctx.fillStyle = b.minutes > 0 ? T.bar : T.barDim;
    roundRect(ctx, x, y, barW, barH, Math.min(6, barW / 2), ctx.fillStyle);

    // X 레이블 (7일 이하면 모두, 31일이면 5의 배수만)
    const showLabel = barCount <= 12 || b.day % (barCount <= 7 ? 1 : barCount <= 12 ? 1 : 5) === 0 || b.day === 1;
    if (showLabel) {
      ctx.fillStyle = T.sub;
      ctx.font = `400 ${barCount <= 12 ? 18 : 14}px ${FONT}`;
      ctx.textBaseline = 'top';
      const lbl = barCount <= 12 ? monthName(b.day, lang) : String(b.day);
      ctx.fillText(lbl, x + barW / 2 - ctx.measureText(lbl).width / 2, chartY + chartH + 8);
    }
  });

  // ── 보조 통계 행 ─────────────────────────────────────────
  const auxY = chartY + chartH + 54;
  const aux = [
    { icon: '📝', value: stats.totalNotes || 0, label: ko ? '메모' : 'Notes' },
    { icon: '✏️', value: stats.totalHighlights || 0, label: ko ? '하이라이트' : 'Highlights' },
    { icon: '🔥', value: stats.sessionCount || 0, label: ko ? '세션' : 'Sessions' },
  ];

  aux.forEach((a, i) => {
    const x = 90 + i * ((W - 180) / 3);
    ctx.fillStyle = T.sub;
    ctx.font = `400 20px ${FONT}`;
    ctx.textBaseline = 'top';
    ctx.fillText(`${a.icon} ${a.label}`, x, auxY);
    ctx.fillStyle = T.text;
    ctx.font = `700 32px ${FONT}`;
    ctx.fillText(String(a.value), x, auxY + 28);
  });

  // ── 워터마크 ────────────────────────────────────────────
  ctx.fillStyle = T.accent;
  ctx.font = `700 22px ${FONT}`;
  ctx.textBaseline = 'bottom';
  ctx.fillText('Personal Knowledge Library', 90, H - 56);

  return canvas;
}

/* ── 다운로드 ──────────────────────────────────────────── */
function safeFileName(s) {
  return String(s || 'stats').replace(/[\\/:*?"<>|]/g, '_').slice(0, 80);
}

export async function downloadStatsCard(stats, opts = {}) {
  const canvas = document.createElement('canvas');
  renderStatsCard(canvas, stats, opts);
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (!blob) { reject(new Error('blob 생성 실패')); return; }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const period = stats.month
        ? `${stats.year}-${String(stats.month).padStart(2, '0')}`
        : String(stats.year);
      a.download = `${safeFileName(`stats_${period}`)}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      resolve(true);
    }, 'image/png');
  });
}

/* ── 내부 헬퍼: 둥근 사각형 ─────────────────────────────── */
function roundRect(ctx, x, y, w, h, r, fill) {
  if (w <= 0 || h <= 0) return;
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
}
