import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithTheme } from './testUtils.jsx';
import { RelatedWikiNotes } from '../components/RelatedWikiNotes.jsx';
import { WikiConnectPanel } from '../components/WikiConnectPanel.jsx';
import { saveWikiConfig, saveWikiIndex, setBookMeta } from '../store.js';

// useGoogleAuth 는 GIS 의존 → 목으로 대체(연결 버튼 렌더만 확인)
vi.mock('../utils/useGoogleAuth.js', () => ({ useGoogleAuth: () => () => {} }));

beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); });

describe('WikiConnectPanel', () => {
  it('미연결 시 안내와 연결 버튼을 보여준다', () => {
    renderWithTheme(<WikiConnectPanel lang="ko" />);
    expect(screen.getByText(/옵시디언 위키 연결/)).toBeInTheDocument();
    expect(screen.getByText('드라이브로 연결')).toBeInTheDocument();
  });

  it('연결됨 상태면 노트 수와 다시 동기화 버튼', () => {
    saveWikiConfig({ connected: true, count: 12, lastSync: Date.now() });
    renderWithTheme(<WikiConnectPanel lang="ko" />);
    expect(screen.getByText(/노트 12개 연결됨/)).toBeInTheDocument();
    expect(screen.getByText('다시 동기화')).toBeInTheDocument();
  });
});

describe('RelatedWikiNotes', () => {
  it('연결 안 됐으면 아무것도 렌더링하지 않는다', () => {
    const { container } = renderWithTheme(<RelatedWikiNotes book={{ id: 'b1', title: '사피엔스' }} lang="ko" />);
    expect(container.textContent).toBe('');
  });

  it('책 주제와 겹치는 위키 노트를 근거와 함께 보여준다', () => {
    saveWikiConfig({ connected: true, count: 1 });
    saveWikiIndex([{ id: 'n1', title: '역사 개론', tags: ['역사'], links: [], webViewLink: 'https://drive/n1', excerpt: '역사 메모', wordCount: 50 }]);
    setBookMeta('b1', { aiTopics: ['역사'] });
    renderWithTheme(<RelatedWikiNotes book={{ id: 'b1', title: '사피엔스' }} lang="ko" />);
    expect(screen.getByText('역사 개론')).toBeInTheDocument();
    expect(screen.getByText('태그 #역사')).toBeInTheDocument();
  });
});
