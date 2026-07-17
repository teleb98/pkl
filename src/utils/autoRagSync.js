/* RAG 인덱스 자동 동기화 — Vision 인식(단일 페이지·전체 스캔)으로 책 전문에
   새 텍스트가 추가될 때마다, 사용자가 "검색 인덱스 만들기"를 따로 누르지
   않아도 벡터 인덱스를 백그라운드에서 갱신한다. 페이지를 연속으로 인식할
   때 매번 재색인하면 낭비이므로 책 단위로 디바운스한다. */
import { buildBookIndex } from './ragIndex.js';

const timers = new Map(); // bookId -> timeoutId

/**
 * bookId의 RAG 인덱스를 delayMs 후 재생성 예약(디바운스). 같은 책에 대해
 * 연속 호출되면 마지막 호출 기준으로 한 번만 실행된다. 스캔 텍스트가 아직
 * 없거나 임베딩이 실패해도 조용히 무시한다(백그라운드 동기화이므로 UI를
 * 막지 않음).
 */
export function scheduleRagSync(bookId, { geminiKey, delayMs = 4000 } = {}) {
  if (!bookId) return;
  clearTimeout(timers.get(bookId));
  timers.set(bookId, setTimeout(async () => {
    timers.delete(bookId);
    try { await buildBookIndex(bookId, { geminiKey }); } catch { /* 인덱싱 불가 상태 — 조용히 무시 */ }
  }, delayMs));
}

/** 대기 중인 예약을 취소(테스트/언마운트용). bookId 생략 시 전체 취소. */
export function cancelScheduledRagSync(bookId) {
  if (bookId) {
    clearTimeout(timers.get(bookId));
    timers.delete(bookId);
  } else {
    for (const t of timers.values()) clearTimeout(t);
    timers.clear();
  }
}
