/* Obsidian 마크다운 노트 파서(순수 함수) — Drive의 cw_wiki 볼트에서 받은 .md 텍스트를
   프론트매터·태그·위키링크·발췌로 구조화한다. 표준 Obsidian 규칙에 견고하게 대응:
   YAML 프론트매터(title/aliases/tags), 인라인 #태그, [[위키링크]](별칭·헤딩 포함). */

const IMG_EXT = /\.(png|jpe?g|gif|svg|webp|pdf)$/i;

/** 파일명에서 .md 확장자를 떼어 기본 제목으로 사용 */
export function titleFromFileName(fileName) {
  return String(fileName || '').replace(/\.md$/i, '').trim();
}

/** 선두 --- ... --- 프론트매터를 분리한다. { data, body } */
export function parseFrontmatter(text) {
  const src = String(text || '');
  const m = src.match(/^﻿?---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { data: {}, body: src };
  const data = {};
  const lines = m[1].split(/\r?\n/);
  let key = null;
  for (const raw of lines) {
    if (!raw.trim()) continue;
    const listItem = raw.match(/^\s*-\s+(.*)$/);
    if (listItem && key) {                       // 블록 리스트 항목
      data[key] = (Array.isArray(data[key]) ? data[key] : []).concat(unquote(listItem[1]));
      continue;
    }
    const kv = raw.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (!kv) continue;
    key = kv[1].toLowerCase();
    const val = kv[2].trim();
    if (val === '') { data[key] = []; continue; } // 다음 줄들이 리스트일 수 있음
    if (val.startsWith('[') && val.endsWith(']')) {
      data[key] = val.slice(1, -1).split(',').map(s => unquote(s.trim())).filter(Boolean);
    } else {
      data[key] = unquote(val);
    }
  }
  return { data, body: src.slice(m[0].length) };
}

function unquote(s) {
  return String(s).replace(/^['"]|['"]$/g, '').trim();
}

/** 코드블록/인라인코드를 제거해 태그·링크 오탐을 줄인다 */
function stripCode(body) {
  return String(body || '').replace(/```[\s\S]*?```/g, ' ').replace(/`[^`]*`/g, ' ');
}

/** 본문의 인라인 #태그 추출(헤딩 '# '은 공백이 있어 제외됨). 숫자만인 것은 버림. */
export function extractTags(body) {
  const out = new Set();
  const re = /(?:^|\s)#([A-Za-z0-9_\-/가-힣]+)/g;
  let m;
  const src = stripCode(body);
  while ((m = re.exec(src))) {
    const t = m[1].replace(/\/+$/, '');
    if (t && !/^\d+$/.test(t)) out.add(t);
  }
  return [...out];
}

/** [[대상]] · [[대상|별칭]] · [[대상#헤딩]] 에서 대상만 추출(이미지 임베드 제외) */
export function extractWikiLinks(body) {
  const out = new Set();
  const re = /!?\[\[([^\]]+?)\]\]/g;
  let m;
  const src = stripCode(body);
  while ((m = re.exec(src))) {
    let target = m[1].split('|')[0].split('#')[0].trim();
    if (!target || IMG_EXT.test(target)) continue;
    out.add(target);
  }
  return [...out];
}

/** 프론트매터·주석·마크다운 기호를 걷어낸 짧은 발췌(최대 len자) */
export function buildExcerpt(body, len = 220) {
  const t = String(body || '')
    .replace(/%%[\s\S]*?%%/g, ' ')      // Obsidian 주석
    .replace(/!?\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_`~-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return t.length > len ? t.slice(0, len).trim() + '…' : t;
}

/**
 * .md 파일 하나를 파싱한다.
 * @returns {{ title, aliases:string[], tags:string[], links:string[], excerpt:string, wordCount:number }}
 */
export function parseNote(fileName, text) {
  const { data, body } = parseFrontmatter(text);
  const fmTags = toArray(data.tags).map(t => String(t).replace(/^#/, ''));
  const tags = [...new Set([...fmTags, ...extractTags(body)])];
  const aliases = toArray(data.aliases).map(String);
  return {
    title: (data.title && String(data.title).trim()) || titleFromFileName(fileName),
    aliases,
    tags,
    links: extractWikiLinks(body),
    excerpt: buildExcerpt(body),          // UI 표시용 짧은 발췌
    content: buildExcerpt(body, 1500),    // RAG 검색·컨텍스트용 본문(상한)
    wordCount: (body.trim().match(/\S+/g) || []).length,
  };
}

function toArray(v) {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}
