/* AI 독서 전략 — 전체 스캔(Vision)으로 쌓인 책 전문(bookTextDb) + 사용자의
   실제 독서 속도(store.computeReadingSpeed)를 근거로 책별 맞춤 전략을 만든다.
   "책 전체를 프롬프트에 욱여넣기" 대신 초·중·후반 샘플 페이지만 뽑아 쓴다. */
import { getBookText } from './bookTextDb.js';
import { callAI } from '../aiClient.js';

const SAMPLE_CHARS_PER_SECTION = 1200; // 초/중/후반 각 구간에서 뽑을 최대 글자 수

/** 스캔된 페이지들에서 초반·중반·후반 대표 샘플을 뽑는다(각 구간 우선순위: 정확히 그 구간, 없으면 가장 가까운 페이지). */
export function sampleBookText(pages) {
  const nums = Object.keys(pages || {}).map(Number).sort((a, b) => a - b);
  if (!nums.length) return { beginning: '', middle: '', end: '' };
  const pick = (targetIdx) => {
    const n = nums[Math.max(0, Math.min(nums.length - 1, targetIdx))];
    return (pages[n] || '').slice(0, SAMPLE_CHARS_PER_SECTION);
  };
  return {
    beginning: pick(0),
    middle: pick(Math.floor(nums.length / 2)),
    end: pick(nums.length - 1),
  };
}

function buildPrompt(lang, book, sample, speed, remainingPages) {
  const ko = lang === 'ko';
  const title = book.aiTitle || book.title || '제목 미상';
  const author = book.aiAuthor || '';
  const summary = book.aiSummary || '';
  const topics = (book.aiTopics || []).join(', ');
  const paceLine = speed
    ? (ko ? `사용자의 실제 평균 독서 속도: 분당 ${speed.pagesPerMin.toFixed(2)}페이지`
          : `User's actual average pace: ${speed.pagesPerMin.toFixed(2)} pages/min`)
    : (ko ? '아직 독서 속도 기록이 없음(하루 30분 기준으로 추정)' : 'No pace history yet (assume 30min/day)');

  if (ko) {
    return `당신은 독서 전략 코치입니다. 아래 책 발췌(초/중/후반)와 사용자 정보를 바탕으로
현실적인 독서 전략과 목표를 JSON으로만 출력하세요. 다른 설명은 절대 쓰지 마세요.

책 제목: ${title}${author ? ` / 저자: ${author}` : ''}
${summary ? `요약: ${summary}` : ''}
${topics ? `주제: ${topics}` : ''}
${paceLine}
남은 페이지: ${remainingPages ?? '알 수 없음'}

초반 발췌:
${sample.beginning || '(없음)'}

중반 발췌:
${sample.middle || '(없음)'}

후반 발췌:
${sample.end || '(없음)'}

다음 JSON 스키마로만 응답하세요:
{
  "difficulty": "쉬움" | "보통" | "어려움",
  "difficultyReason": "난이도 판단 이유 한 문장",
  "dailyPageTarget": 정수(하루 권장 페이지),
  "estimatedDays": 정수(예상 완독 소요일),
  "focusAreas": ["집중해서 읽을 부분/이유 1", "..."],  // 최대 3개
  "milestones": [{"label": "1주차", "goal": "구체적 목표"}, ...] // 3~4개
}`;
  }
  return `You are a reading strategy coach. Based on the book excerpts (beginning/middle/end) and
user info below, output ONLY a JSON reading strategy — no other text.

Title: ${title}${author ? ` / Author: ${author}` : ''}
${summary ? `Summary: ${summary}` : ''}
${topics ? `Topics: ${topics}` : ''}
${paceLine}
Remaining pages: ${remainingPages ?? 'unknown'}

Beginning excerpt:
${sample.beginning || '(none)'}

Middle excerpt:
${sample.middle || '(none)'}

End excerpt:
${sample.end || '(none)'}

Respond ONLY with this JSON schema:
{
  "difficulty": "easy" | "medium" | "hard",
  "difficultyReason": "one sentence",
  "dailyPageTarget": integer,
  "estimatedDays": integer,
  "focusAreas": ["what to focus on and why", "..."],
  "milestones": [{"label": "Week 1", "goal": "concrete goal"}, ...]
}`;
}

function parseStrategyJson(raw) {
  const match = String(raw || '').replace(/```json\s*|```/g, '').trim().match(/\{[\s\S]*\}/);
  if (!match) throw new Error('invalid-ai-response');
  const parsed = JSON.parse(match[0]);
  if (!parsed.dailyPageTarget || !parsed.estimatedDays) throw new Error('invalid-ai-response');
  return {
    difficulty: parsed.difficulty || null,
    difficultyReason: parsed.difficultyReason || '',
    dailyPageTarget: Math.max(1, Math.round(parsed.dailyPageTarget)),
    estimatedDays: Math.max(1, Math.round(parsed.estimatedDays)),
    focusAreas: Array.isArray(parsed.focusAreas) ? parsed.focusAreas.slice(0, 3) : [],
    milestones: Array.isArray(parsed.milestones) ? parsed.milestones.slice(0, 4) : [],
  };
}

/**
 * 책의 전체 스캔 텍스트 + 독서 속도로 맞춤 전략을 생성한다.
 * @throws {Error} 'no-scanned-text' — 전체 스캔이 안 된 책, 'no-key' — AI 키 없음
 */
export async function generateReadingStrategy(book, { lang = 'ko', apiKeys, speed, remainingPages } = {}) {
  const textRec = await getBookText(book.id);
  if (!textRec?.pages || Object.keys(textRec.pages).length === 0) {
    throw new Error('no-scanned-text');
  }
  const sample = sampleBookText(textRec.pages);
  const prompt = buildPrompt(lang, book, sample, speed, remainingPages);
  const raw = await callAI(apiKeys, prompt, [], lang === 'ko' ? '전략을 생성해줘' : 'Generate the strategy');
  return parseStrategyJson(raw);
}
