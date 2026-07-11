"use strict";
/* Apple Vision OCR 러너 — macOS 전용.
   base64 이미지를 임시 파일로 쓰고 macVisionOcr.jxa.js(osascript)로 인식.
   electron 의존성이 없어 node 단독으로도 테스트 가능. */
const { execFile } = require('child_process');
const os = require('os');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SCRIPT = path.join(__dirname, 'macVisionOcr.jxa.js');
const MAX_B64 = 40 * 1024 * 1024; // 40MB — 렌더된 페이지 PNG 상한

function isMacVisionSupported() {
  return process.platform === 'darwin' && fs.existsSync(SCRIPT);
}

/** base64 이미지(PNG/JPEG, 데이터URL 접두사 없음) → { ok, text } | { ok:false, error } */
function runMacVisionOcr(base64) {
  return new Promise((resolve) => {
    if (!isMacVisionSupported()) return resolve({ ok: false, error: 'not-macos' });
    if (typeof base64 !== 'string' || !base64 || base64.length > MAX_B64) {
      return resolve({ ok: false, error: 'bad-image' });
    }
    const tmp = path.join(os.tmpdir(), `pkl-ocr-${crypto.randomBytes(8).toString('hex')}.png`);
    try {
      fs.writeFileSync(tmp, Buffer.from(base64, 'base64'));
    } catch (e) {
      return resolve({ ok: false, error: `tmp-write: ${e.message}` });
    }
    execFile(
      'osascript', ['-l', 'JavaScript', SCRIPT, tmp],
      { timeout: 30000, maxBuffer: 8 * 1024 * 1024 },
      (err, stdout) => {
        try { fs.unlinkSync(tmp); } catch { /* 이미 삭제됨 */ }
        if (err) return resolve({ ok: false, error: `osascript: ${err.message}` });
        try {
          resolve(JSON.parse(String(stdout).trim()));
        } catch {
          resolve({ ok: false, error: 'bad-output' });
        }
      }
    );
  });
}

module.exports = { runMacVisionOcr, isMacVisionSupported };
