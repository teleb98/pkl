/* ── AI Document Scanner ─────────────────────────────────────────
   Downloads the first portion of a Drive PDF and extracts metadata
   (title, author, type, summary, topics) using either Claude or
   Gemini.  Claude is preferred when claudeKey is supplied; Gemini
   is the fallback when only geminiKey is available.
   ────────────────────────────────────────────────────────────── */

const SCAN_BYTES  = 300 * 1024; // 300 KB covers title page + TOC
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const GEMINI_UP   = 'https://generativelanguage.googleapis.com/upload/v1beta';
const CLAUDE_BASE = 'https://api.anthropic.com/v1';
const CLAUDE_MODEL = 'claude-haiku-4-5-20251001';

export async function scanBookMeta({ fileId, fileName, mimeType, size, accessToken, geminiKey, claudeKey, lang = 'ko' }) {
  const isPDF = mimeType === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf');
  const hasAiKey = !!(claudeKey || geminiKey);

  if (!isPDF || !hasAiKey || !accessToken) {
    return filenameOnlyMeta(fileName, lang);
  }

  // ── Step 1: Download first 300 KB from Google Drive ───────────
  const fileSize = size ? parseInt(size, 10) : Infinity;
  const rangeEnd = Math.min(SCAN_BYTES - 1, fileSize - 1);

  const dlRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    { headers: { Authorization: `Bearer ${accessToken}`, Range: `bytes=0-${rangeEnd}` } }
  );

  if (!dlRes.ok && dlRes.status !== 206) {
    if (dlRes.status === 401 || dlRes.status === 403) throw new Error('auth-expired');
    throw new Error(`Drive ${dlRes.status}: ${await dlRes.text().catch(() => 'download failed')}`);
  }

  const rawBuf = await dlRes.arrayBuffer();
  const buffer = rawBuf.byteLength > SCAN_BYTES ? rawBuf.slice(0, SCAN_BYTES) : rawBuf;

  // ── Step 2: Analyze — Claude preferred, Gemini fallback ────────
  if (claudeKey) {
    return await analyzeWithClaude(buffer, claudeKey, lang, fileName);
  }

  // ── Gemini path: upload to File API then analyze ───────────────
  const gemFile = await uploadToFileAPI(buffer, geminiKey, fileName);
  try {
    return await analyzeWithGemini(gemFile.uri, geminiKey, lang, fileName);
  } finally {
    const fid = (gemFile.name || '').replace('files/', '');
    if (fid) {
      fetch(`${GEMINI_BASE}/files/${fid}`, {
        method: 'DELETE',
        headers: { 'x-goog-api-key': geminiKey },
      }).catch(() => {});
    }
  }
}

async function uploadToFileAPI(buffer, geminiKey, fileName) {
  const boundary = `pkl${Date.now().toString(36)}`;
  const meta = JSON.stringify({ file: { displayName: fileName, mimeType: 'application/pdf' } });
  const enc  = new TextEncoder();

  const head = enc.encode(
    `--${boundary}\r\nContent-Type: application/json; charset=utf-8\r\n\r\n${meta}\r\n` +
    `--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`
  );
  const tail = enc.encode(`\r\n--${boundary}--`);

  const body = new Uint8Array(head.byteLength + buffer.byteLength + tail.byteLength);
  body.set(head, 0);
  body.set(new Uint8Array(buffer), head.byteLength);
  body.set(tail, head.byteLength + buffer.byteLength);

  const res = await fetch(`${GEMINI_UP}/files?uploadType=multipart`, {
    method: 'POST',
    headers: {
      'Content-Type': `multipart/related; boundary=${boundary}`,
      'x-goog-api-key': geminiKey,
    },
    body: body.buffer,
  });

  if (!res.ok) {
    if (res.status === 429) throw new Error('rate-limit');
    const msg = await res.text().catch(() => '');
    throw new Error(`Gemini upload ${res.status}${msg ? ': ' + msg.slice(0, 120) : ''}`);
  }

  const data = await res.json();
  return data.file; // { name, uri, mimeType, state, ... }
}

const META_PROMPT_KO = `다음 정보를 바탕으로 문서 메타데이터를 추론하여 JSON만 응답해주세요 (마크다운 없이). 텍스트가 없으면 파일명에서 추론하세요:
{"title":"문서 제목","author":"저자 또는 null","type":"소설|기술서|자기계발|논문|업무문서|에세이|기타","language":"ko|en|ja|zh|other","summary":"내용 요약 또는 추측","topics":["주제1","주제2","주제3"]}`;
const META_PROMPT_EN = `Based on the information below, infer document metadata and return ONLY raw JSON (no markdown). If no text, infer from the filename:
{"title":"title","author":"author or null","type":"novel|technical|self-help|paper|work-doc|essay|other","language":"ko|en|ja|zh|other","summary":"summary or inference","topics":["topic1","topic2","topic3"]}`;

function parseMeta(raw, fileName, lang) {
  const jsonMatch = raw.replace(/```json\s*|\s*```/g, '').trim().match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`parse-error: ${raw.slice(0, 60)}`);
  const m = JSON.parse(jsonMatch[0]);
  return {
    aiTitle:     m.title    || fileNameToTitle(fileName),
    aiAuthor:    m.author   || null,
    aiType:      m.type     || 'other',
    aiLanguage:  m.language || lang,
    aiSummary:   (m.summary || '').slice(0, 250),
    aiTopics:    Array.isArray(m.topics) ? m.topics.slice(0, 5) : [],
    aiScanStatus: 'done',
    aiScannedAt:  Date.now(),
  };
}

function extractPdfInfoField(raw, field) {
  // Literal string: /Title (text)
  const lit = raw.match(new RegExp(`/${field}\\s*\\(([^)]{1,300})\\)`));
  if (lit) return lit[1].replace(/\\(.)/g, '$1').trim();

  // Hex string: /Title <FEFF...> — UTF-16 BE (common in Korean PDFs) or UTF-8
  const hex = raw.match(new RegExp(`/${field}\\s*<([0-9A-Fa-f\\s]{4,600})>`));
  if (hex) {
    try {
      const h = hex[1].replace(/\s/g, '');
      const bytes = new Uint8Array(h.length / 2);
      for (let i = 0; i < h.length; i += 2) bytes[i / 2] = parseInt(h.slice(i, i + 2), 16);
      if (bytes[0] === 0xFE && bytes[1] === 0xFF) {
        return new TextDecoder('utf-16be').decode(bytes.slice(2)).trim();
      }
      return new TextDecoder('utf-8', { fatal: false }).decode(bytes).trim();
    } catch { return null; }
  }
  return null;
}

function extractPdfText(buffer) {
  const raw = new TextDecoder('latin1').decode(buffer);
  const parts = [];

  // Info dictionary metadata (handles both literal and UTF-16 BE hex strings)
  for (const field of ['Title', 'Author', 'Subject']) {
    const val = extractPdfInfoField(raw, field);
    if (val && val.length > 1) parts.push(`${field}: ${val}`);
  }

  // Visible ASCII/Latin text from BT...ET content streams
  for (const m of raw.matchAll(/BT\b[\s\S]{1,3000}?\bET\b/g)) {
    for (const s of m[0].matchAll(/\(([^)\\]{2,200})\)/g)) {
      const clean = s[1].replace(/[\x00-\x1F\x7F]/g, ' ').trim();
      if (clean.length > 2 && /[a-zA-Z가-힣]/.test(clean)) parts.push(clean);
    }
    if (parts.join('').length > 3000) break;
  }

  return parts.join('\n').slice(0, 4000);
}

async function analyzeWithClaude(buffer, claudeKey, lang, fileName) {
  return analyzeTextWithClaude(extractPdfText(buffer), claudeKey, lang, fileName);
}

/** 이미 추출된 텍스트(OCR/텍스트레이어) → AI 메타데이터. 로컬 비전 스캔 경로에서 사용 */
export async function analyzeTextMeta(text, { claudeKey, geminiKey }, lang, fileName) {
  if (claudeKey) return analyzeTextWithClaude(text, claudeKey, lang, fileName);
  if (geminiKey) return analyzeTextWithGemini(text, geminiKey, lang, fileName);
  throw new Error('no-ai-key');
}

async function analyzeTextWithClaude(extracted, claudeKey, lang, fileName) {
  const context = (extracted || '').length > 10
    ? `파일명: ${fileName}\n\n추출된 텍스트:\n${extracted}`
    : `파일명: ${fileName}`;

  const res = await fetch(`${CLAUDE_BASE}/messages`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': claudeKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 512,
      messages: [{
        role: 'user',
        content: `${context}\n\n${lang === 'ko' ? META_PROMPT_KO : META_PROMPT_EN}`,
      }],
    }),
  });

  if (!res.ok) {
    if (res.status === 429) throw new Error('rate-limit');
    if (res.status === 401 || res.status === 403) throw new Error('invalid-key');
    const msg = await res.text().catch(() => '');
    throw new Error(`Claude ${res.status}${msg ? ': ' + msg.slice(0, 120) : ''}`);
  }

  const raw = (await res.json()).content?.[0]?.text || '';
  return parseMeta(raw, fileName, lang);
}

async function analyzeTextWithGemini(extracted, geminiKey, lang, fileName) {
  const context = (extracted || '').length > 10
    ? `파일명: ${fileName}\n\n추출된 텍스트:\n${extracted}`
    : `파일명: ${fileName}`;

  const res = await fetch(`${GEMINI_BASE}/models/gemini-2.0-flash:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': geminiKey },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `${context}\n\n${lang === 'ko' ? META_PROMPT_KO : META_PROMPT_EN}` }] }],
      generationConfig: { maxOutputTokens: 512, temperature: 0.1 },
    }),
  });

  if (!res.ok) {
    if (res.status === 429) throw new Error('rate-limit');
    if (res.status === 401 || res.status === 403) throw new Error('invalid-key');
    const msg = await res.text().catch(() => '');
    throw new Error(`Gemini ${res.status}${msg ? ': ' + msg.slice(0, 120) : ''}`);
  }

  const raw = (await res.json()).candidates?.[0]?.content?.parts?.[0]?.text || '';
  return parseMeta(raw, fileName, lang);
}

async function analyzeWithGemini(fileUri, geminiKey, lang, fileName) {
  const gemRes = await fetch(`${GEMINI_BASE}/models/gemini-2.0-flash:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': geminiKey },
    body: JSON.stringify({
      contents: [{ parts: [
        { file_data: { file_uri: fileUri, mime_type: 'application/pdf' } },
        { text: lang === 'ko' ? META_PROMPT_KO : META_PROMPT_EN },
      ]}],
      generationConfig: { maxOutputTokens: 512, temperature: 0.1 },
    }),
  });

  if (!gemRes.ok) {
    if (gemRes.status === 429) throw new Error('rate-limit');
    const msg = await gemRes.text().catch(() => '');
    throw new Error(`Gemini ${gemRes.status}${msg ? ': ' + msg.slice(0, 120) : ''}`);
  }

  const raw = (await gemRes.json()).candidates?.[0]?.content?.parts?.[0]?.text || '';
  return parseMeta(raw, fileName, lang);
}

function filenameOnlyMeta(fileName, lang) {
  return {
    aiTitle: fileNameToTitle(fileName),
    aiAuthor: null,
    aiType: 'other',
    aiLanguage: lang,
    aiSummary: '',
    aiTopics: [],
    aiScanStatus: 'done',
    aiScannedAt: Date.now(),
  };
}

export function fileNameToTitle(fileName) {
  return fileName.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').trim();
}

/* Builds the metadata section to inject into AI system prompts */
export function buildMetaContext(bookMeta, lang) {
  if (!bookMeta?.aiScanStatus || bookMeta.aiScanStatus !== 'done') return '';

  const ko = lang === 'ko';
  const lines = [];
  if (bookMeta.aiAuthor) lines.push(ko ? `저자: ${bookMeta.aiAuthor}` : `Author: ${bookMeta.aiAuthor}`);
  if (bookMeta.aiType && bookMeta.aiType !== 'other') {
    lines.push(ko ? `유형: ${typeLabel(bookMeta.aiType, lang)}` : `Type: ${typeLabel(bookMeta.aiType, lang)}`);
  }
  if (bookMeta.aiLanguage && bookMeta.aiLanguage !== 'other') {
    lines.push(ko ? `원문 언어: ${langLabel(bookMeta.aiLanguage, lang)}` : `Language: ${langLabel(bookMeta.aiLanguage, lang)}`);
  }
  if (bookMeta.aiSummary) {
    lines.push(ko ? `내용 요약: ${bookMeta.aiSummary}` : `Summary: ${bookMeta.aiSummary}`);
  }
  if (bookMeta.aiTopics?.length) {
    lines.push(ko ? `핵심 주제: ${bookMeta.aiTopics.join(', ')}` : `Topics: ${bookMeta.aiTopics.join(', ')}`);
  }
  if (!lines.length) return '';
  const header = ko ? '[AI 문서 분석]' : '[AI Document Analysis]';
  return `\n\n${header}\n${lines.join('\n')}`;
}

function typeLabel(t, lang) {
  const ko = lang === 'ko';
  const map = { 소설: ko ? '소설' : 'Novel', novel: ko ? '소설' : 'Novel', 기술서: ko ? '기술서' : 'Technical', technical: ko ? '기술서' : 'Technical', 'self-help': ko ? '자기계발' : 'Self-help', 자기계발: ko ? '자기계발' : 'Self-help', paper: ko ? '논문' : 'Paper', 논문: ko ? '논문' : 'Paper', 'work-doc': ko ? '업무문서' : 'Work doc', 업무문서: ko ? '업무문서' : 'Work doc', essay: ko ? '에세이' : 'Essay', 에세이: ko ? '에세이' : 'Essay' };
  return map[t] || t;
}

function langLabel(code, lang) {
  const ko = lang === 'ko';
  const map = { ko: ko ? '한국어' : 'Korean', en: ko ? '영어' : 'English', ja: ko ? '일본어' : 'Japanese', zh: ko ? '중국어' : 'Chinese' };
  return map[code] || code;
}
