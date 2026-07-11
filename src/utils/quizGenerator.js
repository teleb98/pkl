export function generateQuizPrompt(lang, book, pageTexts, isMultipleChoice = true) {
  // Clean and validate pageTexts
  const cleanedTexts = (pageTexts || [])
    .filter(text => text && typeof text === 'string' && text.trim().length > 0)
    .map(text => text.trim().slice(0, 1000)); // Limit each text to 1000 chars

  const context = cleanedTexts.length > 0
    ? cleanedTexts.join('\n\n')
    : (lang === 'ko' ? '이 도서의 내용 기반으로' : 'Based on the book content');

  const systemPrompt = lang === 'ko'
    ? '당신은 교육용 퀴즈 출제 전문가입니다. JSON 형식의 퀴즈만 출력하세요.'
    : 'You are a quiz creation expert. Return ONLY valid JSON quiz format.';

  if (lang === 'ko') {
    return `다음 도서의 내용을 바탕으로 ${isMultipleChoice ? '5지선다형' : '단답형'} 퀴즈 문제를 하나 만들어주세요.

**도서 정보**
제목: ${book.title}
저자: ${book.author || '미상'}

**도서 내용**
${context}

**요구사항**
- 자연스러운 한국어 질문
- ${isMultipleChoice ? '5개의 선택지 (정확히 1개가 정답)' : '명확한 정답'}
- 교육적 가치가 높은 문제
- 도서 내용을 정확히 반영

${isMultipleChoice ? `JSON 형식 (필수):
{
  "question": "퀴즈 질문",
  "options": ["선택지1", "선택지2", "선택지3", "선택지4", "선택지5"],
  "correctIndex": 0,
  "explanation": "정답과 그 이유 설명"
}` : `JSON 형식 (필수):
{
  "question": "퀴즈 질문",
  "correctAnswer": "정답",
  "explanation": "정답과 그 이유 설명"
}`}`;
  }

  return `Create 1 ${isMultipleChoice ? 'multiple choice' : 'short answer'} quiz question based on this book.

**Book Info**
Title: ${book.title}
Author: ${book.author || 'Unknown'}

**Book Content**
${context}

**Requirements**
- Natural English phrasing
- ${isMultipleChoice ? '5 options (exactly 1 correct answer)' : 'Clear correct answer'}
- High educational value
- Accurately reflects book content

${isMultipleChoice ? `JSON format (required):
{
  "question": "Quiz question",
  "options": ["Option 1", "Option 2", "Option 3", "Option 4", "Option 5"],
  "correctIndex": 0,
  "explanation": "Explanation of why this is correct"
}` : `JSON format (required):
{
  "question": "Quiz question",
  "correctAnswer": "Correct answer",
  "explanation": "Explanation of why this is correct"
}`}`;
}

export function parseQuizResponse(jsonStr) {
  try {
    return JSON.parse(jsonStr);
  } catch (e) {
    return null;
  }
}
