import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithTheme } from './testUtils.jsx';

vi.mock('../utils/wikiBridge.js', () => ({ discoverBridges: vi.fn() }));

import { KnowledgeBridgeCard } from '../components/KnowledgeBridgeCard.jsx';
import { discoverBridges } from '../utils/wikiBridge.js';
import { saveWikiConfig } from '../store.js';

beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); });

describe('KnowledgeBridgeCard', () => {
  it('위키 미연결이면 조회하지 않고 렌더링도 없음', () => {
    const { container } = renderWithTheme(<KnowledgeBridgeCard lang="ko" />);
    expect(discoverBridges).not.toHaveBeenCalled();
    expect(container.textContent).toBe('');
  });

  it('끊어진 연결 쌍을 근거·유사도와 함께 보여준다', async () => {
    saveWikiConfig({ connected: true });
    discoverBridges.mockResolvedValue([
      { a: { id: 'a', title: '자유의지', webViewLink: 'https://d/a' },
        b: { id: 'b', title: '결정론', webViewLink: 'https://d/b' },
        sim: 0.87, sharedTags: ['철학'], sharedLinks: [] },
    ]);
    renderWithTheme(<KnowledgeBridgeCard lang="ko" />);

    expect(await screen.findByText('자유의지')).toBeInTheDocument();
    expect(screen.getByText('결정론')).toBeInTheDocument();
    expect(screen.getByText(/공유 태그 #철학/)).toBeInTheDocument();
    expect(screen.getByText(/87%/)).toBeInTheDocument();
    // 원문 열기 링크
    expect(screen.getByText('자유의지').closest('a')).toHaveAttribute('href', 'https://d/a');
  });

  it('결과가 없으면 렌더링하지 않는다', async () => {
    saveWikiConfig({ connected: true });
    discoverBridges.mockResolvedValue([]);
    const { container } = renderWithTheme(<KnowledgeBridgeCard lang="ko" />);
    // effect 완료 대기
    await Promise.resolve();
    expect(container.textContent).toBe('');
  });
});
