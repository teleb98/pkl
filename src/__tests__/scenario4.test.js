import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  addNote, addHighlight, getNotesByBook, getHighlightsByBook,
} from '../store.js';
import {
  buildNotesHtml, buildNotesMarkdown,
  downloadNotesAsMarkdown, printNotesAsPdf,
} from '../utils/exportNotes.js';

beforeEach(() => localStorage.clear());

/* ── 책별 노트/하이라이트 조회 ────────────────────────── */
describe('getNotesByBook', () => {
  it('해당 책의 노트만 반환', () => {
    addNote({ bookId: 'b1', bookTitle: '책1', text: '노트A', page: 10 });
    addNote({ bookId: 'b2', bookTitle: '책2', text: '노트B', page: 5 });
    addNote({ bookId: 'b1', bookTitle: '책1', text: '노트C', page: 20 });
    const notes = getNotesByBook('b1');
    expect(notes).toHaveLength(2);
    expect(notes.every(n => n.bookId === 'b1')).toBe(true);
  });

  it('없으면 빈 배열', () => {
    expect(getNotesByBook('nope')).toEqual([]);
  });
});

describe('getHighlightsByBook', () => {
  it('해당 책의 하이라이트만 반환', () => {
    addHighlight({ bookId: 'b1', bookTitle: '책1', text: 'HL1', page: 1, color: '#fde047' });
    addHighlight({ bookId: 'b2', bookTitle: '책2', text: 'HL2', page: 2 });
    expect(getHighlightsByBook('b1')).toHaveLength(1);
    expect(getHighlightsByBook('b2')).toHaveLength(1);
  });
});

/* ── HTML 빌더 ─────────────────────────────────────────── */
describe('buildNotesHtml', () => {
  it('책 제목과 저자가 cover에 포함됨', () => {
    const html = buildNotesHtml({ title: '예제 책', author: '저자' }, [], []);
    expect(html).toContain('예제 책');
    expect(html).toContain('저자');
    expect(html).toContain('<!doctype html>');
  });

  it('HTML escape — XSS 방지', () => {
    const html = buildNotesHtml(
      { title: '<script>alert(1)</script>', author: '' },
      [],
      []
    );
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('하이라이트와 노트가 페이지 순으로 정렬', () => {
    const html = buildNotesHtml(
      { title: '책' },
      [
        { text: '노트B', page: 50, date: '2026-01-01' },
        { text: '노트A', page: 10, date: '2026-01-01' },
      ],
      []
    );
    expect(html.indexOf('노트A')).toBeLessThan(html.indexOf('노트B'));
  });

  it('하이라이트 color가 left border로 적용됨', () => {
    const html = buildNotesHtml(
      { title: '책' },
      [],
      [{ text: '강조', page: 1, date: '2026-01-01', color: '#ff0000' }]
    );
    expect(html).toContain('#ff0000');
  });

  it('빈 데이터에도 cover와 섹션 헤더 출력', () => {
    const html = buildNotesHtml({ title: '책' }, [], []);
    expect(html).toContain('하이라이트가 없습니다');
    expect(html).toContain('노트가 없습니다');
  });

  it('태그가 출력됨', () => {
    const html = buildNotesHtml({ title: '책' },
      [{ text: 'note', page: 1, date: '2026-01-01', tags: ['철학', 'core'] }],
      []
    );
    expect(html).toContain('#철학');
    expect(html).toContain('#core');
  });

  it('하이라이트/노트 개수가 cover에 표시됨', () => {
    const html = buildNotesHtml({ title: '책' },
      [{ text: 'n1', page: 1 }, { text: 'n2', page: 2 }],
      [{ text: 'h1', page: 3 }]
    );
    expect(html).toMatch(/하이라이트.*1/);
    expect(html).toMatch(/노트.*2/);
  });
});

/* ── Markdown 빌더 ─────────────────────────────────────── */
describe('buildNotesMarkdown', () => {
  it('# 제목과 메타정보 포함', () => {
    const md = buildNotesMarkdown({ title: '책', author: '저자' }, [], []);
    expect(md).toMatch(/^# 책/);
    expect(md).toContain('*저자*');
  });

  it('하이라이트는 > quote로 포함', () => {
    const md = buildNotesMarkdown({ title: '책' }, [],
      [{ text: '명문장', page: 7, date: '2026-01-01' }]
    );
    expect(md).toContain('> 명문장');
    expect(md).toContain('p.7');
  });

  it('노트는 일반 텍스트', () => {
    const md = buildNotesMarkdown({ title: '책' },
      [{ text: '나의 생각', page: 3, date: '2026-01-01' }], []
    );
    expect(md).toContain('나의 생각');
  });

  it('빈 데이터 → _없음_ 표시', () => {
    const md = buildNotesMarkdown({ title: '책' }, [], []);
    expect(md).toMatch(/하이라이트[\s\S]*_없음_/);
    expect(md).toMatch(/노트[\s\S]*_없음_/);
  });

  it('태그 포함', () => {
    const md = buildNotesMarkdown({ title: '책' },
      [{ text: 'n', page: 1, date: '2026-01-01', tags: ['중요'] }], []
    );
    expect(md).toContain('`#중요`');
  });
});

/* ── 다운로드 동작 ────────────────────────────────────── */
describe('downloadNotesAsMarkdown', () => {
  it('a 태그를 생성하고 클릭 → 파일명에 책 제목 포함', () => {
    const clickSpy = vi.fn();
    const origCreate = document.createElement.bind(document);
    let anchorCaptured = null;
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      const el = origCreate(tag);
      if (tag === 'a') {
        anchorCaptured = el;
        el.click = clickSpy;
      }
      return el;
    });

    global.URL.createObjectURL = vi.fn(() => 'blob:test');
    global.URL.revokeObjectURL = vi.fn();

    downloadNotesAsMarkdown({ id: 'b1', title: '예제 책' }, [], []);

    expect(clickSpy).toHaveBeenCalled();
    expect(anchorCaptured.download).toBe('예제 책_notes.md');
    vi.restoreAllMocks();
  });

  it('파일명에 위험 문자 sanitize', () => {
    const origCreate = document.createElement.bind(document);
    let anchorCaptured = null;
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      const el = origCreate(tag);
      if (tag === 'a') { anchorCaptured = el; el.click = vi.fn(); }
      return el;
    });
    global.URL.createObjectURL = vi.fn(() => 'blob:test');
    global.URL.revokeObjectURL = vi.fn();

    downloadNotesAsMarkdown({ title: 'foo/bar:baz' }, [], []);
    expect(anchorCaptured.download).toBe('foo_bar_baz_notes.md');
    vi.restoreAllMocks();
  });
});

describe('printNotesAsPdf', () => {
  it('새 창을 열고 HTML 작성 후 print 호출', () => {
    const printSpy = vi.fn();
    const focusSpy = vi.fn();
    const writeSpy = vi.fn();
    const closeSpy = vi.fn();
    const openSpy = vi.spyOn(window, 'open').mockReturnValue({
      document: { open: vi.fn(), write: writeSpy, close: closeSpy },
      focus: focusSpy,
      print: printSpy,
    });

    vi.useFakeTimers();
    const result = printNotesAsPdf({ title: '책' }, [], []);
    expect(result).toBe(true);
    expect(openSpy).toHaveBeenCalledWith('', '_blank');
    expect(writeSpy).toHaveBeenCalled();
    expect(writeSpy.mock.calls[0][0]).toContain('책');

    vi.runAllTimers();
    expect(printSpy).toHaveBeenCalled();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('window.open이 차단된 경우 false 반환', () => {
    vi.spyOn(window, 'open').mockReturnValue(null);
    expect(printNotesAsPdf({ title: '책' }, [], [])).toBe(false);
    vi.restoreAllMocks();
  });
});

/* ── round-trip ───────────────────────────────────────── */
describe('round-trip — 노트 추가 → 내보내기', () => {
  it('노트와 하이라이트가 모두 출력에 포함', () => {
    addNote({ bookId: 'b1', bookTitle: '책', text: '내 메모', page: 10 });
    addHighlight({ bookId: 'b1', bookTitle: '책', text: '강조 문장', page: 5, color: '#ff0' });
    const html = buildNotesHtml(
      { id: 'b1', title: '책' },
      getNotesByBook('b1'),
      getHighlightsByBook('b1')
    );
    expect(html).toContain('내 메모');
    expect(html).toContain('강조 문장');
  });
});
