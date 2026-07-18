import { describe, it, expect } from 'vitest';
import { noteCoversTopic, buildKnowledgeGraph, findGaps } from '../utils/knowledgeGraph.js';
import { buildGapNotePrompt, cleanDraft } from '../utils/gapDraft.js';

const wnote = (over) => ({ id: 'n', title: '', tags: [], links: [], ...over });

describe('noteCoversTopic', () => {
  it('태그·링크·제목 겹침을 인식(한국어 부분포함)', () => {
    expect(noteCoversTopic(wnote({ tags: ['역사'] }), '역사')).toBe(true);
    expect(noteCoversTopic(wnote({ tags: ['한국사'] }), '한국사')).toBe(true);
    expect(noteCoversTopic(wnote({ links: ['인류학'] }), '인류학')).toBe(true);
    expect(noteCoversTopic(wnote({ title: '진화 이야기' }), '진화')).toBe(true);
    expect(noteCoversTopic(wnote({ tags: ['요리'] }), '역사')).toBe(false);
  });
});

describe('buildKnowledgeGraph', () => {
  it('책 topic·노트 태그로 주제 노드를 잇는다', () => {
    const books = [
      { id: 'b1', title: 'A', aiTopics: ['역사', '철학'] },
      { id: 'b2', title: 'B', aiTopics: ['역사'] },
    ];
    const notes = [wnote({ id: 'n1', tags: ['철학'] })];
    const g = buildKnowledgeGraph(books, notes);
    expect(g.topics.get('역사').books.size).toBe(2);
    expect(g.topics.get('역사').notes.size).toBe(0);   // 위키 노트 없음 → 공백 후보
    expect(g.topics.get('철학').notes.size).toBe(1);   // 노트 있음
  });
});

describe('findGaps', () => {
  const books = [
    { id: 'b1', title: 'A', aiTopics: ['역사', '심리'] },
    { id: 'b2', title: 'B', aiTopics: ['역사'] },
    { id: 'b3', title: 'C', aiTopics: ['역사'] },
  ];

  it('노트 없고 책 신호 minBooks 이상인 주제만, 책 수 내림차순', () => {
    const g = buildKnowledgeGraph(books, []);
    const gaps = findGaps(g, { minBooks: 2 });
    expect(gaps[0].topic).toBe('역사');
    expect(gaps[0].bookCount).toBe(3);
    expect(gaps.map(x => x.topic)).not.toContain('심리'); // 책 1권 → 미달
  });

  it('위키 노트가 커버하면 공백에서 빠진다', () => {
    const g = buildKnowledgeGraph(books, [wnote({ tags: ['역사'] })]);
    expect(findGaps(g, { minBooks: 2 })).toEqual([]);
  });
});

describe('buildGapNotePrompt / cleanDraft', () => {
  it('주제·하이라이트·메모·규칙을 담는다', () => {
    const p = buildGapNotePrompt('역사', [
      { title: '사피엔스', summary: '인류사', highlights: ['허구가 협력을'], notes: ['화폐는 신뢰'] },
    ], 'ko');
    expect(p).toContain('역사');
    expect(p).toContain('《사피엔스》');
    expect(p).toContain('허구가 협력을');
    expect(p).toContain('화폐는 신뢰');
    expect(p).toContain('[[위키링크]]');
  });

  it('영어 프롬프트도 만든다', () => {
    expect(buildGapNotePrompt('history', [{ title: 'Sapiens' }], 'en')).toContain('second brain');
  });

  it('코드펜스와 선두 H1 을 제거한다', () => {
    expect(cleanDraft('```markdown\n# 역사\n본문입니다\n```')).toBe('본문입니다');
    expect(cleanDraft('본문만')).toBe('본문만');
  });
});
