export function extractWord(text, position) {
  if (!text) return null;

  // Find word boundaries (handle English and Korean)
  let start = position;
  let end = position;

  // Korean: each character is a word unit
  const isKorean = (c) => /[가-힯ᄀ-ᇿ]/.test(c);
  const isEnglish = (c) => /[a-z]/i.test(c);
  const isWord = (c) => isKorean(c) || isEnglish(c) || /[0-9]/.test(c);

  // Expand backward
  while (start > 0 && isWord(text[start - 1])) start--;

  // Expand forward
  while (end < text.length && isWord(text[end])) end++;

  const word = text.slice(start, end);
  return word && word.length > 1 ? word : null;
}

export function generateDefinitionPrompt(lang, word, context) {
  if (lang === 'ko') {
    return `"${word}"의 의미를 설명해주세요.

문맥: "${context}"

형식:
1. 정의 (1-2문장)
2. 이 문맥에서의 의미 (1문장)`;
  }

  return `Define the word "${word}".

Context: "${context}"

Format:
1. Definition (1-2 sentences)
2. Meaning in this context (1 sentence)`;
}
