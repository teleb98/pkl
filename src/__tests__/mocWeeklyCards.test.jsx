import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithTheme } from './testUtils.jsx';

vi.mock('../aiClient.js', () => ({ callAI: vi.fn() }));
vi.mock('../utils/useGoogleAuth.js', () => ({
  useGoogleAuth: ({ onSuccess }) => () => onSuccess({ access_token: 'tok' }),
}));
vi.mock('../utils/wikiExport.js', async (orig) => ({
  ...(await orig()),
  exportMocNote: vi.fn(),
}));
vi.mock('../utils/wikiBridge.js', () => ({ discoverBridges: vi.fn(async () => [{}, {}]) }));

import { MocCard } from '../components/MocCard.jsx';
import { WeeklyReviewCard } from '../components/WeeklyReviewCard.jsx';
import { callAI } from '../aiClient.js';
import { exportMocNote } from '../utils/wikiExport.js';
import { saveWikiConfig, saveWikiIndex, saveBookIndex } from '../store.js';

beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); });

function seedNotes() {
  saveWikiConfig({ connected: true });
  saveBookIndex([]);
  saveWikiIndex([
    { id: 'n1', title: '프랑스 혁명', tags: ['역사'], links: [], content: '시민 혁명', modifiedTime: new Date().toISOString() },
    { id: 'n2', title: '산업 혁명', tags: ['역사'], links: [], content: '기계화', modifiedTime: new Date().toISOString() },
  ]);
}

describe('MocCard', () => {
  it('위키 미연결이면 렌더링하지 않는다', () => {
    const { container } = renderWithTheme(<MocCard lang="ko" apiKeys={{ gemini: 'k' }} />);
    expect(container.textContent).toBe('');
  });

  it('노트 2개↑ 주제 칩 → 초안 생성 → 내보내기', async () => {
    seedNotes();
    callAI.mockResolvedValue('## 구조\n- [[프랑스 혁명]]: 시민 혁명');
    exportMocNote.mockResolvedValue({ created: true, updated: false, fileName: '역사 MOC.md' });
    renderWithTheme(<MocCard lang="ko" apiKeys={{ gemini: 'k' }} />);

    expect(screen.getByText(/개념 지도/)).toBeInTheDocument();
    fireEvent.click(screen.getByText(/역사/));
    expect(await screen.findByText(/\[\[프랑스 혁명\]\]/)).toBeInTheDocument();
    // 프롬프트에 노트가 근거로 포함됐는지
    expect(callAI.mock.calls[0][1]).toContain('《프랑스 혁명》');

    fireEvent.click(screen.getByText('볼트로 내보내기'));
    await waitFor(() => expect(exportMocNote).toHaveBeenCalledWith('tok', expect.objectContaining({ topic: '역사' })));
    expect(await screen.findByText(/역사 MOC\.md.*생성/)).toBeInTheDocument();
  });
});

describe('WeeklyReviewCard', () => {
  it('위키 미연결이면 렌더링하지 않는다', () => {
    const { container } = renderWithTheme(<WeeklyReviewCard lang="ko" />);
    expect(container.textContent).toBe('');
  });

  it('이번 주 통계와 제안을 보여준다', async () => {
    seedNotes();
    renderWithTheme(<WeeklyReviewCard lang="ko" />);

    expect(await screen.findByText(/주간 지식 리뷰/)).toBeInTheDocument();
    expect(screen.getByText('새 노트')).toBeInTheDocument();
    expect(screen.getAllByText('2').length).toBeGreaterThan(0); // 새 노트 2·연결 후보 2 — 중복 허용
    expect(screen.getByText(/《프랑스 혁명》/)).toBeInTheDocument();
    expect(screen.getByText(/복습 시작하기/)).toBeInTheDocument(); // 복습 0 → 제안
  });
});
