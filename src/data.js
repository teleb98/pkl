/* ════════════════════════════════════════════════════════════════
   Design tokens, i18n, sample data for PKL
   ════════════════════════════════════════════════════════════════ */

/* ── Color themes ─────────────────────────────────────────────── */
export const THEMES = {
  ember: {
    name: { ko: "엠버", en: "Ember" },
    bg: "#F5F1E8",
    surface: "#FFFFFF",
    surfaceAlt: "#FBF6EC",
    border: "#E6DDC9",
    ink: "#1C1712",
    inkMid: "#3D3529",
    inkLight: "#7A6E5F",
    inkFaint: "#B5AA9A",
    accent: "#B8440A",
    accentGlow: "#D4581F",
    accentSoft: "#F3E4D8",
    accentDeep: "#8A3207",
    secondary: "#4A6741",
    secondarySoft: "#E0EBD8",
  },
  emberDark: {
    name: { ko: "엠버 다크", en: "Ember Dark" },
    bg: "#15110D",
    surface: "#1F1812",
    surfaceAlt: "#27201A",
    border: "#3A2E22",
    ink: "#F5EFE0",
    inkMid: "#C7BEAC",
    inkLight: "#8E8472",
    inkFaint: "#5A5142",
    accent: "#E07041",
    accentGlow: "#F08555",
    accentSoft: "#3A2218",
    accentDeep: "#FFA577",
    secondary: "#7BA268",
    secondarySoft: "#26331F",
  },
  sage: {
    name: { ko: "세이지", en: "Sage" },
    bg: "#F2F1EA",
    surface: "#FFFFFF",
    surfaceAlt: "#F8F7F0",
    border: "#DDDFCF",
    ink: "#16201A",
    inkMid: "#2D3A30",
    inkLight: "#6B7866",
    inkFaint: "#A8B0A4",
    accent: "#3F6B3B",
    accentGlow: "#4F8447",
    accentSoft: "#DCE9D5",
    accentDeep: "#2E5128",
    secondary: "#B8440A",
    secondarySoft: "#F3E4D8",
  },
  sageDark: {
    name: { ko: "세이지 다크", en: "Sage Dark" },
    bg: "#0F1612",
    surface: "#172019",
    surfaceAlt: "#1E2922",
    border: "#2C3A2F",
    ink: "#EFF2EA",
    inkMid: "#BFCBBC",
    inkLight: "#8A9686",
    inkFaint: "#586057",
    accent: "#7BAE74",
    accentGlow: "#9BCB94",
    accentSoft: "#1F2D1D",
    accentDeep: "#B2D8AB",
    secondary: "#E07041",
    secondarySoft: "#3A2218",
  },
  ink: {
    name: { ko: "잉크", en: "Ink" },
    bg: "#EDE9E2",
    surface: "#FFFFFF",
    surfaceAlt: "#F6F2EA",
    border: "#DCD7CC",
    ink: "#0D0D10",
    inkMid: "#2B2B30",
    inkLight: "#6B6B72",
    inkFaint: "#A8A8AE",
    accent: "#1F3A82",
    accentGlow: "#2E52B0",
    accentSoft: "#DCE3F3",
    accentDeep: "#142557",
    secondary: "#B8440A",
    secondarySoft: "#F3E4D8",
  },
  inkDark: {
    name: { ko: "잉크 다크", en: "Ink Dark" },
    bg: "#0A0B10",
    surface: "#13141B",
    surfaceAlt: "#1B1D25",
    border: "#2A2D38",
    ink: "#E8EAF2",
    inkMid: "#B4B8C7",
    inkLight: "#7E8395",
    inkFaint: "#52576A",
    accent: "#7798E0",
    accentGlow: "#9AB1ED",
    accentSoft: "#1A2240",
    accentDeep: "#B1C3F0",
    secondary: "#E07041",
    secondarySoft: "#3A2218",
  },
};

/* ── Type pairings ────────────────────────────────────────────── */
export const TYPE_PAIRS = {
  lora: {
    name: { ko: "로라", en: "Lora" },
    display: "'Lora', 'Noto Serif KR', Georgia, serif",
    body: "'Pretendard', 'DM Sans', system-ui, sans-serif",
    mono: "'JetBrains Mono', 'Courier New', monospace",
  },
  newsreader: {
    name: { ko: "뉴스리더", en: "Newsreader" },
    display: "'Newsreader', 'Noto Serif KR', Georgia, serif",
    body: "'Pretendard', 'Inter', system-ui, sans-serif",
    mono: "'JetBrains Mono', 'Courier New', monospace",
  },
  cormorant: {
    name: { ko: "코모란트", en: "Cormorant" },
    display: "'Cormorant Garamond', 'Noto Serif KR', Georgia, serif",
    body: "'Pretendard', 'DM Sans', system-ui, sans-serif",
    mono: "'JetBrains Mono', 'Courier New', monospace",
  },
};

/* ── Highlight palette (constant across themes) ───────────────── */
export const HIGHLIGHT = {
  yellow: "#F8E59B",
  blue:   "#BFD6F4",
  green:  "#C5E8D2",
  red:    "#F4C5C5",
  purple: "#DDD0F0",
};

/* ── i18n ─────────────────────────────────────────────────────── */
export const i18n = {
  ko: {
    // Brand
    appName: "Personal Knowledge Library",
    appNameShort: "PKL",
    tagline: "읽고, 정리하고, 창조하다",
    sub: "스캔한 책을 AI와 함께\n더 깊이 읽어보세요",
    // Nav
    library: "서재",
    search: "검색",
    knowledge: "지식",
    goals: "목표",
    aiChat: "AI 대화",
    aiChatShort: "AI",
    // Library
    continueReading: "이어 읽기",
    allBooks: "전체",
    reading: "읽는 중",
    completed: "완독",
    unread: "미열람",
    nowReading: "지금 읽는 중",
    yourLibrary: "내 서재",
    driveFiles: "Drive에 저장된 요약",
    // Reader
    toc: "목차",
    bookmarks: "책갈피",
    highlights: "하이라이트",
    notes: "메모",
    lastPosition: "마지막 읽은 위치",
    askAI: "AI에 묻기",
    explain: "설명해줘",
    deeper: "더 깊이",
    discuss: "토론하기",
    saveAsNote: "노트로 저장",
    // Search
    searchPlaceholder: "책, 하이라이트, 메모, AI 대화 검색",
    recent: "최근 검색",
    results: "검색 결과",
    // Knowledge
    selectMore: "선택하여 AI로 작성",
    generateNote: "독서 노트",
    generateReport: "보고서",
    generateSNS: "SNS 콘텐츠",
    // Goals
    todayGoal: "오늘의 독서 목표",
    timeGoal: "시간",
    pageGoal: "페이지",
    focusMode: "집중 모드",
    startReading: "독서 시작",
    thisWeek: "이번 주",
    streak: "연속",
    achieved: "목표 달성!",
    keepGoing: "계속 읽기",
    doneForToday: "오늘은 여기까지",
    todaysInsight: "오늘의 인사이트",
    // AI Modes
    quickMode: "즉시 설명",
    contextMode: "맥락 연결",
    socraticMode: "소크라테스",
    // Drive
    saveToDrive: "Drive에 저장",
    generateSummary: "맥락 요약 생성",
    summaryUnit: "요약 단위",
    byChapter: "챕터별",
    byDate: "날짜별",
    wholeBook: "책 전체",
    generating: "AI 요약 생성 중",
    savingToDrive: "Drive에 저장 중",
    savedSuccess: "저장 완료",
    saveLocation: "저장 위치",
    // Misc
    syncedToDrive: "Drive 동기화됨",
    cancel: "취소",
    next: "다음",
    close: "닫기",
    edit: "수정",
    pageAbbr: "p.",
    minutes: "분",
    minutesShort: "분",
    pages: "페이지",
    remaining: "남음",
  },
  en: {
    appName: "Personal Knowledge Library",
    appNameShort: "PKL",
    tagline: "Read, organize, create",
    sub: "Read your scanned books\nmore deeply with AI",
    library: "Library",
    search: "Search",
    knowledge: "Knowledge",
    goals: "Goals",
    aiChat: "AI Chat",
    continueReading: "Continue",
    allBooks: "All",
    reading: "Reading",
    completed: "Done",
    unread: "Unread",
    nowReading: "Now Reading",
    yourLibrary: "Your Library",
    driveFiles: "Saved Summaries",
    toc: "Contents",
    bookmarks: "Bookmarks",
    highlights: "Highlights",
    notes: "Notes",
    lastPosition: "Last Position",
    askAI: "Ask AI",
    explain: "Explain",
    deeper: "Go Deeper",
    discuss: "Discuss",
    saveAsNote: "Save as Note",
    searchPlaceholder: "Search books, highlights, notes, chats",
    recent: "Recent",
    results: "Results",
    selectMore: "Select to create with AI",
    generateNote: "Reading Note",
    generateReport: "Report",
    generateSNS: "SNS Post",
    todayGoal: "Today's Reading Goal",
    timeGoal: "Time",
    pageGoal: "Pages",
    focusMode: "Focus Mode",
    startReading: "Start Reading",
    thisWeek: "This Week",
    streak: "Streak",
    achieved: "Goal Achieved!",
    keepGoing: "Keep Reading",
    doneForToday: "Done for Today",
    todaysInsight: "Today's Insight",
    quickMode: "Quick",
    contextMode: "Context",
    socraticMode: "Socratic",
    saveToDrive: "Save to Drive",
    generateSummary: "Generate Summary",
    summaryUnit: "Summary Unit",
    byChapter: "By Chapter",
    byDate: "By Date",
    wholeBook: "Whole Book",
    generating: "Generating with AI",
    savingToDrive: "Saving to Drive",
    savedSuccess: "Saved",
    saveLocation: "Save Location",
    syncedToDrive: "Synced to Drive",
    cancel: "Cancel",
    next: "Next",
    close: "Close",
    edit: "Edit",
    pageAbbr: "p.",
    minutes: "min",
    minutesShort: "m",
    pages: "pages",
    remaining: "remaining",
  },
};

/* ── Sample data ──────────────────────────────────────────────── */
export const BOOKS = [
  {
    id: 1,
    title: "전략의 본질",
    titleEn: "The Essence of Strategy",
    author: "헨리 민츠버그",
    authorEn: "Henry Mintzberg",
    year: 1994,
    progress: 53,
    pages: 380,
    lastPage: 203,
    status: "reading",
    highlights: 24,
    bookmarks: 3,
    notes: 7,
    cover: "#8B6B47",
    coverAccent: "#5F4730",
    spine: "#7A5A3A",
    chapters: [
      "서문",
      "1장. 전략이란 무엇인가",
      "2장. 계획의 함정",
      "3장. 전략의 패턴",
      "4장. 포지션과 관점",
      "5장. 창발적 전략",
      "결론",
    ],
  },
  {
    id: 2,
    title: "파괴적 혁신",
    titleEn: "The Innovator's Dilemma",
    author: "클레이튼 크리스텐슨",
    authorEn: "Clayton Christensen",
    year: 1997,
    progress: 100,
    pages: 320,
    lastPage: 320,
    status: "completed",
    highlights: 41,
    bookmarks: 7,
    notes: 12,
    cover: "#3E6B5F",
    coverAccent: "#264842",
    spine: "#2F5A4E",
    chapters: ["1장", "2장", "3장", "4장", "5장"],
  },
  {
    id: 3,
    title: "사피엔스",
    titleEn: "Sapiens",
    author: "유발 하라리",
    authorEn: "Yuval Noah Harari",
    year: 2011,
    progress: 12,
    pages: 638,
    lastPage: 76,
    status: "reading",
    highlights: 8,
    bookmarks: 1,
    notes: 2,
    cover: "#4D5E7E",
    coverAccent: "#2F3D54",
    spine: "#3E4F6B",
    chapters: ["1부 인지혁명", "2부 농업혁명", "3부 인류의 통합", "4부 과학혁명"],
  },
  {
    id: 4,
    title: "넛지",
    titleEn: "Nudge",
    author: "리처드 탈러",
    authorEn: "Richard Thaler",
    year: 2008,
    progress: 78,
    pages: 293,
    lastPage: 228,
    status: "reading",
    highlights: 19,
    bookmarks: 4,
    notes: 5,
    cover: "#B8440A",
    coverAccent: "#7A2A03",
    spine: "#9A3807",
    chapters: ["1장 편향과 실수", "2장 선택 설계", "3장 넛지 적용", "4장 사회 정책"],
  },
  {
    id: 5,
    title: "생각에 관한 생각",
    titleEn: "Thinking, Fast and Slow",
    author: "대니얼 카너먼",
    authorEn: "Daniel Kahneman",
    year: 2011,
    progress: 0,
    pages: 512,
    lastPage: 0,
    status: "unread",
    highlights: 0,
    bookmarks: 0,
    notes: 0,
    cover: "#6A4566",
    coverAccent: "#412840",
    spine: "#553854",
    chapters: ["1부 두 가지 시스템", "2부 휴리스틱과 편향"],
  },
  {
    id: 6,
    title: "린 스타트업",
    titleEn: "The Lean Startup",
    author: "에릭 리스",
    authorEn: "Eric Ries",
    year: 2011,
    progress: 0,
    pages: 336,
    lastPage: 0,
    status: "unread",
    highlights: 0,
    bookmarks: 0,
    notes: 0,
    cover: "#5C6B33",
    coverAccent: "#3A461F",
    spine: "#475427",
    chapters: ["1장 시작", "2장 정의", "3장 학습"],
  },
];

/* Bookmarks for currently-open book */
export const BOOKMARKS = [
  { page: 203, label: "마지막 읽은 위치", labelEn: "Last Position", isAuto: true },
  { page: 45,  label: "3장 핵심 논지",    labelEn: "Chapter 3 Key Argument", isAuto: false },
  { page: 89,  label: "다시 읽을 것",     labelEn: "Re-read this",      isAuto: false },
  { page: 156, label: "결론 요약",        labelEn: "Conclusion summary", isAuto: false },
];

/* Unified search index */
export const INDEX = [
  { type: "highlight", bookId: 1, bookTitle: "전략의 본질", bookTitleEn: "The Essence of Strategy", text: "파괴적 혁신은 기술이 아니라 비즈니스 모델의 문제다.", textEn: "Disruptive innovation is not a technology problem, but a business model problem.", page: 124, color: HIGHLIGHT.blue, tag: "insight" },
  { type: "highlight", bookId: 1, bookTitle: "전략의 본질", bookTitleEn: "The Essence of Strategy", text: "전략은 계획이 아니라 패턴이다. 과거 행동의 일관성에서 발견된다.", textEn: "Strategy is not a plan but a pattern, discovered in the consistency of past actions.", page: 156, color: HIGHLIGHT.blue, tag: "insight" },
  { type: "note",      bookId: 1, bookTitle: "전략의 본질", bookTitleEn: "The Essence of Strategy", text: "민츠버그의 5P를 삼성 TV 기획에 적용하면 어떨까? 포지션 전략이 핵심일 것 같다.", textEn: "How would Mintzberg's 5Ps apply to Samsung TV planning? Position strategy seems key.", page: 156, date: "2026-05-20" },
  { type: "highlight", bookId: 3, bookTitle: "사피엔스", bookTitleEn: "Sapiens", text: "인지 혁명은 약 7만 년 전에 시작되었으며, 호모 사피엔스가 지구를 지배하게 된 결정적 전환점이었다.", textEn: "The Cognitive Revolution began around 70,000 years ago — the decisive turning point enabling Homo sapiens to dominate the earth.", page: 45, color: HIGHLIGHT.yellow, tag: "concept" },
  { type: "highlight", bookId: 4, bookTitle: "넛지", bookTitleEn: "Nudge", text: "선택 설계는 사람들의 자유를 침해하지 않으면서도 더 나은 결정을 내리도록 돕는다.", textEn: "Choice architecture helps people make better decisions without restricting their freedom.", page: 89, color: HIGHLIGHT.green, tag: "quote" },
  { type: "ai",        bookId: 1, bookTitle: "전략의 본질", bookTitleEn: "The Essence of Strategy", text: "소크라테스 토론: 삼성의 반복 패턴과 전략의 관계", textEn: "Socratic discussion: Samsung's repeated patterns and strategy", date: "2026-05-21" },
  { type: "highlight", bookId: 2, bookTitle: "파괴적 혁신", bookTitleEn: "The Innovator's Dilemma", text: "좋은 경영이 오히려 실패를 부른다 — 이것이 혁신가의 딜레마다.", textEn: "Good management itself causes failure — this is the innovator's dilemma.", page: 203, color: HIGHLIGHT.red, tag: "quote" },
  { type: "note",      bookId: 3, bookTitle: "사피엔스", bookTitleEn: "Sapiens", text: "인지혁명과 현재 AI 혁명의 유사점 — 인간의 협력 방식이 근본적으로 바뀌는 시점.", textEn: "Similarities between the Cognitive Revolution and today's AI revolution — a fundamental shift in human cooperation.", page: 62, date: "2026-05-19" },
];

/* Drive files */
export const DRIVE_FILES = [
  { name: "전략의_본질_3장_패턴전략.md", nameEn: "Strategy_Ch3_Pattern.md", date: "2026-05-22", size: "3.1KB", type: "chapter" },
  { name: "전략의_본질_전체요약.md",      nameEn: "Strategy_Whole_Summary.md", date: "2026-05-22", size: "8.2KB", type: "whole" },
  { name: "독서세션_2026-05-20.md",     nameEn: "Session_2026-05-20.md", date: "2026-05-20", size: "4.7KB", type: "date" },
  { name: "파괴적혁신_전체요약.md",      nameEn: "Innovators_Dilemma_Summary.md", date: "2026-05-18", size: "12.4KB", type: "whole" },
  { name: "독서세션_2026-05-15.md",     nameEn: "Session_2026-05-15.md", date: "2026-05-15", size: "2.9KB", type: "date" },
];

/* Today's reading content (paragraphs with inline highlights) */
export const READING_PARAGRAPHS = {
  ko: [
    {
      parts: [
        { text: "전략은 계획이 아니다. 그것은 " },
        { text: "과거 행동들의 일관성 속에서 발견되는 패턴", highlight: "blue", clickable: true },
        { text: "이다. 많은 경영자들이 전략을 수립하려 할 때, 그들은 미래를 계획하려 한다. 그러나 진정한 전략적 통찰은 종종 행동 이후에 온다." },
      ],
    },
    {
      parts: [
        { text: "민츠버그는 전략을 다섯 가지 P로 정의한다 — 계획(Plan), 책략(Ploy), " },
        { text: "패턴(Pattern)", highlight: "yellow" },
        { text: ", 포지션(Position), 관점(Perspective). 이 중 가장 강력하고 또한 가장 자주 간과되는 것이 바로 패턴이다." },
      ],
    },
    {
      pullQuote: "좋은 전략은 복잡하지 않다. 그것은 단순하고 명확하며, 조직 내 모든 사람이 이해할 수 있어야 한다.",
      pullCite: "— 헨리 민츠버그, p.204",
    },
    {
      parts: [
        { text: "창발적 전략(emergent strategy)의 개념이 이를 잘 설명한다. 조직 내 수많은 개별 결정들이 시간이 지남에 따라 하나의 일관된 방향성을 형성하게 되는 것이다. 애플이 처음부터 '생태계 전략'을 계획했을까? iPod → iTunes → iPhone → App Store로 이어지는 " },
        { text: "행동의 패턴이 곧 전략", highlight: "blue" },
        { text: "이 된 것이다." },
      ],
    },
  ],
  en: [
    {
      parts: [
        { text: "Strategy is not a plan. It is " },
        { text: "a pattern discovered in the consistency of past actions", highlight: "blue", clickable: true },
        { text: ". When managers try to formulate strategy, they try to plan the future. But true strategic insight often comes after the action." },
      ],
    },
    {
      parts: [
        { text: "Mintzberg defines strategy through five P's — Plan, Ploy, " },
        { text: "Pattern", highlight: "yellow" },
        { text: ", Position, and Perspective. Of these, the most powerful and most overlooked is pattern." },
      ],
    },
    {
      pullQuote: "Good strategy isn't complex. It is simple, clear, and understandable to everyone in the organization.",
      pullCite: "— Henry Mintzberg, p.204",
    },
    {
      parts: [
        { text: "The concept of emergent strategy explains this well. Countless individual decisions within an organization gradually form a coherent direction over time. Did Apple plan an 'ecosystem strategy' from the start? The progression of iPod → iTunes → iPhone → App Store became " },
        { text: "a pattern of action, and that pattern was the strategy", highlight: "blue" },
        { text: "." },
      ],
    },
  ],
};

/* Markdown preview for Drive save */
export const MD_SAMPLES = {
  ko: `# 전략의 본질 — 3장 맥락 요약
**생성일:** 2026-05-23  ·  **챕터:** 3장 전략의 패턴  ·  **페이지:** 124–156

---

## 핵심 주제
민츠버그는 전략을 사전 계획이 아니라 **반복된 행동에서 사후적으로 발견되는 패턴**으로 재정의한다.

## 주요 하이라이트 (7)

### 인사이트
> "파괴적 혁신은 기술이 아니라 비즈니스 모델의 문제다." — p.124
> "전략은 계획이 아니라 패턴이다." — p.156

### 핵심 개념
- **창발적 전략 (Emergent Strategy)** : 계획 없이 행동들이 모여 전략이 됨
- **의도 vs 실현된 전략** : 처음 의도와 실제 결과는 다를 수 있음

## 내 메모
- 민츠버그의 5P를 삼성 TV 기획에 적용하면? — 포지션 전략이 핵심일 것
- 패턴 전략은 애자일 방법론과 연결됨

## AI 대화 요약
소크라테스 토론에서 삼성의 반복 패턴과 전략의 관계를 탐구함.
**결론:** 의식적 전략보다 조직의 반복 행동이 더 강력한 전략적 신호일 수 있음.

---
*MyLibrary · Personal Knowledge Library*`,
  en: `# The Essence of Strategy — Chapter 3 Summary
**Generated:** 2026-05-23  ·  **Chapter:** 3 Patterns of Strategy  ·  **Pages:** 124–156

---

## Core Theme
Mintzberg redefines strategy not as advance planning but as **a pattern discovered retrospectively** in repeated actions.

## Key Highlights (7)

### Insights
> "Disruptive innovation is not a technology problem, but a business model problem." — p.124
> "Strategy is not a plan but a pattern." — p.156

### Concepts
- **Emergent Strategy** : Actions accumulate into strategy without prior planning
- **Intended vs Realized Strategy** : Initial intent and actual outcomes often diverge

## My Notes
- How would Mintzberg's 5Ps apply to Samsung TV planning? — Position strategy seems key.
- Pattern strategy connects to Agile methodology.

## AI Chat Summary
Socratic discussion explored the relationship between Samsung's repeated patterns and strategy.
**Conclusion:** Repeated organizational behaviors may be stronger strategic signals than conscious strategy.

---
*MyLibrary · Personal Knowledge Library*`,
};