/* 시나리오 E — WikiConnectPanel 사용자 플로우: 연결(동기화) → 상태 갱신 →
   내보내기 → 결과 메시지. Drive/임베딩은 목, 패널의 상태 전이를 검증한다. */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithTheme } from './testUtils.jsx';

// useGoogleAuth: 반환된 함수를 부르면 즉시 토큰 발급 성공으로 처리
vi.mock('../utils/useGoogleAuth.js', () => ({
  useGoogleAuth: ({ onSuccess }) => () => onSuccess({ access_token: 'tok' }),
}));
vi.mock('../utils/driveWiki.js', async (orig) => ({
  ...(await orig()),
  syncWikiIndex: vi.fn(),
}));
vi.mock('../utils/wikiVector.js', () => ({ buildWikiVectors: vi.fn(async () => ({ count: 2 })) }));
vi.mock('../utils/wikiExport.js', async (orig) => ({
  ...(await orig()),
  exportKnowledgeToVault: vi.fn(),
}));

import { WikiConnectPanel } from '../components/WikiConnectPanel.jsx';
import { syncWikiIndex } from '../utils/driveWiki.js';
import { buildWikiVectors } from '../utils/wikiVector.js';
import { exportKnowledgeToVault } from '../utils/wikiExport.js';
import { getWikiConfig, getWikiIndex } from '../store.js';

beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); });

describe('WikiConnectPanel — 연결·동기화 플로우', () => {
  it('연결 버튼 → 동기화 → 노트 수 표시 + 인덱스·벡터 저장', async () => {
    syncWikiIndex.mockResolvedValue({
      folderId: 'w1', count: 2, truncated: false,
      notes: [{ id: 'n1', title: 'a' }, { id: 'n2', title: 'b' }],
    });
    renderWithTheme(<WikiConnectPanel lang="ko" apiKeys={{ gemini: 'g-key' }} />);

    fireEvent.click(screen.getByText('드라이브로 연결'));
    expect(await screen.findByText(/노트 2개 연결됨/)).toBeInTheDocument();

    expect(getWikiConfig().connected).toBe(true);
    expect(getWikiIndex().length).toBe(2);
    expect(buildWikiVectors).toHaveBeenCalledWith(expect.any(Array), { geminiKey: 'g-key' });
    expect(screen.getByText('볼트로 내보내기')).toBeInTheDocument(); // 연결 후 내보내기 노출
  });

  it('폴더가 없으면 에러 안내를 보여준다', async () => {
    syncWikiIndex.mockRejectedValue(Object.assign(new Error('nf'), { code: 'folder-not-found' }));
    renderWithTheme(<WikiConnectPanel lang="ko" apiKeys={{}} />);
    fireEvent.click(screen.getByText('드라이브로 연결'));
    expect(await screen.findByText(/Backups\/cw_wiki 폴더를 찾지 못했어요/)).toBeInTheDocument();
  });

  it('벡터 색인이 실패해도 동기화는 성공 처리(토큰 검색 폴백 전제)', async () => {
    syncWikiIndex.mockResolvedValue({ folderId: 'w1', count: 1, truncated: false, notes: [{ id: 'n1' }] });
    buildWikiVectors.mockRejectedValue(new Error('embed-fail'));
    renderWithTheme(<WikiConnectPanel lang="ko" apiKeys={{}} />);
    fireEvent.click(screen.getByText('드라이브로 연결'));
    expect(await screen.findByText(/노트 1개 연결됨/)).toBeInTheDocument();
  });
});

describe('WikiConnectPanel — 내보내기 플로우', () => {
  function connected() {
    localStorage.setItem('pkl_wiki_config', JSON.stringify({ connected: true, count: 3, lastSync: Date.now() }));
  }

  it('내보내기 버튼 → 결과 요약 메시지', async () => {
    connected();
    exportKnowledgeToVault.mockResolvedValue({ created: 2, updated: 1, total: 3 });
    renderWithTheme(<WikiConnectPanel lang="ko" apiKeys={{}} />);

    fireEvent.click(screen.getByText('볼트로 내보내기'));
    expect(await screen.findByText(/3권 내보냄.*새 노트 2.*갱신 1/)).toBeInTheDocument();
    expect(exportKnowledgeToVault).toHaveBeenCalledWith('tok', expect.any(Object));
  });

  it('내보내기 실패 시 에러 안내', async () => {
    connected();
    exportKnowledgeToVault.mockRejectedValue(new Error('boom'));
    renderWithTheme(<WikiConnectPanel lang="ko" apiKeys={{}} />);
    fireEvent.click(screen.getByText('볼트로 내보내기'));
    expect(await screen.findByText(/내보내기에 실패했어요/)).toBeInTheDocument();
  });

  it('미연결 상태에서는 내보내기 버튼이 없다', () => {
    renderWithTheme(<WikiConnectPanel lang="ko" apiKeys={{}} />);
    expect(screen.queryByText('볼트로 내보내기')).toBeNull();
  });
});
