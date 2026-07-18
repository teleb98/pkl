/* 다권 종합 회고 — 최근 기간에 읽은 여러 책을 AI가 가로질러 분석한다.
   BookCompare(2권 비교)를 일반화한 버전: 세션 기록으로 "최근 읽은 책"
   후보를 자동으로 뽑고, 서재 전체 RAG/메타를 근거로 공통 주제·시너지·
   다음 스텝을 종합한다. */
import { getSessions, getBookMeta, getNotes, getAllHighlightsByBook } from '../store.js';
import { getDocumentText } from '../pageTextCache.js';
import { callAI } from '../aiClient.js';

const MAX_BOOKS = 6;       // 프롬프트 크기 상한
const SNIPPET_CHARS = 500; // 책별 본문 발췌 길이(BookCompare 의 2000자보다 작게 — 여러 권 합산이므로)

/** 최근 periodDays 일 동안 세션이 있었던 책들을, 읽은 시간이 많은 순으로 반환. */
export function getRetroCandidates(periodDays = 30) {
  const cutoff = Date.now() - periodDays * 86400000;
  const sessions = getSessions().filter(s => s.bookId && new Date(s.date).getTime() >= cutoff);
  const byBook = {};
  for (const s of sessions) {
    if (!byBook[s.bookId]) byBook[s.bookId] = { bookId: s.bookId, bookTitle: s.bookTitle || s.bookId, minutes: 0, pages: 0 };
    byBook[s.bookId].minutes += s.minutes || 0;
    byBook[s.bookId].pages += s.pages || 0;
  }
  return Object.values(byBook).sort((a, b) => b.minutes - a.minutes);
}

function buildBookContext(book) {
  const meta = getBookMeta(book.bookId) || {};
  const notes = getNotes().filter(n => n.bookId === book.bookId);
  const highlights = getAllHighlightsByBook(book.bookId);
  const doc = getDocumentText(book.bookId);
  const snippet = doc?.text ? doc.text.slice(0, SNIPPET_CHARS) : '';

  const parts = [`《${book.bookTitle}》`];
  if (meta.aiAuthor) parts.push(`저자: ${meta.aiAuthor}`);
  if (meta.aiSummary) parts.push(`요약: ${meta.aiSummary}`);
  if (meta.aiTopics?.length) parts.push(`주제: ${meta.aiTopics.join(', ')}`);
  if (notes.length) parts.push(`내 메모 ${notes.length}개: ${notes.slice(0, 2).map(n => n.text).join(' / ')}`);
  if (highlights.length) parts.push(`하이라이트 ${highlights.length}개: ${highlights.slice(0, 2).map(h => h.text).join(' / ')}`);
  if (snippet) parts.push(`본문 발췌: ${snippet}`);
  return parts.join('\n');
}

function buildPrompt(lang, books) {
  const contexts = books.map(buildBookContext).join('\n\n---\n\n');
  if (lang === 'ko') {
    return `당신은 독서 코치입니다. 아래는 사용자가 최근 읽은 여러 책의 정보입니다.
이 책들을 종합해서 분석해주세요. 마크다운으로 구조화하세요:

## 공통 주제
책들이 공유하는 핵심 개념이나 주제.

## 연결점과 시너지
책들 사이에서 발견되는 뜻밖의 연결이나 서로를 보완하는 지점.

## 다음 스텝 제안
이 독서 경험을 이어갈 구체적인 다음 행동(더 읽을 책, 정리할 개념 등).

${contexts}`;
  }
  return `You are a reading coach. Below is info on several books the user recently read.
Synthesize across them, structured in markdown:

## Common Themes
Core concepts or themes shared across the books.

## Connections & Synergies
Unexpected links or complementary points between the books.

## Suggested Next Steps
Concrete next actions to continue this reading journey.

${contexts}`;
}

/**
 * 선택된 책들을 종합해 AI 회고를 생성한다.
 * @param {Array<{bookId:string, bookTitle:string}>} books
 * @throws {Error} 'no-books' — 대상 책이 없음
 */
export async function generateMonthlyRetro(books, { lang = 'ko', apiKeys } = {}) {
  if (!books?.length) throw new Error('no-books');
  const trimmed = books.slice(0, MAX_BOOKS);
  const prompt = buildPrompt(lang, trimmed);
  return callAI(apiKeys, prompt, [], lang === 'ko' ? '회고를 작성해줘' : 'Write the retro');
}
