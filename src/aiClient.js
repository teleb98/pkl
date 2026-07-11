/* Shared AI call logic — used by AIChatScreen, DesktopLayout, and ReaderScreen focus mode */

export async function callAI(apiKeys, systemPrompt, history, userMsg, pageImageBase64 = null) {
  if (apiKeys?.claude) return _callClaude(apiKeys.claude, systemPrompt, history, userMsg, pageImageBase64);
  if (apiKeys?.gemini) return _callGemini(apiKeys.gemini, systemPrompt, history, userMsg, pageImageBase64);
  throw new Error('no-key');
}

async function _callClaude(apiKey, systemPrompt, history, userMsg, pageImageBase64) {
  const histMsgs = history.map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content }));
  const userContent = pageImageBase64
    ? [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: pageImageBase64 } }, { type: 'text', text: userMsg }]
    : userMsg;
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json', 'anthropic-dangerous-direct-browser-access': 'true' },
    body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 1024, system: systemPrompt, messages: [...histMsgs, { role: 'user', content: userContent }] }),
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error?.message || `HTTP ${res.status}`); }
  return (await res.json()).content?.[0]?.text || '';
}

async function _callGemini(apiKey, systemPrompt, history, userMsg, pageImageBase64) {
  const histContents = history.map(m => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.content }] }));
  const userParts = pageImageBase64
    ? [{ inline_data: { mime_type: 'image/jpeg', data: pageImageBase64 } }, { text: userMsg }]
    : [{ text: userMsg }];
  const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({ contents: [...histContents, { role: 'user', parts: userParts }], systemInstruction: { parts: [{ text: systemPrompt }] }, generationConfig: { maxOutputTokens: 1024 } }),
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error?.message || `HTTP ${res.status}`); }
  return (await res.json()).candidates?.[0]?.content?.parts?.[0]?.text || '';
}
