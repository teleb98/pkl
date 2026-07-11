/* 공통 토스트 — 어디서나(컴포넌트/유틸) 호출 가능한 전역 알림.
   pub/sub 방식이라 React 밖(OCR·AI·캐시 유틸)에서도 showToast() 가능.
   <Toaster/> (components/Toast.jsx)가 구독해 화면에 렌더. */

const listeners = new Set();
let _seq = 0;

/**
 * @param {string} message
 * @param {{ type?:'info'|'success'|'error', duration?:number,
 *           actionLabel?:string, onAction?:Function }} [opts]
 * @returns {number} toast id
 */
export function showToast(message, opts = {}) {
  const toast = {
    id: ++_seq,
    message: String(message ?? ''),
    type: opts.type || 'info',
    duration: opts.duration ?? (opts.type === 'error' ? 5000 : 3000),
    actionLabel: opts.actionLabel,
    onAction: opts.onAction,
  };
  listeners.forEach((fn) => fn(toast));
  return toast.id;
}

/** 에러 토스트 헬퍼 — 재시도 액션 옵션 */
export function showError(message, onRetry, retryLabel = '재시도') {
  return showToast(message, { type: 'error', actionLabel: onRetry ? retryLabel : undefined, onAction: onRetry });
}

export function subscribeToast(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
