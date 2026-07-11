// 책 리뷰 카드 (시나리오 4-2)
// AI 리뷰 초안 생성 + Canvas 기반 SNS 공유 이미지

/* ── 1. AI 프롬프트 생성 ────────────────────────────────── */
export function buildReviewPrompt(book, notes = [], highlights = [], lang = 'ko') {
  const title = book?.title || '';
  const author = book?.author || '';
  const noteText = notes.slice(0, 10).map(n => `- ${n.text}`).join('\n');
  const hlText = highlights.slice(0, 10).map(h => `- "${h.text}"`).join('\n');
  const ctx = [
    noteText && (lang === 'ko' ? `[내 메모]\n${noteText}` : `[Notes]\n${noteText}`),
    hlText   && (lang === 'ko' ? `[하이라이트]\n${hlText}` : `[Highlights]\n${hlText}`),
  ].filter(Boolean).join('\n\n');

  if (lang === 'ko') {
    return [
      `다음은 《${title}》${author ? ` (${author})` : ''} 책의 독서 메모와 하이라이트입니다.`,
      ctx || '(특별한 메모나 하이라이트 없음)',
      '',
      '이 책에 대한 진솔한 리뷰를 2~3문장으로 작성하세요.',
      '규칙: 책 제목/저자명 반복 금지, 핵심 메시지 + 개인적 인상 포함, 80~140자.',
      '응답은 리뷰 텍스트만 출력하세요.',
    ].join('\n');
  }
  return [
    `Below are notes and highlights from "${title}"${author ? ` by ${author}` : ''}.`,
    ctx || '(no specific notes)',
    '',
    'Write a sincere 2-3 sentence review.',
    'Rules: do not repeat title/author, include core message + personal impression, 60-140 chars.',
    'Output only the review text.',
  ].join('\n');
}

/* ── 2. 텍스트 줄바꿈 (Canvas 폭 계산) ──────────────────── */
export function wrapText(ctx, text, maxWidth) {
  const lines = [];
  const paragraphs = (text || '').split('\n');
  for (const para of paragraphs) {
    if (!para.trim()) { lines.push(''); continue; }
    let line = '';
    // 한글/CJK는 글자 단위, 영문은 단어 단위
    const hasCjk = /[　-鿿가-힯]/.test(para);
    const tokens = hasCjk ? Array.from(para) : para.split(/(\s+)/);
    for (const tok of tokens) {
      const next = line + tok;
      if (ctx.measureText(next).width > maxWidth && line) {
        lines.push(line.trimEnd());
        line = tok.replace(/^\s+/, '');
      } else {
        line = next;
      }
    }
    if (line) lines.push(line.trimEnd());
  }
  return lines;
}

/* ── 3. 테마 (배경 그라데이션, 텍스트 색) ──────────────── */
export const CARD_THEMES = {
  warm:   { from: '#fef3c7', to: '#fde68a', ink: '#78350f', accent: '#b45309' },
  ocean:  { from: '#dbeafe', to: '#bfdbfe', ink: '#1e3a8a', accent: '#1d4ed8' },
  forest: { from: '#dcfce7', to: '#bbf7d0', ink: '#14532d', accent: '#166534' },
  rose:   { from: '#fce7f3', to: '#fbcfe8', ink: '#831843', accent: '#be185d' },
  ink:    { from: '#1f2937', to: '#111827', ink: '#f9fafb', accent: '#fbbf24' },
};

/* ── 4. Canvas에 카드 렌더 ─────────────────────────────── */
export function renderReviewCard(canvas, { book, review, theme = 'warm', stats = {} }) {
  const W = 1080, H = 1080;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const T = CARD_THEMES[theme] || CARD_THEMES.warm;

  // 배경 그라데이션
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, T.from);
  grad.addColorStop(1, T.to);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // 상단 라벨
  ctx.fillStyle = T.accent;
  ctx.font = '600 28px "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';
  ctx.textBaseline = 'top';
  ctx.fillText('📖 BOOK REVIEW', 80, 80);

  // 책 제목 (큰 폰트, 최대 2줄)
  ctx.fillStyle = T.ink;
  ctx.font = 'bold 72px "Apple SD Gothic Neo", "Noto Sans KR", serif';
  const titleLines = wrapText(ctx, book?.title || '제목 없음', W - 160).slice(0, 2);
  let y = 150;
  for (const line of titleLines) { ctx.fillText(line, 80, y); y += 88; }

  // 저자
  if (book?.author) {
    ctx.fillStyle = T.ink + 'cc';
    ctx.font = '500 36px "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';
    ctx.fillText(book.author, 80, y + 8);
    y += 60;
  }

  // 구분선
  y += 30;
  ctx.strokeStyle = T.accent + '55';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(80, y);
  ctx.lineTo(280, y);
  ctx.stroke();
  y += 40;

  // 리뷰 본문 (최대 8줄)
  ctx.fillStyle = T.ink;
  ctx.font = '500 38px "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';
  const reviewLines = wrapText(ctx, review || '', W - 160).slice(0, 10);
  for (const line of reviewLines) { ctx.fillText(line, 80, y); y += 56; }

  // 별점
  if (stats.rating) {
    y += 30;
    ctx.font = '40px sans-serif';
    const full = Math.floor(stats.rating);
    const half = stats.rating - full >= 0.5;
    ctx.fillText('★'.repeat(full) + (half ? '⯨' : '') + '☆'.repeat(5 - full - (half ? 1 : 0)), 80, y);
  }

  // 하단 통계
  ctx.fillStyle = T.ink + '88';
  ctx.font = '500 26px "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';
  const parts = [];
  if (stats.pages) parts.push(`${stats.pages}p`);
  if (stats.notes != null) parts.push(`📝 ${stats.notes}`);
  if (stats.highlights != null) parts.push(`📖 ${stats.highlights}`);
  ctx.fillText(parts.join('  ·  '), 80, H - 130);

  // 워터마크
  ctx.fillStyle = T.accent;
  ctx.font = '700 24px "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';
  ctx.fillText('Personal Knowledge Library', 80, H - 80);

  return canvas;
}

/* ── 5. 다운로드 ──────────────────────────────────────── */
function safeFileName(s) {
  return String(s || 'book').replace(/[\\/:*?"<>|]/g, '_').slice(0, 80);
}

export async function downloadReviewCard(payload) {
  const canvas = document.createElement('canvas');
  renderReviewCard(canvas, payload);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) { reject(new Error('blob 생성 실패')); return; }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${safeFileName(payload.book?.title)}_review.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      resolve(true);
    }, 'image/png');
  });
}
