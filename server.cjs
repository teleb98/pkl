// PKL 정적 서버 — dist/ 를 127.0.0.1:3003 에서 서빙 (SPA fallback 포함)
// LaunchAgent com.pkl.web 이 실행. cloudflared가 pkl.rarebook.co.kr → :3003 으로 프록시.
// + /api/vision-ocr: 서버(Mac)의 Apple Vision 프레임워크로 이미지 OCR — 웹/태블릿에서
//   Mac 로컬 비전 인식을 쓸 수 있게 하는 자가호스팅 API (외부 클라우드 전송 없음).
const http = require('http');
const fs = require('fs');
const path = require('path');
const { runMacVisionOcr, isMacVisionSupported } = require('./electron/macVision.cjs');

const PORT = process.env.PORT || 3003;
const ROOT = path.join(__dirname, 'dist');
const OCR_BODY_LIMIT = 40 * 1024 * 1024; // 40MB (base64 페이지 이미지 상한)
let ocrInFlight = 0;
const OCR_MAX_CONCURRENT = 3;

function handleVisionOcr(req, res) {
  const json = (code, obj) => {
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(obj));
  };
  if (req.method === 'GET') {
    return json(200, { ok: true, available: isMacVisionSupported() });
  }
  if (req.method !== 'POST') return json(405, { ok: false, error: 'method-not-allowed' });
  if (!isMacVisionSupported()) return json(503, { ok: false, error: 'not-available' });
  if (ocrInFlight >= OCR_MAX_CONCURRENT) return json(429, { ok: false, error: 'busy' });

  let size = 0;
  const chunks = [];
  req.on('data', (c) => {
    size += c.length;
    if (size > OCR_BODY_LIMIT) { req.destroy(); return; }
    chunks.push(c);
  });
  req.on('end', async () => {
    let image;
    try { image = JSON.parse(Buffer.concat(chunks).toString('utf8')).image; }
    catch { return json(400, { ok: false, error: 'bad-json' }); }
    if (typeof image !== 'string' || !image) return json(400, { ok: false, error: 'no-image' });
    ocrInFlight++;
    try {
      const result = await runMacVisionOcr(image);
      json(result.ok ? 200 : 422, result);
    } catch (e) {
      json(500, { ok: false, error: e.message });
    } finally {
      ocrInFlight--;
    }
  });
  req.on('error', () => {});
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
  '.pdf': 'application/pdf',
  '.gz': 'application/gzip',
  '.traineddata': 'application/octet-stream',
};

http.createServer((req, res) => {
  try {
    const urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (urlPath === '/api/vision-ocr') return handleVisionOcr(req, res);
    let filePath = path.normalize(path.join(ROOT, urlPath));
    if (!filePath.startsWith(ROOT)) {
      res.writeHead(403); res.end('Forbidden'); return;
    }
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      const indexInDir = path.join(filePath, 'index.html');
      filePath = fs.existsSync(indexInDir) ? indexInDir : path.join(ROOT, 'index.html'); // SPA fallback
    }
    const ext = path.extname(filePath).toLowerCase();
    const headers = { 'Content-Type': MIME[ext] || 'application/octet-stream' };
    // 해시된 자산은 장기 캐시, html/sw는 no-cache (PWA autoUpdate 동작 보장)
    if (/\.(html|webmanifest)$/.test(ext) || /sw\.js$|workbox-.*\.js$/.test(path.basename(filePath))) {
      headers['Cache-Control'] = 'no-cache';
    } else if (/-[A-Za-z0-9_]{8,}\./.test(path.basename(filePath))) {
      headers['Cache-Control'] = 'public, max-age=31536000, immutable';
    }
    res.writeHead(200, headers);
    fs.createReadStream(filePath).pipe(res);
  } catch (e) {
    res.writeHead(500); res.end('Internal Server Error');
  }
}).listen(PORT, '127.0.0.1', () => {
  console.log(`PKL static server on http://127.0.0.1:${PORT}`);
});
