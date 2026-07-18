import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithTheme } from './testUtils.jsx';

vi.mock('../aiClient.js', () => ({ callAI: vi.fn() }));

import { KnowledgeEvolutionCard } from '../components/KnowledgeEvolutionCard.jsx';
import { callAI } from '../aiClient.js';
import { saveWikiConfig, saveWikiIndex } from '../store.js';

beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); });

// 위키 연결 + '자유의지' 태그 노트 2개 → 진화 주제
function seedEvolving() {
  saveWikiConfig({ connected: true });
  saveWikiIndex([
    { id: 'n1', title: '자유의지 초기', tags: ['자유의지'], links: [], content: '있다', modifiedTime: '2026-01-01T00:00:00Z' },
    { id: 'n2', title: '자유의지 수정', tags: ['자유의지'], links: [], content: '없다', modifiedTime: '2026-06-01T00:00:00Z' },
  ]);
}

describe('KnowledgeEvolutionCard', () => {
  it('위키 미연결이면 렌더링하지 않는다', () => {
    const { container } = renderWithTheme(<KnowledgeEvolutionCard lang="ko" apiKeys={{ gemini: 'k' }} />);
    expect(container.textContent).toBe('');
  });

  it('노트가 쌓인 주제를 칩으로 보여준다', () => {
    seedEvolving();
    renderWithTheme(<KnowledgeEvolutionCard lang="ko" apiKeys={{ gemini: 'k' }} />);
    expect(screen.getByText(/관점의 진화/)).toBeInTheDocument();
    expect(screen.getByText(/자유의지/)).toBeInTheDocument();
    expect(screen.getByText(/노트 2/)).toBeInTheDocument();
  });

  it('칩 클릭 → AI 종합 서사를 보여준다', async () => {
    seedEvolving();
    callAI.mockResolvedValue('**생각의 흐름**: 있다→없다로 바뀜.');
    renderWithTheme(<KnowledgeEvolutionCard lang="ko" apiKeys={{ gemini: 'k' }} />);

    fireEvent.click(screen.getByText(/자유의지/));
    expect(await screen.findByText(/있다→없다로 바뀜/)).toBeInTheDocument();
    // 시간순 노트가 프롬프트에 담겼는지
    expect(callAI.mock.calls[0][1]).toContain('자유의지');
    expect(callAI.mock.calls[0][1]).toContain('[2026-01-01]');
  });
});
