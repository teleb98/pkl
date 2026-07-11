import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/* ────────────────────────────────────────────────────────────────
   버그 헌팅 회귀 테스트 (2026-07 테스트 케이스 확충)
   각 describe 는 실제 발견된 결함 하나를 고정한다:
   1. readingCoach — 일별 그룹핑이 전체 ISO 타임스탬프 기준 → 일별 통계 전부 0
   2. store — addNote/addHighlight/addSession id 가 Date.now() 만 사용 → 같은 ms 충돌
   3. store — streak: 오늘 기록이 없으면 어제까지의 연속 기록이 0으로 표시
   4. store — streak 이 7일 창에 갇혀 streak30/100 배지 획득 불가
   5. quizGenerator — AI가 ```json 펜스로 감싸면 파싱 실패
   6. reviewCard — 별점 5 초과 시 '☆'.repeat(음수) RangeError
   7. driveBackup — 저자 없는 책 백업 md 에 빈 줄 artifact
   ─────────────────────────────────────────────────────────────── */

const webLoginFn = vi.fn();
vi.mock('@react-oauth/google', () => ({
  useGoogleLogin: (opts) => { webLoginFn._opts = opts; return webLoginFn; },
}));

import { getWeeklyCoachData } from '../utils/readingCoach.js';
import {
  addNote, getNotes, deleteNote,
  addHighlight, getHighlights,
  addSession, getSessions,
  getWeekStats, computeStreak,
} from '../store.js';
import { parseQuizResponse } from '../utils/quizGenerator.js';
import { starString } from '../utils/reviewCard.js';
import { buildBackupMarkdown } from '../utils/driveBackup.js';
import { useGoogleAuth, hasWebOAuth } from '../utils/useGoogleAuth.js';

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  delete window.electron;
});
afterEach(() => {
  vi.restoreAllMocks();
  delete window.electron;
});

/** n일 전 정오(UTC 기준 하루 중간) ISO 문자열 — 자정 경계 오차 방지 */
function daysAgoIso(n, hour = 12) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const day = d.toISOString().slice(0, 10);
  return `${day}T${String(hour).padStart(2, '0')}:00:00.000Z`;
}

function seedSessions(sessions) {
  localStorage.setItem('pkl_sessions', JSON.stringify(sessions));
}

/* ── 1. readingCoach 일별 통계 ─────────────────────────────── */
describe('readingCoach — 일별 통계가 실제 세션을 반영', () => {
  it('오늘 세션의 분/페이지가 dailyStats 마지막 항목(오늘)에 집계된다', () => {
    seedSessions([
      { id: '1', bookId: 'b1', date: daysAgoIso(0), minutes: 30, pages: 10 },
      { id: '2', bookId: 'b1', date: daysAgoIso(0), minutes: 15, pages: 5 },
    ]);
    const data = getWeeklyCoachData();
    const today = data.dailyStats[data.dailyStats.length - 1];
    expect(today.minutes).toBe(45);
    expect(today.pages).toBe(15);
    expect(today.sessions).toBe(2);
  });

  it('readDays 는 세션 수가 아니라 "읽은 날 수"를 센다', () => {
    seedSessions([
      { id: '1', bookId: 'b1', date: daysAgoIso(0, 9), minutes: 10, pages: 1 },
      { id: '2', bookId: 'b1', date: daysAgoIso(0, 20), minutes: 10, pages: 1 },
      { id: '3', bookId: 'b1', date: daysAgoIso(1), minutes: 10, pages: 1 },
    ]);
    const data = getWeeklyCoachData();
    expect(data.readDays).toBe(2); // 오늘 + 어제
  });

  it('pages 필드가 없는 세션이 있어도 NaN 이 되지 않는다', () => {
    seedSessions([
      { id: '1', bookId: 'b1', date: daysAgoIso(0), minutes: 20 }, // pages 없음
      { id: '2', bookId: 'b1', date: daysAgoIso(0), minutes: 10, pages: 3 },
    ]);
    const data = getWeeklyCoachData();
    const today = data.dailyStats[data.dailyStats.length - 1];
    expect(Number.isNaN(today.pages)).toBe(false);
    expect(today.pages).toBe(3);
    expect(Number.isNaN(today.minutes)).toBe(false);
    expect(today.minutes).toBe(30);
  });
});

/* ── 2. store id 충돌 ──────────────────────────────────────── */
describe('store — 같은 ms 에 연속 추가해도 id 가 유일', () => {
  it('addNote 2회 (같은 timestamp) → 서로 다른 id', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1750000000000);
    const a = addNote({ bookId: 'b1', text: 'A' });
    const b = addNote({ bookId: 'b1', text: 'B' });
    expect(a.id).not.toBe(b.id);
  });

  it('id 충돌 시 deleteNote 가 다른 메모까지 지우지 않는다', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1750000000000);
    const a = addNote({ bookId: 'b1', text: 'A' });
    addNote({ bookId: 'b1', text: 'B' });
    deleteNote(a.id);
    const remain = getNotes();
    expect(remain).toHaveLength(1);
    expect(remain[0].text).toBe('B');
  });

  it('addHighlight / addSession 도 동일', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1750000000000);
    const h1 = addHighlight({ bookId: 'b1', text: 'h1' });
    const h2 = addHighlight({ bookId: 'b1', text: 'h2' });
    expect(h1.id).not.toBe(h2.id);
    const s1 = addSession({ bookId: 'b1', minutes: 5 });
    const s2 = addSession({ bookId: 'b1', minutes: 5 });
    expect(s1.id).not.toBe(s2.id);
    expect(getHighlights()).toHaveLength(2);
    expect(getSessions()).toHaveLength(2);
  });
});

/* ── 3+4. streak ──────────────────────────────────────────── */
describe('store — streak 계산', () => {
  it('오늘 아직 안 읽었어도 어제까지의 연속 기록이 유지된다', () => {
    seedSessions([
      { id: '1', bookId: 'b1', date: daysAgoIso(1), minutes: 30 },
      { id: '2', bookId: 'b1', date: daysAgoIso(2), minutes: 30 },
    ]);
    expect(getWeekStats().streak).toBe(2);
  });

  it('오늘 읽으면 오늘 포함', () => {
    seedSessions([
      { id: '1', bookId: 'b1', date: daysAgoIso(0), minutes: 30 },
      { id: '2', bookId: 'b1', date: daysAgoIso(1), minutes: 30 },
    ]);
    expect(getWeekStats().streak).toBe(2);
  });

  it('중간에 빈 날이 있으면 거기서 끊긴다', () => {
    seedSessions([
      { id: '1', bookId: 'b1', date: daysAgoIso(0), minutes: 30 },
      { id: '2', bookId: 'b1', date: daysAgoIso(3), minutes: 30 },
    ]);
    expect(getWeekStats().streak).toBe(1);
  });

  it('그저께까지만 읽었으면 (어제 공백) streak 0', () => {
    seedSessions([{ id: '1', bookId: 'b1', date: daysAgoIso(2), minutes: 30 }]);
    expect(getWeekStats().streak).toBe(0);
  });

  it('7일 넘는 연속 기록도 집계된다 (streak30/100 배지 가능)', () => {
    seedSessions(Array.from({ length: 31 }, (_, i) => ({
      id: `s${i}`, bookId: 'b1', date: daysAgoIso(i), minutes: 10,
    })));
    expect(computeStreak()).toBe(31);
    expect(getWeekStats().streak).toBe(31);
  });

  it('minutes 0 세션만 있는 날은 읽은 날로 치지 않는다', () => {
    seedSessions([
      { id: '1', bookId: 'b1', date: daysAgoIso(0), minutes: 0 },
      { id: '2', bookId: 'b1', date: daysAgoIso(1), minutes: 30 },
    ]);
    expect(getWeekStats().streak).toBe(1); // 어제만
  });
});

/* ── 5. 퀴즈 JSON 파싱 ─────────────────────────────────────── */
describe('quizGenerator.parseQuizResponse — LLM 응답 형태 관용', () => {
  const quiz = { question: 'Q', options: ['1', '2', '3', '4', '5'], correctIndex: 2, explanation: 'E' };

  it('순수 JSON', () => {
    expect(parseQuizResponse(JSON.stringify(quiz))).toEqual(quiz);
  });

  it('```json 코드펜스로 감싼 응답', () => {
    const fenced = '```json\n' + JSON.stringify(quiz, null, 2) + '\n```';
    expect(parseQuizResponse(fenced)).toEqual(quiz);
  });

  it('언어 표기 없는 ``` 펜스', () => {
    const fenced = '```\n' + JSON.stringify(quiz) + '\n```';
    expect(parseQuizResponse(fenced)).toEqual(quiz);
  });

  it('앞뒤에 잡담이 붙은 응답', () => {
    const chatty = '네, 퀴즈를 만들었습니다:\n' + JSON.stringify(quiz) + '\n도움이 되길 바랍니다!';
    expect(parseQuizResponse(chatty)).toEqual(quiz);
  });

  it('JSON 이 전혀 없으면 null', () => {
    expect(parseQuizResponse('죄송합니다, 퀴즈를 만들 수 없습니다.')).toBeNull();
    expect(parseQuizResponse('')).toBeNull();
    expect(parseQuizResponse(null)).toBeNull();
  });

  it('기존 동작 유지: 빈 객체 "{}"', () => {
    expect(parseQuizResponse('{}')).toEqual({});
  });
});

/* ── 6. 리뷰 카드 별점 ─────────────────────────────────────── */
describe('reviewCard.starString — 별점 범위 방어', () => {
  it('정상 범위', () => {
    expect(starString(0)).toBe('☆☆☆☆☆');
    expect(starString(3)).toBe('★★★☆☆');
    expect(starString(4.5)).toBe('★★★★⯨');
    expect(starString(5)).toBe('★★★★★');
  });

  it('5 초과·음수·비숫자에도 throw 하지 않는다', () => {
    expect(() => starString(6)).not.toThrow();
    expect(starString(6)).toBe('★★★★★');
    expect(starString(-1)).toBe('☆☆☆☆☆');
    expect(starString(NaN)).toBe('☆☆☆☆☆');
    expect(starString(undefined)).toBe('☆☆☆☆☆');
  });
});

/* ── 7. Drive 백업 마크다운 ────────────────────────────────── */
describe('driveBackup.buildBackupMarkdown', () => {
  it('저자가 없으면 저자 줄(빈 줄 artifact) 없이 생성된다', () => {
    const md = buildBackupMarkdown({ id: 'b1', title: '무제' }, [], []);
    const lines = md.split('\n');
    expect(lines[0]).toBe('# 무제');
    expect(lines[1]).toMatch(/^\*\*백업:\*\*/); // 제목 바로 다음이 백업 줄
  });

  it('저자가 있으면 저자 줄 포함', () => {
    const md = buildBackupMarkdown({ id: 'b1', title: '무제', author: '김작가' }, [], []);
    expect(md).toContain('**저자:** 김작가');
  });

  it('하이라이트/메모 섹션 렌더', () => {
    const md = buildBackupMarkdown(
      { id: 'b1', title: 'T' },
      [{ text: '메모입니다', page: 3, tags: ['태그'] }],
      [{ text: '밑줄', page: 1 }],
    );
    expect(md).toContain('## 하이라이트');
    expect(md).toContain('> 밑줄');
    expect(md).toContain('## 메모');
    expect(md).toContain('*태그: 태그*');
  });
});

/* ── 8. (전날 패치 커버) 웹 OAuth 미설정 가드 ─────────────── */
describe('useGoogleAuth — 웹 클라이언트 ID 미설정 가드', () => {
  it('hasWebOAuth: 미설정 false / 설정 true', () => {
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', '');
    expect(hasWebOAuth()).toBe(false);
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'web.apps.googleusercontent.com');
    expect(hasWebOAuth()).toBe(true);
  });

  it('웹 + ID 미설정: 호출 시 GIS 팝업 대신 onError(web-oauth-not-configured)', () => {
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', '');
    const onError = vi.fn();
    const login = useGoogleAuth({ scope: 'openid', onError });
    expect(login).not.toBe(webLoginFn);
    login();
    expect(onError).toHaveBeenCalledWith('web-oauth-not-configured');
    expect(webLoginFn).not.toHaveBeenCalled();
  });

  it('웹 + ID 설정: 정상적으로 GIS 로그인 함수 반환', () => {
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'web.apps.googleusercontent.com');
    const login = useGoogleAuth({ scope: 'openid', onError: vi.fn() });
    expect(login).toBe(webLoginFn);
  });
});
