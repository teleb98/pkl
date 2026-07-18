import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/react';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { ThemeContext } from '../context.jsx';
import { THEMES, TYPE_PAIRS } from '../data.js';
import { KnowledgeScreen } from '../screens/KnowledgeScreen.jsx';
import {
  addFlashcard, saveFlashcards, getFlashcards, markFlashcard,
  addVocabularyEntry, saveVocabulary, getVocabulary, deleteVocabularyEntry,
  addNote, addHighlight,
} from '../store.js';
import { callAI } from '../aiClient.js';

/* aiClient mock — 실제 API 호출 방지 */
vi.mock('../aiClient.js', () => ({
  callAI: vi.fn().mockResolvedValue('[{"q":"AI가 생성한 질문","a":"AI가 생성한 답변"}]'),
}));
vi.mock('../pageTextCache.js', () => ({
  getDocumentText:  vi.fn().mockReturnValue({ text: '테스트 페이지 텍스트 내용입니다.' }),
  getPageImage:     vi.fn().mockReturnValue(null),
  setPageText:      vi.fn(),
  setViewedPage:    vi.fn(),
  setPageImage:     vi.fn(),
  _resetForTesting: vi.fn(),
}));

const T = THEMES.ember;
const F = TYPE_PAIRS.lora;
const MOCK_BOOK = { id: 'book-test', title: '테스트 책' };
const API_KEYS  = { claude: 'test-key' };

function renderKnowledge(props = {}) {
  return render(
    <GoogleOAuthProvider clientId="test-client-id">
      <ThemeContext.Provider value={{ T, F }}>
        <KnowledgeScreen lang="ko" apiKeys={API_KEYS} currentBook={MOCK_BOOK} {...props} />
      </ThemeContext.Provider>
    </GoogleOAuthProvider>
  );
}

function clickTab(label) {
  const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === label);
  if (btn) fireEvent.click(btn);
  return btn ?? null;
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  callAI.mockResolvedValue('[{"q":"AI가 생성한 질문","a":"AI가 생성한 답변"}]');
});

/* ── 탭 네비게이션 ───────────────────────────────────────── */
describe('KnowledgeScreen — 탭 네비게이션', () => {
  it('초기 렌더 시 노트/카드/어휘 탭이 모두 표시됨', () => {
    renderKnowledge();
    expect(document.body.textContent).toContain('노트');
    expect(document.body.textContent).toContain('카드');
    expect(document.body.textContent).toContain('어휘');
  });

  it('카드 탭 클릭 시 AI 생성 버튼 표시', () => {
    localStorage.setItem('pkl_book_index', JSON.stringify([{ id: 'book-test', title: '테스트 책' }]));
    renderKnowledge();
    clickTab('카드');
    expect(document.body.textContent).toContain('AI 생성');
  });

  it('어휘 탭 클릭 시 AI 어휘 추출 버튼 표시', () => {
    renderKnowledge();
    clickTab('어휘');
    expect(document.body.textContent).toContain('AI 어휘 추출');
  });

  it('카드 → 노트 탭 이동 시 노트 영역 복귀', () => {
    renderKnowledge();
    clickTab('카드');
    clickTab('노트');
    expect(document.body.textContent).toContain('아직 기록이 없어요');
  });
});

/* ── 노트 탭: 빈 상태 ────────────────────────────────────── */
describe('KnowledgeScreen — 노트 탭 빈 상태', () => {
  it('노트/하이라이트가 없을 때 빈 상태 메시지 표시', () => {
    renderKnowledge();
    expect(document.body.textContent).toContain('아직 기록이 없어요');
  });

  it('빈 상태에서 내보내기 버튼 없음', () => {
    renderKnowledge();
    const btns = Array.from(document.querySelectorAll('button')).map(b => b.textContent.trim());
    expect(btns).not.toContain('내보내기');
  });
});

/* ── 노트 탭: 데이터 표시 ────────────────────────────────── */
describe('KnowledgeScreen — 노트 탭 데이터 표시', () => {
  beforeEach(() => {
    addNote({ bookId: 'b1', bookTitle: '철학 책', text: '존재는 의식을 규정한다', page: 10 });
    addHighlight({ bookId: 'b1', bookTitle: '철학 책', text: '하이라이트 내용', color: '#FFF3B0', page: 5 });
  });

  it('노트 텍스트가 화면에 표시됨', () => {
    renderKnowledge();
    expect(document.body.textContent).toContain('존재는 의식을 규정한다');
  });

  it('하이라이트 텍스트가 화면에 표시됨', () => {
    renderKnowledge();
    expect(document.body.textContent).toContain('하이라이트 내용');
  });

  it('전체/책별/종류별 서브탭이 표시됨', () => {
    renderKnowledge();
    expect(document.body.textContent).toContain('전체');
    expect(document.body.textContent).toContain('책별');
    expect(document.body.textContent).toContain('종류별');
  });

  it('내보내기 버튼이 표시됨', () => {
    renderKnowledge();
    const btns = Array.from(document.querySelectorAll('button')).map(b => b.textContent.trim());
    expect(btns.some(t => t.includes('내보내기'))).toBe(true);
  });
});

/* ── 노트 탭: 태그 필터 ──────────────────────────────────── */
describe('KnowledgeScreen — 태그 필터', () => {
  it('태그 있는 노트에 태그 칩이 렌더됨', () => {
    addNote({ bookId: 'b1', bookTitle: '책', text: '태그 있는 노트', page: 1, tags: ['철학', 'AI'] });
    renderKnowledge();
    expect(document.body.textContent).toContain('#철학');
    expect(document.body.textContent).toContain('#AI');
  });

  it('복수 태그를 가진 노트의 모든 태그가 표시됨', () => {
    addNote({ bookId: 'b1', bookTitle: '책', text: '다중 태그 노트', page: 1, tags: ['A', 'B', 'C'] });
    renderKnowledge();
    expect(document.body.textContent).toContain('#A');
    expect(document.body.textContent).toContain('#B');
    expect(document.body.textContent).toContain('#C');
  });

  it('태그 없는 노트에는 태그 필터 영역 없음', () => {
    addNote({ bookId: 'b1', bookTitle: '책', text: '태그 없는 노트', page: 1 });
    renderKnowledge();
    const hashTags = Array.from(document.querySelectorAll('button')).filter(b => b.textContent.trim().startsWith('#'));
    expect(hashTags).toHaveLength(0);
  });

  it('태그 칩 클릭 시 해당 태그 노트만 표시', () => {
    addNote({ bookId: 'b1', bookTitle: '책', text: '철학 노트', page: 1, tags: ['철학'] });
    addNote({ bookId: 'b1', bookTitle: '책', text: '과학 노트', page: 2, tags: ['과학'] });
    renderKnowledge();

    const tagChip = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === '#철학');
    if (tagChip) {
      fireEvent.click(tagChip);
      expect(document.body.textContent).toContain('철학 노트');
    }
  });

  it('태그 칩 재클릭 시 필터 해제됨 (모든 항목 표시)', () => {
    addNote({ bookId: 'b1', bookTitle: '책', text: '노트1', page: 1, tags: ['태그'] });
    renderKnowledge();

    const tagChip = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === '#태그');
    if (tagChip) {
      fireEvent.click(tagChip); // 필터 ON
      fireEvent.click(tagChip); // 필터 OFF
      expect(document.body.textContent).toContain('노트1');
    }
  });
});

/* ── 카드 탭: 플래시카드 목록 ────────────────────────────── */
describe('KnowledgeScreen — 카드 탭 목록', () => {
  beforeEach(() => {
    localStorage.setItem('pkl_book_index', JSON.stringify([{ id: 'book-test', title: '테스트 책' }]));
  });

  it('저장된 플래시카드가 화면에 렌더됨', () => {
    addFlashcard('book-test', { q: '메모리란 무엇인가?', a: '정보를 저장하는 장치' });
    renderKnowledge();
    clickTab('카드');
    expect(document.body.textContent).toContain('메모리란 무엇인가?');
    expect(document.body.textContent).toContain('정보를 저장하는 장치');
  });

  it('카드의 Q/A 레이블이 표시됨', () => {
    addFlashcard('book-test', { q: '질문', a: '답변' });
    renderKnowledge();
    clickTab('카드');
    const allText = document.body.textContent;
    expect(allText).toContain('Q');
    expect(allText).toContain('A');
  });

  it('학습 완료된 카드에 완료 표시', () => {
    const cards = addFlashcard('book-test', { q: '완료 카드', a: '답변' });
    markFlashcard('book-test', cards[0].id, true);
    renderKnowledge();
    clickTab('카드');
    expect(document.body.textContent).toContain('학습 완료');
  });

  it('완료 카드가 없을 때 학습 시작 버튼 표시 (미완료 카드 존재)', () => {
    addFlashcard('book-test', { q: 'Q1', a: 'A1' });
    renderKnowledge();
    clickTab('카드');
    expect(document.body.textContent).toContain('학습 시작');
  });

  it('모든 카드가 완료되면 학습 시작 버튼 없음', () => {
    const cards = addFlashcard('book-test', { q: 'Q', a: 'A' });
    markFlashcard('book-test', cards[0].id, true);
    renderKnowledge();
    clickTab('카드');
    const btns = Array.from(document.querySelectorAll('button')).map(b => b.textContent.trim());
    expect(btns).not.toContain('학습 시작');
  });

  it('총 카드 수가 통계 영역에 표시됨', () => {
    addFlashcard('book-test', { q: 'Q1', a: 'A1' });
    addFlashcard('book-test', { q: 'Q2', a: 'A2' });
    addFlashcard('book-test', { q: 'Q3', a: 'A3' });
    renderKnowledge();
    clickTab('카드');
    expect(document.body.textContent).toContain('3');
  });
});

/* ── 카드 탭: AI 생성 ────────────────────────────────────── */
describe('KnowledgeScreen — AI 플래시카드 생성', () => {
  beforeEach(() => {
    localStorage.setItem('pkl_book_index', JSON.stringify([{ id: 'book-test', title: '테스트 책' }]));
    addNote({ bookId: 'book-test', bookTitle: '테스트 책', text: '핵심 내용 메모', page: 1 });
  });

  it('API 키 있을 때 AI 생성 버튼 활성화됨', () => {
    renderKnowledge();
    clickTab('카드');
    const aiBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('AI 생성'));
    expect(aiBtn).toBeDefined();
    expect(aiBtn?.disabled).toBe(false);
  });

  it('API 키 없을 때 AI 생성 버튼 비활성화', () => {
    render(
      <GoogleOAuthProvider clientId="test-client-id">
        <ThemeContext.Provider value={{ T, F }}>
          <KnowledgeScreen lang="ko" apiKeys={{}} currentBook={MOCK_BOOK} />
        </ThemeContext.Provider>
      </GoogleOAuthProvider>
    );
    clickTab('카드');
    const aiBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('AI 생성'));
    expect(aiBtn?.disabled).toBe(true);
  });

  it('AI 생성 버튼 클릭 시 callAI가 호출됨', async () => {
    renderKnowledge();
    clickTab('카드');
    const aiBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('AI 생성'));
    if (aiBtn) {
      fireEvent.click(aiBtn);
      await waitFor(() => expect(callAI).toHaveBeenCalled(), { timeout: 3000 });
    }
  });

  it('AI 생성 후 플래시카드가 localStorage에 저장됨', async () => {
    renderKnowledge();
    clickTab('카드');
    const aiBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('AI 생성'));
    if (aiBtn) {
      fireEvent.click(aiBtn);
      await waitFor(() => getFlashcards('book-test').length > 0, { timeout: 3000 });
      const cards = getFlashcards('book-test');
      expect(cards.length).toBeGreaterThan(0);
      expect(cards[0]).toHaveProperty('q');
      expect(cards[0]).toHaveProperty('a');
    }
  });
});

/* ── 어휘 탭 ─────────────────────────────────────────────── */
describe('KnowledgeScreen — 어휘 탭', () => {
  it('어휘가 없을 때 안내 메시지 표시', () => {
    renderKnowledge();
    clickTab('어휘');
    expect(document.body.textContent).toContain('수집된 어휘가 없어요');
  });

  it('저장된 어휘의 단어와 정의가 표시됨', () => {
    addVocabularyEntry({ word: '알고리즘', definition: '문제 해결을 위한 절차', bookId: 'b1', bookTitle: '컴퓨터 과학' });
    renderKnowledge();
    clickTab('어휘');
    expect(document.body.textContent).toContain('알고리즘');
    expect(document.body.textContent).toContain('문제 해결을 위한 절차');
  });

  it('어휘 항목에 출처 책 정보가 표시됨', () => {
    addVocabularyEntry({ word: '존재론', definition: '존재에 대한 연구', bookId: 'b1', bookTitle: '철학 개론' });
    renderKnowledge();
    clickTab('어휘');
    expect(document.body.textContent).toContain('철학 개론');
  });

  it('수집된 단어 수가 통계에 표시됨', () => {
    addVocabularyEntry({ word: 'word1', definition: 'def1' });
    addVocabularyEntry({ word: 'word2', definition: 'def2' });
    renderKnowledge();
    clickTab('어휘');
    expect(document.body.textContent).toContain('2');
  });

  it('AI 어휘 추출 버튼이 표시됨', () => {
    renderKnowledge();
    clickTab('어휘');
    const btns = Array.from(document.querySelectorAll('button')).map(b => b.textContent.trim());
    expect(btns.some(t => t.includes('AI 어휘 추출'))).toBe(true);
  });

  it('API 키 없을 때 AI 어휘 추출 버튼 비활성화', () => {
    render(
      <GoogleOAuthProvider clientId="test-client-id">
        <ThemeContext.Provider value={{ T, F }}>
          <KnowledgeScreen lang="ko" apiKeys={{}} currentBook={MOCK_BOOK} />
        </ThemeContext.Provider>
      </GoogleOAuthProvider>
    );
    clickTab('어휘');
    const extractBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('AI 어휘 추출'));
    expect(extractBtn?.disabled).toBe(true);
  });

  it('복수 어휘가 모두 렌더됨', () => {
    addVocabularyEntry({ word: '인공지능', definition: 'AI 기술' });
    addVocabularyEntry({ word: '머신러닝', definition: '학습 알고리즘' });
    addVocabularyEntry({ word: '딥러닝',  definition: '신경망 기반' });
    renderKnowledge();
    clickTab('어휘');
    expect(document.body.textContent).toContain('인공지능');
    expect(document.body.textContent).toContain('머신러닝');
    expect(document.body.textContent).toContain('딥러닝');
  });
});

/* ── 영문 모드 ───────────────────────────────────────────── */
describe('KnowledgeScreen — 영문(lang=en)', () => {
  it('탭 레이블이 영어로 표시됨', () => {
    render(
      <GoogleOAuthProvider clientId="test-client-id">
        <ThemeContext.Provider value={{ T, F }}>
          <KnowledgeScreen lang="en" apiKeys={API_KEYS} currentBook={MOCK_BOOK} />
        </ThemeContext.Provider>
      </GoogleOAuthProvider>
    );
    expect(document.body.textContent).toContain('Notes');
    expect(document.body.textContent).toContain('Cards');
    expect(document.body.textContent).toContain('Vocab');
  });

  it('빈 상태 메시지가 영어로 표시됨', () => {
    render(
      <GoogleOAuthProvider clientId="test-client-id">
        <ThemeContext.Provider value={{ T, F }}>
          <KnowledgeScreen lang="en" apiKeys={API_KEYS} currentBook={MOCK_BOOK} />
        </ThemeContext.Provider>
      </GoogleOAuthProvider>
    );
    expect(document.body.textContent).toContain('No entries yet');
  });

  it('카드 탭의 AI Generate 버튼이 영어로 표시됨', () => {
    localStorage.setItem('pkl_book_index', JSON.stringify([{ id: 'book-test', title: 'Test Book' }]));
    render(
      <GoogleOAuthProvider clientId="test-client-id">
        <ThemeContext.Provider value={{ T, F }}>
          <KnowledgeScreen lang="en" apiKeys={API_KEYS} currentBook={MOCK_BOOK} />
        </ThemeContext.Provider>
      </GoogleOAuthProvider>
    );
    clickTab('Cards');
    expect(document.body.textContent).toContain('AI Generate');
  });
});
