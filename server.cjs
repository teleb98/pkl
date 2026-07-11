// PKL 정적 서버 — dist/ 를 127.0.0.1:3003 에서 서빙 (SPA fallback 포함)
// LaunchAgent com.pkl.web 이 실행. cloudflared가 pkl.rarebook.co.kr → :3003 으로 프록시.
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3003;
const ROOT = path.join(__dirname, 'dist');

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
