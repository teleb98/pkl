import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import 'fake-indexeddb/auto';

/* ────────────────────────────────────────────────────────────────
   Vision 인식(단일 페이지·전체 스캔) → RAG 자동 동기화.
   기존 문제: 단일 페이지 Vision 인식이 pageTextCache(메모리)에만 저장되고
   bookTextDb(RAG 원천)에 반영되지 않아, 검색·AI 질문에서 절대 쓰일 수
   없었다. mergePageText + scheduleRagSync 로 이를 해결.
   ─────────────────────────────────────────────────────────────── */

import { getBookText, mergePageText } from '../utils/bookTextDb.js';

vi.mock('../utils/ragIndex.js', () => ({ buildBookIndex: vi.fn(async () => ({ chunkCount: 3, model: 'local-hash-256' })) }));
import { buildBookIndex } from '../utils/ragIndex.js';
import { scheduleRagSync, cancelScheduledRagSync } from '../utils/autoRagSync.js';

describe('mergePageText — 단일 페이지 Vision 인식을 bookTextDb에 반영', () => {
  it('레코드가 없으면 새로 생성한다', async () => {
    const rec = await mergePageText('book-1', 3, '3페이지 내용');
    expect(rec.pages[3]).toBe('3페이지 내용');
    expect(rec.scannedPages).toBe(1);
    expect(rec.done).toBe(false);
  });

  it('기존 레코드가 있으면 페이지를 합치고 done/engine을 보존한다', async () => {
    await mergePageText('book-2', 1, '1페이지');
    await mergePageText('book-2', 2, '2페이지');
    const rec = await getBookText('book-2');
    expect(Object.keys(rec.pages).sort()).toEqual(['1', '2']);
    expect(rec.scannedPages).toBe(2);
  });

  it('같은 페이지를 다시 인식하면 최신 텍스트로 덮어쓴다', async () => {
    await mergePageText('book-3', 1, '이전 인식');
    await mergePageText('book-3', 1, '재인식된 더 정확한 텍스트');
    const rec = await getBookText('book-3');
    expect(rec.pages[1]).toBe('재인식된 더 정확한 텍스트');
    expect(rec.scannedPages).toBe(1); // 중복 카운트 안 됨
  });

  it('빈 텍스트는 무시한다', async () => {
    const rec = await mergePageText('book-4', 1, '   ');
    expect(rec).toBeNull();
    expect(await getBookText('book-4')).toBeNull();
  });
});

describe('scheduleRagSync — Vision 인식 후 RAG 인덱스 백그라운드 자동 갱신', () => {
  beforeEach(() => { vi.clearAllMocks(); vi.useFakeTimers(); });
  afterEach(() => { cancelScheduledRagSync(); vi.useRealTimers(); });

  it('delay 후 해당 책의 인덱스를 재생성한다', async () => {
    scheduleRagSync('book-a', { delayMs: 1000 });
    await vi.advanceTimersByTimeAsync(1000);
    expect(buildBookIndex).toHaveBeenCalledWith('book-a', { geminiKey: undefined });
  });

  it('같은 책에 연속 호출하면 디바운스되어 한 번만 실행된다', async () => {
    scheduleRagSync('book-b', { delayMs: 1000 });
    await vi.advanceTimersByTimeAsync(500);
    scheduleRagSync('book-b', { delayMs: 1000 }); // 재예약 — 타이머 리셋
    await vi.advanceTimersByTimeAsync(500);
    expect(buildBookIndex).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(500);
    expect(buildBookIndex).toHaveBeenCalledTimes(1);
  });

  it('서로 다른 책은 독립적으로 스케줄된다', async () => {
    scheduleRagSync('book-c', { delayMs: 1000 });
    scheduleRagSync('book-d', { delayMs: 1000 });
    await vi.advanceTimersByTimeAsync(1000);
    expect(buildBookIndex).toHaveBeenCalledWith('book-c', expect.anything());
    expect(buildBookIndex).toHaveBeenCalledWith('book-d', expect.anything());
    expect(buildBookIndex).toHaveBeenCalledTimes(2);
  });

  it('buildBookIndex 실패해도 크래시 없이 조용히 무시', async () => {
    buildBookIndex.mockRejectedValueOnce(new Error('no-scanned-text'));
    expect(() => scheduleRagSync('book-e', { delayMs: 0 })).not.toThrow();
    await vi.advanceTimersByTimeAsync(0);
  });

  it('cancelScheduledRagSync(bookId) 로 예약을 취소할 수 있다', async () => {
    scheduleRagSync('book-f', { delayMs: 1000 });
    cancelScheduledRagSync('book-f');
    await vi.advanceTimersByTimeAsync(2000);
    expect(buildBookIndex).not.toHaveBeenCalled();
  });

  it('bookId 없이 cancelScheduledRagSync() 호출하면 전체 예약을 취소한다', async () => {
    scheduleRagSync('book-g', { delayMs: 1000 });
    scheduleRagSync('book-h', { delayMs: 1000 });
    cancelScheduledRagSync();
    await vi.advanceTimersByTimeAsync(2000);
    expect(buildBookIndex).not.toHaveBeenCalled();
  });
});
