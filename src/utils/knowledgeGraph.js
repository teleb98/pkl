/* 지식 그래프 — 읽은 책(book→topic)과 cw_wiki 노트(note→topic, note↔note)를
   하나의 네트워크로 보고, "많이 읽었지만 아직 위키에 정리하지 않은 주제"(지식 공백)를
   찾는다. 옵시디언의 그래프 구조를 되살려 서재가 사고 파트너가 되게 하는 첫 조각. */
import { tokenize } from './wikiMatch.js';

function norm(s) { return String(s || '').toLowerCase().trim(); }

/** 위키 노트가 이 주제를 "다루고 있는가" — 태그/링크/제목 겹침으로 판정 */
export function noteCoversTopic(note, topicNorm) {
  if (!topicNorm) return false;
  const contains = (a, b) => a === b || (a.length >= 2 && b.length >= 2 && (a.includes(b) || b.includes(a)));
  if ((note.tags || []).map(norm).some(t => contains(t, topicNorm))) return true;
  if ((note.links || []).map(norm).some(l => contains(l, topicNorm))) return true;
  const titleToks = new Set(tokenize(note.title));
  const topicToks = tokenize(topicNorm);
  return topicToks.length > 0 && topicToks.every(t => titleToks.has(t));
}

/**
 * 책·위키 노트로 주제 중심 그래프를 만든다.
 * @param {Array<{id,title,aiTopics?:string[]}>} books
 * @param {Array} wikiNotes  파싱된 위키 인덱스
 * @returns {{ topics: Map<string,{topic,books:Set,notes:Set}>, bookCount, noteCount }}
 */
export function buildKnowledgeGraph(books, wikiNotes) {
  const topics = new Map();
  for (const b of books || []) {
    for (const raw of b.aiTopics || []) {
      const key = norm(raw);
      if (!key) continue;
      if (!topics.has(key)) topics.set(key, { topic: raw, books: new Set(), notes: new Set() });
      topics.get(key).books.add(b.id);
    }
  }
  for (const [key, entry] of topics) {
    for (const n of wikiNotes || []) {
      if (noteCoversTopic(n, key)) entry.notes.add(n.id);
    }
  }
  return { topics, bookCount: (books || []).length, noteCount: (wikiNotes || []).length };
}

/**
 * 지식 공백 — 위키 노트가 하나도 없고, 책 신호가 minBooks 이상인 주제.
 * @returns {Array<{topic, key, bookIds:string[], bookCount:number}>} 책 수 내림차순
 */
export function findGaps(graph, { minBooks = 2 } = {}) {
  const out = [];
  for (const [key, e] of graph.topics) {
    if (e.notes.size === 0 && e.books.size >= minBooks) {
      out.push({ topic: e.topic, key, bookIds: [...e.books], bookCount: e.books.size });
    }
  }
  return out.sort((a, b) => b.bookCount - a.bookCount);
}
