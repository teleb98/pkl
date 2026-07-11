import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock pdfjs-dist before PdfViewer import (uses DOMMatrix internally)
vi.mock('pdfjs-dist/build/pdf.min.mjs', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  getDocument: vi.fn(),
}));
vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: '' }));

import {
  setPageText, setViewedPage, setPageImage, getDocumentText, getPageImage, _resetForTesting,
} from '../pageTextCache.js';
import {
  _callClaude, _callGemini, _buildSystemPrompt,
} from '../screens/AIChatScreen.jsx';
import { _captureCanvas } from '../components/PdfViewer.jsx';

beforeEach(() => {
  _resetForTesting();
  vi.restoreAllMocks();
});

/* ── captureCanvas ───────────────────────────────────────── */
describe('captureCanvas', () => {
  it('returns null for null input', () => {
    expect(_captureCanvas(null)).toBeNull();
  });

  it('returns null when canvas toDataURL returns empty base64', () => {
    const canvas = document.createElement('canvas');
    // jsdom returns "data:," — split gives ""
    expect(_captureCanvas(canvas)).toBeNull();
  });

  it('returns base64 string when toDataURL returns data', () => {
    const canvas = document.createElement('canvas');
    vi.spyOn(canvas, 'toDataURL').mockReturnValue('data:image/jpeg;base64,ABC123==');
    const result = _captureCanvas(canvas);
    expect(result).toBe('ABC123==');
  });

  it('scales down canvas wider than 1200px', () => {
    const bigCanvas = document.createElement('canvas');
    Object.defineProperty(bigCanvas, 'width', { value: 2400, writable: true });
    Object.defineProperty(bigCanvas, 'height', { value: 3200, writable: true });
    const tmpCanvas = document.createElement('canvas');
    // jsdom doesn't support canvas: mock getContext and toDataURL
    vi.spyOn(tmpCanvas, 'getContext').mockReturnValue({ drawImage: vi.fn() });
    vi.spyOn(tmpCanvas, 'toDataURL').mockReturnValue('data:image/jpeg;base64,SCALED==');
    const origCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation(tag => {
      if (tag === 'canvas') return tmpCanvas;
      return origCreate(tag);
    });
    const result = _captureCanvas(bigCanvas);
    expect(tmpCanvas.width).toBe(1200);
    expect(tmpCanvas.height).toBe(1600); // 3200 * (1200/2400)
    expect(result).toBe('SCALED==');
  });

  it('returns null on exception', () => {
    const canvas = document.createElement('canvas');
    vi.spyOn(canvas, 'toDataURL').mockImplementation(() => { throw new Error('fail'); });
    expect(_captureCanvas(canvas)).toBeNull();
  });
});

/* ── buildSystemPrompt — text mode ──────────────────────── */
describe('buildSystemPrompt (text mode)', () => {
  const book = { id: 'b1', title: 'Test Book' };

  it('includes document text when pages are extracted', () => {
    setPageText('b1', 1, '1페이지 내용입니다');
    setPageText('b1', 2, '2페이지 내용입니다');
    const prompt = _buildSystemPrompt('quick', book, [], [], 'ko', false);
    expect(prompt).toContain('문서 내용');
    expect(prompt).toContain('1페이지 내용입니다');
    expect(prompt).toContain('2페이지 내용입니다');
  });

  it('does NOT include image recognition note in text mode', () => {
    setPageText('b1', 1, '텍스트 있음');
    const prompt = _buildSystemPrompt('quick', book, [], [], 'ko', false);
    expect(prompt).not.toContain('이미지 인식 모드');
    expect(prompt).not.toContain('Image Recognition Mode');
  });

  it('includes user notes in all modes', () => {
    const notes = [{ text: '내 독서 메모' }];
    const prompt = _buildSystemPrompt('quick', book, notes, [], 'ko', false);
    expect(prompt).toContain('내 독서 메모');
  });

  it('includes highlights', () => {
    const highlights = [{ text: '하이라이트된 문장' }];
    const prompt = _buildSystemPrompt('context', book, [], highlights, 'ko', false);
    expect(prompt).toContain('하이라이트된 문장');
  });

  it('socratic mode asks questions', () => {
    const prompt = _buildSystemPrompt('socratic', book, [], [], 'ko', false);
    expect(prompt).toContain('소크라테스');
    expect(prompt).toContain('질문');
  });

  it('context mode mentions book context', () => {
    const prompt = _buildSystemPrompt('context', book, [], [], 'ko', false);
    expect(prompt).toContain('맥락');
  });
});

/* ── buildSystemPrompt — image mode ─────────────────────── */
describe('buildSystemPrompt (image mode)', () => {
  const book = { id: 'b1', title: 'Scanned Book' };

  it('includes image recognition note when hasPageImage=true and no text', () => {
    // No text in cache → doc = null
    const prompt = _buildSystemPrompt('quick', book, [], [], 'ko', true);
    expect(prompt).toContain('이미지 인식 모드');
    expect(prompt).toContain('스캔 PDF');
  });

  it('does NOT add image note when text is also available', () => {
    setPageText('b1', 1, '텍스트 있음');
    // hasPageImage=true but text exists → text mode wins
    const prompt = _buildSystemPrompt('quick', book, [], [], 'ko', true);
    expect(prompt).not.toContain('이미지 인식 모드');
    expect(prompt).toContain('텍스트 있음');
  });

  it('works in english locale', () => {
    const prompt = _buildSystemPrompt('quick', book, [], [], 'en', true);
    expect(prompt).toContain('Image Recognition Mode');
    expect(prompt).toContain('scanned PDF');
  });
});

/* ── callClaude with image ───────────────────────────────── */
describe('callClaude — vision payload', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ content: [{ text: 'AI 답변' }] }),
    }));
  });

  it('sends plain text message when no image', async () => {
    await _callClaude('key123', 'system', [], 'user question', null);
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    const lastMsg = body.messages.at(-1);
    expect(lastMsg.role).toBe('user');
    expect(lastMsg.content).toBe('user question');
  });

  it('sends image content block when pageImageBase64 is provided', async () => {
    await _callClaude('key123', 'system', [], 'question', 'BASE64IMG==');
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    const lastMsg = body.messages.at(-1);
    expect(Array.isArray(lastMsg.content)).toBe(true);
    const imageBlock = lastMsg.content.find(b => b.type === 'image');
    expect(imageBlock).toBeDefined();
    expect(imageBlock.source.type).toBe('base64');
    expect(imageBlock.source.media_type).toBe('image/jpeg');
    expect(imageBlock.source.data).toBe('BASE64IMG==');
    const textBlock = lastMsg.content.find(b => b.type === 'text');
    expect(textBlock.text).toBe('question');
  });

  it('includes system prompt in request', async () => {
    await _callClaude('key123', 'MY SYSTEM', [], 'hi', null);
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.system).toBe('MY SYSTEM');
  });

  it('skips greeting (history[0]) and sends rest as history', async () => {
    const history = [
      { role: 'ai', content: 'greeting' },
      { role: 'user', content: 'first question' },
      { role: 'ai', content: 'first answer' },
    ];
    // Note: caller (send fn) already slices, callClaude receives history directly
    await _callClaude('key', 'sys', history, 'new question', null);
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    // greeting becomes assistant role (converted), first question = user, etc.
    expect(body.messages[0].content).toBe('greeting');
    expect(body.messages[1].content).toBe('first question');
  });
});

/* ── callGemini with image ───────────────────────────────── */
describe('callGemini — vision payload', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: 'Gemini 답변' }] } }] }),
    }));
  });

  it('sends plain text parts when no image', async () => {
    await _callGemini('gkey', 'sys', [], 'hello', null);
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    const lastContent = body.contents.at(-1);
    expect(lastContent.parts).toHaveLength(1);
    expect(lastContent.parts[0].text).toBe('hello');
  });

  it('sends inline_data part when image provided', async () => {
    await _callGemini('gkey', 'sys', [], 'describe', 'IMGDATA==');
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    const lastContent = body.contents.at(-1);
    expect(lastContent.parts).toHaveLength(2);
    const imgPart = lastContent.parts.find(p => p.inline_data);
    expect(imgPart.inline_data.mime_type).toBe('image/jpeg');
    expect(imgPart.inline_data.data).toBe('IMGDATA==');
    const txtPart = lastContent.parts.find(p => p.text);
    expect(txtPart.text).toBe('describe');
  });

  it('sends systemInstruction separately', async () => {
    await _callGemini('gkey', 'MY GEMINI SYS', [], 'q', null);
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.systemInstruction.parts[0].text).toBe('MY GEMINI SYS');
  });

  it('maps ai role to model role', async () => {
    const history = [{ role: 'ai', content: 'hello' }];
    await _callGemini('gkey', 'sys', history, 'q', null);
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.contents[0].role).toBe('model');
  });
});

/* ── mode selection: text vs image ──────────────────────── */
describe('text vs image mode selection via cache', () => {
  it('text mode: getDocumentText returns data → no image used', () => {
    setPageText('b1', 1, '텍스트 내용');
    const doc = getDocumentText('b1');
    const img = getPageImage('b1');
    // pageImg logic: use image only when no doc
    const pageImg = img && !doc ? img.base64 : null;
    expect(pageImg).toBeNull();
  });

  it('image mode: no text → getPageImage used', () => {
    setViewedPage('b1', 3, null); // viewed but no text
    setPageImage('b1', 3, 'SCAN_IMG==');
    const doc = getDocumentText('b1');
    const img = getPageImage('b1');
    const pageImg = img && !doc ? img.base64 : null;
    expect(pageImg).toBe('SCAN_IMG==');
  });

  it('image is ignored when text is available', () => {
    setPageText('b1', 1, '텍스트 있음');
    setPageImage('b1', 1, 'IMG_DATA');
    const doc = getDocumentText('b1');
    const img = getPageImage('b1');
    const pageImg = img && !doc ? img.base64 : null;
    expect(pageImg).toBeNull();
  });
});

/* ── callClaude error handling ───────────────────────────── */
describe('callClaude — error handling', () => {
  it('throws with API error message on 429', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 429,
      json: async () => ({ error: { message: 'too many requests' } }),
    }));
    await expect(_callClaude('key', 'sys', [], 'hi')).rejects.toThrow('too many requests');
  });

  it('throws with API error message on 401', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 401,
      json: async () => ({ error: { message: 'unauthorized' } }),
    }));
    await expect(_callClaude('key', 'sys', [], 'hi')).rejects.toThrow('unauthorized');
  });

  it('falls back to HTTP status message when no error body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 500,
      json: async () => ({ }),
    }));
    await expect(_callClaude('key', 'sys', [], 'hi')).rejects.toThrow('HTTP 500');
  });
});

/* ── callGemini error handling ───────────────────────────── */
describe('callGemini — error handling', () => {
  it('throws on 429', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 429,
      json: async () => ({ error: { message: 'quota exceeded' } }),
    }));
    await expect(_callGemini('key', 'sys', [], 'hi')).rejects.toThrow();
  });
});
