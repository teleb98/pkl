/* MOC(Map of Content) 초안 — 한 주제에 흩어진 노트들을 상위 구조(계층·논증)로 엮는
   허브 노트를 AI가 제안한다. 공백 파인더가 "원자 노트"를 만든다면, 이것은 그 위의
   "구조"를 세운다. 순수 함수(프롬프트 생성만). */

export function buildMocPrompt(topic, notes, books, lang = 'ko') {
  const noteBlocks = (notes || []).map(n =>
    `- 《${n.title}》: ${(n.content || n.excerpt || '').slice(0, 300)}`).join('\n');
  const bookBlocks = (books || []).map(b => `- 《${b.title}》${b.summary ? `: ${b.summary}` : ''}`).join('\n');

  if (lang === 'ko') {
    return `당신은 옵시디언 MOC(Map of Content) 설계자입니다. 사용자가 "${topic}" 주제로 쓴 노트들이 흩어져 있습니다. 이들을 하나의 사고 구조로 엮는 MOC 노트의 "본문"을 작성하세요.

## "${topic}" 노트들
${noteBlocks || '(없음)'}

## 관련 책
${bookBlocks || '(없음)'}

작성 규칙:
- 제목(H1)·프론트매터는 넣지 마세요. 본문만.
- 첫 줄: 이 주제를 관통하는 핵심 질문 또는 한 문장 정리.
- 그 아래 2~4개의 소제목(##)으로 논리적 계층을 세우고, 각 소제목 아래에 해당하는 노트를 [[노트 제목]] 링크 + 한 줄 설명으로 배치하세요. 실제 존재하는 노트 제목만 링크하세요.
- 노트가 없는 빈 가지는 "(아직 노트 없음 — 쓸 것)"으로 표시해 다음 쓸거리를 드러내세요.
- 마지막 "## 열린 질문" 섹션에 이 구조가 던지는 미해결 질문 1~2개.
- 코드펜스 없이 한국어 마크다운으로만.`;
  }
  return `You are an Obsidian MOC (Map of Content) architect. The user's notes on "${topic}" are scattered. Write the "body" of a MOC note that weaves them into one structure of thought.

## Notes on "${topic}"
${noteBlocks || '(none)'}

## Related books
${bookBlocks || '(none)'}

Rules:
- No H1 title or frontmatter. Body only.
- First line: the central question or one-sentence thesis of this topic.
- Then 2-4 subheadings (##) forming a logical hierarchy; under each, place the relevant notes as [[Note Title]] links with a one-line description. Only link titles that actually exist.
- Mark empty branches "(no note yet — to write)" to surface what to write next.
- End with "## Open questions": 1-2 unresolved questions this structure raises.
- Markdown only, no code fences.`;
}
