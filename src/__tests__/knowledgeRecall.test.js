import { describe, it, expect, beforeEach } from 'vitest';
import {
  computeNoteDegrees, recallPriority, pickRecallCandidates,
  buildRecallQuizPrompt, parseRecallQuiz,
} from '../utils/knowledgeRecall.js';
import { getRecallLog, recordRecall } from '../store.js';

const DAY = 24 * 60 * 60 * 1000;
const LONG = 'x'.repeat(60);   // 후보 자격(내용 40자 이상)
const wnote = (over) => ({ id: 'n', title: '', tags: [], links: [], aliases: [], content: LONG, ...over });

describe('computeNoteDegrees', () => {
  it('[[링크]]를 무방향 차수로 센다(별칭 해석 포함)', () => {
    const notes = [
      wnote({ id: 'hub', title: '허브' }),
      wnote({ id: 'a', title: 'A', links: ['허브'] }),
      wnote({ id: 'b', title: 'B', links: ['허브', '없는노트'] }),   // 미해석 링크는 무시
    ];
    const deg = computeNoteDegrees(notes);
    expect(deg.get('hub')).toBe(2);
    expect(deg.get('a')).toBe(1);
  });
});

describe('recallPriority', () => {
  const now = Date.now();

  it('오래될수록 점수가 높다', () => {
    const oldNote = wnote({ modifiedTime: new Date(now - 60 * DAY).toISOString() });
    const newNote = wnote({ modifiedTime: new Date(now - 2 * DAY).toISOString() });
    expect(recallPriority(oldNote, 0, {}, now)).toBeGreaterThan(recallPriority(newNote, 0, {}, now));
  });

  it('중심성(차수)이 높을수록 점수가 높다', () => {
    const n = wnote({ modifiedTime: new Date(now - 10 * DAY).toISOString() });
    expect(recallPriority(n, 5, {}, now)).toBeGreaterThan(recallPriority(n, 0, {}, now));
  });

  it('실패율이 높을수록 점수가 높다', () => {
    const n = wnote({ modifiedTime: new Date(now - 10 * DAY).toISOString() });
    const weak = { lastReviewAt: now - 10 * DAY, attempts: 2, fails: 2 };
    const strong = { lastReviewAt: now - 10 * DAY, attempts: 2, fails: 0 };
    expect(recallPriority(n, 0, weak, now)).toBeGreaterThan(recallPriority(n, 0, strong, now));
  });

  it('복습하면(lastReviewAt 갱신) 점수가 낮아진다', () => {
    const n = wnote({ modifiedTime: new Date(now - 60 * DAY).toISOString() });
    expect(recallPriority(n, 0, { lastReviewAt: now - DAY }, now))
      .toBeLessThan(recallPriority(n, 0, {}, now));
  });
});

describe('pickRecallCandidates', () => {
  it('내용이 짧은 노트는 제외하고 우선순위순으로 자른다', () => {
    const now = Date.now();
    const notes = [
      wnote({ id: 'old', modifiedTime: new Date(now - 90 * DAY).toISOString() }),
      wnote({ id: 'new', modifiedTime: new Date(now - 1 * DAY).toISOString() }),
      wnote({ id: 'short', content: '짧음' }),
    ];
    const picked = pickRecallCandidates(notes, {}, { limit: 2, now });
    expect(picked[0].note.id).toBe('old');
    expect(picked.map(p => p.note.id)).not.toContain('short');
  });
});

describe('quiz prompt/parse', () => {
  const notes = [wnote({ id: 'n1', title: '노트1' }), wnote({ id: 'n2', title: '노트2' })];

  it('프롬프트에 노트 id·본문·JSON 규칙 포함', () => {
    const p = buildRecallQuizPrompt(notes, 'ko');
    expect(p).toContain('id=n1');
    expect(p).toContain('JSON');
  });

  it('AI 응답을 id→질문 맵으로, 누락은 폴백', () => {
    const q = parseRecallQuiz('[{"id":"n1","question":"왜 그런가?"}]', notes, 'ko');
    expect(q.get('n1')).toBe('왜 그런가?');
    expect(q.get('n2')).toContain('《노트2》');   // 폴백
  });

  it('완전 파싱 실패면 전부 폴백', () => {
    const q = parseRecallQuiz('엉뚱한 텍스트', notes, 'ko');
    expect(q.get('n1')).toContain('《노트1》');
  });
});

describe('recall log (store)', () => {
  beforeEach(() => localStorage.clear());

  it('결과를 누적 기록한다', () => {
    recordRecall('n1', true);
    recordRecall('n1', false);
    const log = getRecallLog();
    expect(log.n1.attempts).toBe(2);
    expect(log.n1.fails).toBe(1);
    expect(log.n1.lastReviewAt).toBeGreaterThan(0);
  });
});
