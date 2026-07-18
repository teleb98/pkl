import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resolveFolderByPath, listMarkdownFiles, syncWikiIndex, WikiDriveError } from '../utils/driveWiki.js';

/* Drive API를 URL 패턴으로 흉내내는 fetch 목 */
function mockDrive({ tree = {}, files = {} } = {}) {
  // tree: parentId -> [{id,name,mimeType}] ,  files: fileId -> text
  return vi.fn(async (url) => {
    const u = String(url);
    if (u.includes('alt=media')) {
      const id = u.match(/files\/([^?]+)\?/)[1];
      return { ok: true, status: 200, text: async () => files[id] ?? '' };
    }
    const q = decodeURIComponent(((u.match(/[?&]q=([^&]+)/) || [])[1] || '').replace(/\+/g, ' '));
    const parent = (q.match(/'([^']+)' in parents/) || [])[1];
    let list = tree[parent] || [];
    if (q.includes("mimeType='application/vnd.google-apps.folder'")) {
      list = list.filter(f => f.mimeType === 'application/vnd.google-apps.folder');
    }
    return { ok: true, status: 200, json: async () => ({ files: list }) };
  });
}

beforeEach(() => { globalThis.fetch = undefined; });
afterEach(() => { vi.restoreAllMocks(); });

const FOLDER = 'application/vnd.google-apps.folder';

describe('resolveFolderByPath', () => {
  it('root부터 경로를 따라 최종 폴더 id를 찾는다', async () => {
    globalThis.fetch = mockDrive({ tree: {
      root: [{ id: 'b1', name: 'Backups', mimeType: FOLDER }],
      b1: [{ id: 'w1', name: 'cw_wiki', mimeType: FOLDER }],
    }});
    await expect(resolveFolderByPath('tok', ['Backups', 'cw_wiki'])).resolves.toBe('w1');
  });

  it('대소문자가 달라도 폴백 매칭', async () => {
    globalThis.fetch = mockDrive({ tree: { root: [{ id: 'b1', name: 'backups', mimeType: FOLDER }] } });
    await expect(resolveFolderByPath('tok', ['Backups'])).resolves.toBe('b1');
  });

  it('경로가 없으면 folder-not-found', async () => {
    globalThis.fetch = mockDrive({ tree: { root: [] } });
    await expect(resolveFolderByPath('tok', ['Backups'])).rejects.toMatchObject({ code: 'folder-not-found' });
  });

  it('401은 auth-expired', async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: false, status: 401 }));
    await expect(resolveFolderByPath('tok', ['Backups'])).rejects.toMatchObject({ code: 'auth-expired' });
  });
});

describe('listMarkdownFiles', () => {
  it('하위 폴더까지 재귀로 .md만 수집한다', async () => {
    globalThis.fetch = mockDrive({ tree: {
      w1: [
        { id: 'f1', name: 'a.md', mimeType: 'text/markdown' },
        { id: 'sub', name: '2026', mimeType: FOLDER },
        { id: 'img', name: 'pic.png', mimeType: 'image/png' },
      ],
      sub: [{ id: 'f2', name: 'b.md', mimeType: 'text/plain' }],
    }});
    const files = await listMarkdownFiles('tok', 'w1');
    const names = files.map(f => f.name).sort();
    expect(names).toEqual(['a.md', 'b.md']);
    expect(files.find(f => f.name === 'b.md').path).toBe('2026');
  });

  it('maxNotes 상한을 지킨다', async () => {
    globalThis.fetch = mockDrive({ tree: {
      w1: Array.from({ length: 5 }, (_, i) => ({ id: `f${i}`, name: `n${i}.md`, mimeType: 'text/markdown' })),
    }});
    const files = await listMarkdownFiles('tok', 'w1', { maxNotes: 2 });
    expect(files.length).toBe(2);
  });
});

describe('syncWikiIndex', () => {
  it('볼트를 스캔해 파싱된 노트 인덱스를 만든다', async () => {
    globalThis.fetch = mockDrive({
      tree: {
        root: [{ id: 'b1', name: 'Backups', mimeType: FOLDER }],
        b1: [{ id: 'w1', name: 'cw_wiki', mimeType: FOLDER }],
        w1: [{ id: 'f1', name: '사피엔스.md', mimeType: 'text/markdown' }],
      },
      files: { f1: '---\ntags: [역사]\n---\n[[진화]] 메모' },
    });
    const res = await syncWikiIndex('tok', { segments: ['Backups', 'cw_wiki'] });
    expect(res.count).toBe(1);
    expect(res.notes[0].title).toBe('사피엔스');
    expect(res.notes[0].tags).toContain('역사');
    expect(res.notes[0].links).toContain('진화');
  });

  it('토큰이 없으면 no-token', async () => {
    await expect(syncWikiIndex('', {})).rejects.toBeInstanceOf(WikiDriveError);
  });
});
