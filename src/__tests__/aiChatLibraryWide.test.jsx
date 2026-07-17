import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithTheme } from './testUtils.jsx';

vi.mock('../utils/ragIndex.js', () => ({
  queryBookIndex: vi.fn(async () => []),
  formatRagContext: vi.fn(() => ''),
}));
vi.mock('../utils/ragSearch.js', () => ({
  semanticSearchAll: vi.fn(async () => []),
  formatLibraryContext: vi.fn(() => ''),
}));
vi.mock('../utils/ensureBookText.js', () => ({ ensureBookText: vi.fn(async () => {}) }));

import { AIChatScreen } from '../screens/AIChatScreen.jsx';
import { saveBookIndex } from '../store.js';
import { semanticSearchAll } from '../utils/ragSearch.js';
import { queryBookIndex } from '../utils/ragIndex.js';

const CURRENT = { id: 'book-current', title: '지금 읽는 책' };
const OTHER_A = { id: 'book-other-a', title: '이전에 읽은 책 A' };
const OTHER_B = { id: 'book-other-b', title: '이전에 읽은 책 B' };

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  saveBookIndex([CURRENT, OTHER_A, OTHER_B]);
  global.fetch = vi.fn(async () => ({
    ok: true,
    json: async () => ({ candidates: [{ content: { parts: [{ text: 'AI 응답' }] } }] }),
  }));
});

describe('AIChatScreen — 서재 전체 참고 토글', () => {
  it('기본값은 꺼짐이며, 끄면 다른 책의 RAG를 조회하지 않는다', async () => {
    renderWithTheme(<AIChatScreen lang="ko" apiKeys={{ gemini: 'k' }} currentBook={CURRENT} />);
    expect(screen.getByText('꺼짐')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/./), { target: { value: '질문입니다' } });
    fireEvent.keyDown(screen.getByPlaceholderText(/./), { key: 'Enter' });

    await waitFor(() => expect(queryBookIndex).toHaveBeenCalled());
    expect(semanticSearchAll).not.toHaveBeenCalled();
  });

  it('토글을 켜면 현재 책을 제외한 다른 책들로 서재 전체 검색을 수행한다', async () => {
    renderWithTheme(<AIChatScreen lang="ko" apiKeys={{ gemini: 'k' }} currentBook={CURRENT} />);
    fireEvent.click(screen.getByText('서재 전체 참고'));
    expect(screen.getByText('켜짐')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/./), { target: { value: '질문입니다' } });
    fireEvent.keyDown(screen.getByPlaceholderText(/./), { key: 'Enter' });

    await waitFor(() => expect(semanticSearchAll).toHaveBeenCalled());
    const [, opts] = semanticSearchAll.mock.calls[0];
    expect(opts.bookIds.sort()).toEqual(['book-other-a', 'book-other-b']);
    expect(opts.bookIds).not.toContain('book-current');
  });
});
