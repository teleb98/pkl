import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithTheme } from './testUtils.jsx';

vi.mock('../utils/useGoogleAuth.js', () => ({
  useGoogleAuth: ({ onSuccess }) => () => onSuccess({ access_token: 'tok' }),
}));
vi.mock('../aiClient.js', () => ({ callAI: vi.fn() }));
vi.mock('../utils/wikiExport.js', async (orig) => ({
  ...(await orig()),
  exportGapNote: vi.fn(),
}));

import { KnowledgeGapCard } from '../components/KnowledgeGapCard.jsx';
import { callAI } from '../aiClient.js';
import { exportGapNote } from '../utils/wikiExport.js';
import { saveBookIndex, setBookMeta, saveWikiConfig, saveWikiIndex } from '../store.js';

beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); });

// 위키 연결 + 역사 2권(위키 노트 없음) → 공백 '역사'
function seedGap() {
  saveBookIndex([{ id: 'b1', title: '사피엔스' }, { id: 'b2', title: '총균쇠' }]);
  setBookMeta('b1', { aiTopics: ['역사'], aiSummary: '인류사' });
  setBookMeta('b2', { aiTopics: ['역사'] });
  saveWikiConfig({ connected: true, count: 1 });
  saveWikiIndex([{ id: 'n1', title: '요리', tags: ['음식'], links: [] }]); // 역사 미커버
}

describe('KnowledgeGapCard', () => {
  it('위키 미연결이면 렌더링하지 않는다', () => {
    saveBookIndex([{ id: 'b1', title: 'A' }]);
    setBookMeta('b1', { aiTopics: ['역사'] });
    const { container } = renderWithTheme(<KnowledgeGapCard lang="ko" apiKeys={{ gemini: 'k' }} />);
    expect(container.textContent).toBe('');
  });

  it('공백 주제를 칩으로 보여준다', () => {
    seedGap();
    renderWithTheme(<KnowledgeGapCard lang="ko" apiKeys={{ gemini: 'k' }} />);
    expect(screen.getByText(/지식 공백/)).toBeInTheDocument();
    expect(screen.getByText(/역사/)).toBeInTheDocument();
    expect(screen.getByText(/2권/)).toBeInTheDocument();
  });

  it('칩 클릭 → AI 초안 생성 → 미리보기 표시', async () => {
    seedGap();
    callAI.mockResolvedValue('역사는 협력의 이야기다.\n- 핵심1\n[[문명]]');
    renderWithTheme(<KnowledgeGapCard lang="ko" apiKeys={{ gemini: 'k' }} />);

    fireEvent.click(screen.getByText(/역사/));
    expect(await screen.findByText(/역사는 협력의 이야기다/)).toBeInTheDocument();
    // 하이라이트/요약이 프롬프트에 담겼는지
    expect(callAI.mock.calls[0][1]).toContain('역사');
    expect(screen.getByText('볼트로 내보내기')).toBeInTheDocument();
  });

  it('초안 후 내보내기 → exportGapNote 호출 + 결과 메시지', async () => {
    seedGap();
    callAI.mockResolvedValue('초안 본문');
    exportGapNote.mockResolvedValue({ created: true, updated: false, fileName: '역사.md' });
    renderWithTheme(<KnowledgeGapCard lang="ko" apiKeys={{ gemini: 'k' }} />);

    fireEvent.click(screen.getByText(/역사/));
    await screen.findByText('초안 본문');
    fireEvent.click(screen.getByText('볼트로 내보내기'));

    await waitFor(() => expect(exportGapNote).toHaveBeenCalledWith('tok', expect.objectContaining({ topic: '역사', draftBody: '초안 본문' })));
    expect(await screen.findByText(/역사\.md.*생성/)).toBeInTheDocument();
  });
});
