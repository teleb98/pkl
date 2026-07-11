import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  findOrCreateFolder, uploadFileToDrive, buildBackupMarkdown,
  backupBookToDrive, backupAllToDrive, DriveError,
} from '../utils/driveBackup.js';
import {
  getBackupSettings, saveBackupSettings, appendBackupLog,
  getBackupLog, getLastBackupTime,
} from '../store.js';

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});
afterEach(() => vi.restoreAllMocks());

const FAKE_TOKEN = 'fake_token';

/* ── buildBackupMarkdown ───────────────────────────────── */
describe('buildBackupMarkdown', () => {
  const book = { id: 'b1', title: '테스트 책', author: '저자' };

  it('제목과 저자 포함', () => {
    const md = buildBackupMarkdown(book, [], []);
    expect(md).toContain('# 테스트 책');
    expect(md).toContain('저자');
  });

  it('메모 개수 포함', () => {
    const notes = [{ text: '메모1', page: 10 }];
    const md = buildBackupMarkdown(book, notes, []);
    expect(md).toContain('1개');
    expect(md).toContain('## 메모');
    expect(md).toContain('메모1');
  });

  it('하이라이트 포함', () => {
    const highlights = [{ text: '중요한 문장', page: 5 }];
    const md = buildBackupMarkdown(book, [], highlights);
    expect(md).toContain('## 하이라이트');
    expect(md).toContain('중요한 문장');
    expect(md).toContain('p.5');
  });

  it('태그 포함', () => {
    const notes = [{ text: '메모', tags: ['철학', '자기계발'] }];
    const md = buildBackupMarkdown(book, notes, []);
    expect(md).toContain('철학');
    expect(md).toContain('자기계발');
  });

  it('메모/하이라이트 없어도 생성', () => {
    const md = buildBackupMarkdown(book, [], []);
    expect(md).toContain('# 테스트 책');
    expect(md).not.toContain('## 메모');
    expect(md).not.toContain('## 하이라이트');
  });
});

/* ── DriveError ────────────────────────────────────────── */
describe('DriveError', () => {
  it('status 필드 포함', () => {
    const e = new DriveError('테스트 오류', 401);
    expect(e.name).toBe('DriveError');
    expect(e.status).toBe(401);
    expect(e.message).toBe('테스트 오류');
  });
});

/* ── findOrCreateFolder ────────────────────────────────── */
describe('findOrCreateFolder', () => {
  it('기존 폴더 ID 반환', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ files: [{ id: 'folder123', name: 'PKL' }] }),
    }));
    const id = await findOrCreateFolder(FAKE_TOKEN, 'PKL');
    expect(id).toBe('folder123');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('폴더 없으면 생성 후 ID 반환', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ files: [] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'new_folder' }) })
    );
    const id = await findOrCreateFolder(FAKE_TOKEN, 'PKL');
    expect(id).toBe('new_folder');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('API 오류 시 DriveError throw', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403 }));
    await expect(findOrCreateFolder(FAKE_TOKEN, 'PKL')).rejects.toThrow(DriveError);
  });
});

/* ── uploadFileToDrive ─────────────────────────────────── */
describe('uploadFileToDrive', () => {
  it('새 파일 업로드', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ files: [] }) })   // findFile
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'file_new', name: 'test.md' }) }) // upload
    );
    const result = await uploadFileToDrive(FAKE_TOKEN, 'folder1', 'test.md', '# 내용');
    expect(result.updated).toBe(false);
    expect(result.id).toBe('file_new');
  });

  it('기존 파일 업데이트', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ files: [{ id: 'existing_id' }] }) }) // findFile
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'existing_id' }) })               // PATCH
    );
    const result = await uploadFileToDrive(FAKE_TOKEN, 'folder1', 'test.md', '# 수정 내용');
    expect(result.updated).toBe(true);
    expect(result.id).toBe('existing_id');
  });

  it('업로드 실패 시 DriveError', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ files: [] }) })
      .mockResolvedValueOnce({ ok: false, status: 500 })
    );
    await expect(uploadFileToDrive(FAKE_TOKEN, 'f', 'f.md', '')).rejects.toThrow(DriveError);
  });
});

/* ── backupBookToDrive ─────────────────────────────────── */
describe('backupBookToDrive', () => {
  const book = { id: 'b1', title: '독서의 즐거움', author: '테스터' };
  const notes = [{ text: '중요한 메모', page: 20 }];
  const highlights = [{ text: '밑줄 친 문장', page: 15 }];

  it('PKL/backups 폴더 구조 생성 후 업로드', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ files: [] }) })               // find PKL
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'pkl_id' }) })            // create PKL
      .mockResolvedValueOnce({ ok: true, json: async () => ({ files: [] }) })               // find backups
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'backup_id' }) })         // create backups
      .mockResolvedValueOnce({ ok: true, json: async () => ({ files: [] }) })               // find file
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'file_id', name: '독서의_즐거움_notes.md' }) }) // upload
    );
    const result = await backupBookToDrive(FAKE_TOKEN, book, notes, highlights);
    expect(result.bookId).toBe('b1');
    expect(result.fileName).toContain('notes.md');
    expect(fetch).toHaveBeenCalledTimes(6);
  });
});

/* ── backupAllToDrive ──────────────────────────────────── */
describe('backupAllToDrive', () => {
  it('메모/하이라이트 없는 책은 스킵', async () => {
    const mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
    const books = [{ id: 'empty', title: '빈 책' }];
    const result = await backupAllToDrive(
      FAKE_TOKEN, books,
      () => [],  // getNotes — 빈 배열
      () => [],  // getHighlights — 빈 배열
    );
    expect(result.succeeded).toHaveLength(0);
    expect(result.failed).toHaveLength(0);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('일부 실패해도 다음 책 진행', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockRejectedValueOnce(new Error('network'))    // 첫째 책 실패
      .mockResolvedValue({ ok: true, json: async () => ({ files: [] }) }) // 이후 ok
    );
    const books = [
      { id: 'fail_book', title: '실패 책' },
      { id: 'ok_book', title: '성공 책' },
    ];
    const getNotes = (id) => id === 'ok_book' ? [{ text: '메모' }] : [{ text: '메모' }];
    const getHL = () => [];
    const result = await backupAllToDrive(FAKE_TOKEN, books, getNotes, getHL);
    expect(result.failed).toContain('fail_book');
  });
});

/* ── store 백업 설정/이력 ─────────────────────────────── */
describe('getBackupSettings / saveBackupSettings', () => {
  it('기본값 반환', () => {
    const s = getBackupSettings();
    expect(s.autoBackup).toBe(false);
    expect(s.writeToken).toBeNull();
  });

  it('저장/불러오기', () => {
    saveBackupSettings({ autoBackup: true, writeToken: 'tok', writeTokenExpiresAt: 9999 });
    const s = getBackupSettings();
    expect(s.autoBackup).toBe(true);
    expect(s.writeToken).toBe('tok');
  });

  it('잘못된 JSON → 기본값', () => {
    localStorage.setItem('pkl_backup_settings', 'bad{');
    expect(getBackupSettings().autoBackup).toBe(false);
  });
});

describe('appendBackupLog / getBackupLog / getLastBackupTime', () => {
  it('로그 추가', () => {
    appendBackupLog({ status: 'ok', succeeded: 2 });
    const log = getBackupLog();
    expect(log).toHaveLength(1);
    expect(log[0].status).toBe('ok');
    expect(log[0].ts).toBeDefined();
  });

  it('최신 20개만 유지', () => {
    for (let i = 0; i < 25; i++) appendBackupLog({ status: 'ok' });
    expect(getBackupLog()).toHaveLength(20);
  });

  it('getLastBackupTime — 성공한 마지막 시각', () => {
    appendBackupLog({ status: 'error' });
    appendBackupLog({ status: 'ok' });
    expect(getLastBackupTime()).toBeGreaterThan(0);
  });

  it('성공 기록 없으면 null', () => {
    appendBackupLog({ status: 'error' });
    expect(getLastBackupTime()).toBeNull();
  });
});
