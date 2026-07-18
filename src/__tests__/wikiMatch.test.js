import { describe, it, expect } from 'vitest';
import { tokenize, buildBookTerms, scoreNote, findRelatedWikiNotes } from '../utils/wikiMatch.js';

const note = (over) => ({ title: '', tags: [], links: [], aliases: [], wordCount: 100, ...over });

describe('tokenize', () => {
  it('영숫자/한글 토큰만 소문자로', () => {
    expect(tokenize('World-War 2차대전!')).toEqual(['world', 'war', '2', '차대전']);
  });
});

describe('buildBookTerms', () => {
  it('주제 구절과 제목·주제 토큰을 만든다', () => {
    const t = buildBookTerms({ title: '사피엔스', aiTopics: ['역사', '인류학'] });
    expect(t.topicPhrases).toEqual(['역사', '인류학']);
    expect(t.tokens).toEqual(expect.arrayContaining(['사피엔스', '역사', '인류학']));
  });
});

describe('scoreNote', () => {
  const book = buildBookTerms({ title: '사피엔스', aiTopics: ['역사', '인류학'] });

  it('주제와 태그가 일치하면 강한 점수 + 근거', () => {
    const r = scoreNote(book, note({ title: '한국 근현대사', tags: ['역사'] }));
    expect(r.score).toBeGreaterThanOrEqual(3);
    expect(r.reasons).toContain('태그 #역사');
  });

  it('주제가 위키링크 대상과 일치해도 점수', () => {
    const r = scoreNote(book, note({ title: '메모', links: ['인류학'] }));
    expect(r.reasons).toContain('링크 [[인류학]]');
  });

  it('겹치는 신호가 없으면 0점', () => {
    const r = scoreNote(book, note({ title: '요리 레시피', tags: ['음식'] }));
    expect(r.score).toBe(0);
  });
});

describe('findRelatedWikiNotes', () => {
  const notes = [
    note({ id: 'n1', title: '역사 개론', tags: ['역사'] }),
    note({ id: 'n2', title: '인류학 노트', tags: ['인류학'], links: ['진화'] }),
    note({ id: 'n3', title: '오늘 저녁', tags: ['요리'] }),
  ];

  it('관련 노트를 점수순으로, 무관한 것은 제외', () => {
    const res = findRelatedWikiNotes({ title: '사피엔스', aiTopics: ['역사', '인류학'] }, notes, { minScore: 2 });
    const ids = res.map(r => r.note.id);
    expect(ids).toContain('n1');
    expect(ids).toContain('n2');
    expect(ids).not.toContain('n3');
  });

  it('주제/제목 신호가 전혀 없으면 빈 배열', () => {
    expect(findRelatedWikiNotes({ title: '', aiTopics: [] }, notes)).toEqual([]);
  });

  it('limit 를 넘지 않는다', () => {
    const many = Array.from({ length: 10 }, (_, i) => note({ id: `m${i}`, tags: ['역사'] }));
    expect(findRelatedWikiNotes({ aiTopics: ['역사'] }, many, { limit: 3 }).length).toBe(3);
  });
});
