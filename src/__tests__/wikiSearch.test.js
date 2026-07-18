import { describe, it, expect } from 'vitest';
import { searchWikiNotes, formatWikiContext } from '../utils/wikiSearch.js';

const note = (over) => ({ title: '', tags: [], links: [], content: '', excerpt: '', ...over });

describe('searchWikiNotes', () => {
  const notes = [
    note({ id: 'n1', title: '역사 개론', tags: ['역사'], content: '프랑스 혁명은 1789년에 일어났다.' }),
    note({ id: 'n2', title: '요리 노트', tags: ['음식'], content: '파스타 삶는 법.' }),
    note({ id: 'n3', title: '메모', content: '프랑스 혁명과 계몽주의의 관계를 정리.' }),
  ];

  it('제목/태그가 질의 토큰과 맞으면 상위로', () => {
    const res = searchWikiNotes('역사에 대해 알려줘', notes);
    expect(res[0].note.id).toBe('n1');
    expect(res[0].matched).toContain('역사');
  });

  it('본문(content)에서 매칭되고 스니펫을 만든다', () => {
    const res = searchWikiNotes('프랑스 혁명', notes);
    const ids = res.map(r => r.note.id);
    expect(ids).toEqual(expect.arrayContaining(['n1', 'n3']));
    expect(res.find(r => r.note.id === 'n3').snippet).toContain('프랑스 혁명');
  });

  it('무관한 노트는 제외', () => {
    const res = searchWikiNotes('역사', notes);
    expect(res.map(r => r.note.id)).not.toContain('n2');
  });

  it('짧은 질의(2자 미만 토큰만)면 빈 배열', () => {
    expect(searchWikiNotes('a', notes)).toEqual([]);
    expect(searchWikiNotes('', notes)).toEqual([]);
  });

  it('limit 를 지킨다', () => {
    const many = Array.from({ length: 8 }, (_, i) => note({ id: `m${i}`, tags: ['역사'] }));
    expect(searchWikiNotes('역사', many, { limit: 3 }).length).toBe(3);
  });
});

describe('formatWikiContext', () => {
  it('결과가 없으면 빈 문자열', () => {
    expect(formatWikiContext([])).toBe('');
    expect(formatWikiContext(null)).toBe('');
  });

  it('노트 제목·스니펫을 담고 인용 안내를 포함(한국어)', () => {
    const ctx = formatWikiContext([{ note: { title: '역사 개론' }, snippet: '프랑스 혁명…' }], 'ko');
    expect(ctx).toContain('cw_wiki');
    expect(ctx).toContain('역사 개론');
    expect(ctx).toContain('프랑스 혁명');
    expect(ctx).toContain('노트 제목');
  });

  it('영어 컨텍스트도 만든다', () => {
    const ctx = formatWikiContext([{ note: { title: 'History' }, snippet: 'French Revolution' }], 'en');
    expect(ctx).toContain('cw_wiki');
    expect(ctx).toContain('History');
    expect(ctx).toContain('cite');
  });
});
