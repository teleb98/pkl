/* 지식 성장 경로 — 완독한 책들을 완료 순서로 이어 "무엇에서 무엇으로 지식이
   깊어지고 있는가"를 파악한다(크로스 서비스 아님, 서재 내부 고도화).
   핵심 관심사(반복 등장 주제)와 최근 이동(새로 등장한 주제)을 인사이트로 보여주고,
   다음 읽을 책 추천이 단순 유사도가 아니라 "경로의 다음 단계"를 밟도록 힌트를 준다. */

import { getBookIndex, getBookMeta } from '../store.js';

const MIN_BOOKS = 3;    // 이보다 적으면 경로를 판단하지 않음
const RECENT_TAKE = 3;  // 최근 이동 판단에 쓰는 마지막 완독 책 수

/**
 * 완독 책 목록(주제 포함)에서 지식 성장 경로를 계산한다(순수 함수).
 * @param {Array<{title:string, topics?:string[], at?:number}>} readBooks
 * @returns {{ enough:boolean, bookCount:number,
 *   coreTopics:Array<{topic:string,count:number}>, recentTopics:string[],
 *   emergingTopics:string[], trajectory:Array<{title:string,topics:string[]}> }}
 */
export function computeKnowledgePath(readBooks) {
  // 주제가 하나라도 있는 완독 책만, 완료(updatedAt) 순으로 정렬
  const valid = (readBooks || [])
    .filter(b => Array.isArray(b?.topics) && b.topics.length)
    .slice()
    .sort((a, b) => (a.at || 0) - (b.at || 0));
  const bookCount = valid.length;
  if (bookCount < MIN_BOOKS) {
    return { enough: false, bookCount, coreTopics: [], recentTopics: [], emergingTopics: [], trajectory: [] };
  }

  const trajectory = valid.map(b => ({ title: b.title, topics: b.topics }));

  // 핵심 관심사 — 여러 책에 반복 등장한 주제(등장 횟수 desc)
  const count = {};
  for (const b of valid) for (const t of new Set(b.topics)) count[t] = (count[t] || 0) + 1;
  const coreTopics = Object.entries(count)
    .filter(([, c]) => c >= 2)
    .sort((a, b) => b[1] - a[1])
    .map(([topic, c]) => ({ topic, count: c }));

  // 최근 이동 — 마지막 몇 권의 주제 중, 그 이전 책들에는 없던 새 주제
  const recent = valid.slice(-RECENT_TAKE);
  const earlier = valid.slice(0, -RECENT_TAKE);
  const earlierTopics = new Set(earlier.flatMap(b => b.topics));
  const recentTopics = [...new Set(recent.flatMap(b => b.topics))];
  const emergingTopics = earlier.length
    ? recentTopics.filter(t => !earlierTopics.has(t))
    : [];

  return { enough: true, bookCount, coreTopics, recentTopics, emergingTopics, trajectory };
}

/** 서재의 완독 책(주제·완료시각 포함)에서 지식 성장 경로를 계산한다(store 연동). */
export function getKnowledgePath() {
  const readBooks = getBookIndex()
    .map(b => ({ book: b, meta: getBookMeta(b.id) || {} }))
    .filter(({ meta }) => meta.status === 'done' || (meta.progress || 0) >= 100)
    .map(({ book, meta }) => ({ title: book.title, topics: meta.aiTopics || [], at: meta.updatedAt || 0 }));
  return computeKnowledgePath(readBooks);
}

/**
 * 추천 프롬프트에 넣을 지식 성장 경로 힌트 문장. 경로가 약하면 빈 문자열.
 */
export function pathHintLine(path, lang = 'ko') {
  if (!path?.enough) return '';
  const core = path.coreTopics.slice(0, 3).map(c => c.topic);
  const emerging = path.emergingTopics.slice(0, 3);
  if (!core.length && !emerging.length) return '';

  if (lang === 'ko') {
    const parts = [];
    if (core.length) parts.push(`핵심 관심사는 ${core.join(', ')}`);
    if (emerging.length) parts.push(`최근 ${emerging.join(', ')} 쪽으로 넓어지는 중`);
    return `\n## 참고: 지식 성장 경로\n지금까지 완독한 책들을 보면 ${parts.join('이고, ')}입니다. 단순히 비슷한 책이 아니라, 이 흐름에서 한 걸음 더 깊어지거나 자연스럽게 확장되는 "다음 단계"의 책을 우선 고려하세요.\n`;
  }
  const parts = [];
  if (core.length) parts.push(`core interests are ${core.join(', ')}`);
  if (emerging.length) parts.push(`recently branching into ${emerging.join(', ')}`);
  return `\n## Note: Knowledge Growth Path\nAcross finished books, the reader's ${parts.join(', and ')}. Prefer a "next step" book that deepens or naturally extends this trajectory, not just a similar one.\n`;
}
