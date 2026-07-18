import { describe, it, expect } from 'vitest';
import { findDeepDiveTopics, buildDeepDivePrompt, openingUserMsg } from '../utils/deepDive.js';
import { buildKnowledgeGraph } from '../utils/knowledgeGraph.js';

const wnote = (over) => ({ id: 'n', title: '', tags: [], links: [], ...over });

describe('findDeepDiveTopics', () => {
  it('노트+책 둘 다 있는 주제를 우선, 그다음 신호 합계순', () => {
    const books = [
      { id: 'b1', title: 'A', aiTopics: ['자유의지'] },          // 노트도 있음 → both
      { id: 'b2', title: 'B', aiTopics: ['역사'] },
      { id: 'b3', title: 'C', aiTopics: ['역사'] },              // 역사: 책 2, 노트 0
    ];
    const notes = [wnote({ id: 'n1', tags: ['자유의지'] }), wnote({ id: 'n2', tags: ['요리'] })];
    const g = buildKnowledgeGraph(books, notes);
    const topics = findDeepDiveTopics(g);
    expect(topics[0].topic).toBe('자유의지');                     // both 우선
    expect(topics[0].noteCount).toBe(1);
    expect(topics[0].bookCount).toBe(1);
    expect(topics.map(t => t.topic)).toContain('역사');           // 신호 있으면 포함
  });

  it('신호가 전혀 없는 그래프면 빈 배열', () => {
    expect(findDeepDiveTopics(buildKnowledgeGraph([], []))).toEqual([]);
  });

  it('limit 를 지킨다', () => {
    const books = Array.from({ length: 8 }, (_, i) => ({ id: `b${i}`, title: `B${i}`, aiTopics: [`주제${i}`] }));
    expect(findDeepDiveTopics(buildKnowledgeGraph(books, []), { limit: 3 }).length).toBe(3);
  });
});

describe('buildDeepDivePrompt', () => {
  it('노트·책 근거와 소크라테스 규칙을 담는다', () => {
    const p = buildDeepDivePrompt('자유의지', {
      notes: [{ title: '자유의지 단상', content: '자유의지는 있다고 본다' }],
      books: [{ title: '자유의지의 과학', summary: '결정론 옹호', highlights: ['뇌가 먼저 결정한다'] }],
    }, 'ko');
    expect(p).toContain('자유의지');
    expect(p).toContain('《자유의지 단상》');
    expect(p).toContain('자유의지는 있다고 본다');
    expect(p).toContain('《자유의지의 과학》');
    expect(p).toContain('뇌가 먼저 결정한다');
    expect(p).toContain('한 번에 질문 하나만');
    expect(p).toContain('Feynman');
  });

  it('영어 프롬프트도 만든다', () => {
    const p = buildDeepDivePrompt('free will', { notes: [], books: [] }, 'en');
    expect(p).toContain('Socratic sparring partner');
    expect(p).toContain('One question at a time');
  });

  it('openingUserMsg 는 첫 질문을 요청한다', () => {
    expect(openingUserMsg('ko')).toContain('첫 질문');
    expect(openingUserMsg('en')).toContain('first question');
  });
});
