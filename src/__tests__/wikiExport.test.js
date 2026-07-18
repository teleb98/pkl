import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  sanitizeFileName, buildManagedBlock, buildBookNote, mergeManagedBlock,
  selectExportBooks, exportKnowledgeToVault, FENCE_START, FENCE_END,
} from '../utils/wikiExport.js';
import { saveBookIndex, setBookMeta, addNote } from '../store.js';

beforeEach(() => { localStorage.clear(); });
afterEach(() => { vi.restoreAllMocks(); });

describe('sanitizeFileName', () => {
  it('금지 문자를 제거하고 .md 를 붙인다', () => {
    expect(sanitizeFileName('사피엔스: 유인원[초판]')).toBe('사피엔스 유인원 초판.md');
    expect(sanitizeFileName('')).toBe('무제.md');
  });
});

describe('buildManagedBlock', () => {
  it('하이라이트·메모·감상을 섹션으로 만든다', () => {
    const block = buildManagedBlock({
      highlights: [{ text: '중요한 문장', page: 42 }],
      notes: [{ text: '내 메모', page: 51 }],
      review: { text: '좋았다', rating: 4 },
    });
    expect(block).toContain('## 하이라이트');
    expect(block).toContain('(p.42) "중요한 문장"');
    expect(block).toContain('## 메모');
    expect(block).toContain('(p.51) 내 메모');
    expect(block).toContain('## 감상');
    expect(block).toContain('★★★★☆');
  });
});

describe('buildBookNote', () => {
  it('rarebook_id 프론트매터·주제 위키링크·펜스를 포함한다', () => {
    const md = buildBookNote({ id: 'bk1', title: '사피엔스' }, {
      meta: { status: 'done', aiTopics: ['역사', '인류학'], aiSummary: '요약문' },
      highlights: [{ text: 'h', page: 1 }], notes: [], review: null,
    });
    expect(md).toContain('rarebook_id: bk1');
    expect(md).toContain('status: 완독');
    expect(md).toContain('[[역사]]');
    expect(md).toContain('> [!abstract] AI 요약');
    expect(md).toContain(FENCE_START);
    expect(md).toContain(FENCE_END);
    expect(md).toContain('## 나의 생각');
  });
});

describe('mergeManagedBlock', () => {
  it('펜스 안쪽만 교체하고 밖(사용자 편집)은 보존한다', () => {
    const existing = `---\nrarebook_id: bk1\n---\n# 책\n${FENCE_START}\n옛 내용\n${FENCE_END}\n\n## 나의 생각\n소중한 내 글`;
    const merged = mergeManagedBlock(existing, '새 내용');
    expect(merged).toContain('새 내용');
    expect(merged).not.toContain('옛 내용');
    expect(merged).toContain('소중한 내 글');   // 펜스 밖 보존
    expect(merged).toContain('rarebook_id: bk1');
  });

  it('펜스가 없으면(사용자가 지웠으면) 끝에 덧붙인다', () => {
    const merged = mergeManagedBlock('# 책\n내 글만 있음', '새 내용');
    expect(merged).toContain('내 글만 있음');
    expect(merged).toContain(FENCE_START);
    expect(merged).toContain('새 내용');
  });
});

describe('selectExportBooks', () => {
  it('완독했거나 지식(메모·하이라이트·감상)이 있는 책만 고른다', () => {
    saveBookIndex([
      { id: 'done1', title: '완독' }, { id: 'noted', title: '메모 있음' },
      { id: 'blank', title: '아무것도 없음' },
    ]);
    setBookMeta('done1', { status: 'done' });
    addNote({ bookId: 'noted', bookTitle: '메모 있음', text: 'm', page: 1 });
    const ids = selectExportBooks().map(b => b.id);
    expect(ids).toEqual(expect.arrayContaining(['done1', 'noted']));
    expect(ids).not.toContain('blank');
  });
});

describe('exportKnowledgeToVault', () => {
  const FOLDER = 'application/vnd.google-apps.folder';

  it('볼트/rarebook 폴더에 책 노트를 생성한다', async () => {
    saveBookIndex([{ id: 'bk1', title: '사피엔스' }]);
    setBookMeta('bk1', { status: 'done', aiTopics: ['역사'] });

    const uploads = [];
    globalThis.fetch = vi.fn(async (url, init = {}) => {
      const u = String(url);
      if (u.includes('upload/drive')) {
        uploads.push({ url: u, body: init.body });
        return { ok: true, status: 200, json: async () => ({ id: 'newfile' }) };
      }
      const q = decodeURIComponent(((u.match(/[?&]q=([^&]+)/) || [])[1] || '').replace(/\+/g, ' '));
      const parent = (q.match(/'([^']+)' in parents/) || [])[1];
      const tree = {
        root: [{ id: 'b1', name: 'Backups', mimeType: FOLDER }],
        b1: [{ id: 'w1', name: 'cw_wiki', mimeType: FOLDER }],
        w1: [{ id: 'rb', name: 'rarebook', mimeType: FOLDER }],
        rb: [],   // 아직 노트 없음 → 신규 생성 경로
      };
      let list = tree[parent] || [];
      if (q.includes("mimeType='application/vnd.google-apps.folder'")) list = list.filter(f => f.mimeType === FOLDER);
      if (q.includes("name='")) { const nm = (q.match(/name='([^']+)'/) || [])[1]; list = list.filter(f => f.name === nm); }
      return { ok: true, status: 200, json: async () => ({ files: list }) };
    });

    const res = await exportKnowledgeToVault('tok');
    expect(res).toEqual({ created: 1, updated: 0, total: 1 });
    expect(uploads.length).toBe(1);
  });

  it('토큰이 없으면 에러', async () => {
    await expect(exportKnowledgeToVault('')).rejects.toThrow('no-token');
  });
});
