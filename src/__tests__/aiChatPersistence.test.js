import { describe, it, expect, beforeEach } from 'vitest';
import { getAiChat, saveAiChat, clearAiChat } from '../store.js';

beforeEach(() => localStorage.clear());

/* ── getAiChat ───────────────────────────────────────────── */
describe('getAiChat', () => {
  it('returns null when no saved data', () => {
    expect(getAiChat('b1')).toBeNull();
  });

  it('returns null for empty array stored', () => {
    localStorage.setItem('pkl_ai_chat_b1', 'null');
    expect(getAiChat('b1')).toBeNull();
  });

  it('returns parsed messages array', () => {
    const msgs = [{ role: 'user', content: '안녕' }, { role: 'ai', content: '반가워요' }];
    localStorage.setItem('pkl_ai_chat_b1', JSON.stringify(msgs));
    expect(getAiChat('b1')).toEqual(msgs);
  });

  it('returns null on invalid JSON', () => {
    localStorage.setItem('pkl_ai_chat_b1', '{broken json');
    expect(getAiChat('b1')).toBeNull();
  });

  it('is isolated per book', () => {
    const msgsA = [{ role: 'user', content: 'A' }];
    localStorage.setItem('pkl_ai_chat_bookA', JSON.stringify(msgsA));
    expect(getAiChat('bookB')).toBeNull();
    expect(getAiChat('bookA')).toEqual(msgsA);
  });
});

/* ── saveAiChat ──────────────────────────────────────────── */
describe('saveAiChat', () => {
  it('skips the greeting message (index 0)', () => {
    const msgs = [
      { role: 'ai', content: '안녕하세요 — 인사말' },
      { role: 'user', content: '첫 번째 질문' },
      { role: 'ai', content: '첫 번째 답변' },
    ];
    saveAiChat('b1', msgs);
    const saved = getAiChat('b1');
    expect(saved).toHaveLength(2);
    expect(saved[0].content).toBe('첫 번째 질문');
    expect(saved[1].content).toBe('첫 번째 답변');
  });

  it('removes key from localStorage when only greeting is present', () => {
    const msgs = [{ role: 'ai', content: '인사말만' }];
    saveAiChat('b1', msgs);
    expect(localStorage.getItem('pkl_ai_chat_b1')).toBeNull();
  });

  it('removes key when messages is empty array', () => {
    saveAiChat('b1', []);
    expect(localStorage.getItem('pkl_ai_chat_b1')).toBeNull();
  });

  it('keeps last 30 messages when there are more', () => {
    const msgs = [{ role: 'ai', content: 'greeting' }];
    for (let i = 1; i <= 35; i++) {
      msgs.push({ role: 'user', content: `msg${i}` });
    }
    saveAiChat('b1', msgs);
    const saved = getAiChat('b1');
    expect(saved).toHaveLength(30);
    expect(saved[0].content).toBe('msg6');   // first 5 dropped
    expect(saved[29].content).toBe('msg35'); // last message preserved
  });

  it('saves all messages when under 30', () => {
    const msgs = [{ role: 'ai', content: 'greeting' }];
    for (let i = 1; i <= 10; i++) msgs.push({ role: 'user', content: `msg${i}` });
    saveAiChat('b1', msgs);
    expect(getAiChat('b1')).toHaveLength(10);
  });

  it('overwrites previous save for same book', () => {
    const v1 = [{ role: 'ai', content: 'g' }, { role: 'user', content: 'old' }];
    const v2 = [{ role: 'ai', content: 'g' }, { role: 'user', content: 'new' }];
    saveAiChat('b1', v1);
    saveAiChat('b1', v2);
    expect(getAiChat('b1')[0].content).toBe('new');
  });

  it('is isolated per book', () => {
    const a = [{ role: 'ai', content: 'g' }, { role: 'user', content: 'A' }];
    const b = [{ role: 'ai', content: 'g' }, { role: 'user', content: 'B' }];
    saveAiChat('bookA', a);
    saveAiChat('bookB', b);
    expect(getAiChat('bookA')[0].content).toBe('A');
    expect(getAiChat('bookB')[0].content).toBe('B');
  });

  it('preserves all message fields (role, content)', () => {
    const msgs = [
      { role: 'ai', content: 'greeting' },
      { role: 'user', content: 'user msg', extra: 'data' },
    ];
    saveAiChat('b1', msgs);
    expect(getAiChat('b1')[0]).toMatchObject({ role: 'user', content: 'user msg' });
  });
});

/* ── clearAiChat ─────────────────────────────────────────── */
describe('clearAiChat', () => {
  it('removes saved chat for the specified book', () => {
    const msgs = [{ role: 'ai', content: 'g' }, { role: 'user', content: 'hi' }];
    saveAiChat('b1', msgs);
    clearAiChat('b1');
    expect(getAiChat('b1')).toBeNull();
  });

  it('does not affect other books', () => {
    const msgs = [{ role: 'ai', content: 'g' }, { role: 'user', content: 'hi' }];
    saveAiChat('bookA', msgs);
    saveAiChat('bookB', msgs);
    clearAiChat('bookA');
    expect(getAiChat('bookA')).toBeNull();
    expect(getAiChat('bookB')).not.toBeNull();
  });

  it('does not throw when nothing saved', () => {
    expect(() => clearAiChat('nonexistent')).not.toThrow();
  });

  it('can save again after clear', () => {
    const msgs = [{ role: 'ai', content: 'g' }, { role: 'user', content: 'q' }];
    saveAiChat('b1', msgs);
    clearAiChat('b1');
    saveAiChat('b1', msgs);
    expect(getAiChat('b1')).toHaveLength(1);
  });
});

/* ── round-trip: save → restore → clear ─────────────────── */
describe('round-trip', () => {
  it('full conversation round-trip', () => {
    const conversation = [
      { role: 'ai', content: '안녕하세요' },
      { role: 'user', content: '이 책 요약해줘' },
      { role: 'ai', content: '이 책은...' },
      { role: 'user', content: '더 자세히' },
      { role: 'ai', content: '자세한 내용은...' },
    ];
    saveAiChat('mybook', conversation);
    const restored = getAiChat('mybook');
    // greeting excluded → 4 messages
    expect(restored).toHaveLength(4);
    expect(restored[0].content).toBe('이 책 요약해줘');
    expect(restored[3].content).toBe('자세한 내용은...');
    clearAiChat('mybook');
    expect(getAiChat('mybook')).toBeNull();
  });
});
