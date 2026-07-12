/* 진행률(+컬렉션·단어장) 자동 동기화 스케줄러 — 여러 진입점(세션 종료,
   페이지 이동)에서 공유하는 단일 트리거. 페이지 이동처럼 짧은 간격으로
   반복 호출될 수 있는 경우를 위해 디바운스를 지원한다(마지막 호출 후
   delayMs 동안 추가 변경이 없으면 실행). 세션 종료처럼 "지금 당장"
   필요하면 delayMs=0 으로 호출. */
import { getBackupSettings, appendProgressSyncLog } from '../store.js';
import { syncProgressWithDrive } from './progressSync.js';
import { syncLibraryDataWithDrive } from './librarySync.js';

let timer = null;

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
  const token = bs.writeToken;
  timer = setTimeout(() => { runSync(token); }, delayMs);
}

/** 테스트/언마운트 정리용 */
export function cancelScheduledProgressAutoSync() {
  clearTimeout(timer);
  timer = null;
}
