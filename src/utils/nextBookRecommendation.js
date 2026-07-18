/* 다음 읽을 책 추천 — 서재에 쌓인 책들의 주제(관심사)를 근거로,
   아직 읽지 않은 책 중 지금과 이어지는 책을 AI가 추천한다. */
import { getBookIndex, getBookMeta } from '../store.js';
import { callAI } from '../aiClient.js';
import { getKnowledgePath, pathHintLine } from './knowledgePath.js';

const MAX_CANDIDATES = 12;

/** 서재에서 아직 읽지 않은(진행 없음 & 완독 아님) 책들 */
export function getUnreadCandidates() {
  return getBookIndex().filter(b => {
    const meta = getBookMeta(b.id) || {};
    const started = (meta.lastPage || 0) > 0;
    const done = meta.status === 'done' || (meta.progress || 0) >= 100;
    return !started && !done;
  });
}

/** 읽었거나 읽고 있는 책들의 주제/요약 — 관심사 추론 근거 */
function getInterestContext() {
  return getBookIndex()
    .map(b => ({ book: b, meta: getBookMeta(b.id) || {} }))
    .filter(({ meta }) => (meta.lastPage || 0) > 0 || meta.status === 'done')
    .map(({ book, meta }) => ({ title: book.title, topics: meta.aiTopics || [], summary: meta.aiSummary || '' }))
    .filter(x => x.topics.length || x.summary);
}

function buildPrompt(lang, candidates, interest, healthBias, pathHint = '') {
  const candidateList = candidates.map((b, i) => {
    const meta = getBookMeta(b.id) || {};
    const parts = [`${i + 1}. 《${b.title}》`];
    if (meta.aiAuthor || b.author) parts.push(`- ${meta.aiAuthor || b.author}`);
    if (meta.aiSummary) parts.push(`- ${meta.aiSummary}`);
    if (meta.aiTopics?.length) parts.push(`- ${lang === 'ko' ? '주제' : 'Topics'}: ${meta.aiTopics.join(', ')}`);
    return parts.join(' ');
  }).join('\n');

  // 라이프스타일 인사이트(서재·부엌·서점 종합) — 건강 지향이 뚜렷하면 관련 후보를 우선 고려하도록 힌트
  const healthHint = healthBias?.label === 'high'
    ? (lang === 'ko'
      ? '\n## 참고: 라이프스타일 인사이트\n서재·부엌·서점 활동을 종합하면 최근 건강/웰빙 지향이 뚜렷합니다. 후보 중 관련 주제의 책이 있다면 우선적으로 고려하세요(단, 그런 책이 없다면 억지로 끼워 맞추지 마세요).\n'
      : '\n## Note: Lifestyle Insight\nAcross study, kitchen, and store activity, health/wellness interest is notably rising. If a candidate matches this theme, weigh it favorably (but don\'t force it if none fit).\n')
    : '';

  if (lang === 'ko') {
    const interestList = interest.length
      ? interest.map(x => `- 《${x.title}》${x.topics.length ? ` (${x.topics.join(', ')})` : ''}`).join('\n')
      : '(아직 읽은 기록이 없음 — 후보 자체의 매력만으로 판단)';
    return `당신은 독서 추천 사서입니다. 사용자가 최근 읽었거나 읽고 있는 책들과,
서재에 있지만 아직 읽지 않은 후보 목록이 있습니다. 관심사와 이어지는 책을
1~3권 추천하고 이유를 설명하세요.
${pathHint}${healthHint}
## 최근 읽은 책(관심사 근거)
${interestList}

## 아직 안 읽은 후보
${candidateList}

다음 JSON 배열 형식으로만 응답하세요(다른 텍스트 금지):
[{"index": 후보 번호(정수), "reason": "추천 이유 한두 문장"}]`;
  }
  const interestList = interest.length
    ? interest.map(x => `- 《${x.title}》${x.topics.length ? ` (${x.topics.join(', ')})` : ''}`).join('\n')
    : '(no reading history yet — judge candidates on their own merit)';
  return `You are a reading recommendation librarian. Below are books the user
recently read or is reading, and a list of unread candidates from their library.
Recommend 1-3 books that connect to their interests, with reasons.
${pathHint}${healthHint}
## Recently read (interest signal)
${interestList}

## Unread candidates
${candidateList}

Respond ONLY with this JSON array (no other text):
[{"index": candidate number (integer), "reason": "one or two sentence reason"}]`;
}

function parseRecommendation(raw, candidates) {
  const match = String(raw || '').replace(/```json\s*|```/g, '').trim().match(/\[[\s\S]*\]/);
  if (!match) throw new Error('invalid-ai-response');
  let parsed;
  try { parsed = JSON.parse(match[0]); } catch { throw new Error('invalid-ai-response'); }
  const out = [];
  for (const item of parsed) {
    const idx = Number(item.index) - 1;
    if (Number.isInteger(idx) && candidates[idx]) {
      out.push({ book: candidates[idx], reason: item.reason || '' });
    }
  }
  if (!out.length) throw new Error('invalid-ai-response');
  return out;
}

/**
 * 서재의 안 읽은 책 중 지금 관심사와 이어지는 책을 AI가 추천한다.
 * @param {{lang?:string, apiKeys?:object, healthBias?:{label:string}}} opts
 *   healthBias — 라이프스타일 인사이트(서재·부엌·서점 종합 건강 지향 신호). label='high'면 관련 후보를 우선 고려하도록 프롬프트에 반영.
 * @returns {Promise<Array<{book, reason:string}>>}
 * @throws {Error} 'no-candidates' — 추천할 안 읽은 책이 없음
 */
export async function recommendNextBook({ lang = 'ko', apiKeys, healthBias } = {}) {
  const candidates = getUnreadCandidates().slice(0, MAX_CANDIDATES);
  if (!candidates.length) throw new Error('no-candidates');
  const interest = getInterestContext();
  const path = getKnowledgePath();
  const prompt = buildPrompt(lang, candidates, interest, healthBias, pathHintLine(path, lang));
  const raw = await callAI(apiKeys, prompt, [], lang === 'ko' ? '추천해줘' : 'Recommend');
  const items = parseRecommendation(raw, candidates);
  return { items, path };
}
