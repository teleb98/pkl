"use strict";
const { app, BrowserWindow, ipcMain, dialog, Menu, shell, nativeTheme, session } = require('electron');
const path = require('path');
const fs   = require('fs');
const http = require('http');
const crypto = require('crypto');
const isDev = process.env.ELECTRON_DEV === '1';

// 보안: Content-Security-Policy — XSS 심층 방어. 앱이 실제 호출하는 도메인만 허용.
const CSP = [
  "default-src 'self'",
  // 인라인 차단 + GIS(OAuth) + Tesseract WASM(wasm-unsafe-eval) + 로컬OCR 코어(jsdelivr)
  "script-src 'self' 'wasm-unsafe-eval' https://accounts.google.com https://cdn.jsdelivr.net",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net",
  "font-src 'self' data: https://fonts.gstatic.com https://cdn.jsdelivr.net",
  "img-src 'self' data: blob: https:",         // PDF 캔버스(blob), 프로필 사진(https)
  // AI/Drive/OAuth + Ollama 로컬(127.0.0.1) + Tesseract 언어팩 + Gemma4 모델(HuggingFace)
  "connect-src 'self' blob: https://api.anthropic.com https://generativelanguage.googleapis.com https://vision.googleapis.com https://www.googleapis.com https://oauth2.googleapis.com https://drive.google.com https://accounts.google.com https://cdn.jsdelivr.net https://huggingface.co https://*.hf.co http://127.0.0.1:*",
  "worker-src 'self' blob: https://cdn.jsdelivr.net",  // pdf.js + Tesseract worker
  "frame-src https://accounts.google.com",     // GIS OAuth iframe
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
].join('; ');

let win;

function createWindow() {
  win = new BrowserWindow({
    width:1280, height:820, minWidth:900, minHeight:600,
    titleBarStyle:'hiddenInset',
    trafficLightPosition:{x:14,y:12},
    backgroundColor:'#FAF7F2',
    show:false,
    webPreferences:{
      preload: path.join(__dirname,'preload.cjs'),
      contextIsolation:true, nodeIntegration:false, sandbox:false,
    },
  });
  if (isDev) {
    win.loadURL('http://localhost:5173');
    if (process.env.PKL_DEVTOOLS === '1') win.webContents.openDevTools({mode:'detach'});
  } else {
    win.loadFile(path.join(__dirname,'../dist/index.html'));
  }
  win.once('ready-to-show', () => win.show());
  win.on('closed', () => { win = null; });

  // ── 보안: navigation/새 창 통제 ──────────────────────────────
  const isAppUrl = (u) => {
    try {
      const url = new URL(u);
      return (isDev && url.origin === 'http://localhost:5173') || url.protocol === 'file:';
    } catch { return false; }
  };
  // 외부 링크는 시스템 브라우저로 (앱 창 내 탈취 방지). http/https만.
  win.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const p = new URL(url).protocol;
      if (p === 'http:' || p === 'https:') shell.openExternal(url);
    } catch {}
    return { action: 'deny' };
  });
  // 앱 외 URL로의 in-page navigation 차단 (피싱/코드 로드 방지)
  win.webContents.on('will-navigate', (e, url) => {
    if (!isAppUrl(url)) { e.preventDefault(); }
  });
  // webview 첨부 차단
  win.webContents.on('will-attach-webview', (e) => e.preventDefault());
}

app.whenReady().then(() => {
  // 보안: 프로덕션(file://)에 CSP 헤더 주입. dev는 Vite HMR(ws/eval) 위해 제외.
  if (!isDev) {
    session.defaultSession.webRequest.onHeadersReceived((details, cb) => {
      cb({ responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [CSP] } });
    });
  }
  createWindow();
  buildMenu();
  app.on('activate', () => { if (!win) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

// 보안: 사용자가 다이얼로그로 고른 PDF 경로만 readPdf 에서 읽기 허용
const _allowedPdfPaths = new Set();

ipcMain.handle('dialog:openPdf', async () => {
  const {canceled, filePaths} = await dialog.showOpenDialog(win, {
    title:'PDF 파일 선택',
    filters:[{name:'PDF Files',extensions:['pdf']}],
    properties:['openFile','multiSelections'],
  });
  if (canceled || !filePaths.length) return [];
  // 사용자가 명시적으로 고른 경로만 이후 readPdf 에서 허용
  filePaths.forEach(fp => _allowedPdfPaths.add(path.resolve(fp)));
  return filePaths.map(fp => ({path:fp, name:path.basename(fp), size:fs.statSync(fp).size}));
});

// 보안: openPdfDialog 로 사용자가 선택한 경로만 읽기 허용 (renderer 침해 시 임의 파일 읽기 차단)
ipcMain.handle('fs:readPdf', async (_e, filePath) => {
  try {
    // 1) 사용자가 다이얼로그로 고른 경로이거나 2) .pdf 확장자 + 일반 파일만 허용
    const resolved = path.resolve(String(filePath || ''));
    const isAllowed = _allowedPdfPaths.has(resolved);
    if (!isAllowed) {
      if (!resolved.toLowerCase().endsWith('.pdf')) {
        return { ok: false, error: 'only-pdf-allowed' };
      }
      const st = fs.statSync(resolved); // 없으면 throw → catch
      if (!st.isFile()) return { ok: false, error: 'not-a-file' };
    }
    const buf = fs.readFileSync(resolved);
    return {ok:true, buffer:buf.buffer.slice(buf.byteOffset, buf.byteOffset+buf.byteLength)};
  } catch(err) { return {ok:false, error:err.message}; }
});

ipcMain.handle('system:isDark', () => nativeTheme.shouldUseDarkColors);
ipcMain.handle('app:version', () => app.getVersion());

// ── Drive PDF 로컬 영구 저장 ─────────────────────────────────────────
// 다운로드한 Drive 파일을 앱 데이터 폴더에 실제 파일로 저장 — 이후부터는
// Drive 토큰/네트워크 없이도 오프라인으로 열람 가능. IndexedDB 캐시가
// 지워져도(브라우저 스토리지 정리 등) 이 파일은 남는다.
const DRIVE_CACHE_DIR = path.join(app.getPath('userData'), 'drive-books');
const MAX_DRIVE_PDF_BYTES = 200 * 1024 * 1024; // 200MB 상한

ipcMain.handle('fs:saveDrivePdf', async (_e, { fileName, buffer }) => {
  try {
    if (!buffer || !buffer.byteLength) return { ok: false, error: 'empty-buffer' };
    if (buffer.byteLength > MAX_DRIVE_PDF_BYTES) return { ok: false, error: 'too-large' };
    // 파일명은 Drive fileId 기반으로 호출되므로 경로 탈출 문자만 제거하면 충분
    const safeName = String(fileName || 'book.pdf').replace(/[\\/:*?"<>|]/g, '_');
    if (!safeName.toLowerCase().endsWith('.pdf')) return { ok: false, error: 'not-pdf' };
    fs.mkdirSync(DRIVE_CACHE_DIR, { recursive: true });
    const dest = path.join(DRIVE_CACHE_DIR, safeName);
    fs.writeFileSync(dest, Buffer.from(buffer));
    _allowedPdfPaths.add(path.resolve(dest)); // 이후 fs:readPdf 로 재로딩 허용
    return { ok: true, path: dest };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// ── Apple Vision OCR (macOS 로컬, 오프라인) ────────────────────────────
const { runMacVisionOcr, isMacVisionSupported } = require('./macVision.cjs');
ipcMain.handle('ocr:macVisionAvailable', () => isMacVisionSupported());
ipcMain.handle('ocr:macVision', (_e, base64) => runMacVisionOcr(base64));

// 보안: 외부 URL 열기는 http/https/mailto 스킴만 허용 (file://, 커스텀 스킴 등 차단)
ipcMain.handle('shell:openExternal', (_e, url) => {
  try {
    const u = new URL(String(url));
    if (!['http:', 'https:', 'mailto:'].includes(u.protocol)) return false;
    shell.openExternal(u.href);
    return true;
  } catch { return false; }
});
nativeTheme.on('updated', () => win?.webContents.send('system:themeChanged', nativeTheme.shouldUseDarkColors));

// ── Google OAuth (loopback + PCKE) — 데스크톱 앱 권장 방식 ──────────────
// 임시 로컬 HTTP 서버를 열고, 시스템 기본 브라우저에서 Google 로그인을 띄운다.
// 로그인 후 authorization code → PKCE 로 access_token 교환.
//
// 요구사항: Google Cloud Console 에서 "Desktop app" 유형 OAuth 클라이언트 ID.
//          client_secret 은 데스크톱 앱에선 비밀이 아니므로 함께 전달받아 사용.
ipcMain.handle('oauth:google', async (_e, { clientId, clientSecret, scope }) => {
  if (!clientId) return { ok: false, error: 'no-client-id' };

  // PKCE 코드 생성
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');

  return new Promise((resolve) => {
    let settled = false;
    let redirectUri;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      try { server.close(); } catch {}
      resolve(result);
    };

    const server = http.createServer(async (req, res) => {
      const reqUrl = new URL(req.url, `http://127.0.0.1`);
      if (!reqUrl.pathname.startsWith('/callback')) {
        res.writeHead(404); res.end(); return;
      }
      const code = reqUrl.searchParams.get('code');
      const error = reqUrl.searchParams.get('error');

      // 브라우저 탭에 닫기 안내
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!doctype html><html><head><meta charset="utf-8"><title>PKL</title></head>
        <body style="font-family:-apple-system,sans-serif;text-align:center;padding:60px;color:#333">
        <h2>${error ? '로그인 실패' : '로그인 완료 ✓'}</h2>
        <p>${error ? error : 'PKL 앱으로 돌아가세요. 이 창은 닫아도 됩니다.'}</p>
        <script>window.close()</script></body></html>`);

      if (error) return finish({ ok: false, error });
      if (!code) return finish({ ok: false, error: 'no-code' });

      // code → token 교환 (PKCE)
      try {
        const body = new URLSearchParams({
          code,
          client_id: clientId,
          ...(clientSecret ? { client_secret: clientSecret } : {}),
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
          code_verifier: verifier,
        });
        const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: body.toString(),
        });
        const data = await tokenRes.json();
        if (!tokenRes.ok || !data.access_token) {
          return finish({ ok: false, error: data.error_description || data.error || 'token-exchange-failed' });
        }
        win?.show(); win?.focus();
        finish({
          ok: true,
          access_token: data.access_token,
          refresh_token: data.refresh_token,
          expires_in: data.expires_in,
        });
      } catch (err) {
        finish({ ok: false, error: err.message });
      }
    });

    // 임의 포트로 로컬 서버 시작 → redirect_uri 확정
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      redirectUri = `http://127.0.0.1:${port}/callback`;
      const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      authUrl.searchParams.set('client_id', clientId);
      authUrl.searchParams.set('redirect_uri', redirectUri);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('scope', scope || 'openid email profile');
      authUrl.searchParams.set('code_challenge', challenge);
      authUrl.searchParams.set('code_challenge_method', 'S256');
      authUrl.searchParams.set('access_type', 'offline');
      authUrl.searchParams.set('prompt', 'consent');
      shell.openExternal(authUrl.toString());
    });

    // 5분 타임아웃
    setTimeout(() => finish({ ok: false, error: 'timeout' }), 5 * 60 * 1000);
  });
});

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{label:app.name, submenu:[
      {role:'about'},{type:'separator'},{role:'services'},{type:'separator'},
      {role:'hide'},{role:'hideOthers'},{role:'unhide'},{type:'separator'},{role:'quit'},
    ]}] : []),
    {label:'파일', submenu:[
      {label:'PDF 추가…', accelerator:'CmdOrCtrl+O', click:()=>win?.webContents.send('menu:openPdf')},
      {type:'separator'},
      isMac ? {role:'close'} : {role:'quit'},
    ]},
    {label:'편집', submenu:[
      {role:'undo'},{role:'redo'},{type:'separator'},
      {role:'cut'},{role:'copy'},{role:'paste'},{role:'selectAll'},
    ]},
    {label:'보기', submenu:[
      {role:'reload'},{role:'forceReload'},{type:'separator'},
      {role:'resetZoom'},{role:'zoomIn'},{role:'zoomOut'},{type:'separator'},
      {role:'togglefullscreen'},
      ...(isDev ? [{role:'toggleDevTools'}] : []),
    ]},
    {label:'창', submenu:[
      {role:'minimize'},{role:'zoom'},
      ...(isMac ? [{type:'separator'},{role:'front'}] : []),
    ]},
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
