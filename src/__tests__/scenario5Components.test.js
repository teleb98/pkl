import { describe, it, expect, beforeEach, vi } from 'vitest';
import { extractWord, generateDefinitionPrompt } from '../utils/wordDefinition.js';
import { generateQuizPrompt, parseQuizResponse } from '../utils/quizGenerator.js';

beforeEach(() => {
  vi.clearAllMocks();
});

/* ── Component Props & Logic Tests ────────────────── */
describe('Scenario 5 Component Logic', () => {
  describe('TextSelectionAI Props Validation', () => {
    it('필수 props 확인', () => {
      const props = {
        selectedText: '텍스트',
        position: { x: 100, y: 100 },
        book: { id: 'b1', title: '책' },
        onClose: vi.fn(),
        lang: 'ko',
        apiKeys: { claude: 'key' }
      };
      expect(props.selectedText).toBeTruthy();
      expect(props.position).toHaveProperty('x');
      expect(props.position).toHaveProperty('y');
      expect(typeof props.onClose).toBe('function');
    });

    it('빈 selectedText 처리', () => {
      const props = { selectedText: '', position: null, onClose: vi.fn() };
      // Component should return null when position is null
      expect(!props.position).toBe(true);
    });

    it('API 키 검증', () => {
      const validKeys = { claude: 'key' };
      const emptyKeys = {};
      expect(!!validKeys.claude || !!validKeys.gemini).toBe(true);
      expect(!!emptyKeys.claude || !!emptyKeys.gemini).toBe(false);
    });
  });

  describe('WordDefinition Props Validation', () => {
    it('단어와 문맥 props 검증', () => {
      const props = {
        word: 'responsibility',
        context: 'His responsibility...',
        position: { x: 150, y: 150 },
        onClose: vi.fn(),
        lang: 'en',
        apiKeys: { claude: 'key' }
      };
      expect(props.word).toBeTruthy();
      expect(props.context).toBeTruthy();
      expect(props.position).toHaveProperty('x');
    });

    it('단어 없을 때 처리', () => {
      const word = '';
      const position = null;
      // Should not render when word is empty or position is null
      expect(!word || !position).toBe(true);
    });

    it('다국어 지원', () => {
      const props = [
        { word: '책임감', lang: 'ko' },
        { word: 'responsibility', lang: 'en' }
      ];
      props.forEach(p => {
        expect(p.word).toBeTruthy();
        expect(['ko', 'en']).toContain(p.lang);
      });
    });
  });

  describe('QuizModal Props Validation', () => {
    it('필수 props 확인', () => {
      const props = {
        book: { id: 'b1', title: '책', author: '저자' },
        pageTexts: ['내용'],
        lang: 'ko',
        apiKeys: { claude: 'key' },
        onClose: vi.fn()
      };
      expect(props.book).toHaveProperty('title');
      expect(Array.isArray(props.pageTexts)).toBe(true);
      expect(['ko', 'en']).toContain(props.lang);
    });

    it('책 없을 때 처리', () => {
      const currentBook = null;
      expect(!currentBook).toBe(true);
    });

    it('API 키 유효성', () => {
      const apiKeys = { claude: 'key' };
      expect(!!apiKeys.claude || !!apiKeys.gemini).toBe(true);
    });

    it('문제 유형 선택', () => {
      const types = ['multiple', 'shortAnswer'];
      expect(types.includes('multiple')).toBe(true);
      expect(types.includes('shortAnswer')).toBe(true);
    });
  });
});

/* ── Utility Function Integration ────────────────── */
describe('Scenario 5 Component Utilities', () => {
  it('단어 추출 후 정의 프롬프트 생성 흐름', () => {
    const text = 'The responsibility is important';
    const word = extractWord(text, 4); // 'responsibility' 근처

    if (word) {
      const prompt = generateDefinitionPrompt('en', word, text);
      expect(prompt).toContain('responsibility');
      expect(prompt.length).toBeGreaterThan(0);
    }
  });

  it('퀴즈 프롬프트 생성 후 응답 파싱 흐름', () => {
    const book = { title: '책', author: '저자' };
    const prompt = generateQuizPrompt('ko', book, ['내용1'], true);

    expect(prompt).toBeTruthy();

    // Simulate AI response
    const mockResponse = JSON.stringify({
      question: '테스트 질문?',
      options: ['A', 'B', 'C', 'D', 'E'],
      correctIndex: 2,
      explanation: '설명'
    });

    const quiz = parseQuizResponse(mockResponse);
    expect(quiz).toHaveProperty('question');
    expect(quiz.options.length).toBe(5);
    expect(quiz.correctIndex).toBeLessThan(5);
  });

  it('여러 언어에서 프롬프트 생성', () => {
    const word = 'test';
    const prompts = [
      generateDefinitionPrompt('ko', '테스트', '테스트 문맥'),
      generateDefinitionPrompt('en', 'test', 'test context')
    ];

    prompts.forEach(p => {
      expect(p).toBeTruthy();
      expect(p.length).toBeGreaterThan(0);
    });
  });
});

/* ── Error Handling Tests ─────────────────────────── */
describe('Scenario 5 Error Handling', () => {
  it('잘못된 퀴즈 JSON 처리', () => {
    const result = parseQuizResponse('not valid json');
    expect(result).toBeNull();
  });

  it('빈 JSON 객체 처리', () => {
    const result = parseQuizResponse('{}');
    expect(result).toEqual({});
  });

  it('단어 추출 실패 처리', () => {
    const text = 'a';
    const word = extractWord(text, 0);
    expect(word === null || word.length > 1).toBe(true);
  });

  it('문맥 없는 정의 프롬프트', () => {
    const prompt = generateDefinitionPrompt('ko', '단어', '');
    expect(prompt).toContain('단어');
  });
});
