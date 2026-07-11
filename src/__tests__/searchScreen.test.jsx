import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithTheme } from './testUtils.jsx';
import { SearchScreen } from '../screens/SearchScreen.jsx';
import { addNote, addHighlight, saveBookIndex, setBookMeta } from '../store.js';

const FIXED_NOW = new Date('2026-05-27T10:00:00.000Z');

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('SearchScreen — 빈 상태', () => {
  it('빈 상태 메시지가 표시된다', () => {
    renderWithTheme(<SearchScreen lang="ko" />);
    expect(screen.getByText('아직 검색할 내용이 없어요')).toBeInTheDocument();
  });

  it('검색 입력 필드가 표시된다', () => {
    renderWithTheme(<SearchScreen lang="ko" />);
    expect(screen.getByPlaceholderText('책·메모·하이라이트를 검색하세요')).toBeInTheDocument();
  });

  it('영문 lang으로도 렌더링된다', () => {
    renderWithTheme(<SearchScreen lang="en" />);
    expect(screen.getByText('Nothing to search yet')).toBeInTheDocument();
  });
});

describe('SearchScreen — 필터 칩', () => {
  beforeEach(() => {
    addNote({ bookId: 'b1', bookTitle: '책A', text: '메모 내용', page: 1 });
  });

  it('필터 칩 4개가 표시된다 (전체, 책, 하이라이트, 메모)', () => {
    renderWithTheme(<SearchScreen lang="ko" />);
    expect(screen.getByText('전체')).toBeInTheDocument();
    expect(screen.getByText('책')).toBeInTheDocument();
    expect(screen.getByText('하이라이트')).toBeInTheDocument();
    // 메모는 칩으로도, 항목 뱃지로도 나올 수 있어 getAllByText 사용
    expect(screen.getAllByText('메모').length).toBeGreaterThan(0);
  });

  it('영문 필터 칩이 표시된다', () => {
    renderWithTheme(<SearchScreen lang="en" />);
    expect(screen.getByText('All')).toBeInTheDocument();
    expect(screen.getByText('Books')).toBeInTheDocument();
    expect(screen.getByText('Highlights')).toBeInTheDocument();
    expect(screen.getAllByText('Notes').length).toBeGreaterThan(0);
  });
});

describe('SearchScreen — 데이터 표시', () => {
  beforeEach(() => {
    vi.setSystemTime(new Date('2026-05-27T10:00:00.000Z'));
    addNote({ bookId: 'b1', bookTitle: '독서 개론', text: '좋은 메모 내용입니다', page: 5 });
    vi.advanceTimersByTime(1);
    addHighlight({ bookId: 'b1', bookTitle: '독서 개론', text: '중요한 하이라이트', color: '#FFF3B0', page: 10 });
  });

  it('전체 모드에서 메모와 하이라이트가 표시된다', () => {
    renderWithTheme(<SearchScreen lang="ko" />);
    expect(screen.getByText('좋은 메모 내용입니다')).toBeInTheDocument();
    expect(screen.getByText('중요한 하이라이트')).toBeInTheDocument();
  });

  it('검색어 입력 시 일치하는 항목만 표시된다', () => {
    renderWithTheme(<SearchScreen lang="ko" />);
    const input = screen.getByPlaceholderText(/검색/);
    fireEvent.change(input, { target: { value: '메모' } });
    // 하이라이트 <mark> 태그로 텍스트가 분리되므로 body textContent로 확인
    expect(document.body.textContent).toContain('좋은 메모 내용입니다');
    expect(document.body.textContent).not.toContain('중요한 하이라이트');
  });

  it('결과 없을 때 "검색 결과가 없어요" 표시', () => {
    renderWithTheme(<SearchScreen lang="ko" />);
    const input = screen.getByPlaceholderText(/검색/);
    fireEvent.change(input, { target: { value: '존재하지않는내용xyz' } });
    expect(screen.getByText('검색 결과가 없어요')).toBeInTheDocument();
  });

  it('전체 항목 수가 표시된다', () => {
    renderWithTheme(<SearchScreen lang="ko" />);
    expect(screen.getByText('전체 · 2')).toBeInTheDocument();
  });
});

describe('SearchScreen — 책 검색', () => {
  beforeEach(() => {
    saveBookIndex([
      { id: 'bk1', title: '파이썬 완전 정복', webViewLink: 'https://example.com' },
      { id: 'bk2', title: '리액트 실전 가이드', webViewLink: 'https://example.com' },
    ]);
    setBookMeta('bk1', {
      aiTitle: '파이썬 완전 정복',
      aiAuthor: '김개발',
      aiSummary: '파이썬 프로그래밍 입문서',
      aiTopics: ['파이썬', '프로그래밍'],
      aiScanStatus: 'done',
    });
  });

  it('책 제목으로 검색되면 책 결과 헤더가 표시된다', () => {
    renderWithTheme(<SearchScreen lang="ko" />);
    const input = screen.getByPlaceholderText(/검색/);
    fireEvent.change(input, { target: { value: '파이썬' } });
    expect(screen.getByText(/책 · /)).toBeInTheDocument();
  });

  it('책 제목이 결과에 표시된다', () => {
    renderWithTheme(<SearchScreen lang="ko" />);
    const input = screen.getByPlaceholderText(/검색/);
    fireEvent.change(input, { target: { value: '파이썬' } });
    expect(document.body.textContent).toContain('파이썬 완전 정복');
  });

  it('저자로 검색하면 저자가 표시된다', () => {
    renderWithTheme(<SearchScreen lang="ko" />);
    const input = screen.getByPlaceholderText(/검색/);
    fireEvent.change(input, { target: { value: '김개발' } });
    expect(screen.getByText('김개발')).toBeInTheDocument();
  });

  it('AI 요약으로 검색하면 책이 표시된다', () => {
    renderWithTheme(<SearchScreen lang="ko" />);
    const input = screen.getByPlaceholderText(/검색/);
    fireEvent.change(input, { target: { value: '입문서' } });
    expect(screen.getByText('파이썬 완전 정복')).toBeInTheDocument();
  });

  it('책 필터 선택 시 메모/하이라이트 결과 섹션이 숨겨진다', () => {
    vi.advanceTimersByTime(1);
    addNote({ bookId: 'bk1', bookTitle: '파이썬 완전 정복', text: '파이썬은 배우기 쉽다', page: 1 });
    renderWithTheme(<SearchScreen lang="ko" />);
    const input = screen.getByPlaceholderText(/검색/);
    fireEvent.change(input, { target: { value: '파이썬' } });
    fireEvent.click(screen.getByText('책'));
    expect(screen.queryByText('파이썬은 배우기 쉽다')).not.toBeInTheDocument();
  });
});
