import { describe, it, expect } from 'vitest';
import { computeKnowledgePath, pathHintLine } from '../utils/knowledgePath.js';

// 완독 책 헬퍼 (at = 완료 시각 순서)
function bk(title, topics, at) {
  return { title, topics, at };
}

describe('computeKnowledgePath', () => {
  it('주제 있는 완독 책이 3권 미만이면 enough=false', () => {
    const res = computeKnowledgePath([bk('A', ['역사'], 1), bk('B', ['철학'], 2)]);
    expect(res.enough).toBe(false);
    expect(res.bookCount).toBe(2);
  });

  it('주제가 없는 책은 제외한다', () => {
    const res = computeKnowledgePath([
      bk('A', ['역사'], 1), bk('B', ['역사'], 2), bk('C', ['철학'], 3),
      bk('D', [], 4), bk('E', undefined, 5),
    ]);
    expect(res.bookCount).toBe(3);
  });

  it('반복 등장 주제를 핵심 관심사로 뽑는다(횟수 내림차순)', () => {
    const res = computeKnowledgePath([
      bk('A', ['역사', '철학'], 1),
      bk('B', ['역사'], 2),
      bk('C', ['역사', '심리학'], 3),
      bk('D', ['철학'], 4),
    ]);
    expect(res.enough).toBe(true);
    expect(res.coreTopics[0]).toEqual({ topic: '역사', count: 3 });
    expect(res.coreTopics.map(c => c.topic)).toContain('철학'); // count 2
    expect(res.coreTopics.map(c => c.topic)).not.toContain('심리학'); // count 1
  });

  it('이전 책엔 없던 최근 주제를 emerging 으로 잡는다', () => {
    const res = computeKnowledgePath([
      bk('A', ['역사'], 1),
      bk('B', ['역사'], 2),      // earlier (RECENT_TAKE=3 → 마지막 3권이 recent)
      bk('C', ['역사'], 3),      // recent
      bk('D', ['심리학'], 4),    // recent — 새 주제
      bk('E', ['심리학'], 5),    // recent
    ]);
    expect(res.recentTopics).toEqual(expect.arrayContaining(['심리학']));
    expect(res.emergingTopics).toContain('심리학');
    expect(res.emergingTopics).not.toContain('역사'); // 이전에 이미 있었음
  });

  it('완료 시각(at) 순으로 trajectory 를 정렬한다', () => {
    const res = computeKnowledgePath([
      bk('C', ['x'], 30), bk('A', ['x'], 10), bk('B', ['x'], 20),
    ]);
    expect(res.trajectory.map(t => t.title)).toEqual(['A', 'B', 'C']);
  });
});

describe('pathHintLine', () => {
  it('경로가 없으면 빈 문자열', () => {
    expect(pathHintLine({ enough: false })).toBe('');
  });

  it('핵심 관심사와 최근 이동을 한국어 힌트로 만든다', () => {
    const path = {
      enough: true,
      coreTopics: [{ topic: '역사', count: 3 }, { topic: '철학', count: 2 }],
      emergingTopics: ['심리학'],
    };
    const line = pathHintLine(path, 'ko');
    expect(line).toContain('역사, 철학');
    expect(line).toContain('심리학');
    expect(line).toContain('다음 단계');
  });

  it('영어 힌트도 생성한다', () => {
    const path = { enough: true, coreTopics: [{ topic: 'history', count: 2 }], emergingTopics: ['psychology'] };
    const line = pathHintLine(path, 'en');
    expect(line).toContain('history');
    expect(line).toContain('psychology');
    expect(line).toContain('next step');
  });
});
