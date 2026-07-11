/* Apple Vision OCR provider — Electron macOS 전용.
   macOS 내장 Vision 프레임워크(VNRecognizeTextRequest)로 완전 로컬 인식.
   한국어 인식 품질이 Tesseract 보다 높고 모델 다운로드가 없다(즉시, 오프라인).
   비 macOS/웹에서는 사용 불가 → isMacVisionAvailable 로 가드. */

// 가용성은 세션 내 불변 → 1회 캐시
let _cache = null;

export async function isMacVisionAvailable() {
  if (_cache !== null) return _cache;
  try {
    _cache = !!(window.electron?.macVisionAvailable && await window.electron.macVisionAvailable());
  } catch {
    _cache = false;
  }
  return _cache;
}

export function _resetMacVisionCache() { _cache = null; }

/** base64 이미지(데이터URL 접두사 없음) → 인식된 텍스트. 실패 시 throw(체인 폴백 유도) */
export async function ocrImageWithMacVision(base64) {
  const res = await window.electron.macVisionOcr(base64);
  if (!res?.ok) throw new Error(res?.error || 'mac-vision-failed');
  return res.text || '';
}
