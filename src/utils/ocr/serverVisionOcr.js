/* 서버 Vision OCR provider — 자가호스팅 서버(Mac)의 Apple Vision 인식.
   pkl.rarebook.co.kr 처럼 macOS 에서 셀프호스팅하면 서버가 /api/vision-ocr 를
   제공하고, 웹/태블릿/폰 어디서든 Mac 의 Vision 프레임워크로 OCR 할 수 있다.
   이미지는 자기 서버로만 전송(외부 클라우드 없음) — 'local' 모드에 포함. */

let _cache = null; // 세션 내 가용성 캐시

export async function isServerVisionAvailable() {
  if (_cache !== null) return _cache;
  try {
    // Electron(file://)이나 미지원 서버에서는 실패 → false
    const res = await fetch('/api/vision-ocr', { method: 'GET' });
    const data = res.ok ? await res.json() : null;
    _cache = !!data?.available;
  } catch {
    _cache = false;
  }
  return _cache;
}

export function _resetServerVisionCache() { _cache = null; }

/** base64 이미지(데이터URL 접두사 없음) → 인식된 텍스트. 실패 시 throw(체인 폴백) */
export async function ocrImageWithServerVision(base64) {
  const res = await fetch('/api/vision-ocr', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: base64 }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.ok) throw new Error(data?.error || `server-vision-${res.status}`);
  return data.text || '';
}
