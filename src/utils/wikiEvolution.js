/* 관점의 진화 & 모순 — 한 주제를 다룬 위키 노트를 시간순으로 종합해 "생각이 어떻게
   바뀌었는가"를 서사로 만들고, 읽은 책의 주장과 노트 사이의 긴장/모순을 짚는다.
   서재가 사고 파트너가 되는 세 번째 능력. (읽기 전용 인사이트 — 볼트에 쓰지 않음) */
import { noteCoversTopic } from './knowledgeGraph.js';

function norm(s) { return String(s || '').toLowerCase().trim(); }
function dateOf(n) { return n.modifiedTime ? new Date(n.modifiedTime).getTime() : 0; }

/** 주제를 다루는 노트를 수정 시각 오름차순(오래된→최근)으로 */
export function gatherTopicNotes(topic, notes) {
  const key = norm(topic);
  return (notes || [])
    .filter(n => noteCoversTopic(n, key))
    .slice()
    .sort((a, b) => dateOf(a) - dateOf(b));
}

/** 관점의 진화 종합을 요청하는 프롬프트(시간순 노트 + 관련 책 주장) */
export function buildEvolutionPrompt(topic, orderedNotes, books, lang = 'ko') {
  const noteBlocks = (orderedNotes || []).map(n => {
    const d = n.modifiedTime ? new Date(n.modifiedTime).toISOString().slice(0, 10) : (lang === 'ko' ? '날짜 미상' : 'undated');
    return `[${d}] 《${n.title}》\n${(n.content || n.excerpt || '').slice(0, 700)}`;
  }).join('\n\n');
  const bookBlocks = (books || []).map(b => `《${b.title}》${b.summary ? `: ${b.summary}` : ''}`).join('\n');

  if (lang === 'ko') {
    return `당신은 사용자의 "제2의 뇌"를 돕는 사고 파트너입니다. 사용자가 "${topic}" 주제로 시간에 걸쳐 쓴 위키 노트들(오래된 순)과, 관련해 읽은 책들이 있습니다. 아래를 근거로 답하세요.

## "${topic}" 노트 (시간순)
${noteBlocks || '(노트 없음)'}

## 관련 책
${bookBlocks || '(없음)'}

다음을 간결한 한국어 마크다운으로 정리하세요(코드펜스 없이):
1. **생각의 흐름**: 이 주제에 대한 관점이 시간에 따라 어떻게 형성·변화했는지 2~3문장 서사. 노트 제목을 인용하세요.
2. **긴장·모순**: 노트들 사이, 또는 노트와 책의 주장 사이에 상충하거나 재검토가 필요한 지점이 있으면 1~3개 짚으세요. 없으면 "뚜렷한 모순 없음".
3. **다음 질문**: 사고를 한 걸음 더 밀어줄 열린 질문 1~2개.`;
  }
  return `You are a thinking partner for the user's "second brain." Below are the user's wiki notes on "${topic}" over time (oldest first), plus related books. Answer grounded in them.

## Notes on "${topic}" (chronological)
${noteBlocks || '(no notes)'}

## Related books
${bookBlocks || '(none)'}

Summarize in concise Markdown (no code fences):
1. **Evolution**: how their view formed/changed over time (2-3 sentences), citing note titles.
2. **Tensions**: 1-3 contradictions or points needing revisiting, between notes or between notes and books. If none, say "no clear tension".
3. **Next questions**: 1-2 open questions to push their thinking further.`;
}
