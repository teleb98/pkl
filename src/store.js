/* ── Persistent store (localStorage) ───────────────────── */

// timestamp+random — 같은 ms 다중 추가 시 id 충돌 방지 (addPdfAnnotation 과 동일 규칙)
function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

// Book index — minimal { id, title, webViewLink } list, kept in sync with Drive
export function getBookIndex() {
  try { return JSON.parse(localStorage.getItem('pkl_book_index') || '[]'); } catch { return []; }
}
export function saveBookIndex(books) {
  localStorage.setItem('pkl_book_index', JSON.stringify(
    books.map(b => ({ id: b.id, title: b.title, webViewLink: b.webViewLink }))
  ));
}

// Per-book progress
export function getBookMeta(id) {
  try { return JSON.parse(localStorage.getItem(`pkl_book_${id}`) || '{}'); } catch { return {}; }
}
export function setBookMeta(id, patch) {
  const cur = getBookMeta(id);
  // updatedAt 은 로컬 변경 시 자동 스탬프 — Drive 진행률 동기화(progressSync.js)가
  // 원격 값을 그대로 적용할 때는 patch.updatedAt 을 명시해 덮어쓰지 않게 한다.
  const updatedAt = patch.updatedAt !== undefined ? patch.updatedAt : Date.now();
  localStorage.setItem(`pkl_book_${id}`, JSON.stringify({ ...cur, ...patch, updatedAt }));
}

// Notes  [{ id, bookId, bookTitle, text, page, date }]
export function getNotes() {
  try { return JSON.parse(localStorage.getItem('pkl_notes') || '[]'); } catch { return []; }
}
export function addNote(note) {
  const list = getNotes();
  const item = { id: uid(), date: new Date().toISOString(), ...note };
  localStorage.setItem('pkl_notes', JSON.stringify([item, ...list]));
  return item;
}
export function deleteNote(id) {
  localStorage.setItem('pkl_notes', JSON.stringify(getNotes().filter(n => n.id !== id)));
}

// Highlights  [{ id, bookId, bookTitle, text, color, page, date }]
export function getHighlights() {
  try { return JSON.parse(localStorage.getItem('pkl_highlights') || '[]'); } catch { return []; }
}
export function addHighlight(hl) {
  const list = getHighlights();
  const item = { id: uid(), date: new Date().toISOString(), ...hl };
  localStorage.setItem('pkl_highlights', JSON.stringify([item, ...list]));
  return item;
}
export function deleteHighlight(id) {
  localStorage.setItem('pkl_highlights', JSON.stringify(getHighlights().filter(h => h.id !== id)));
}

// ── 책별 노트/하이라이트 조회 (4-1 노트 내보내기용) ──
export function getNotesByBook(bookId) {
  return getNotes().filter(n => n.bookId === bookId);
}
export function getHighlightsByBook(bookId) {
  return getHighlights().filter(h => h.bookId === bookId);
}

// ── 컬렉션 / 책장 (4-3) ─────────────────────────────────
// 형식: [{ id, name, emoji, bookIds: [], createdAt }]
const COLLECTIONS_KEY = 'pkl_collections';

export function getCollections() {
  try { return JSON.parse(localStorage.getItem(COLLECTIONS_KEY) || '[]'); }
  catch { return []; }
}
// librarySync.js 가 병합 결과를 통째로 반영할 때 사용(개별 mutator 우회)
export function saveCollections(list) {
  localStorage.setItem(COLLECTIONS_KEY, JSON.stringify(list));
  return list;
}
export function createCollection({ name, emoji = '📚' }) {
  const trimmed = String(name || '').trim();
  if (!trimmed) return getCollections();
  const list = getCollections();
  const item = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name: trimmed,
    emoji,
    bookIds: [],
    createdAt: Date.now(),
  };
  return saveCollections([...list, item]);
}
export function renameCollection(id, { name, emoji }) {
  const list = getCollections().map(c => {
    if (c.id !== id) return c;
    const next = { ...c };
    if (name != null && String(name).trim()) next.name = String(name).trim();
    if (emoji != null) next.emoji = emoji;
    return next;
  });
  return saveCollections(list);
}
export function deleteCollection(id) {
  return saveCollections(getCollections().filter(c => c.id !== id));
}
export function addBookToCollection(collectionId, bookId) {
  const list = getCollections().map(c => {
    if (c.id !== collectionId) return c;
    if (c.bookIds.includes(bookId)) return c;
    return { ...c, bookIds: [...c.bookIds, bookId] };
  });
  return saveCollections(list);
}
export function removeBookFromCollection(collectionId, bookId) {
  const list = getCollections().map(c =>
    c.id !== collectionId ? c : { ...c, bookIds: c.bookIds.filter(id => id !== bookId) }
  );
  return saveCollections(list);
}
export function getCollectionsByBook(bookId) {
  return getCollections().filter(c => c.bookIds.includes(bookId));
}

// ── 책 리뷰 (4-2 리뷰 카드용) ──
// 형식: { text, rating, theme, updatedAt }
export function getBookReview(bookId) {
  try { return JSON.parse(localStorage.getItem(`pkl_book_review_${bookId}`) || 'null'); }
  catch { return null; }
}
export function saveBookReview(bookId, review) {
  const merged = { ...(getBookReview(bookId) || {}), ...review, updatedAt: Date.now() };
  localStorage.setItem(`pkl_book_review_${bookId}`, JSON.stringify(merged));
  return merged;
}

// Reading sessions  [{ id, bookId, bookTitle, date, minutes, pages }]
export function getSessions() {
  try { return JSON.parse(localStorage.getItem('pkl_sessions') || '[]'); } catch { return []; }
}
export function addSession(session) {
  const list = getSessions();
  const item = { id: uid(), date: new Date().toISOString(), ...session };
  localStorage.setItem('pkl_sessions', JSON.stringify([item, ...list]));
  return item;
}

// Goals
export function getGoals() {
  try { return JSON.parse(localStorage.getItem('pkl_goals') || '{"dailyMinutes":30,"dailyPages":20}'); } catch { return { dailyMinutes: 30, dailyPages: 20 }; }
}
export function saveGoals(g) {
  localStorage.setItem('pkl_goals', JSON.stringify(g));
}

// Search history
export function getSearchHistory() {
  try { return JSON.parse(localStorage.getItem('pkl_search_history') || '[]'); } catch { return []; }
}
export function pushSearchHistory(q) {
  if (!q.trim()) return;
  const list = getSearchHistory().filter(s => s !== q).slice(0, 8);
  localStorage.setItem('pkl_search_history', JSON.stringify([q, ...list]));
}

// Weekly stats helper
export function getWeekStats() {
  const sessions = getSessions();
  const notes = getNotes();
  const highlights = getHighlights();
  const now = new Date();
  // Build last 7 days
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now);
    d.setDate(d.getDate() - (6 - i));
    return d.toISOString().slice(0, 10);
  });
  const minutesByDay = {};
  sessions.forEach(s => {
    const day = s.date.slice(0, 10);
    minutesByDay[day] = (minutesByDay[day] || 0) + (s.minutes || 0);
  });
  const maxMin = Math.max(1, ...Object.values(minutesByDay));
  const weekDays = days.map(d => ({
    d: ['S', 'M', 'T', 'W', 'T', 'F', 'S'][new Date(d + 'T12:00:00').getDay()],
    date: d,
    v: Math.round(((minutesByDay[d] || 0) / maxMin) * 100),
    minutes: minutesByDay[d] || 0,
  }));
  const weekSessions = sessions.filter(s => days.includes(s.date.slice(0, 10)));
  const totalMinutes = weekSessions.reduce((a, s) => a + (s.minutes || 0), 0);
  const totalPages = weekSessions.reduce((a, s) => a + (s.pages || 0), 0);
  const weekHighlights = highlights.filter(h => days.includes(h.date.slice(0, 10))).length;
  return { weekDays, totalMinutes, totalPages, weekHighlights, streak: computeStreak() };
}

/** 연속 독서일 수 — 전체 세션 기준 (7일 창 제한 없음 → streak30/100 배지 가능).
 *  오늘 기록이 아직 없으면 어제부터 세어 하루가 끝나기 전 스트릭이 0으로 깨지지 않게 한다. */
export function computeStreak() {
  const readDays = new Set(
    getSessions().filter(s => (s.minutes || 0) > 0).map(s => s.date.slice(0, 10))
  );
  const d = new Date();
  if (!readDays.has(d.toISOString().slice(0, 10))) d.setDate(d.getDate() - 1);
  let streak = 0;
  while (readDays.has(d.toISOString().slice(0, 10))) {
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

// ── 월간/연간 통계 (4-4 통계 이미지용) ──────────────────────
export function getMonthStats(year, month) {
  // month: 1-based (1=Jan)
  const sessions = getSessions();
  const notes    = getNotes();
  const highlights = getHighlights();

  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  const daysInMonth = new Date(year, month, 0).getDate();

  const monthSessions  = sessions.filter(s => s.date.startsWith(prefix));
  const monthNotes     = notes.filter(n => n.date.startsWith(prefix));
  const monthHighlights = highlights.filter(h => h.date.startsWith(prefix));

  const totalMinutes = monthSessions.reduce((a, s) => a + (s.minutes || 0), 0);
  const totalPages   = monthSessions.reduce((a, s) => a + (s.pages || 0), 0);

  // 완독 책 수 (sessions에 기록된 고유 bookId 중 getBookMeta.completed)
  const bookIds = [...new Set(monthSessions.map(s => s.bookId).filter(Boolean))];
  const completedBooks = bookIds.filter(id => getBookMeta(id)?.status === 'completed').length;

  // 일별 독서 분 (bar chart용)
  const minutesByDay = {};
  monthSessions.forEach(s => {
    const day = Number(s.date.slice(8, 10));
    minutesByDay[day] = (minutesByDay[day] || 0) + (s.minutes || 0);
  });
  const dayBars = Array.from({ length: daysInMonth }, (_, i) => ({
    day: i + 1,
    minutes: minutesByDay[i + 1] || 0,
  }));

  // 독서한 날 수
  const activeDays = new Set(monthSessions.map(s => s.date.slice(0, 10))).size;

  return {
    year, month,
    totalMinutes, totalPages,
    completedBooks,
    totalNotes: monthNotes.length,
    totalHighlights: monthHighlights.length,
    activeDays,
    dayBars,
    sessionCount: monthSessions.length,
  };
}

export function getYearStats(year) {
  const months = Array.from({ length: 12 }, (_, i) => getMonthStats(year, i + 1));
  return {
    year,
    totalMinutes: months.reduce((a, m) => a + m.totalMinutes, 0),
    totalPages:   months.reduce((a, m) => a + m.totalPages, 0),
    completedBooks: months.reduce((a, m) => a + m.completedBooks, 0),
    activeDays:   months.reduce((a, m) => a + m.activeDays, 0),
    months, // 12개 월 요약 (bar chart용)
  };
}

/* ── AI Chat session persistence ─────────────────────────── */
const AI_CHAT_KEY = id => `pkl_ai_chat_${id}`;
const MAX_SAVED_MSGS = 30;

export function getAiChat(bookId) {
  try { return JSON.parse(localStorage.getItem(AI_CHAT_KEY(bookId)) || 'null') || null; }
  catch { return null; }
}

export function saveAiChat(bookId, messages) {
  // Skip the greeting (index 0), keep last MAX_SAVED_MSGS
  const toSave = messages.slice(1).slice(-MAX_SAVED_MSGS);
  if (toSave.length === 0) { localStorage.removeItem(AI_CHAT_KEY(bookId)); return; }
  try { localStorage.setItem(AI_CHAT_KEY(bookId), JSON.stringify(toSave)); }
  catch { /* storage full */ }
}

export function clearAiChat(bookId) {
  localStorage.removeItem(AI_CHAT_KEY(bookId));
}

/* ── Bookmarks ───────────────────────────────────────────── */
const BOOKMARK_KEY = id => `pkl_bookmarks_${id}`;

export function getBookmarks(bookId) {
  try { return JSON.parse(localStorage.getItem(BOOKMARK_KEY(bookId)) || '[]'); }
  catch { return []; }
}

export function toggleBookmark(bookId, pageNum) {
  const bms = getBookmarks(bookId);
  const idx = bms.indexOf(pageNum);
  if (idx >= 0) bms.splice(idx, 1);
  else bms.push(pageNum);
  bms.sort((a, b) => a - b);
  localStorage.setItem(BOOKMARK_KEY(bookId), JSON.stringify(bms));
  return [...bms];
}

export function isBookmarked(bookId, pageNum) {
  return getBookmarks(bookId).includes(pageNum);
}

/* ── Reader settings ─────────────────────────────────────── */
const READER_SETTINGS_KEY = 'pkl_reader_settings';

export function getReaderSettings() {
  try { return JSON.parse(localStorage.getItem(READER_SETTINGS_KEY) || 'null') || { bg: 'white', zoom: 1 }; }
  catch { return { bg: 'white', zoom: 1 }; }
}

export function saveReaderSettings(s) {
  try { localStorage.setItem(READER_SETTINGS_KEY, JSON.stringify(s)); } catch {}
}

/* ── Flashcards ──────────────────────────────────────────── */
const FC_KEY = id => `pkl_flashcards_${id}`;

export function getFlashcards(bookId) {
  try { return JSON.parse(localStorage.getItem(FC_KEY(bookId)) || '[]'); }
  catch { return []; }
}

export function saveFlashcards(bookId, cards) {
  try { localStorage.setItem(FC_KEY(bookId), JSON.stringify(cards)); } catch {}
}

export function addFlashcard(bookId, { q, a }) {
  const card = { id: Date.now().toString(36) + Math.random().toString(36).slice(2), q, a, known: false, createdAt: Date.now() };
  const cards = [...getFlashcards(bookId), card];
  saveFlashcards(bookId, cards);
  return cards;
}

export function deleteFlashcard(bookId, cardId) {
  const cards = getFlashcards(bookId).filter(c => c.id !== cardId);
  saveFlashcards(bookId, cards);
  return cards;
}

export function markFlashcard(bookId, cardId, known) {
  const cards = getFlashcards(bookId).map(c => c.id === cardId ? { ...c, known } : c);
  saveFlashcards(bookId, cards);
  return cards;
}

/* ── Vocabulary ──────────────────────────────────────────── */
const VOCAB_KEY = 'pkl_vocabulary';

export function getVocabulary() {
  try { return JSON.parse(localStorage.getItem(VOCAB_KEY) || '[]'); }
  catch { return []; }
}

export function saveVocabulary(entries) {
  try { localStorage.setItem(VOCAB_KEY, JSON.stringify(entries)); } catch {}
}

export function addVocabularyEntry({ word, definition, bookId, bookTitle }) {
  const entries = getVocabulary();
  if (entries.some(e => e.word.toLowerCase() === word.toLowerCase())) return entries;
  const entry = { id: Date.now().toString(36) + Math.random().toString(36).slice(2), word, definition, bookId: bookId || '', bookTitle: bookTitle || '', createdAt: Date.now() };
  const next = [entry, ...entries];
  saveVocabulary(next);
  return next;
}

export function deleteVocabularyEntry(id) {
  const next = getVocabulary().filter(e => e.id !== id);
  saveVocabulary(next);
  return next;
}

/* ── Reading Queue ───────────────────────────────────────── */
const QUEUE_KEY = 'pkl_read_queue';

export function getReadQueue() {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); }
  catch { return []; }
}

export function saveReadQueue(queue) {
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(queue)); } catch {}
}

export function addToQueue(book) {
  const q = getReadQueue();
  if (q.some(b => b.id === book.id)) return q;
  const next = [...q, { id: book.id, title: book.title, addedAt: Date.now() }];
  saveReadQueue(next);
  return next;
}

export function removeFromQueue(bookId) {
  const next = getReadQueue().filter(b => b.id !== bookId);
  saveReadQueue(next);
  return next;
}

export function moveQueueItem(bookId, direction) {
  const q = getReadQueue();
  const idx = q.findIndex(b => b.id === bookId);
  if (idx < 0) return q;
  const newIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (newIdx < 0 || newIdx >= q.length) return q;
  const next = [...q];
  [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
  saveReadQueue(next);
  return next;
}

/* ── Badges ──────────────────────────────────────────────── */
const BADGE_KEY = 'pkl_badges';

export function getBadges() {
  try { return JSON.parse(localStorage.getItem(BADGE_KEY) || '[]'); }
  catch { return []; }
}

export function awardBadge(id, label, emoji) {
  const badges = getBadges();
  if (badges.some(b => b.id === id)) return badges;
  const next = [...badges, { id, label, emoji, earnedAt: Date.now() }];
  try { localStorage.setItem(BADGE_KEY, JSON.stringify(next)); } catch {}
  return next;
}

// Badge definitions: id → { koLabel, enLabel, emoji }
export const BADGE_DEFS = {
  streak7:   { ko: '7일 연속',   en: '7-day streak',   emoji: '🔥' },
  streak30:  { ko: '30일 달성',  en: '30-day streak',  emoji: '⚡' },
  streak100: { ko: '100일 전설', en: '100-day legend', emoji: '👑' },
  book1:     { ko: '첫 완독',    en: 'First book',      emoji: '📖' },
  book10:    { ko: '10권 완독',  en: '10 books',        emoji: '🏆' },
  book50:    { ko: '50권 완독',  en: '50 books',        emoji: '🌟' },
};

export function checkAndAwardBadges(streak, totalBooks) {
  let badges = getBadges();
  const award = (id) => { badges = awardBadge(id, BADGE_DEFS[id].ko, BADGE_DEFS[id].emoji); };
  if (streak >= 7)   award('streak7');
  if (streak >= 30)  award('streak30');
  if (streak >= 100) award('streak100');
  if (totalBooks >= 1)  award('book1');
  if (totalBooks >= 10) award('book10');
  if (totalBooks >= 50) award('book50');
  return badges;
}

/* ── Notification settings ───────────────────────────────── */
const NOTIF_KEY = 'pkl_notification_settings';

export function getNotificationSettings() {
  try { return JSON.parse(localStorage.getItem(NOTIF_KEY) || 'null') || { enabled: false, time: '21:00' }; }
  catch { return { enabled: false, time: '21:00' }; }
}

export function saveNotificationSettings(s) {
  try { localStorage.setItem(NOTIF_KEY, JSON.stringify(s)); } catch {}
}

/* ── Reading speed (derived from sessions) ───────────────── */
export function computeReadingSpeed() {
  const sessions = getSessions().filter(s => s.minutes > 0 && s.pages > 0);
  if (sessions.length === 0) return null;
  const totalMinutes = sessions.reduce((a, s) => a + s.minutes, 0);
  const totalPages   = sessions.reduce((a, s) => a + s.pages, 0);
  return { pagesPerMin: totalPages / totalMinutes, totalMinutes, totalPages, sessionCount: sessions.length };
}

export function estimateCompletion(bookId) {
  const speed = computeReadingSpeed();
  if (!speed) return null;
  const meta = getBookMeta(bookId);
  if (!meta?.pages || !meta?.lastPage) return null;
  const remaining = meta.pages - meta.lastPage;
  if (remaining <= 0) return null;
  const minutesLeft = remaining / speed.pagesPerMin;
  const sessions7d = getSessions().filter(s => {
    const d = new Date(s.date); return (Date.now() - d) / 86400000 <= 7;
  });
  const avg7d = sessions7d.length > 0
    ? sessions7d.reduce((a, s) => a + s.minutes, 0) / 7
    : 30; // default 30 min/day
  const daysLeft = avg7d > 0 ? Math.ceil(minutesLeft / avg7d) : null;
  return { remaining, minutesLeft: Math.round(minutesLeft), daysLeft };
}

/* ── Drive 백업 설정/이력 (Scenario 4-5) ────────────────── */
const BACKUP_SETTINGS_KEY = 'pkl_backup_settings';
const BACKUP_LOG_KEY = 'pkl_backup_log';

export function getBackupSettings() {
  try {
    return JSON.parse(localStorage.getItem(BACKUP_SETTINGS_KEY) || 'null') || {
      autoBackup: false,   // 세션 종료 시 자동 백업 (메모·하이라이트 마크다운)
      autoProgressSync: false, // 세션 종료 시 읽은 위치(진행률) 자동 동기화 — 같은 writeToken 재사용
      writeToken: null,    // drive.file 스코프 토큰
      writeTokenExpiresAt: null,
    };
  } catch {
    return { autoBackup: false, autoProgressSync: false, writeToken: null, writeTokenExpiresAt: null };
  }
}

export function saveBackupSettings(s) {
  try { localStorage.setItem(BACKUP_SETTINGS_KEY, JSON.stringify(s)); } catch {}
}

/** 백업 이력 조회 (최신 20개) */
export function getBackupLog() {
  try { return JSON.parse(localStorage.getItem(BACKUP_LOG_KEY) || '[]'); } catch { return []; }
}

/** 백업 이력 추가 */
export function appendBackupLog(entry) {
  try {
    const log = getBackupLog();
    log.unshift({ ...entry, ts: Date.now() });
    localStorage.setItem(BACKUP_LOG_KEY, JSON.stringify(log.slice(0, 20)));
  } catch {}
}

/** 마지막 성공 백업 시각 (ms) */
export function getLastBackupTime() {
  const log = getBackupLog().filter(e => e.status === 'ok');
  return log[0]?.ts || null;
}

/* ── 읽은 위치(진행률) 전용 Drive 동기화 이력 ──────────────
   메모·하이라이트 백업과는 별개 — "어디까지 읽었는지"만 작은 JSON으로
   Drive PKL 폴더에 동기화(progressSync.js). 같은 writeToken 을 재사용한다. */
const PROGRESS_SYNC_LOG_KEY = 'pkl_progress_sync_log';

export function getProgressSyncLog() {
  try { return JSON.parse(localStorage.getItem(PROGRESS_SYNC_LOG_KEY) || '[]'); } catch { return []; }
}

export function appendProgressSyncLog(entry) {
  try {
    const log = getProgressSyncLog();
    log.unshift({ ...entry, ts: Date.now() });
    localStorage.setItem(PROGRESS_SYNC_LOG_KEY, JSON.stringify(log.slice(0, 20)));
  } catch {}
}

export function getLastProgressSyncTime() {
  const log = getProgressSyncLog().filter(e => e.status === 'ok');
  return log[0]?.ts || null;
}

// ── PDF 페이지 형광펜 주석 ──────────────────────────────────
// annotation: { id, bookId, pageNum, rects:[{x,y,w,h}], color, text, createdAt }
export function getPdfAnnotations(bookId) {
  try { return JSON.parse(localStorage.getItem(`pkl_annot_${bookId}`) || '[]'); } catch { return []; }
}
export function savePdfAnnotations(bookId, annotations) {
  localStorage.setItem(`pkl_annot_${bookId}`, JSON.stringify(annotations));
}
export function addPdfAnnotation({ bookId, pageNum, rects, color = '#FFD54F', text = '' }) {
  const annotations = getPdfAnnotations(bookId);
  // timestamp+random 으로 같은 ms 다중 추가 시 id 충돌 방지
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const entry = { id, bookId, pageNum, rects, color, text, createdAt: Date.now() };
  annotations.unshift(entry);
  savePdfAnnotations(bookId, annotations);
  return entry;
}
export function deletePdfAnnotation(bookId, id) {
  const annotations = getPdfAnnotations(bookId).filter(a => a.id !== id);
  savePdfAnnotations(bookId, annotations);
  return annotations;
}

/* ── 형광펜 주석을 하이라이트로 통합 조회 ───────────────────
   pkl_highlights(텍스트 선택 기반)와 pkl_annot_<bookId>(PDF 좌표 기반
   형광펜)는 서로 다른 저장소라, 이 함수 없이는 검색·내보내기·AI 컨텍스트·
   Drive 백업 어디에도 형광펜이 노출되지 않았다. 아래 함수들로 항상 병합해
   조회한다(원본 저장소는 그대로 — 뷰어의 오버레이 렌더링은 rects 가 필요
   하므로 getPdfAnnotations 를 계속 사용). */
function annotationToHighlight(a) {
  return {
    id: `annot-${a.id}`,
    bookId: a.bookId,
    text: (a.text || '').trim() || '(PDF 형광펜 — 텍스트 없음)',
    color: a.color,
    page: a.pageNum,
    date: new Date(a.createdAt).toISOString(),
    isPdfAnnotation: true,
  };
}

/** 책 하나의 하이라이트(텍스트 선택 + PDF 형광펜) 통합 조회 */
export function getAllHighlightsByBook(bookId) {
  return [...getHighlightsByBook(bookId), ...getPdfAnnotations(bookId).map(annotationToHighlight)];
}

/** 모든 책의 PDF 형광펜 주석 (bookId 별로 분리 저장돼 있어 localStorage 를 스캔).
 *  Object.keys(localStorage) 대신 length/key(i) 를 쓴다 — 일부 환경(테스트 목 등)의
 *  localStorage 구현은 자체 속성만 열거 가능해 Object.keys 로는 저장된 키가 안 잡힌다. */
export function getAllPdfAnnotations() {
  const out = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith('pkl_annot_')) continue;
    try {
      const list = JSON.parse(localStorage.getItem(key) || '[]');
      for (const a of list) out.push(a);
    } catch { /* 손상된 항목은 스킵 */ }
  }
  return out;
}

/** 전체 하이라이트(텍스트 선택 + PDF 형광펜) 통합 조회 — 검색 화면용 */
export function getAllHighlightsMerged() {
  return [...getHighlights(), ...getAllPdfAnnotations().map(annotationToHighlight)];
}
