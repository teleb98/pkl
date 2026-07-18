/* 개념 심화 문답 — 한 개념을 골라 서재가 "요약하지 않고 심문"한다. 사용자의 위키
   노트와 그 주제로 읽은 책의 주장을 근거로, 반론·경계 사례·Feynman 설명을 요구하는
   소크라테스식 스파링. 관찰(공백·연결·진화)에서 도전(이해 벼리기)으로 넘어가는 조각. */

/**
 * 심화 문답할 만한 개념 — 노트·책 신호가 있는 주제. 노트+책이 "둘 다" 있는 주제
 * (긴장을 만들 수 있는 재료)를 우선, 그다음 신호 합계 순.
 * @returns {Array<{topic,key,noteIds:string[],bookIds:string[],noteCount,bookCount}>}
 */
export function findDeepDiveTopics(graph, { limit = 5 } = {}) {
  const out = [];
  for (const [key, e] of graph.topics) {
    const noteCount = e.notes.size, bookCount = e.books.size;
    if (noteCount + bookCount === 0) continue;
    out.push({ topic: e.topic, key, noteIds: [...e.notes], bookIds: [...e.books], noteCount, bookCount });
  }
  return out
    .sort((a, b) => {
      const both = (x) => (x.noteCount > 0 && x.bookCount > 0) ? 1 : 0;
      return both(b) - both(a) || (b.noteCount + b.bookCount) - (a.noteCount + a.bookCount);
    })
    .slice(0, limit);
}

/**
 * 스파링 시스템 프롬프트 — 근거(노트·책) + 소크라테스 규칙.
 * @param {string} topic
 * @param {{notes:Array<{title,content?,excerpt?}>, books:Array<{title,summary?,highlights?:string[]}>}} src
 */
export function buildDeepDivePrompt(topic, src, lang = 'ko') {
  const noteBlocks = (src.notes || []).map(n =>
    `《${n.title}》\n${(n.content || n.excerpt || '').slice(0, 600)}`).join('\n\n') || (lang === 'ko' ? '(노트 없음)' : '(none)');
  const bookBlocks = (src.books || []).map(b => {
    const hl = b.highlights?.length ? '\n' + b.highlights.slice(0, 5).map(h => `- "${h}"`).join('\n') : '';
    return `《${b.title}》${b.summary ? `: ${b.summary}` : ''}${hl}`;
  }).join('\n\n') || (lang === 'ko' ? '(책 없음)' : '(none)');

  if (lang === 'ko') {
    return `당신은 "${topic}" 개념에 대한 소크라테스식 스파링 파트너입니다. 사용자의 이해를 요약해 주는 것이 아니라, 질문으로 벼리는 것이 임무입니다.

## 사용자의 위키 노트 (본인이 쓴 생각)
${noteBlocks}

## 사용자가 읽은 관련 책
${bookBlocks}

## 규칙
- 한 번에 질문 하나만. 2~3문장 이내로 짧게.
- 강의하지 마세요. 사용자가 스스로 답하게 하세요.
- 사용자의 노트 문장과 책의 주장이 충돌하면 그 긴장을 정면으로 짚으세요("당신은 …라고 썼지만, 《책》은 …라고 봅니다").
- 반론, 예외, 경계 사례를 던져 이해의 빈틈을 드러내세요.
- 가끔 Feynman 테스트: "처음 접한 사람에게 한 문장으로 설명한다면?"
- 사용자의 답이 좋으면 짧게 인정하고 더 깊은 층으로 파고드세요. 얼버무리면 구체적 사례를 요구하세요.
- 근거를 인용할 땐 노트/책 제목을 밝히세요.
- 반드시 한국어로.`;
  }
  return `You are a Socratic sparring partner on the concept "${topic}". Your job is to sharpen the user's understanding through questions, not to summarize it for them.

## The user's wiki notes (their own thinking)
${noteBlocks}

## Related books they read
${bookBlocks}

## Rules
- One question at a time, 2-3 sentences max.
- Do not lecture; make them answer.
- If their notes clash with a book's claim, confront the tension head-on ("You wrote …, but 《Book》 argues …").
- Probe with counterarguments, exceptions, and edge cases to expose gaps.
- Occasionally apply the Feynman test: "Explain it in one sentence to a newcomer."
- If an answer is strong, acknowledge briefly and dig a level deeper. If vague, demand a concrete example.
- Cite note/book titles when referencing them.`;
}

/** 첫 질문을 요청하는 유저 메시지 */
export function openingUserMsg(lang = 'ko') {
  return lang === 'ko'
    ? '시작합시다. 내 노트와 책을 근거로, 내 이해를 시험할 첫 질문을 던져주세요.'
    : "Let's begin. Ask your first question that tests my understanding, grounded in my notes and books.";
}
