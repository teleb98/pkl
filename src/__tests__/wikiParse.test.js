import { describe, it, expect } from 'vitest';
import {
  parseFrontmatter, extractTags, extractWikiLinks, buildExcerpt, parseNote, titleFromFileName,
} from '../utils/wikiParse.js';

describe('parseFrontmatter', () => {
  it('인라인/블록 리스트와 스칼라를 파싱한다', () => {
    const { data, body } = parseFrontmatter(
      '---\ntitle: 사피엔스\naliases: [Sapiens, 인류]\ntags:\n  - 역사\n  - 인류학\n---\n본문 시작'
    );
    expect(data.title).toBe('사피엔스');
    expect(data.aliases).toEqual(['Sapiens', '인류']);
    expect(data.tags).toEqual(['역사', '인류학']);
    expect(body).toBe('본문 시작');
  });

  it('프론트매터가 없으면 원문을 body로', () => {
    const { data, body } = parseFrontmatter('# 제목\n내용');
    expect(data).toEqual({});
    expect(body).toBe('# 제목\n내용');
  });
});

describe('extractTags', () => {
  it('인라인 #태그만 뽑고 헤딩(# )과 숫자는 제외', () => {
    const tags = extractTags('# 헤딩입니다\n본문 #역사 #world-war2 코드 `#nope` 끝 #123');
    expect(tags).toContain('역사');
    expect(tags).toContain('world-war2');
    expect(tags).not.toContain('헤딩입니다');
    expect(tags).not.toContain('nope');   // 인라인 코드 안
    expect(tags).not.toContain('123');
  });
});

describe('extractWikiLinks', () => {
  it('별칭·헤딩을 제거하고 대상만, 이미지 임베드는 제외', () => {
    const links = extractWikiLinks('[[역사]] 그리고 [[돈의 역사|돈]] 과 [[사피엔스#3장]] ![[img.png]]');
    expect(links).toEqual(expect.arrayContaining(['역사', '돈의 역사', '사피엔스']));
    expect(links).not.toContain('img.png');
  });
});

describe('buildExcerpt', () => {
  it('마크다운/위키링크/주석을 걷어낸 축약을 만든다', () => {
    const ex = buildExcerpt('## 제목\n%% 숨김 %% [[역사]]에 대한 **중요한** 메모', 100);
    expect(ex).toContain('역사');
    expect(ex).toContain('중요한');
    expect(ex).not.toContain('%%');
    expect(ex).not.toContain('##');
  });
});

describe('parseNote', () => {
  it('프론트매터 태그 + 인라인 태그를 합치고 제목을 결정', () => {
    const note = parseNote('사피엔스.md', '---\ntags: [역사]\n---\n#인류학 [[진화]] 내용');
    expect(note.title).toBe('사피엔스');
    expect(note.tags).toEqual(expect.arrayContaining(['역사', '인류학']));
    expect(note.links).toContain('진화');
    expect(note.wordCount).toBeGreaterThan(0);
  });

  it('title 프론트매터가 없으면 파일명에서 제목', () => {
    expect(parseNote('나의 노트.md', '내용').title).toBe('나의 노트');
    expect(titleFromFileName('a.md')).toBe('a');
  });
});
