import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithTheme } from './testUtils.jsx';

vi.mock('../aiClient.js', () => ({ callAI: vi.fn() }));

import { RecallCard } from '../components/RecallCard.jsx';
import { callAI } from '../aiClient.js';
import { saveWikiConfig, saveWikiIndex, getRecallLog } from '../store.js';

beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); });

const LONG = '핵심 내용이 충분히 담긴 노트 본문입니다. '.repeat(4);

function seed() {
  saveWikiConfig({ connected: true });
  saveWikiIndex([
    { id: 'n1', title: '자유의지', tags: [], links: [], content: LONG, modifiedTime: '2026-01-01T00:00:00Z', webViewLink: 'https://d/n1' },
    { id: 'n2', title: '결정론', tags: [], links: [], content: LONG, modifiedTime: '2026-02-01T00:00:00Z' },
  ]);
}

describe('RecallCard', () => {
  it('위키 미연결이면 렌더링하지 않는다', () => {
    const { container } = renderWithTheme(<RecallCard lang="ko" apiKeys={{ gemini: 'k' }} />);
    expect(container.textContent).toBe('');
  });

  it('후보 수와 시작 버튼을 보여준다', () => {
    seed();
    renderWithTheme(<RecallCard lang="ko" apiKeys={{ gemini: 'k' }} />);
    expect(screen.getByText(/지식 정착 복습/)).toBeInTheDocument();
    expect(screen.getByText(/오늘의 복습 시작 \(2\)/)).toBeInTheDocument();
  });

  it('시작 → AI 질문 → 정답 보기 → 자기 평가 → 기록·다음 문제', async () => {
    seed();
    callAI.mockResolvedValue('[{"id":"n1","question":"자유의지의 핵심 논지는?"},{"id":"n2","question":"결정론의 근거는?"}]');
    renderWithTheme(<RecallCard lang="ko" apiKeys={{ gemini: 'k' }} />);

    fireEvent.click(screen.getByText(/오늘의 복습 시작/));
    // 우선순위상 더 오래된 n1 이 먼저
    expect(await screen.findByText(/자유의지의 핵심 논지는\?/)).toBeInTheDocument();
    expect(screen.getByText(/1 \/ 2/)).toBeInTheDocument();

    fireEvent.click(screen.getByText(/정답 보기/));
    expect(screen.getAllByText(new RegExp('핵심 내용이 충분히'))[0]).toBeInTheDocument();
    expect(screen.getByText(/원문 열기/)).toBeInTheDocument();

    fireEvent.click(screen.getByText(/기억했어요/));
    expect(getRecallLog().n1).toMatchObject({ attempts: 1, fails: 0 });
    expect(await screen.findByText(/결정론의 근거는\?/)).toBeInTheDocument();

    fireEvent.click(screen.getByText(/정답 보기/));
    fireEvent.click(screen.getByText(/못 떠올렸어요/));
    expect(getRecallLog().n2).toMatchObject({ attempts: 1, fails: 1 });
    expect(await screen.findByText(/복습 완료 — 2개 중 1개 기억/)).toBeInTheDocument();
  });

  it('AI 실패 시 폴백 질문으로 진행된다', async () => {
    seed();
    callAI.mockRejectedValue(new Error('no-key'));
    renderWithTheme(<RecallCard lang="ko" apiKeys={{}} />);

    fireEvent.click(screen.getByText(/오늘의 복습 시작/));
    expect(await screen.findByText(/《자유의지》 노트에 적어둔 핵심 내용은/)).toBeInTheDocument();
  });
});
