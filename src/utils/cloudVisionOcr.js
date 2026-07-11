const VISION_API = 'https://vision.googleapis.com/v1/images:annotate';

export async function ocrImageWithVision(base64Image, apiKey) {
  const res = await fetch(`${VISION_API}?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      requests: [{
        image: { content: base64Image },
        features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
      }],
    }),
  });

  if (!res.ok) {
    const status = res.status;
    if (status === 400 || status === 401 || status === 403) throw new Error('invalid-key');
    if (status === 429) throw new Error('rate-limit');
    throw new Error(`Vision API ${status}`);
  }

  const data = await res.json();
  const text = data.responses?.[0]?.fullTextAnnotation?.text;
  return text?.trim() || '';
}
