const { contextBridge, ipcRenderer } = require('electron');

// renderer 에서 window.electron 으로 접근
contextBridge.exposeInMainWorld('electron', {
  /** 네이티브 파일 선택 다이얼로그 → [{ path, name, size }] */
  openPdfDialog: () => ipcRenderer.invoke('dialog:openPdf'),

  /** 파일 경로 → ArrayBuffer */
  readPdf: (filePath) => ipcRenderer.invoke('fs:readPdf', filePath),

  /** 시스템 다크모드 여부 */
  isDark: () => ipcRenderer.invoke('system:isDark'),

  /** 앱 버전 */
  version: () => ipcRenderer.invoke('app:version'),

  /** 외부 URL 브라우저에서 열기 */
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),

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
