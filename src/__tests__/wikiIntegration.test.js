/* cw_wiki 연계 종단(E2E) 시나리오 — 실제 옵시디언 볼트 형태의 픽스처와
   스테이트풀 Drive 목으로 파이프라인 전체를 검증한다:
   A. 가져오기(중첩 폴더·다양한 프론트매터) → B. 책↔위키 교차연결 →
   C. AI 컨텍스트(시맨틱 검색) → D. 내보내기 왕복(사용자 편집·파일명 변경 보존) */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { syncWikiIndex } from '../utils/driveWiki.js';
import { findRelatedWikiNotes } from '../utils/wikiMatch.js';
import { buildWikiVectors, searchWiki } from '../utils/wikiVector.js';
import { formatWikiContext } from '../utils/wikiSearch.js';
import { exportKnowledgeToVault, exportGapNote, FENCE_START, FENCE_END } from '../utils/wikiExport.js';
import { deleteBookVectors } from '../utils/bookVectorDb.js';
import { saveBookIndex, setBookMeta, addNote, addHighlight } from '../store.js';

const FOLDER = 'application/vnd.google-apps.folder';

/* ── 스테이트풀 Drive 목 — 목록/다운로드/생성/업데이트를 실제처럼 반영 ── */
function createMockDrive(initialFiles) {
  const files = new Map(initialFiles.map(f => [f.id, { parents: ['root'], content: '', ...f }]));
  let seq = 0;
  const fetchImpl = vi.fn(async (url, init = {}) => {
    const u = String(url);
    const method = (init.method || 'GET').toUpperCase();

    // 본문 다운로드
    let m = u.match(/drive\/v3\/files\/([^?/]+)\?alt=media/);
    if (m) {
      const f = files.get(m[1]);
      return { ok: !!f, status: f ? 200 : 404, text: async () => f?.content ?? '' };
    }
    // 기존 파일 업데이트(PATCH, body 는 Blob)
    m = u.match(/upload\/drive\/v3\/files\/([^?/]+)\?/);
    if (m && method === 'PATCH') {
      const f = files.get(m[1]);
      if (!f) return { ok: false, status: 404 };
      f.content = typeof init.body === 'string' ? init.body : await init.body.text();
      return { ok: true, status: 200, json: async () => ({ id: f.id }) };
    }
    // 신규 파일 생성(multipart POST)
    if (u.includes('upload/drive/v3/files?uploadType=multipart') && method === 'POST') {
      const body = String(init.body);
      const meta = JSON.parse(body.match(/\r\n\r\n(\{[\s\S]*?\})\r\n--/)[1]);
      const content = (body.match(/Content-Type: text\/markdown\r\n\r\n([\s\S]*?)\r\n--[^-]*--$/) || [])[1] || '';
      const id = `gen${++seq}`;
      files.set(id, { id, name: meta.name, mimeType: meta.mimeType || 'text/markdown', parents: meta.parents || ['root'], content });
      return { ok: true, status: 200, json: async () => ({ id, name: meta.name }) };
    }
    // 폴더 생성(JSON POST)
    if (/drive\/v3\/files$/.test(u.split('?')[0]) && method === 'POST') {
      const meta = JSON.parse(init.body);
      const id = `gen${++seq}`;
      files.set(id, { id, name: meta.name, mimeType: meta.mimeType, parents: meta.parents || ['root'], content: '' });
      return { ok: true, status: 200, json: async () => ({ id }) };
    }
    // 목록/검색(GET files?q=)
    const q = decodeURIComponent(((u.match(/[?&]q=([^&]+)/) || [])[1] || '').replace(/\+/g, ' '));
    const parent = (q.match(/'([^']+)' in parents/) || [])[1];
    let list = [...files.values()].filter(f => (f.parents || []).includes(parent));
    if (q.includes(`mimeType='${FOLDER}'`)) list = list.filter(f => f.mimeType === FOLDER);
    const nm = (q.match(/name='((?:[^'\\]|\\.)*)'/) || [])[1];
    if (nm) list = list.filter(f => f.name === nm.replace(/\\'/g, "'"));
    return { ok: true, status: 200, json: async () => ({ files: list.map(({ content, ...rest }) => rest) }) };
  });
  return { fetchImpl, files };
}

/* ── 현실적인 옵시디언 볼트 픽스처 (Backups/cw_wiki) ── */
function vaultFixture() {
  return [
    { id: 'bak', name: 'Backups', mimeType: FOLDER, parents: ['root'] },
    { id: 'wiki', name: 'cw_wiki', mimeType: FOLDER, parents: ['bak'] },
    // 인라인 배열 프론트매터 + 위키링크
    { id: 'f1', name: '독서법.md', mimeType: 'text/markdown', parents: ['wiki'],
      content: '---\ntags: [독서, 학습]\naliases: [reading-method]\n---\n# 독서법\n[[제텔카스텐]] 방식으로 메모하며 읽는다.' },
    // 하위 폴더 + 블록 리스트 프론트매터
    { id: 'sub1', name: '주제', mimeType: FOLDER, parents: ['wiki'] },
    { id: 'f2', name: '역사노트.md', mimeType: 'text/plain', parents: ['sub1'],
      content: '---\ntags:\n  - 역사\n  - 프랑스\n---\n프랑스 혁명은 1789년 시민이 왕정을 무너뜨린 사건. [[계몽주의]]가 사상적 배경.' },
    // 프론트매터 없는 데일리 노트(인라인 태그)
    { id: 'sub2', name: '일지', mimeType: FOLDER, parents: ['wiki'] },
    { id: 'f3', name: '2026-07-01.md', mimeType: 'text/markdown', parents: ['sub2'],
      content: '오늘은 #일기 를 썼다. 요리 연습도 했다.' },
    // 무시되어야 하는 파일들
    { id: 'img', name: '첨부.png', mimeType: 'image/png', parents: ['wiki'] },
  ];
}

beforeEach(async () => {
  localStorage.clear();
  await deleteBookVectors('__wiki__').catch(() => {});
});

describe('시나리오 A — 가져오기: 실제 볼트 구조를 인덱스로', () => {
  it('중첩 폴더의 .md 만 수집하고 프론트매터 스타일별로 파싱한다', async () => {
    const { fetchImpl } = createMockDrive(vaultFixture());
    globalThis.fetch = fetchImpl;

    const res = await syncWikiIndex('tok');
    expect(res.count).toBe(3);                                 // png 제외
    const byName = Object.fromEntries(res.notes.map(n => [n.name, n]));

    expect(byName['독서법.md'].tags).toEqual(expect.arrayContaining(['독서', '학습']));
    expect(byName['독서법.md'].links).toContain('제텔카스텐');
    expect(byName['역사노트.md'].tags).toEqual(expect.arrayContaining(['역사', '프랑스'])); // 블록 리스트
    expect(byName['역사노트.md'].path).toBe('주제');            // 중첩 경로
    expect(byName['2026-07-01.md'].tags).toContain('일기');     // 인라인 태그
  });
});

describe('시나리오 B — 교차연결: 책 주제 ↔ 위키', () => {
  it('책의 aiTopics 와 겹치는 노트를 근거와 함께 찾는다', async () => {
    const { fetchImpl } = createMockDrive(vaultFixture());
    globalThis.fetch = fetchImpl;
    const { notes } = await syncWikiIndex('tok');

    const related = findRelatedWikiNotes({ title: '혁명의 시대', aiTopics: ['역사', '프랑스'] }, notes);
    expect(related[0].note.name).toBe('역사노트.md');
    expect(related[0].reasons).toContain('태그 #역사');
    expect(related.map(r => r.note.name)).not.toContain('2026-07-01.md'); // 무관 노트 제외
  });
});

describe('시나리오 C — AI 컨텍스트: 위키 기반 답변 재료', () => {
  it('시맨틱 검색으로 관련 노트를 찾아 프롬프트 블록을 만든다', async () => {
    const { fetchImpl } = createMockDrive(vaultFixture());
    globalThis.fetch = fetchImpl;
    const { notes } = await syncWikiIndex('tok');
    await buildWikiVectors(notes, {});                          // 로컬 임베딩(키 없음)

    const hits = await searchWiki('프랑스 혁명이 일어난 배경이 뭐야', notes, {});
    expect(hits[0].note.name).toBe('역사노트.md');

    const ctx = formatWikiContext(hits, 'ko');
    expect(ctx).toContain('cw_wiki');
    expect(ctx).toContain('역사노트');
    expect(ctx).toContain('계몽주의');                          // 스니펫에 본문 포함
  });
});

describe('시나리오 D — 내보내기 왕복: 사용자 편집·파일명 변경 보존', () => {
  it('생성 → 옵시디언에서 편집·개명 → 재내보내기에도 편집이 보존된다', async () => {
    const drive = createMockDrive(vaultFixture());
    globalThis.fetch = drive.fetchImpl;

    // 1) 서재: 완독 책 + 지식
    saveBookIndex([{ id: 'bk1', title: '혁명의 시대' }]);
    setBookMeta('bk1', { status: 'done', aiTopics: ['역사'], aiSummary: '19세기 혁명사' });
    addHighlight({ bookId: 'bk1', bookTitle: '혁명의 시대', text: '첫 하이라이트', page: 10 });

    // 2) 최초 내보내기 → rarebook/ 폴더 자동 생성 + 노트 생성
    let res = await exportKnowledgeToVault('tok');
    expect(res).toEqual({ created: 1, updated: 0, total: 1 });
    const created = [...drive.files.values()].find(f => f.name === '혁명의 시대.md');
    expect(created).toBeTruthy();
    const rarebookFolder = [...drive.files.values()].find(f => f.name === 'rarebook' && f.mimeType === FOLDER);
    expect(created.parents).toContain(rarebookFolder.id);
    expect(created.content).toContain('rarebook_id: bk1');
    expect(created.content).toContain('[[역사]]');
    expect(created.content).toContain('첫 하이라이트');

    // 3) 사용자가 옵시디언에서: 펜스 밖에 자기 글 추가 + 파일명 변경
    created.content += '\n이 책은 인생책이다. [[혁명]] 노트와 연결.\n';
    created.name = '혁명의시대(내가 바꾼 이름).md';

    // 4) 서재에서 하이라이트 추가 후 재내보내기
    addHighlight({ bookId: 'bk1', bookTitle: '혁명의 시대', text: '둘째 하이라이트', page: 99 });
    res = await exportKnowledgeToVault('tok');
    expect(res).toEqual({ created: 0, updated: 1, total: 1 });  // rarebook_id 로 개명 파일 매칭

    const updated = drive.files.get(created.id);
    expect(updated.name).toBe('혁명의시대(내가 바꾼 이름).md');   // 파일명 유지
    expect(updated.content).toContain('둘째 하이라이트');         // 펜스 안 갱신
    expect(updated.content).toContain('이 책은 인생책이다');       // 펜스 밖 보존
    expect(updated.content.match(new RegExp(FENCE_START.slice(0, 20), 'g')).length).toBe(1); // 펜스 중복 없음
    expect([...drive.files.values()].filter(f => f.name.endsWith('.md') && (f.parents || []).includes(rarebookFolder.id)).length).toBe(1); // 파일 중복 생성 없음
  });

  it('지식 공백 노트: 생성 → 재생성 시 rarebook_id(topic:)로 매칭·펜스 갱신', async () => {
    const drive = createMockDrive(vaultFixture());
    globalThis.fetch = drive.fetchImpl;

    let res = await exportGapNote('tok', { topic: '역사', draftBody: '첫 초안', sources: ['사피엔스'] });
    expect(res.created).toBe(true);
    const note = [...drive.files.values()].find(f => f.name === '역사.md');
    expect(note.content).toContain('rarebook_id: topic:역사');
    expect(note.content).toContain('[[역사]]');
    expect(note.content).toContain('첫 초안');

    // 사용자가 펜스 밖에 글 추가
    note.content += '\n내가 덧붙인 생각.';
    res = await exportGapNote('tok', { topic: '역사', draftBody: '재합성된 초안' });
    expect(res.updated).toBe(true);
    const updated = drive.files.get(note.id);
    expect(updated.content).toContain('재합성된 초안');
    expect(updated.content).not.toContain('첫 초안');
    expect(updated.content).toContain('내가 덧붙인 생각');   // 펜스 밖 보존
  });

  it('펜스를 통째로 지운 노트에는 펜스를 끝에 재부착한다', async () => {
    const drive = createMockDrive(vaultFixture());
    globalThis.fetch = drive.fetchImpl;
    saveBookIndex([{ id: 'bk1', title: '혁명의 시대' }]);
    setBookMeta('bk1', { status: 'done' });
    addNote({ bookId: 'bk1', bookTitle: '혁명의 시대', text: '메모', page: 1 });

    await exportKnowledgeToVault('tok');
    const f = [...drive.files.values()].find(x => x.name === '혁명의 시대.md');
    f.content = `---\nrarebook_id: bk1\n---\n# 혁명의 시대\n펜스 없이 내 글만.`; // 사용자가 펜스 삭제

    await exportKnowledgeToVault('tok');
    expect(f.content).toContain('펜스 없이 내 글만.');
    expect(f.content).toContain(FENCE_START);
    expect(f.content).toContain(FENCE_END);
    expect(f.content).toContain('메모');
  });
});
