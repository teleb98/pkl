/* 지식 공백 → AI 노트 초안 프롬프트 — 공백 주제를 다룬 책들의 하이라이트·메모를
   종합해, 옵시디언에 넣을 개념 노트 본문(마크다운)을 AI가 쓰게 한다. 순수 함수. */

/** @param {Array<{title,summary?,highlights?:string[],notes?:string[]}>} sources */
function sourceBlock(sources) {
  return (sources || []).map(s => {
    const hl = s.highlights?.length ? '\n하이라이트:\n' + s.highlights.map(h => `- ${h}`).join('\n') : '';
    const nt = s.notes?.length ? '\n메모:\n' + s.notes.map(n => `- ${n}`).join('\n') : '';
    return `《${s.title}》${s.summary ? ` — ${s.summary}` : ''}${hl}${nt}`;
  }).join('\n\n');
}

export function buildGapNotePrompt(topic, sources, lang = 'ko') {
  const blocks = sourceBlock(sources);
  if (lang === 'ko') {
    return `당신은 사용자의 "제2의 뇌"를 돕는 지식 큐레이터입니다. 사용자는 "${topic}" 주제로 여러 책을 읽었지만, 아직 자기 위키에 정리한 노트가 없습니다. 아래 책들의 하이라이트·메모를 종합해, 옵시디언 위키에 넣을 간결한 개념 노트의 "본문"을 작성하세요.

${blocks}

작성 규칙:
- 제목(H1)·프론트매터는 넣지 마세요. 본문만 작성합니다.
- "${topic}"의 핵심을 2~3문단으로 종합하세요(사용자가 나중에 확장할 씨앗).
- 핵심 주장·개념을 불릿 3~5개로 정리하세요.
- 관련 개념을 [[위키링크]] 형태로 3개 이내 제안하세요.
- 마지막에 "출처: 《책제목》…" 로 근거 책을 밝히세요.
- 코드펜스 없이 한국어 마크다운으로만 응답하세요.`;
  }
  return `You are a knowledge curator for the user's "second brain." The user has read several books on "${topic}" but has no note about it in their wiki yet. Synthesize the highlights and notes below into the "body" of a concise concept note for their Obsidian wiki.

${blocks}

Rules:
- Do NOT include an H1 title or frontmatter. Write the body only.
- Synthesize the core of "${topic}" in 2-3 short paragraphs (a seed to expand later).
- List 3-5 key claims/concepts as bullets.
- Suggest up to 3 related concepts as [[wikilinks]].
- End with "Source: 《Book Title》…" citing the books.
- Respond in Markdown only, no code fences.`;
}

/** AI 응답에서 실수로 들어간 코드펜스/선두 H1 제거 */
export function cleanDraft(raw) {
  return String(raw || '')
    .replace(/^```[a-z]*\s*|\s*```$/g, '')
    .replace(/^#\s+.*\n+/, '')   // 초안이 제목을 붙였으면 제거(제목은 별도 관리)
    .trim();
}
