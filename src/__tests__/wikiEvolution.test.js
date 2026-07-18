import { describe, it, expect } from 'vitest';
import { gatherTopicNotes, buildEvolutionPrompt } from '../utils/wikiEvolution.js';
import { buildKnowledgeGraph, findEvolvingTopics } from '../utils/knowledgeGraph.js';

const wnote = (over) => ({ id: 'n', title: '', tags: [], links: [], ...over });

describe('gatherTopicNotes', () => {
  it('주제를 다루는 노트를 시간순(오래된→최근)으로', () => {
    const notes = [
      wnote({ id: 'n2', title: '자유의지2', tags: ['자유의지'], modifiedTime: '2026-06-01T00:00:00Z' }),
      wnote({ id: 'n1', title: '자유의지1', tags: ['자유의지'], modifiedTime: '2026-01-01T00:00:00Z' }),
      wnote({ id: 'x', title: '요리', tags: ['음식'], modifiedTime: '2026-03-01T00:00:00Z' }),
    ];
    const got = gatherTopicNotes('자유의지', notes);
    expect(got.map(n => n.id)).toEqual(['n1', 'n2']);   // 시간순, 무관 노트 제외
  });
});

describe('buildEvolutionPrompt', () => {
  it('시간순 노트와 관련 책을 담고 진화·모순·질문을 요청', () => {
    const notes = [
      wnote({ title: '초기 생각', content: '자유의지는 있다', modifiedTime: '2026-01-01T00:00:00Z' }),
      wnote({ title: '수정된 생각', content: '결정론이 더 설득력', modifiedTime: '2026-06-01T00:00:00Z' }),
    ];
    const p = buildEvolutionPrompt('자유의지', notes, [{ title: '자유의지론', summary: '요약' }], 'ko');
    expect(p).toContain('자유의지');
    expect(p).toContain('[2026-01-01] 《초기 생각》');
    expect(p).toContain('《자유의지론》');
    expect(p).toContain('생각의 흐름');
    expect(p).toContain('긴장·모순');
  });

  it('영어 프롬프트도 만든다', () => {
    expect(buildEvolutionPrompt('free will', [], [], 'en')).toContain('Evolution');
  });
});

describe('findEvolvingTopics', () => {
  it('노트 minNotes 이상인 주제를 노트 수 내림차순으로', () => {
    const notes = [
      wnote({ id: 'a', tags: ['자유의지'] }),
      wnote({ id: 'b', tags: ['자유의지'] }),
      wnote({ id: 'c', tags: ['요리'] }),   // 노트 1개
    ];
    const g = buildKnowledgeGraph([], notes);   // 책 없이 노트 태그만으로도 주제 노드 생성
    const evolving = findEvolvingTopics(g, { minNotes: 2 });
    expect(evolving.map(t => t.topic)).toContain('자유의지');
    expect(evolving.map(t => t.topic)).not.toContain('요리');
    expect(evolving[0].noteCount).toBe(2);
  });
});
