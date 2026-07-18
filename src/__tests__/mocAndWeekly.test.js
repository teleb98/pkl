import { describe, it, expect } from 'vitest';
import { buildMocPrompt } from '../utils/mocDraft.js';
import { buildMocNote } from '../utils/wikiExport.js';
import { buildWeeklyReview } from '../utils/weeklyReview.js';

const DAY = 24 * 60 * 60 * 1000;

describe('buildMocPrompt', () => {
  it('노트·책 목록과 MOC 규칙([[링크]]·빈 가지·열린 질문)을 담는다', () => {
    const p = buildMocPrompt('역사', [
      { title: '프랑스 혁명', content: '시민 혁명이다' },
      { title: '산업 혁명', excerpt: '기계화' },
    ], [{ title: '혁명의 시대', summary: '19세기' }], 'ko');
    expect(p).toContain('역사');
    expect(p).toContain('《프랑스 혁명》');
    expect(p).toContain('《혁명의 시대》');
    expect(p).toContain('[[노트 제목]]');
    expect(p).toContain('아직 노트 없음');
    expect(p).toContain('열린 질문');
  });

  it('영어 프롬프트도 만든다', () => {
    expect(buildMocPrompt('history', [], [], 'en')).toContain('Map of Content');
  });
});

describe('buildMocNote', () => {
  it('moc: 멱등 id·type: moc·펜스를 포함한다', () => {
    const md = buildMocNote({ topic: '역사', draftBody: '## 구조\n- [[프랑스 혁명]]' });
    expect(md).toContain('rarebook_id: moc:역사');
    expect(md).toContain('type: moc');
    expect(md).toContain('# 역사 MOC');
    expect(md).toContain('[[프랑스 혁명]]');
    expect(md).toContain('rarebook:auto:start');
    expect(md).toContain('## 나의 구조');
  });
});

describe('buildWeeklyReview', () => {
  const now = Date.now();
  const note = (title, daysAgo) => ({ id: title, title, modifiedTime: new Date(now - daysAgo * DAY).toISOString() });

  it('이번 주 새 노트·공백·연결·복습을 집계한다', () => {
    const notes = [note('신규1', 2), note('신규2', 6), note('옛날', 30)];
    const recallLog = {
      a: { lastReviewAt: now - 1 * DAY, attempts: 2, fails: 1 },
      b: { lastReviewAt: now - 20 * DAY, attempts: 1, fails: 0 },
    };
    const r = buildWeeklyReview(notes, { gaps: [{ topic: '역사' }], bridgeCount: 3, recallLog, now });
    expect(r.newNoteCount).toBe(2);
    expect(r.newNoteTitles).toEqual(['신규1', '신규2']);
    expect(r.gapTop).toBe('역사');
    expect(r.bridgeCount).toBe(3);
    expect(r.reviewedCount).toBe(1);   // 이번 주 복습은 a 뿐
    expect(r.weakCount).toBe(1);       // fails>0 은 a 뿐
  });

  it('상황에 맞는 제안을 만든다(최대 3개)', () => {
    // 공백 있음 + 연결 있음 + 복습 안 함 + 새 노트 없음 → 3개로 잘림
    const r = buildWeeklyReview([], { gaps: [{ topic: '역사' }], bridgeCount: 2, recallLog: {}, now });
    expect(r.suggestions.length).toBe(3);
    expect(r.suggestions[0].text).toContain('역사');
    expect(r.suggestions.map(s => s.icon)).toContain('🔁');
  });

  it('복습을 했고 약점이 있으면 재복습 제안', () => {
    const recallLog = { a: { lastReviewAt: now - DAY, attempts: 3, fails: 2 } };
    const r = buildWeeklyReview([note('n', 1)], { gaps: [], bridgeCount: 0, recallLog, now });
    expect(r.suggestions.some(s => s.text.includes('다시 복습'))).toBe(true);
  });
});
