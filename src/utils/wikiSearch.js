/* 위키 노트 RAG — 사용자의 질문과 관련된 cw_wiki 노트를 찾아 AI 프롬프트에 넣을
   컨텍스트로 만든다(순수 함수). 벡터 인덱스가 아니라 로컬 캐시된 파싱 인덱스 위의
   토큰 기반 검색이라 키 없이도 오프라인으로 동작한다. */
import { tokenize } from './wikiMatch.js';

const SNIPPET_LEN = 260;

/** 질의 토큰 q 와 매칭되는 노트 토큰들(정확 일치 또는 부분 포함 — 한국어 조사 대응) */
function matchToks(noteToks, q) {
  return noteToks.filter(t => t === q || (t.length >= 2 && q.length >= 2 && (t.includes(q) || q.includes(t))));
}

/** matched 토큰이 처음 등장하는 지점 주변을 잘라 스니펫을 만든다(없으면 발췌 앞부분) */
export function buildSnippet(note, matched) {
  const text = note.content || note.excerpt || '';
  const low = text.toLowerCase();
  let at = -1;
  for (const m of matched) {
    const i = low.indexOf(m);
    if (i >= 0 && (at < 0 || i < at)) at = i;
  }
  if (at < 0) return (note.excerpt || text).slice(0, SNIPPET_LEN).trim();
  const start = Math.max(0, at - 60);
  const slice = text.slice(start, start + SNIPPET_LEN).trim();
  return (start > 0 ? '…' : '') + slice + (start + SNIPPET_LEN < text.length ? '…' : '');
}

/**
 * 질문과 관련된 위키 노트를 점수순으로 반환.
 * @param {string} query
 * @param {Array} notes  파싱된 위키 인덱스(title/tags/links/content/excerpt)
 * @param {{limit?:number, minScore?:number}} [opts]
 * @returns {Array<{ note, score:number, snippet:string, matched:string[] }>}
 */
export function searchWikiNotes(query, notes, opts = {}) {
  const { limit = 4, minScore = 2 } = opts;
  const qTokens = [...new Set(tokenize(query))].filter(t => t.length >= 2);
  if (!qTokens.length) return [];

  const results = [];
  for (const note of notes || []) {
    const titleToks = tokenize(note.title);
    const tagToks = (note.tags || []).flatMap(tokenize);
    const linkToks = (note.links || []).flatMap(tokenize);
    const contentToks = tokenize(note.content || note.excerpt || '');

    let score = 0;
    const matched = new Set();
    const add = (hits, weight) => { if (hits.length) { score += Math.min(hits.length, 2) + weight - 1; hits.forEach(h => matched.add(h)); } };
    for (const q of qTokens) {
      add(matchToks(titleToks, q), 3);
      add(matchToks(tagToks, q), 3);
      add(matchToks(linkToks, q), 2);
      add(matchToks(contentToks, q), 1);
    }
    if (score >= minScore && matched.size) {
      results.push({ note, score, matched: [...matched], snippet: buildSnippet(note, matched) });
    }
  }
  return results.sort((a, b) => b.score - a.score).slice(0, limit);
}

/** 검색 결과를 시스템 프롬프트에 덧붙일 컨텍스트 블록으로 포맷(빈 결과면 '') */
export function formatWikiContext(results, lang = 'ko') {
  if (!results || !results.length) return '';
  const header = lang === 'ko'
    ? '\n\n[내 위키 메모 — cw_wiki]\n아래는 사용자가 직접 작성한 옵시디언 위키에서 질문과 관련된 부분입니다. 답변에 활용하고, 인용하면 노트 제목을 함께 밝혀 주세요.\n'
    : '\n\n[My wiki notes — cw_wiki]\nThe following are relevant excerpts from the user\'s own Obsidian wiki. Use them in your answer, and cite the note title when you draw on one.\n';
  const body = results.map(r => `- 《${r.note.title}》: ${r.snippet}`).join('\n');
  return header + body;
}
