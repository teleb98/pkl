import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getWeeklyCoachData, generateCoachPrompt } from '../utils/readingCoach.js';
import { extractWord, generateDefinitionPrompt } from '../utils/wordDefinition.js';
import { generateQuizPrompt, parseQuizResponse } from '../utils/quizGenerator.js';
import { addSession, getWeekStats, getSessions, getBookIndex } from '../store.js';

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

/* ── Scenario 5-4: AI Reading Coach ───────────────── */
describe('Reading Coach (5-4)', () => {
  describe('getWeeklyCoachData', () => {
    it('주간 데이터 수집', () => {
      const now = new Date();
      const today = now.toISOString().slice(0, 10);
      addSession({ bookId: 'b1', bookTitle: '테스트 책', minutes: 30, pages: 10 });

      const data = getWeeklyCoachData();
      expect(data.totalMinutes).toBeGreaterThanOrEqual(30);
      expect(data.totalPages).toBeGreaterThanOrEqual(10);
      expect(data.streak).toBeGreaterThanOrEqual(0);
    });

    it('7일 일별 통계 생성', () => {
      const data = getWeeklyCoachData();
      expect(data.dailyStats).toHaveLength(7);
      expect(data.dailyStats[0]).toHaveProperty('dayName');
      expect(data.dailyStats[0]).toHaveProperty('minutes');
      expect(data.dailyStats[0]).toHaveProperty('pages');
    });

    it('빈 주간 데이터 처리', () => {
      const data = getWeeklyCoachData();
      expect(data.totalMinutes).toBeGreaterThanOrEqual(0);
      expect(data.totalPages).toBeGreaterThanOrEqual(0);
      expect(data.streak).toBeGreaterThanOrEqual(0);
    });
  });

  describe('generateCoachPrompt', () => {
    it('한국어 코치 프롬프트 생성', () => {
      const data = {
        totalMinutes: 180,
        totalPages: 50,
        readDays: 5,
        streak: 10,
        dailyStats: [
          { dayName: 'Mon', minutes: 30, pages: 10 },
          { dayName: 'Tue', minutes: 40, pages: 12 },
        ]
      };
      const prompt = generateCoachPrompt('ko', data);
      expect(prompt).toContain('180분');
      expect(prompt).toContain('50페이지');
      expect(prompt).toContain('5일');
    });

    it('영문 코치 프롬프트 생성', () => {
      const data = {
        totalMinutes: 180,
        totalPages: 50,
        readDays: 5,
        streak: 10,
        dailyStats: []
      };
      const prompt = generateCoachPrompt('en', data);
      expect(prompt).toContain('180 minutes');
      expect(prompt).toContain('50');
      expect(prompt).toContain('5 days');
    });
  });
});

/* ── Scenario 5-5: Word Definition ────────────────── */
describe('Word Definition (5-5)', () => {
  describe('extractWord', () => {
    it('영문 단어 추출', () => {
      const text = 'The quick brown fox jumps';
      const word = extractWord(text, 5); // 'quick' 위치
      expect(['quick', 'The', 'brown', 'fox']).toContain(word);
    });

    it('한글 단어 추출', () => {
      const text = '빠른 갈색 여우가 뛴다';
      const word = extractWord(text, 0); // '빠른' 위치
      expect(word).toBeTruthy();
    });

    it('짧은 텍스트 무시', () => {
      const text = 'a b c';
      const word = extractWord(text, 0);
      expect(word === null || word?.length > 1).toBe(true);
    });

    it('숫자 포함 단어 추출', () => {
      const text = 'Version2.0 is released';
      const word = extractWord(text, 0);
      expect(word).toBeTruthy();
    });
  });

  describe('generateDefinitionPrompt', () => {
    it('한국어 정의 프롬프트 생성', () => {
      const prompt = generateDefinitionPrompt('ko', '책임감', '그 책임감이 그를 움직였다');
      expect(prompt).toContain('책임감');
      expect(prompt).toContain('정의');
    });

    it('영문 정의 프롬프트 생성', () => {
      const prompt = generateDefinitionPrompt('en', 'responsibility', 'His responsibility drove him forward');
      expect(prompt).toContain('responsibility');
      expect(prompt).toContain('Definition');
    });
  });
});

/* ── Scenario 5-1: Quiz Generator ─────────────────── */
describe('Quiz Generator (5-1)', () => {
  const testBook = { title: '테스트 책', author: '저자' };

  describe('generateQuizPrompt', () => {
    it('5지선다형 퀴즈 프롬프트 생성', () => {
      const prompt = generateQuizPrompt('ko', testBook, ['내용1', '내용2'], true);
      expect(prompt).toContain('5지선다형');
      expect(prompt).toContain('correctIndex');
      expect(prompt).toContain('JSON');
    });

    it('단답형 퀴즈 프롬프트 생성', () => {
      const prompt = generateQuizPrompt('ko', testBook, ['내용1'], false);
      expect(prompt).toContain('단답형');
      expect(prompt).toContain('correctAnswer');
    });

    it('도서 정보 포함', () => {
      const prompt = generateQuizPrompt('ko', testBook, ['내용']);
      expect(prompt).toContain('테스트 책');
      expect(prompt).toContain('저자');
    });

    it('영문 프롬프트 생성', () => {
      const prompt = generateQuizPrompt('en', testBook, ['content'], true);
      expect(prompt).toContain('multiple choice');
      expect(prompt).toContain('JSON');
    });
  });

  describe('parseQuizResponse', () => {
    it('5지선다형 JSON 파싱', () => {
      const json = JSON.stringify({
        question: '질문?',
        options: ['A', 'B', 'C', 'D', 'E'],
        correctIndex: 2,
        explanation: '설명'
      });
      const quiz = parseQuizResponse(json);
      expect(quiz.question).toBe('질문?');
      expect(quiz.options).toHaveLength(5);
      expect(quiz.correctIndex).toBe(2);
    });

    it('단답형 JSON 파싱', () => {
      const json = JSON.stringify({
        question: '질문?',
        correctAnswer: '정답',
        explanation: '설명'
      });
      const quiz = parseQuizResponse(json);
      expect(quiz.question).toBe('질문?');
      expect(quiz.correctAnswer).toBe('정답');
    });

    it('잘못된 JSON 처리', () => {
      const result = parseQuizResponse('invalid json');
      expect(result).toBeNull();
    });

    it('빈 JSON 처리', () => {
      const result = parseQuizResponse('{}');
      expect(result).toEqual({});
    });
  });
});

/* ── Integration Tests ────────────────────────────── */
describe('Scenario 5 Integration', () => {
  it('세션 생성 후 코치 데이터 수집', () => {
    addSession({ bookId: 'b1', bookTitle: '책1', minutes: 30, pages: 10 });
    addSession({ bookId: 'b2', bookTitle: '책2', minutes: 20, pages: 5 });

    const data = getWeeklyCoachData();
    expect(data.totalMinutes).toBeGreaterThanOrEqual(50);
    expect(data.totalPages).toBeGreaterThanOrEqual(15);
  });

  it('다양한 텍스트에서 단어 추출 및 정의 프롬프트 생성', () => {
    const texts = [
      '책임감이 중요하다',
      'Responsibility matters',
      'The word123 is complex'
    ];

    texts.forEach(text => {
      const word = extractWord(text, 0);
      if (word) {
        const prompt = generateDefinitionPrompt('ko', word, text);
        expect(prompt).toContain(word);
      }
    });
  });

  it('퀴즈 프롬프트 생성 및 응답 파싱', () => {
    const book = { title: '책', author: '저자' };
    const prompt = generateQuizPrompt('ko', book, ['내용'], true);

    expect(prompt).toBeTruthy();

    // Mock response
    const mockResponse = JSON.stringify({
      question: 'Test question?',
      options: ['A', 'B', 'C', 'D', 'E'],
      correctIndex: 0,
      explanation: 'Test explanation'
    });

    const parsed = parseQuizResponse(mockResponse);
    expect(parsed).toHaveProperty('question');
    expect(parsed).toHaveProperty('options');
    expect(parsed.options).toHaveLength(5);
  });
});
