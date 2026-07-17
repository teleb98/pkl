/* 진행률(+컬렉션·단어장) 자동 동기화 스케줄러 — 여러 진입점(세션 종료,
   페이지 이동)에서 공유하는 단일 트리거. 페이지 이동처럼 짧은 간격으로
   반복 호출될 수 있는 경우를 위해 디바운스를 지원한다(마지막 호출 후
   delayMs 동안 추가 변경이 없으면 실행). 세션 종료처럼 "지금 당장"
   필요하면 delayMs=0 으로 호출. */
import { getBackupSettings, appendProgressSyncLog } from '../store.js';
import { syncProgressWithDrive } from './progressSync.js';
import { syncLibraryDataWithDrive } from './librarySync.js';

let timer = null;
let pendingToken = null;

async function runSync(token) {
  try {
    const { pulled, total } = await syncProgressWithDrive(token);
    await syncLibraryDataWithDrive(token).catch(() => {}); // 부가 동기화 실패는 조용히 무시
    appendProgressSyncLog({ status: 'ok', pulled, total, auto: true });
  } catch (e) {
    appendProgressSyncLog({ status: 'error', error: e.message, auto: true });
  }
}

/** autoProgressSync 설정이 꺼져있거나 토큰이 없으면 아무 일도 하지 않는다(조용히 no-op). */
export function scheduleProgressAutoSync(delayMs = 8000) {
  const bs = getBackupSettings();
  if (!bs.autoProgressSync || !bs.writeToken) return;
  clearTimeout(timer);
  pendingToken = bs.writeToken;
  timer = setTimeout(() => { timer = null; const t = pendingToken; pendingToken = null; runSync(t); }, delayMs);
}

/**
 * 대기 중인 자동 동기화를 즉시 실행한다(디바운스를 건너뜀).
 * 세션 종료(앱 백그라운드/종료: visibilitychange·pagehide)에서 호출 — 마지막 페이지
 * 이동 후 디바운스가 끝나기 전에 앱이 닫혀 진행률이 유실되는 것을 막는다.
 * 대기 중인 스케줄이 없으면 아무 일도 하지 않는다. 실행하면 Promise, 아니면 null 반환.
 */
export function flushProgressAutoSync() {
  if (!timer) return null;
  clearTimeout(timer);
  timer = null;
  const t = pendingToken;
  pendingToken = null;
  if (!t) return null;
  return runSync(t);
}

/** 테스트/언마운트 정리용 */
export function cancelScheduledProgressAutoSync() {
  clearTimeout(timer);
  timer = null;
  pendingToken = null;
}
