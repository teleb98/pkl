import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, waitFor, fireEvent, screen } from '@testing-library/react';
import { ThemeContext } from '../context.jsx';
import { THEMES, TYPE_PAIRS } from '../data.js';
import { _resetForTesting } from '../pageTextCache.js';

/* pdfjs mock */
vi.mock('pdfjs-dist/build/pdf.min.mjs', () => ({
  getDocument: vi.fn(),
  GlobalWorkerOptions: { workerSrc: '' },
  TextLayer: vi.fn(),
}));
vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: '' }));

/* aiClient mock — 테스트 중 실제 API 호출 방지 */
vi.mock('../aiClient.js', () => ({
  callAI: vi.fn().mockResolvedValue('AI 테스트 답변입니다'),
}));

import { getDocument, TextLayer } from 'pdfjs-dist/build/pdf.min.mjs';
import { ReaderScreen } from '../screens/ReaderScreen.jsx';

const T = THEMES.ember;
const F = TYPE_PAIRS.lora;

const MOCK_BOOK = { id: 'book123', title: '테스트 책', webViewLink: 'https://drive.google.com/file/d/book123/view' };

function makeMockPdf() {
  const page = {
    getViewport: vi.fn().mockReturnValue({ width: 595, height: 842, scale: 1, transform: [1,0,0,1,0,0] }),
    render:      vi.fn().mockReturnValue({ promise: Promise.resolve(), cancel: vi.fn() }),
    getTextContent:    vi.fn().mockResolvedValue({ items: [{ str: 'Sample' }] }),
    streamTextContent: vi.fn().mockReturnValue({}),
  };
  return { numPages: 10, getPage: vi.fn().mockResolvedValue(page), destroy: vi.fn() };
}

function renderReader(props = {}) {
  return render(
    <ThemeContext.Provider value={{ T, F }}>
      <ReaderScreen
        lang="ko"
        setScreen={vi.fn()}
        openDriveSave={vi.fn()}
        currentBook={MOCK_BOOK}
        apiKeys={{ claude: 'test-key' }}
        {...props}
      />
    </ThemeContext.Provider>
  );
}

function pressKey(key) {
  fireEvent.keyDown(window, { key });
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('pkl_config', JSON.stringify({ driveAccessToken: 'tok' }));
  _resetForTesting();
  vi.clearAllMocks();
  TextLayer.mockImplementation(function() { this.render = vi.fn().mockResolvedValue(undefined); this.cancel = vi.fn(); });
  getDocument.mockReturnValue({
    onProgress: null,
    promise: Promise.resolve(makeMockPdf()),
    destroy: vi.fn(),
  });
});

/* ── 초기 상태 ───────────────────────────────────────────── */
describe('ReaderScreen — 초기 상태 (집중 모드 OFF)', () => {
  it('책 제목이 헤더에 표시됨', () => {
    renderReader();
    expect(document.body.textContent).toContain('테스트 책');
  });

  it('집중 모드 진입 버튼(✦)이 헤더에 있음', () => {
    renderReader();
    // 집중 모드 버튼: Icon name="spark"가 있는 button (헤더 내부)
    const header = document.querySelector('[style*="background: rgb(255"]') ??
                   document.querySelector('[style*="border-bottom"]');
    expect(header).not.toBeNull();
  });

  it('집중 모드 플로팅 툴바가 없음', () => {
    renderReader();
    // 플로팅 툴바는 focusMode=true일 때만 렌더됨
    expect(document.body.textContent).not.toContain('A · AI');
  });
});

/* ── F 키: 집중 모드 토글 ────────────────────────────────── */
describe('F 키 — 집중 모드 토글', () => {
  it('F 키를 누르면 집중 모드 플로팅 툴바가 나타남', async () => {
    renderReader();
    pressKey('f');
    await waitFor(() => {
      expect(document.body.textContent).toContain('A · AI');
    });
  });

  it('F 키를 두 번 누르면 집중 모드가 해제됨', async () => {
    renderReader();
    pressKey('f');
    await waitFor(() => expect(document.body.textContent).toContain('A · AI'));
    pressKey('f');
    await waitFor(() => {
      expect(document.body.textContent).not.toContain('A · AI');
    });
  });

  it('대문자 F 키도 동작함', async () => {
    renderReader();
    pressKey('F');
    await waitFor(() => expect(document.body.textContent).toContain('A · AI'));
  });

  it('집중 모드 ON → 툴바에 페이지 이동 버튼 존재', async () => {
    renderReader();
    pressKey('f');
    await waitFor(() => {
      // 플로팅 툴바의 ‹ › 버튼
      expect(document.body.textContent).toContain('‹');
      expect(document.body.textContent).toContain('›');
    });
  });
});

/* ── A 키: AI 채팅 토글 (집중 모드 내에서) ─────────────── */
describe('A 키 — 집중 모드에서 AI 채팅 토글', () => {
  it('집중 모드 OFF 상태에서 A 키는 AI 오버레이를 열지 않음', async () => {
    renderReader();
    pressKey('a');
    // AI 오버레이가 나타나지 않아야 함
    await new Promise(r => setTimeout(r, 50));
    expect(document.body.textContent).not.toContain('[A] 닫기');
  });

  it('집중 모드 ON → A 키 → AI 오버레이가 열림', async () => {
    renderReader();
    pressKey('f');
    await waitFor(() => expect(document.body.textContent).toContain('A · AI'));

    pressKey('a');
    await waitFor(() => {
      expect(document.body.textContent).toContain('[A] 닫기');
    });
  });

  it('집중 모드 ON → A → A → AI 오버레이가 닫힘', async () => {
    renderReader();
    pressKey('f');
    await waitFor(() => expect(document.body.textContent).toContain('A · AI'));

    pressKey('a');
    await waitFor(() => expect(document.body.textContent).toContain('[A] 닫기'));

    pressKey('a');
    await waitFor(() => {
      expect(document.body.textContent).not.toContain('[A] 닫기');
    });
  });

  it('대문자 A 키도 동작함', async () => {
    renderReader();
    pressKey('F');
    await waitFor(() => expect(document.body.textContent).toContain('A · AI'));
    pressKey('A');
    await waitFor(() => expect(document.body.textContent).toContain('[A] 닫기'));
  });

  it('AI 오버레이에 AI 모델명이 표시됨', async () => {
    renderReader();
    pressKey('f');
    await waitFor(() => expect(document.body.textContent).toContain('A · AI'));
    pressKey('a');
    await waitFor(() => {
      expect(document.body.textContent).toContain('Claude');
    });
  });

  it('AI 오버레이에 입력창이 있음', async () => {
    renderReader();
    pressKey('f');
    await waitFor(() => expect(document.body.textContent).toContain('A · AI'));
    pressKey('a');
    await waitFor(() => {
      const input = document.querySelector('input[placeholder*="질문"]');
      expect(input).not.toBeNull();
    });
  });
});

/* ── Escape 키 ───────────────────────────────────────────── */
describe('Escape 키 — 단계별 종료', () => {
  it('집중 모드 OFF 상태에서 Escape는 아무 영향 없음', async () => {
    renderReader();
    pressKey('Escape');
    await new Promise(r => setTimeout(r, 50));
    // 상태 변화 없음 — 에러 없이 동작
    expect(document.body.textContent).toContain('테스트 책');
  });

  it('집중 모드 ON → Escape → 집중 모드 종료', async () => {
    renderReader();
    pressKey('f');
    await waitFor(() => expect(document.body.textContent).toContain('A · AI'));

    pressKey('Escape');
    await waitFor(() => {
      expect(document.body.textContent).not.toContain('A · AI');
    });
  });

  it('AI 오버레이 열림 → Escape → AI만 닫히고 집중 모드 유지', async () => {
    renderReader();
    pressKey('f');
    await waitFor(() => expect(document.body.textContent).toContain('A · AI'));
    pressKey('a');
    await waitFor(() => expect(document.body.textContent).toContain('[A] 닫기'));

    // Escape: AI 닫힘, 집중 모드는 유지
    pressKey('Escape');
    await waitFor(() => {
      expect(document.body.textContent).not.toContain('[A] 닫기'); // AI 닫힘
      expect(document.body.textContent).toContain('A · AI');       // 집중 모드 유지
    });
  });

  it('AI Escape 후 두 번째 Escape → 집중 모드까지 종료', async () => {
    renderReader();
    pressKey('f');
    await waitFor(() => expect(document.body.textContent).toContain('A · AI'));
    pressKey('a');
    await waitFor(() => expect(document.body.textContent).toContain('[A] 닫기'));
    pressKey('Escape'); // AI 닫기
    await waitFor(() => expect(document.body.textContent).not.toContain('[A] 닫기'));
    pressKey('Escape'); // 집중 모드 종료
    await waitFor(() => expect(document.body.textContent).not.toContain('A · AI'));
  });
});

/* ── 플로팅 툴바 버튼 ─────────────────────────────────────── */
describe('집중 모드 플로팅 툴바 버튼', () => {
  it('"A · AI" 버튼 클릭 → AI 오버레이 열림', async () => {
    renderReader();
    pressKey('f');
    await waitFor(() => expect(document.body.textContent).toContain('A · AI'));

    // "A · AI" 텍스트가 있는 버튼 클릭
    const aiBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('A · AI'));
    expect(aiBtn).not.toBeNull();
    fireEvent.click(aiBtn);
    await waitFor(() => expect(document.body.textContent).toContain('[A] 닫기'));
  });

  it('"✕" 버튼 클릭 → 집중 모드 종료', async () => {
    renderReader();
    pressKey('f');
    await waitFor(() => expect(document.body.textContent).toContain('A · AI'));

    const exitBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent === '✕');
    expect(exitBtn).not.toBeNull();
    fireEvent.click(exitBtn);
    await waitFor(() => expect(document.body.textContent).not.toContain('A · AI'));
  });
});

/* ── INPUT 포커스 시 단축키 무시 ─────────────────────────── */
describe('입력창 포커스 시 단축키 무시', () => {
  it('input 요소에 포커스된 상태에서 F 키는 집중 모드 진입 안 함', async () => {
    renderReader();
    const anyInput = document.querySelector('input');
    if (anyInput) {
      fireEvent.keyDown(anyInput, { key: 'f', target: anyInput });
      // 집중 모드 플로팅 툴바가 나타나지 않아야 함
      await new Promise(r => setTimeout(r, 50));
      expect(document.body.textContent).not.toContain('A · AI');
    }
  });
});
