import { describe, it, expect, beforeEach, vi } from 'vitest';
import { callAI } from '../aiClient.js';

beforeEach(() => vi.restoreAllMocks());

function mockFetch(body, status = 200) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: status < 400,
    status,
    json: async () => body,
  }));
}

/* ── 모델 라우팅 ─────────────────────────────────────────── */
describe('callAI — model routing', () => {
  it('calls Claude API when claude key is provided', async () => {
    mockFetch({ content: [{ text: 'Claude 답변' }] });
    await callAI({ claude: 'key-c', gemini: 'key-g' }, 'sys', [], 'hi');
    const url = fetch.mock.calls[0][0];
    expect(url).toContain('anthropic.com');
  });

  it('calls Gemini API when only gemini key is provided', async () => {
    mockFetch({ candidates: [{ content: { parts: [{ text: 'Gemini 답변' }] } }] });
    await callAI({ gemini: 'key-g' }, 'sys', [], 'hi');
    const url = fetch.mock.calls[0][0];
    expect(url).toContain('googleapis.com');
  });

  it('prefers Claude over Gemini when both keys available', async () => {
    mockFetch({ content: [{ text: '답변' }] });
    await callAI({ claude: 'key-c', gemini: 'key-g' }, 'sys', [], 'hi');
    expect(fetch.mock.calls[0][0]).toContain('anthropic.com');
  });

  it('throws when no key is provided', async () => {
    await expect(callAI({}, 'sys', [], 'hi')).rejects.toThrow('no-key');
  });

  it('throws when apiKeys is undefined', async () => {
    await expect(callAI(undefined, 'sys', [], 'hi')).rejects.toThrow();
  });
});

/* ── 시스템 프롬프트 전달 ────────────────────────────────── */
describe('callAI — system prompt', () => {
  it('sends systemPrompt to Claude', async () => {
    mockFetch({ content: [{ text: 'ok' }] });
    await callAI({ claude: 'key' }, 'MY SYSTEM PROMPT', [], 'hi');
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.system).toBe('MY SYSTEM PROMPT');
  });

  it('sends systemInstruction to Gemini', async () => {
    mockFetch({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] });
    await callAI({ gemini: 'key' }, 'GEMINI SYS', [], 'hi');
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.systemInstruction.parts[0].text).toBe('GEMINI SYS');
  });
});

/* ── 히스토리 처리 ───────────────────────────────────────── */
describe('callAI — conversation history', () => {
  it('maps ai role to assistant for Claude', async () => {
    mockFetch({ content: [{ text: 'ok' }] });
    const history = [{ role: 'ai', content: '이전 답변' }];
    await callAI({ claude: 'key' }, 'sys', history, '새 질문');
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.messages[0].role).toBe('assistant');
    expect(body.messages[0].content).toBe('이전 답변');
  });

  it('maps ai role to model for Gemini', async () => {
    mockFetch({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] });
    const history = [{ role: 'ai', content: '이전 답변' }];
    await callAI({ gemini: 'key' }, 'sys', history, '새 질문');
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.contents[0].role).toBe('model');
  });

  it('includes current user message as last message', async () => {
    mockFetch({ content: [{ text: 'ok' }] });
    await callAI({ claude: 'key' }, 'sys', [], '현재 질문');
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    const last = body.messages.at(-1);
    expect(last.role).toBe('user');
    expect(last.content).toBe('현재 질문');
  });
});

/* ── 이미지 비전 모드 ────────────────────────────────────── */
describe('callAI — image vision', () => {
  it('sends image block to Claude when pageImageBase64 provided', async () => {
    mockFetch({ content: [{ text: 'ok' }] });
    await callAI({ claude: 'key' }, 'sys', [], '질문', 'IMG_BASE64==');
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    const lastMsg = body.messages.at(-1);
    expect(Array.isArray(lastMsg.content)).toBe(true);
    const imgBlock = lastMsg.content.find(b => b.type === 'image');
    expect(imgBlock.source.type).toBe('base64');
    expect(imgBlock.source.data).toBe('IMG_BASE64==');
    expect(imgBlock.source.media_type).toBe('image/jpeg');
  });

  it('sends inline_data to Gemini when pageImageBase64 provided', async () => {
    mockFetch({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] });
    await callAI({ gemini: 'key' }, 'sys', [], '질문', 'GEMINI_IMG==');
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    const lastContent = body.contents.at(-1);
    const imgPart = lastContent.parts.find(p => p.inline_data);
    expect(imgPart.inline_data.data).toBe('GEMINI_IMG==');
    expect(imgPart.inline_data.mime_type).toBe('image/jpeg');
  });

  it('sends plain text (no image block) when pageImageBase64 is null', async () => {
    mockFetch({ content: [{ text: 'ok' }] });
    await callAI({ claude: 'key' }, 'sys', [], '질문', null);
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    const lastMsg = body.messages.at(-1);
    expect(lastMsg.content).toBe('질문'); // string, not array
  });
});

/* ── 에러 처리 ───────────────────────────────────────────── */
describe('callAI — error handling', () => {
  it('throws with API error message on Claude failure', async () => {
    mockFetch({ error: { message: '잘못된 키입니다' } }, 401);
    await expect(callAI({ claude: 'bad-key' }, 'sys', [], 'hi')).rejects.toThrow('잘못된 키입니다');
  });

  it('falls back to HTTP status when no error body', async () => {
    mockFetch({}, 500);
    await expect(callAI({ claude: 'key' }, 'sys', [], 'hi')).rejects.toThrow('HTTP 500');
  });

  it('throws with error message on Gemini failure', async () => {
    mockFetch({ error: { message: '할당량 초과' } }, 429);
    await expect(callAI({ gemini: 'key' }, 'sys', [], 'hi')).rejects.toThrow('할당량 초과');
  });
});
