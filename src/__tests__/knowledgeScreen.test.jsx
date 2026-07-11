import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithTheme } from './testUtils.jsx';
import { KnowledgeScreen } from '../screens/KnowledgeScreen.jsx';
import { addNote, addHighlight, getNotes } from '../store.js';

const FIXED_NOW = new Date('2026-05-27T10:00:00.000Z');

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
  global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
  global.URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('KnowledgeScreen — 빈 상태', () => {
  it('빈 상태 메시지가 표시된다', () => {
    renderWithTheme(<KnowledgeScreen lang="ko" />);
    expect(screen.getByText('아직 기록이 없어요')).toBeInTheDocument();
  });

  it('안내 문구가 표시된다', () => {
    renderWithTheme(<KnowledgeScreen lang="ko" />);
    expect(screen.getByText('뷰어에서 메모와 하이라이트를 추가하면 여기 쌓입니다.')).toBeInTheDocument();
  });

  it('내보내기 버튼이 없다', () => {
    renderWithTheme(<KnowledgeScreen lang="ko" />);
    expect(screen.queryByText('내보내기')).not.toBeInTheDocument();
  });

  it('영문 lang으로도 렌더링된다', () => {
    renderWithTheme(<KnowledgeScreen lang="en" />);
    expect(screen.getByText('No entries yet')).toBeInTheDocument();
  });
});

describe('KnowledgeScreen — 데이터 있을 때', () => {
  beforeEach(() => {
    addNote({ bookId: 'b1', bookTitle: '철학 입문', text: '존재란 무엇인가', page: 42 });
    vi.advanceTimersByTime(1);
    addHighlight({ bookId: 'b1', bookTitle: '철학 입문', text: '진리는 추구되어야 한다', color: '#FFF3B0', page: 10 });
  });

  it('메모 내용이 표시된다', () => {
    renderWithTheme(<KnowledgeScreen lang="ko" />);
    expect(screen.getByText('존재란 무엇인가')).toBeInTheDocument();
  });

  it('하이라이트 내용이 표시된다', () => {
    renderWithTheme(<KnowledgeScreen lang="ko" />);
    expect(screen.getByText('진리는 추구되어야 한다')).toBeInTheDocument();
  });

  it('노트 탭에 항목들이 렌더링된다', () => {
    renderWithTheme(<KnowledgeScreen lang="ko" />);
    // mock 노트/하이라이트의 텍스트가 표시됨
    expect(document.body.textContent).toContain('진리는 추구되어야');
    expect(document.body.textContent).toContain('존재란 무엇인가');
  });

  it('내보내기 버튼이 표시된다', () => {
    renderWithTheme(<KnowledgeScreen lang="ko" />);
    expect(screen.getByText('내보내기')).toBeInTheDocument();
  });
});

describe('KnowledgeScreen — 뷰 탭', () => {
  beforeEach(() => {
    addNote({ bookId: 'b1', bookTitle: '철학 입문', text: '메모1', page: 1 });
    vi.advanceTimersByTime(1);
    addNote({ bookId: 'b2', bookTitle: '수학의 아름다움', text: '메모2', page: 5 });
    vi.advanceTimersByTime(1);
    addHighlight({ bookId: 'b1', bookTitle: '철학 입문', text: '하이라이트1', color: '#FFF3B0', page: 2 });
  });

  it('뷰 탭 3개가 표시된다 (전체, 책별, 종류별)', () => {
    renderWithTheme(<KnowledgeScreen lang="ko" />);
    expect(screen.getByText('전체')).toBeInTheDocument();
    expect(screen.getByText('책별')).toBeInTheDocument();
    expect(screen.getByText('종류별')).toBeInTheDocument();
  });

  it('"책별" 탭 클릭 시 각 책 이름이 그룹 헤더로 표시된다', () => {
    renderWithTheme(<KnowledgeScreen lang="ko" />);
    fireEvent.click(screen.getByText('책별'));
    // 책 이름은 그룹 헤더에 표시됨
    expect(screen.getAllByText('철학 입문').length).toBeGreaterThan(0);
    expect(screen.getAllByText('수학의 아름다움').length).toBeGreaterThan(0);
  });

  it('"종류별" 탭 클릭 시 그룹 내 항목이 표시된다', () => {
    renderWithTheme(<KnowledgeScreen lang="ko" />);
    fireEvent.click(screen.getByText('종류별'));
    expect(screen.getByText('메모1')).toBeInTheDocument();
    expect(screen.getByText('하이라이트1')).toBeInTheDocument();
  });
});

describe('KnowledgeScreen — 선택 및 삭제', () => {
  beforeEach(() => {
    addNote({ bookId: 'b1', bookTitle: '철학 입문', text: '삭제할 메모', page: 1 });
    vi.advanceTimersByTime(1);
    addNote({ bookId: 'b1', bookTitle: '철학 입문', text: '남길 메모', page: 2 });
  });

  it('항목 클릭 시 선택 상태가 표시된다', () => {
    renderWithTheme(<KnowledgeScreen lang="ko" />);
    fireEvent.click(screen.getByText('삭제할 메모'));
    expect(screen.getByText('1개 선택')).toBeInTheDocument();
  });

  it('선택 후 삭제 버튼 클릭 시 항목이 제거된다', () => {
    renderWithTheme(<KnowledgeScreen lang="ko" />);
    fireEvent.click(screen.getByText('삭제할 메모'));
    fireEvent.click(screen.getByText('삭제'));
    expect(screen.queryByText('삭제할 메모')).not.toBeInTheDocument();
    expect(screen.getByText('남길 메모')).toBeInTheDocument();
  });

  it('삭제 후 localStorage에서도 제거된다', () => {
    renderWithTheme(<KnowledgeScreen lang="ko" />);
    fireEvent.click(screen.getByText('삭제할 메모'));
    fireEvent.click(screen.getByText('삭제'));
    expect(getNotes().some(n => n.text === '삭제할 메모')).toBe(false);
    expect(getNotes().some(n => n.text === '남길 메모')).toBe(true);
  });
});

describe('KnowledgeScreen — Markdown 내보내기', () => {
  beforeEach(() => {
    addNote({ bookId: 'b1', bookTitle: '철학 입문', text: '내보낼 메모', page: 3 });
    vi.advanceTimersByTime(1);
    addHighlight({ bookId: 'b1', bookTitle: '철학 입문', text: '내보낼 하이라이트', color: '#FFF3B0', page: 7 });
  });

  it('내보내기 클릭 시 URL.createObjectURL이 호출된다', () => {
    renderWithTheme(<KnowledgeScreen lang="ko" />);
    const mockAnchor = { href: '', download: '', click: vi.fn() };
    const origCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      if (tag === 'a') return mockAnchor;
      return origCreate(tag);
    });
    vi.spyOn(document.body, 'appendChild').mockImplementationOnce(() => {});
    vi.spyOn(document.body, 'removeChild').mockImplementationOnce(() => {});

    fireEvent.click(screen.getByText('내보내기'));
    expect(URL.createObjectURL).toHaveBeenCalledOnce();
    expect(mockAnchor.click).toHaveBeenCalledOnce();
  });

  it('선택 항목 있을 때 "N개 내보내기" 버튼 텍스트 확인', () => {
    renderWithTheme(<KnowledgeScreen lang="ko" />);
    fireEvent.click(screen.getByText('내보낼 메모'));
    // 선택 시 헤더 우측 export 버튼이 "1개"로 변함 (button 요소 한정)
    const buttons = screen.getAllByRole('button');
    const exportBtn = buttons.find(b => b.textContent === '1개');
    expect(exportBtn).toBeDefined();
  });

  it('영문에서도 Export 버튼이 표시된다', () => {
    renderWithTheme(<KnowledgeScreen lang="en" />);
    expect(screen.getByText('Export')).toBeInTheDocument();
  });
});
