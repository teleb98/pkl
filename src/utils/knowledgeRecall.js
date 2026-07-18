/* 지식 정착 복습 — 위키 노트를 "오래됨 × 중심성 × 약점" 순으로 골라 능동 회상
   (질문 → 스스로 떠올림 → 정답 확인 → 자기 평가)을 시킨다. 회상하지 못하는 지식은
   고도화되지 않는다 — 벼린 이해(심화 문답)를 기억으로 정착시키는 조각. */

const DAY = 24 * 60 * 60 * 1000;

function norm(s) { return String(s || '').toLowerCase().trim(); }

/** [[링크]] 차수(무방향) — 그래프에서 많이 연결된 허브 노트일수록 중심성이 높다 */
export function computeNoteDegrees(notes) {
  const idByKey = new Map();
  for (const n of notes || []) {
    for (const key of [n.title, ...(n.aliases || [])]) {
      const k = norm(key);
      if (k && !idByKey.has(k)) idByKey.set(k, n.id);
    }
  }
  const deg = new Map();
  const bump = (id) => deg.set(id, (deg.get(id) || 0) + 1);
  for (const n of notes || []) {
    for (const link of n.links || []) {
      const tid = idByKey.get(norm(link));
      if (tid && tid !== n.id) { bump(n.id); bump(tid); }
    }
  }
  return deg;
}

/**
 * 복습 우선순위 점수 — 오래될수록 / 허브일수록 / 자주 틀릴수록 높다.
 * @param {object} note
 * @param {number} degree  링크 차수
 * @param {{lastReviewAt?:number, attempts?:number, fails?:number}} [log]
 * @param {number} [now]
 */
export function recallPriority(note, degree, log = {}, now = Date.now()) {
  const anchor = log.lastReviewAt
    || (note.modifiedTime ? new Date(note.modifiedTime).getTime() : now - 30 * DAY);
  const staleDays = Math.max(1, (now - anchor) / DAY);
  const centrality = 1 + Math.log2(1 + (degree || 0));
  const failRate = (log.fails || 0) / ((log.attempts || 0) + 1);
  return staleDays * centrality * (1 + 2 * failRate);
}

/**
 * 오늘 복습할 노트 후보 — 내용이 있는 노트만, 우선순위 내림차순.
 * @param {Array} notes  파싱된 위키 인덱스
 * @param {Object<string,{lastReviewAt,attempts,fails}>} reviewLog  noteId → 기록
 */
export function pickRecallCandidates(notes, reviewLog = {}, { limit = 5, now = Date.now() } = {}) {
  const deg = computeNoteDegrees(notes);
  return (notes || [])
    .filter(n => (n.content || n.excerpt || '').trim().length >= 40)  // 회상할 내용이 있는 노트만
    .map(n => ({ note: n, degree: deg.get(n.id) || 0, score: recallPriority(n, deg.get(n.id) || 0, reviewLog[n.id], now) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/** 선택된 노트들로 회상 질문 생성을 요청(JSON 배열 응답) */
export function buildRecallQuizPrompt(notes, lang = 'ko') {
  const blocks = (notes || []).map((n, i) =>
    `${i + 1}. id=${n.id} 《${n.title}》\n${(n.content || n.excerpt || '').slice(0, 500)}`).join('\n\n');
  if (lang === 'ko') {
    return `당신은 능동 회상(active recall) 코치입니다. 아래는 사용자가 직접 쓴 위키 노트들입니다. 각 노트마다, 노트를 보지 않고도 핵심 내용을 스스로 떠올리게 만드는 회상 질문을 1개씩 만드세요.

${blocks}

규칙:
- 답이 노트 안에 있는 질문만(외부 지식 요구 금지).
- "무엇/왜/어떻게"로 핵심을 찌르는 한 문장 질문.
- 노트 제목을 답으로 요구하는 질문 금지(제목은 힌트로 보여줄 것).
다음 JSON 배열로만 응답하세요(다른 텍스트 금지):
[{"id": "노트 id", "question": "질문"}]`;
  }
  return `You are an active-recall coach. Below are the user's own wiki notes. For each, write one recall question that makes them retrieve the core content from memory.

${blocks}

Rules:
- Answerable strictly from the note (no outside knowledge).
- One sharp what/why/how question per note.
- Never ask for the note's title (it will be shown as a hint).
Respond ONLY with this JSON array:
[{"id": "note id", "question": "question"}]`;
}

/** AI 응답 → noteId→질문 맵. 파싱 실패·누락은 폴백 질문으로 채운다. */
export function parseRecallQuiz(raw, notes, lang = 'ko') {
  const fallback = (n) => lang === 'ko'
    ? `《${n.title}》 노트에 적어둔 핵심 내용은 무엇이었나요?`
    : `What were the key points you wrote in 《${n.title}》?`;
  const out = new Map((notes || []).map(n => [n.id, fallback(n)]));
  try {
    const m = String(raw || '').replace(/```json\s*|```/g, '').match(/\[[\s\S]*\]/);
    if (m) {
      for (const item of JSON.parse(m[0])) {
        if (item?.id && item?.question && out.has(item.id)) out.set(item.id, String(item.question));
      }
    }
  } catch { /* 폴백 유지 */ }
  return out;
}
