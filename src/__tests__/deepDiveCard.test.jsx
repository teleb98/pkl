import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithTheme } from './testUtils.jsx';

vi.mock('../aiClient.js', () => ({ callAI: vi.fn() }));

import { DeepDiveCard } from '../components/DeepDiveCard.jsx';
import { callAI } from '../aiClient.js';
import { saveBookIndex, setBookMeta, saveWikiConfig, saveWikiIndex } from '../store.js';

beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); });

// 위키 연결 + '자유의지' 노트 1 + 책 1 → 스파링 주제
function seed() {
  saveBookIndex([{ id: 'b1', title: '자유의지의 과학' }]);
  setBookMeta('b1', { aiTopics: ['자유의지'], aiSummary: '결정론 옹호' });
  saveWikiConfig({ connected: true });
  saveWikiIndex([{ id: 'n1', title: '자유의지 단상', tags: ['자유의지'], links: [], content: '있다고 본다' }]);
}

describe('DeepDiveCard', () => {
  it('위키 미연결이면 렌더링하지 않는다', () => {
    const { container } = renderWithTheme(<DeepDiveCard lang="ko" apiKeys={{ gemini: 'k' }} />);
    expect(container.textContent).toBe('');
  });

  it('신호 있는 개념을 칩으로 보여준다', () => {
    seed();
    renderWithTheme(<DeepDiveCard lang="ko" apiKeys={{ gemini: 'k' }} />);
    expect(screen.getByText(/개념 심화 문답/)).toBeInTheDocument();
    expect(screen.getByText(/자유의지/)).toBeInTheDocument();
    expect(screen.getByText(/노트 1·책 1/)).toBeInTheDocument();
  });

  it('칩 클릭 → 첫 질문 표시(노트·책이 프롬프트에 근거로 포함)', async () => {
    seed();
    callAI.mockResolvedValue('당신은 "있다고 본다"고 썼지만, 《자유의지의 과학》은 결정론을 옹호합니다. 이 긴장을 어떻게 보십니까?');
    renderWithTheme(<DeepDiveCard lang="ko" apiKeys={{ gemini: 'k' }} />);

    fireEvent.click(screen.getByText(/자유의지/));
    expect(await screen.findByText(/이 긴장을 어떻게 보십니까/)).toBeInTheDocument();
    const [, sysPrompt] = callAI.mock.calls[0];
    expect(sysPrompt).toContain('《자유의지 단상》');
    expect(sysPrompt).toContain('《자유의지의 과학》');
  });

  it('답 입력 → 히스토리와 함께 후속 질문 요청', async () => {
    seed();
    callAI.mockResolvedValueOnce('첫 질문입니다.');
    callAI.mockResolvedValueOnce('더 깊은 후속 질문입니다.');
    renderWithTheme(<DeepDiveCard lang="ko" apiKeys={{ gemini: 'k' }} />);

    fireEvent.click(screen.getByText(/자유의지/));
    await screen.findByText('첫 질문입니다.');

    fireEvent.change(screen.getByPlaceholderText(/당신의 답을 쓰세요/), { target: { value: '내 생각은 이렇다' } });
    fireEvent.click(screen.getByText('답하기'));

    expect(await screen.findByText('더 깊은 후속 질문입니다.')).toBeInTheDocument();
    // 두 번째 호출: history 에 첫 질문(ai) 포함 + userMsg 는 내 답
    const secondCall = callAI.mock.calls[1];
    expect(secondCall[2]).toEqual([{ role: 'ai', content: '첫 질문입니다.' }]);
    expect(secondCall[3]).toBe('내 생각은 이렇다');
  });

  it('끝내기를 누르면 칩 목록으로 돌아온다', async () => {
    seed();
    callAI.mockResolvedValue('질문');
    renderWithTheme(<DeepDiveCard lang="ko" apiKeys={{ gemini: 'k' }} />);
    fireEvent.click(screen.getByText(/자유의지/));
    await screen.findByText('질문');

    fireEvent.click(screen.getByText('끝내기'));
    await waitFor(() => expect(screen.queryByText('질문')).toBeNull());
    expect(screen.getByText(/노트 1·책 1/)).toBeInTheDocument();
  });
});
