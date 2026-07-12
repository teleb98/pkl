const { contextBridge, ipcRenderer } = require('electron');

// renderer 에서 window.electron 으로 접근
contextBridge.exposeInMainWorld('electron', {
  /** 네이티브 파일 선택 다이얼로그 → [{ path, name, size }] */
  openPdfDialog: () => ipcRenderer.invoke('dialog:openPdf'),

  /** 파일 경로 → ArrayBuffer */
  readPdf: (filePath) => ipcRenderer.invoke('fs:readPdf', filePath),

  /** Drive에서 다운로드한 PDF를 앱 데이터 폴더에 영구 저장 → { ok, path } */
  saveDrivePdf: (fileName, buffer) => ipcRenderer.invoke('fs:saveDrivePdf', { fileName, buffer }),

  /** 시스템 다크모드 여부 */
  isDark: () => ipcRenderer.invoke('system:isDark'),

  /** 앱 버전 */
  version: () => ipcRenderer.invoke('app:version'),

  /** 외부 URL 브라우저에서 열기 */
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),

  /** Apple Vision OCR 사용 가능 여부 (macOS 전용) */
  macVisionAvailable: () => ipcRenderer.invoke('ocr:macVisionAvailable'),

  /** Apple Vision OCR: base64 이미지 → { ok, text } (macOS 로컬, 오프라인) */
  macVisionOcr: (base64) => ipcRenderer.invoke('ocr:macVision', base64),

  /** Google OAuth (시스템 브라우저 + loopback). → { ok, access_token, expires_in } */
  googleOAuth: ({ clientId, clientSecret, scope }) =>
    ipcRenderer.invoke('oauth:google', { clientId, clientSecret, scope }),

  /** 메뉴 / 시스템 이벤트 구독 */
  on: (channel, fn) => {
    const allowed = ['menu:openPdf', 'system:themeChanged'];
    if (allowed.includes(channel)) ipcRenderer.on(channel, (_e, ...args) => fn(...args));
  },
  off: (channel, fn) => ipcRenderer.removeListener(channel, fn),
});
