import { useState, useEffect, useRef } from 'react';
import { i18n } from '../data.js';
import { useTheme } from '../context.jsx';
import { Button, Icon, ProgressBar, ScreenHeader } from '../components.jsx';
import { getBookMeta, setBookMeta, addNote, addHighlight, getNotes, getAllHighlightsByBook, addSession, getAiChat, saveAiChat, getBookmarks, toggleBookmark, getReaderSettings, saveReaderSettings } from '../store.js';
import { scheduleProgressAutoSync } from '../utils/autoProgressSync.js';
import { mergePageText } from '../utils/bookTextDb.js';
import { scheduleRagSync } from '../utils/autoRagSync.js';
import { PdfViewer } from '../components/PdfViewer.jsx';
import { TextSelectionAI } from '../components/TextSelectionAI.jsx';
import { WordDefinition } from '../components/WordDefinition.jsx';
import { RangeSelector } from '../components/RangeSelector.jsx';
import { QuizModal } from '../components/QuizModal.jsx';
import { VisionTextSheet } from '../components/VisionTextSheet.jsx';
import { callAI } from '../aiClient.js';
import { extractWord } from '../utils/wordDefinition.js';
import { buildMetaContext } from '../scanBook.js';
import { getDocumentText, getPageImage, getTextForRange } from '../pageTextCache.js';
import { ensureBookText } from '../utils/ensureBookText.js';
import { getVocabulary, saveVocabulary, addVocabularyEntry, getPdfAnnotations, addPdfAnnotation } from '../store.js';

// 어휘/퀴즈 생성 실패 사유별 메시지
function genErrorMsg(e, lang) {
  const code = e?.message || '';
  if (code === 'no-text') {
    return lang === 'ko'
      ? '⚠️ 페이지 텍스트가 아직 없습니다. 해당 범위를 한 번 넘겨본 뒤 다시 시도하세요. (스캔 이미지 PDF는 미지원)'
      : '⚠️ No page text yet. Flip through that range once, then retry. (Scanned image PDFs unsupported)';
  }
  if (code === 'parse-failed' || code === 'invalid-format') {
    return lang === 'ko' ? '⚠️ AI 응답 형식 오류. 다시 시도하세요.' : '⚠️ AI response format error. Please retry.';
  }
  return lang === 'ko' ? `⚠️ 생성 실패: ${code}` : `⚠️ Failed: ${code}`;
}

function AddNoteSheet({ book, lang, onClose, onSaved }) {
  const { T, F } = useTheme();
  const [text, setText] = useState('');
  const [page, setPage] = useState('');
  const [type, setType] = useState('note');
  const [tagInput, setTagInput] = useState('');
  const colors = ['#FFF3B0', '#D4EDDA', '#D1ECF1', '#F8D7DA'];
  const [color, setColor] = useState(colors[0]);

  const parseTags = (s) => s.split(/[,\s]+/).map(t => t.trim().replace(/^#/, '')).filter(Boolean);

  const save = () => {
    if (!text.trim()) return;
    const tags = parseTags(tagInput);
    if (type === 'note') {
      addNote({ bookId: book.id, bookTitle: book.title, text: text.trim(), page: page ? parseInt(page) : 0, tags });
    } else {
      addHighlight({ bookId: book.id, bookTitle: book.title, text: text.trim(), color, page: page ? parseInt(page) : 0, tags });
    }
    onSaved();
    onClose();
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 300, display: 'flex', alignItems: 'flex-end' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: T.surface, borderRadius: '18px 18px 0 0', width: '100%', padding: '18px 20px 32px', boxShadow: '0 -16px 48px rgba(0,0,0,.18)' }}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 14, background: T.surfaceAlt, padding: 3, borderRadius: 10, border: `1px solid ${T.border}` }}>
          {[{ k: 'note', label: lang === 'ko' ? '메모' : 'Note' }, { k: 'highlight', label: lang === 'ko' ? '하이라이트' : 'Highlight' }].map(opt => (
            <button key={opt.k} onClick={() => setType(opt.k)} style={{ flex: 1, padding: '8px', borderRadius: 7, border: 'none', background: type === opt.k ? T.surface : 'transparent', color: type === opt.k ? T.ink : T.inkLight, fontSize: 13, fontWeight: type === opt.k ? 600 : 400, fontFamily: F.body, cursor: 'pointer' }}>{opt.label}</button>
          ))}
        </div>
        {type === 'highlight' && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            {colors.map(c => (
              <button key={c} onClick={() => setColor(c)} style={{ width: 28, height: 28, borderRadius: 8, background: c, border: color === c ? `2px solid ${T.ink}` : `1px solid ${T.border}`, cursor: 'pointer' }} />
            ))}
          </div>
        )}
        <textarea
          autoFocus
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder={type === 'note' ? (lang === 'ko' ? '메모를 입력하세요…' : 'Write your note…') : (lang === 'ko' ? '하이라이트할 텍스트를 입력하세요…' : 'Enter highlighted text…')}
          style={{ width: '100%', minHeight: 90, border: `1.5px solid ${T.border}`, borderRadius: 12, padding: '11px 13px', fontSize: 14, fontFamily: F.body, color: T.ink, background: type === 'highlight' ? color : T.surfaceAlt, resize: 'none', outline: 'none', boxSizing: 'border-box', lineHeight: 1.6 }}
        />
        <input
          value={page}
          onChange={e => setPage(e.target.value.replace(/\D/g, ''))}
          placeholder={lang === 'ko' ? '페이지 (선택)' : 'Page (optional)'}
          style={{ width: '100%', border: `1px solid ${T.border}`, borderRadius: 10, padding: '9px 13px', fontSize: 13, fontFamily: F.mono, color: T.ink, background: T.surfaceAlt, outline: 'none', marginTop: 8, boxSizing: 'border-box' }}
        />
        <input
          value={tagInput}
          onChange={e => setTagInput(e.target.value)}
          placeholder={lang === 'ko' ? '태그 (선택, 쉼표/공백 구분)' : 'Tags (optional, comma/space)'}
          style={{ width: '100%', border: `1px solid ${T.border}`, borderRadius: 10, padding: '9px 13px', fontSize: 13, fontFamily: F.body, color: T.ink, background: T.surfaceAlt, outline: 'none', marginTop: 8, boxSizing: 'border-box' }}
        />
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <Button variant="ghost" onClick={onClose} style={{ flex: 1 }}>{lang === 'ko' ? '취소' : 'Cancel'}</Button>
          <Button variant="accent" onClick={save} style={{ flex: 1.4 }} disabled={!text.trim()}>
            {lang === 'ko' ? '저장' : 'Save'}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* Sheet for logging current page + total pages */
function PageLogSheet({ book, lang, meta, onClose, onSaved, onNavigate }) {
  const { T, F } = useTheme();
  const ko = lang === 'ko';
  const [pageInput, setPageInput] = useState(String(meta.lastPage || ''));
  const [totalInput, setTotalInput] = useState(String(meta.pages || ''));

  const save = () => {
    if (!book) return;
    const p = parseInt(pageInput);
    if (!p || p < 1) { onClose(); return; }
    const total = parseInt(totalInput) || meta.pages || 0;
    const patch = { lastPage: p, status: 'reading' };
    if (total > 0) {
      patch.pages = total;
      patch.progress = Math.min(100, Math.round((p / total) * 100));
      if (patch.progress >= 100) patch.status = 'completed';
    }
    setBookMeta(book.id, patch);
    onNavigate?.(p);
    onSaved();
    onClose();
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 200, display: 'flex', alignItems: 'flex-end' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: T.surface, borderRadius: '18px 18px 0 0', width: '100%', padding: '20px 20px 36px', boxShadow: '0 -12px 40px rgba(0,0,0,.15)' }}>
        <div style={{ width: 36, height: 4, borderRadius: 2, background: T.border, margin: '0 auto 18px' }} />

        <div style={{ fontSize: 13, fontWeight: 700, color: T.ink, fontFamily: F.body, marginBottom: 14 }}>
          {ko ? '독서 위치 기록' : 'Log reading position'}
        </div>

        {/* Current page */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10.5, fontWeight: 600, color: T.inkLight, letterSpacing: 0.8, textTransform: 'uppercase', fontFamily: F.body, marginBottom: 6 }}>
            {ko ? '현재 페이지' : 'Current page'}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={() => setPageInput(p => String(Math.max(1, (parseInt(p) || 1) - 1)))}
              style={{ width: 40, height: 40, borderRadius: 10, border: `1px solid ${T.border}`, background: T.surfaceAlt, fontSize: 20, color: T.inkMid, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
            >−</button>
            <input
              autoFocus
              value={pageInput}
              onChange={e => setPageInput(e.target.value.replace(/\D/g, ''))}
              onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') onClose(); }}
              placeholder={ko ? '페이지 번호' : 'Page number'}
              style={{ flex: 1, border: `1.5px solid ${T.accent}`, borderRadius: 10, padding: '10px 14px', fontSize: 18, fontFamily: F.mono, fontWeight: 700, color: T.ink, background: T.surface, outline: 'none', textAlign: 'center' }}
            />
            <button
              onClick={() => setPageInput(p => String((parseInt(p) || 0) + 1))}
              style={{ width: 40, height: 40, borderRadius: 10, border: `1px solid ${T.border}`, background: T.surfaceAlt, fontSize: 20, color: T.inkMid, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
            >+</button>
          </div>
        </div>

        {/* Total pages — only shown until set */}
        {!meta.pages && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10.5, fontWeight: 600, color: T.inkLight, letterSpacing: 0.8, textTransform: 'uppercase', fontFamily: F.body, marginBottom: 6 }}>
              {ko ? '전체 페이지 수 (처음 한 번만)' : 'Total pages (set once)'}
            </div>
            <input
              value={totalInput}
              onChange={e => setTotalInput(e.target.value.replace(/\D/g, ''))}
              placeholder={ko ? '예: 320' : 'e.g. 320'}
              style={{ width: '100%', border: `1px solid ${T.border}`, borderRadius: 10, padding: '9px 14px', fontSize: 15, fontFamily: F.mono, color: T.ink, background: T.surfaceAlt, outline: 'none', boxSizing: 'border-box', textAlign: 'center' }}
            />
            <div style={{ fontSize: 11, color: T.inkLight, fontFamily: F.body, marginTop: 4 }}>
              {ko ? '전체 페이지를 입력하면 진행률 %가 정확해집니다.' : 'Enter total pages for accurate progress %.'}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="ghost" onClick={onClose} style={{ flex: 1 }}>{ko ? '취소' : 'Cancel'}</Button>
          <Button variant="accent" onClick={save} style={{ flex: 1.4 }} disabled={!pageInput}>
            {ko ? '저장' : 'Save'}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function ReaderScreen({ lang, setScreen, openDriveSave, currentBook, apiKeys }) {
  const { T, F } = useTheme();
  const t = i18n[lang];
  const [sidebar, setSidebar] = useState(null);
  const [showAddNote, setShowAddNote] = useState(false);
  const [showPageLog, setShowPageLog] = useState(false);
  const [notes, setNotes] = useState([]);
  const [highlights, setHighlights] = useState([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [saveFeedback, setSaveFeedback] = useState(false);
  const [pdfPage, setPdfPage] = useState(1);
  const [focusMode, setFocusMode] = useState(false);
  const [focusAiOpen, setFocusAiOpen] = useState(false);
  const [bookmarks, setBookmarks] = useState([]);
  const [readerSettings, setReaderSettings] = useState(getReaderSettings);
  const [showReaderSettings, setShowReaderSettings] = useState(false);
  const [focusAiMessages, setFocusAiMessages] = useState([]);
  const [focusAiInput, setFocusAiInput] = useState('');
  const [focusAiLoading, setFocusAiLoading] = useState(false);
  // 5-2: 선택 텍스트 AI
  const [selectedText, setSelectedText] = useState('');
  const [selectionPos, setSelectionPos] = useState(null);
  // 5-5: 단어 즉시 검색
  const [selectedWord, setSelectedWord] = useState('');
  const [wordContext, setWordContext] = useState('');
  const [wordPos, setWordPos] = useState(null);
  // Vocab & Quiz generation
  const [showVocabRange, setShowVocabRange] = useState(false);
  const [showQuizRange, setShowQuizRange] = useState(false);
  const [vocabLoading, setVocabLoading] = useState(false);
  const [visionOcr, setVisionOcr] = useState(null); // 텍스트 인식 시트 상태
  const [quizLoading, setQuizLoading] = useState(false);
  const [quizData, setQuizData] = useState(null);
  const [genFeedback, setGenFeedback] = useState('');
  const [pdfAnnotations, setPdfAnnotations] = useState([]);

  const focusModeRef = useRef(false);
  const focusAiRef = useRef(false);
  const focusAiScrollRef = useRef(null);
  const sessionStart = useRef(null);
  const adjustPageRef = useRef(null);
  const pdfViewerRef = useRef(null);

  useEffect(() => { focusModeRef.current = focusMode; }, [focusMode]);
  useEffect(() => { focusAiRef.current = focusAiOpen; }, [focusAiOpen]);

  // 텍스트 선택 감지
  useEffect(() => {
    const handleMouseUp = () => {
      const sel = window.getSelection();
      const text = sel?.toString?.().trim();
      if (text && text.length > 5) {
        const range = sel.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        setSelectedText(text);
        setSelectionPos({ x: rect.left + rect.width / 2, y: rect.top });
      } else {
        setSelectedText('');
      }
    };
    document.addEventListener('mouseup', handleMouseUp);
    return () => document.removeEventListener('mouseup', handleMouseUp);
  }, []);

  // 5-5: 단어 더블 클릭 감지
  useEffect(() => {
    const handleDblClick = (e) => {
      const sel = window.getSelection();
      const text = sel?.toString?.().trim();
      if (!text) return;

      const word = extractWord(text, 0);
      if (!word) return;

      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();

      // Get surrounding context (50 chars before and after)
      const fullText = document.body.innerText;
      const idx = fullText.indexOf(text);
      if (idx !== -1) {
        const start = Math.max(0, idx - 50);
        const end = Math.min(fullText.length, idx + text.length + 50);
        const ctx = fullText.slice(start, end).trim();
        setWordContext(ctx);
      } else {
        setWordContext(text);
      }

      setSelectedWord(word);
      setWordPos({ x: rect.left + rect.width / 2, y: rect.top });
    };
    document.addEventListener('dblclick', handleDblClick);
    return () => document.removeEventListener('dblclick', handleDblClick);
  }, []);

  const book = currentBook;

  // 생성 함수들
  const showGenFeedback = (msg) => {
    setGenFeedback(msg);
    setTimeout(() => setGenFeedback(''), 3500);
  };

  // 선택 범위의 텍스트를 추출: 캐시에 없으면 즉석 추출(+OCR) → 전체 캐시 폴백 → throw
  const getRangeText = async (startPage, endPage) => {
    let ranged = getTextForRange(book.id, startPage, endPage);
    if (!ranged?.text) {
      showGenFeedback(lang === 'ko' ? '⏳ 페이지 텍스트 추출 중…' : '⏳ Extracting page text…');
      const result = await pdfViewerRef.current?.ensureRange(startPage, endPage, ({ pageNum, total, done, engine, enginePct }) => {
        // 엔진 내부 진행(모델 로드/인식 %)이 오면 그것 우선 표시
        if (engine && enginePct != null) {
          const label = enginePct < 100 && /Gemma/i.test(engine)
            ? (lang === 'ko' ? `🧠 ${engine} 모델 로딩… ${enginePct}%` : `🧠 ${engine} loading… ${enginePct}%`)
            : (lang === 'ko' ? `🔤 ${engine} 인식… ${enginePct}%` : `🔤 ${engine}… ${enginePct}%`);
          showGenFeedback(label);
        } else if (total) {
          const pct = Math.round((done / total) * 100);
          showGenFeedback(lang === 'ko' ? `⏳ OCR ${done}/${total}p (${pct}%) · ${pageNum}p` : `⏳ OCR ${done}/${total} (${pct}%)`);
        }
      });
      if (result?.ocr > 0) showGenFeedback(lang === 'ko' ? `✓ OCR ${result.ocr}페이지 완료` : `✓ OCR ${result.ocr} pages done`);
      ranged = getTextForRange(book.id, startPage, endPage);
    }
    if (ranged?.text) return ranged.text;
    const doc = getDocumentText(book.id);
    const full = typeof doc === 'string' ? doc : (doc?.text || '');
    if (full) return full;
    throw new Error('no-text');
  };

  // 현재 페이지 Vision/로컬 OCR → 활용 시트 (복사·메모·AI 질문)
  const recognizeCurrentPage = async () => {
    if (!book?.id || visionOcr?.status === 'running') return;
    setVisionOcr({ status: 'running', pageNum: pdfPage });
    try {
      const res = await pdfViewerRef.current?.ocrPage(pdfPage, {
        onProgress: ({ engine, pct }) => setVisionOcr(s => s?.status === 'running' ? { ...s, engine, enginePct: pct } : s),
      });
      if (res?.text) {
        setVisionOcr({ status: 'done', ...res });
        // 단일 페이지 인식도 RAG 원천(bookTextDb)에 반영 + 인덱스 백그라운드 갱신
        // — 그래야 검색·AI 질문이 지금 인식한 내용을 즉시 활용할 수 있다.
        mergePageText(book.id, pdfPage, res.text)
          .then(() => scheduleRagSync(book.id, { geminiKey: apiKeys?.gemini }))
          .catch(() => {});
      } else setVisionOcr({ status: 'error', pageNum: pdfPage });
    } catch {
      setVisionOcr({ status: 'error', pageNum: pdfPage });
    }
  };

  const generateVocabInRange = async (startPage, endPage) => {
    if (!apiKeys?.claude && !apiKeys?.gemini) {
      showGenFeedback(lang === 'ko' ? '⚠️ AI 키를 먼저 설정하세요' : '⚠️ Set an AI key first');
      return;
    }
    if (!book?.id) return;

    setVocabLoading(true);
    try {
      const pageText = await getRangeText(startPage, endPage);

      const systemPrompt = lang === 'ko'
        ? '어휘 추출 전문가입니다. JSON 배열만 출력하세요. 형식: [{"word":"단어","definition":"뜻"}]'
        : 'You are a vocabulary expert. Return ONLY a JSON array. Format: [{"word":"term","definition":"meaning"}]';

      const prompt = lang === 'ko'
        ? `p.${startPage}-${endPage}에서 중요한 단어 5개를 추출하세요.\n\n${pageText.slice(0, 3000)}`
        : `Extract 5 key terms from pages ${startPage}-${endPage}.\n\n${pageText.slice(0, 3000)}`;

      const raw = await callAI(apiKeys, systemPrompt, [], prompt);
      const jsonMatch = raw.match(/\[[\s\S]*\]/);
      if (!jsonMatch) throw new Error('parse-failed');

      const extracted = JSON.parse(jsonMatch[0]);
      const cur = getVocabulary();
      let added = 0;
      extracted.forEach(({ word, definition }) => {
        if (word?.trim() && definition?.trim()) {
          if (!cur.some(e => e.word.toLowerCase() === word.toLowerCase().trim())) {
            addVocabularyEntry({ word: word.trim(), definition: definition.trim(), bookId: book.id, bookTitle: book.title });
            added++;
          }
        }
      });
      showGenFeedback(lang === 'ko' ? `✓ 어휘 ${added}개 추가됨 (지식에서 확인)` : `✓ Added ${added} terms (see Knowledge)`);
    } catch (e) {
      showGenFeedback(genErrorMsg(e, lang));
    } finally {
      setVocabLoading(false);
    }
  };

  const generateQuizInRange = async (startPage, endPage) => {
    if (!apiKeys?.claude && !apiKeys?.gemini) {
      showGenFeedback(lang === 'ko' ? '⚠️ AI 키를 먼저 설정하세요' : '⚠️ Set an AI key first');
      return;
    }
    if (!book?.id) return;

    setQuizLoading(true);
    try {
      const pageText = await getRangeText(startPage, endPage);

      const prompt = lang === 'ko'
        ? `p.${startPage}-${endPage} 내용 기반 5지선다형 퀴즈 1문제를 만드세요.\nJSON 형식: {"question":"질문","options":["1","2","3","4","5"],"correctIndex":0,"explanation":"해설"}\n\n${pageText.slice(0, 2000)}`
        : `Create 1 multiple-choice quiz from pages ${startPage}-${endPage}.\nJSON: {"question":"q","options":["1","2","3","4","5"],"correctIndex":0,"explanation":"why"}\n\n${pageText.slice(0, 2000)}`;

      const systemPrompt = lang === 'ko'
        ? '교육용 퀴즈 전문가입니다. 유효한 JSON만 출력하세요.'
        : 'You are a quiz expert. Return ONLY valid JSON.';

      const raw = await callAI(apiKeys, systemPrompt, [], prompt);
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('parse-failed');

      const quiz = JSON.parse(jsonMatch[0]);
      if (quiz.question && Array.isArray(quiz.options) && typeof quiz.correctIndex === 'number') {
        setShowQuizRange(false);
        setQuizData({ ...quiz, range: { startPage, endPage } });
      } else {
        throw new Error('invalid-format');
      }
    } catch (e) {
      showGenFeedback(genErrorMsg(e, lang));
    } finally {
      setQuizLoading(false);
    }
  };

  // Sync pdfPage + bookmarks + AI chat when book changes
  useEffect(() => {
    if (book) {
      setPdfPage(getBookMeta(book.id)?.lastPage || 1);
      setBookmarks(getBookmarks(book.id));
      setPdfAnnotations(getPdfAnnotations(book.id));
      const saved = getAiChat(book.id);
      const greeting = { role: 'ai', content: lang === 'ko' ? `《${book.title}》에 대해 질문하세요.` : `Ask me about 《${book.title}》.` };
      setFocusAiMessages(saved?.length ? [greeting, ...saved] : [greeting]);
    }
  }, [book?.id]); // eslint-disable-line

  // Keyboard: F = focus, A = AI (in focus), Escape = exit
  useEffect(() => {
    if (!book) return;
    const onKey = (e) => {
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target?.isContentEditable) return;
      if (e.key === 'f' || e.key === 'F') setFocusMode(m => !m);
      else if ((e.key === 'a' || e.key === 'A') && focusModeRef.current) {
        if (!focusAiRef.current) setFocusAiOpen(true);
        else setFocusAiOpen(false);
      } else if (e.key === 'Escape' && focusModeRef.current) {
        if (focusAiRef.current) setFocusAiOpen(false);
        else setFocusMode(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [book?.id]); // eslint-disable-line

  useEffect(() => {
    if (focusAiScrollRef.current) focusAiScrollRef.current.scrollTop = focusAiScrollRef.current.scrollHeight;
  }, [focusAiMessages, focusAiLoading]);

  /* Auto-session tracking: record time spent, auto-save on unmount / book change */
  useEffect(() => {
    if (!book) return;
    sessionStart.current = Date.now();

    // Auto-mark as reading on open
    const cur = getBookMeta(book.id);
    if (!cur.status || cur.status === 'unread') {
      setBookMeta(book.id, { status: 'reading' });
    }

    return () => {
      const elapsed = Math.round((Date.now() - sessionStart.current) / 60000);
      if (elapsed >= 1) {
        addSession({ bookId: book.id, bookTitle: book.title, minutes: elapsed, pages: 0 });
      }
    };
  }, [book?.id]); // eslint-disable-line

  /* Refresh notes & highlights */
  useEffect(() => {
    if (!book) return;
    setNotes(getNotes().filter(n => n.bookId === book.id));
    setHighlights(getAllHighlightsByBook(book.id));
  }, [book?.id, refreshKey]);

  /* Re-read meta fresh on each render */
  const meta = book ? getBookMeta(book.id) : {};
  const progress = meta.progress || 0;
  const lastPage = meta.lastPage || 0;
  const totalPages = meta.pages || 0;

  /* Quick ±1 page — preserves existing progress% when totalPages is unknown */
  const adjustPage = (delta) => {
    if (!book) return;
    const cur = getBookMeta(book.id);
    const newPage = Math.max(1, (cur.lastPage || 0) + delta);
    const total = cur.pages || 0;
    const patch = { lastPage: newPage, status: 'reading' };
    if (total > 0) {
      patch.progress = Math.min(100, Math.round((newPage / total) * 100));
      if (patch.progress >= 100) patch.status = 'completed';
    }
    setBookMeta(book.id, patch);
    setPdfPage(newPage);
    setSaveFeedback(true);
    setRefreshKey(k => k + 1);
    scheduleProgressAutoSync(); // 세션 타이머 없이 페이지만 넘겨도 진행률 동기화되도록(디바운스)
    setTimeout(() => setSaveFeedback(false), 1400);
  };
  adjustPageRef.current = adjustPage;

  const handleToggleBookmark = () => {
    if (!book || !lastPage) return;
    setBookmarks(toggleBookmark(book.id, lastPage));
  };

  const handleReaderSetting = (key, val) => {
    const next = { ...readerSettings, [key]: val };
    setReaderSettings(next);
    saveReaderSettings(next);
  };

  const sendFocusAi = async (txt) => {
    const text = (txt || focusAiInput).trim();
    if (!text || focusAiLoading || !book || (!apiKeys?.claude && !apiKeys?.gemini)) return;
    const history = focusAiMessages.slice(1).map(m => ({ role: m.role, content: m.content }));
    const newMsgs = [...focusAiMessages, { role: 'user', content: text }];
    setFocusAiMessages(newMsgs);
    setFocusAiInput('');
    setFocusAiLoading(true);
    try {
      // 업로드된 책 기반 답변 보장
      if (!getDocumentText(book.id)) {
        await ensureBookText(book);
      }
      const bookMeta = getBookMeta(book.id);
      const metaCtx = buildMetaContext(bookMeta, lang);
      const doc = getDocumentText(book.id);
      const img = getPageImage(book.id);
      const pageImg = img && !doc ? img.base64 : null;
      const pageCtx = doc ? `\n\n[문서 내용]\n${doc.text}` : '';
      const imageCtx = pageImg && !doc ? (lang === 'ko' ? '\n\n[이미지 인식 모드] 현재 페이지 이미지 첨부.' : '\n\n[Image mode] Current page image attached.') : '';
      const systemPrompt = lang === 'ko'
        ? `《${book.title}》 독서 도우미입니다.${metaCtx}${pageCtx}${imageCtx}\n\n명확하고 간결하게 한국어로 답변하세요.`
        : `Reading assistant for 《${book.title}》.${metaCtx}${pageCtx}${imageCtx}\n\nAnswer clearly and concisely.`;
      const reply = await callAI(apiKeys, systemPrompt, history, text, pageImg);
      setFocusAiMessages(prev => {
        const next = [...prev, { role: 'ai', content: reply }];
        saveAiChat(book.id, next);
        return next;
      });
    } catch (e) {
      setFocusAiMessages(prev => [...prev, { role: 'ai', content: `오류: ${e.message}` }]);
    } finally {
      setFocusAiLoading(false);
    }
  };

  /* Keyboard shortcuts: ←/→ / PageUp/Down when parent frame has focus */
  useEffect(() => {
    if (!book) return;
    const handleKey = (e) => {
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target?.isContentEditable) return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        e.preventDefault();
        adjustPageRef.current?.(+1);
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        adjustPageRef.current?.(-1);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [book?.id]); // eslint-disable-line

  const onPageSaved = (navigatedPage) => {
    if (navigatedPage) setPdfPage(navigatedPage);
    setSaveFeedback(true);
    setRefreshKey(k => k + 1);
    scheduleProgressAutoSync();
    setTimeout(() => setSaveFeedback(false), 1400);
  };

  /* ── No book selected ── */
  if (!book) {
    return (
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 32 }}>
        <div style={{ width: 72, height: 72, borderRadius: 20, background: T.accentSoft, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="library" size={32} color={T.accent} />
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 18, fontWeight: 600, color: T.ink, fontFamily: F.display, marginBottom: 8 }}>
            {lang === 'ko' ? '읽을 책을 선택해주세요' : 'Select a book to read'}
          </div>
          <div style={{ fontSize: 13, color: T.inkLight, fontFamily: F.body, lineHeight: 1.6 }}>
            {lang === 'ko' ? '서재에서 책을 탭하면 여기서 볼 수 있어요.' : 'Tap a book in your library to open it here.'}
          </div>
        </div>
        <Button variant="accent" onClick={() => setScreen('library')} style={{ padding: '12px 24px' }}>
          {lang === 'ko' ? '서재로 이동' : 'Go to Library'}
        </Button>
      </div>
    );
  }

  const isBookmarkedPage = bookmarks.includes(lastPage);

  return (
    <div style={{ position: 'absolute', inset: 0, background: T.surfaceAlt, display: 'flex', flexDirection: 'column' }}>

      {/* ── 집중 모드 플로팅 툴바 ── */}
      {focusMode && (
        <div style={{ position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 300, display: 'flex', gap: 4, alignItems: 'center', background: 'rgba(20,20,20,.9)', backdropFilter: 'blur(10px)', borderRadius: 16, padding: '8px 12px', boxShadow: '0 4px 24px rgba(0,0,0,.5)' }}>
          <button onClick={() => adjustPage(-1)} style={{ background: 'none', border: 'none', color: '#ddd', fontSize: 20, cursor: 'pointer', lineHeight: 1, padding: '2px 6px' }}>‹</button>
          <span style={{ fontSize: 11, fontFamily: F.mono, color: '#ccc', minWidth: 56, textAlign: 'center' }}>
            {lastPage > 0 ? `p.${lastPage}${totalPages > 0 ? `/${totalPages}` : ''}` : '—'}
          </span>
          <button onClick={() => adjustPage(1)} style={{ background: 'none', border: 'none', color: '#ddd', fontSize: 20, cursor: 'pointer', lineHeight: 1, padding: '2px 6px' }}>›</button>
          <div style={{ width: 1, height: 14, background: 'rgba(255,255,255,.2)', margin: '0 2px' }} />
          <button onClick={handleToggleBookmark} title="북마크" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 15, color: isBookmarkedPage ? '#FFD700' : '#666', padding: '2px 4px' }}>★</button>
          <button onClick={() => setFocusAiOpen(v => !v)} style={{ background: focusAiOpen ? T.accent : 'rgba(255,255,255,.12)', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 10, fontWeight: 700, color: focusAiOpen ? '#fff' : '#ccc', padding: '5px 9px', fontFamily: F.body }}>
            A · AI
          </button>
          <button onClick={() => setShowReaderSettings(s => !s)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#888', padding: '2px 4px' }}>⚙</button>
          <button onClick={() => setFocusMode(false)} style={{ background: 'none', border: 'none', color: '#666', fontSize: 12, cursor: 'pointer', padding: '2px 4px' }}>✕</button>
        </div>
      )}

      {/* ── 읽기 설정 패널 ── */}
      {showReaderSettings && (
        <div style={{ position: 'fixed', bottom: focusMode ? 76 : 20, left: '50%', transform: 'translateX(-50%)', zIndex: 310, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 16, padding: '16px 18px', boxShadow: '0 4px 24px rgba(0,0,0,.2)', width: 270 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.inkLight, letterSpacing: 1, textTransform: 'uppercase', fontFamily: F.body, marginBottom: 12 }}>{lang === 'ko' ? '읽기 설정' : 'Settings'}</div>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: T.inkMid, fontFamily: F.body, marginBottom: 6 }}>{lang === 'ko' ? '배경' : 'Background'}</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {[{ k: 'white', l: lang === 'ko' ? '기본' : 'Default', bg: '#fff', bd: '#ccc' }, { k: 'sepia', l: '세피아', bg: '#f5eddc', bd: '#c4a97d' }, { k: 'dark', l: '다크', bg: '#1a1a2e', bd: '#444' }].map(o => (
                <button key={o.k} onClick={() => handleReaderSetting('bg', o.k)} style={{ flex: 1, padding: '8px 0', borderRadius: 9, border: `2px solid ${readerSettings.bg === o.k ? T.accent : o.bd}`, background: o.bg, cursor: 'pointer', fontSize: 10, color: o.k === 'dark' ? '#eee' : '#333', fontFamily: F.body, fontWeight: readerSettings.bg === o.k ? 700 : 400 }}>{o.l}</button>
              ))}
            </div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: T.inkMid, fontFamily: F.body, marginBottom: 6 }}>{lang === 'ko' ? '확대' : 'Zoom'} · {Math.round(readerSettings.zoom * 100)}%</div>
            <div style={{ display: 'flex', gap: 4 }}>
              {[0.75, 1, 1.25, 1.5].map(z => (
                <button key={z} onClick={() => handleReaderSetting('zoom', z)} style={{ flex: 1, padding: '7px 0', borderRadius: 8, border: `1.5px solid ${readerSettings.zoom === z ? T.accent : T.border}`, background: readerSettings.zoom === z ? T.accentSoft : T.surfaceAlt, cursor: 'pointer', fontSize: 10, color: readerSettings.zoom === z ? T.accent : T.inkMid, fontFamily: F.mono, fontWeight: readerSettings.zoom === z ? 700 : 400 }}>{z === 1 ? '100%' : `${z * 100}%`}</button>
              ))}
            </div>
          </div>
          <button onClick={() => setShowReaderSettings(false)} style={{ width: '100%', padding: '8px', borderRadius: 9, border: 'none', background: T.surfaceAlt, color: T.inkMid, fontSize: 12, fontFamily: F.body, cursor: 'pointer' }}>{lang === 'ko' ? '닫기' : 'Close'}</button>
        </div>
      )}

      {/* ── 집중 모드 AI 오버레이 ── */}
      {focusMode && focusAiOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', flexDirection: 'column' }}>
          <div onClick={() => setFocusAiOpen(false)} style={{ flex: 1, background: 'rgba(0,0,0,.45)' }} />
          <div style={{ height: '65vh', background: T.surface, borderRadius: '20px 20px 0 0', display: 'flex', flexDirection: 'column', boxShadow: '0 -8px 40px rgba(0,0,0,.3)' }}>
            <div style={{ padding: '14px 18px 10px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.accent, fontFamily: F.body }}>AI · {apiKeys?.claude ? 'Claude' : apiKeys?.gemini ? 'Gemini' : '미연결'}</div>
                <div style={{ fontSize: 11, color: T.inkLight, fontFamily: F.body, marginTop: 1 }}>{lang === 'ko' ? '[A] 닫기  · Esc 집중 모드 종료' : '[A] close · Esc exit focus'}</div>
              </div>
              <button onClick={() => setFocusAiOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.inkLight, fontSize: 18 }}>✕</button>
            </div>
            <div ref={focusAiScrollRef} style={{ flex: 1, overflowY: 'auto', padding: '12px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {focusAiMessages.map((m, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                  <div style={{ maxWidth: '84%', padding: '10px 13px', borderRadius: m.role === 'user' ? '14px 14px 3px 14px' : '3px 14px 14px 14px', background: m.role === 'user' ? T.ink : T.surfaceAlt, color: m.role === 'user' ? T.surface : T.ink, fontSize: 13.5, lineHeight: 1.65, fontFamily: F.body, whiteSpace: 'pre-wrap' }}>{m.content}</div>
                </div>
              ))}
              {focusAiLoading && (
                <div style={{ display: 'flex', gap: 5, padding: '10px 0' }}>
                  {[0,1,2].map(i => <div key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: T.inkFaint, animation: `pulse 1.2s ${i * 0.2}s infinite` }} />)}
                </div>
              )}
            </div>
            <div style={{ padding: '10px 14px 24px', borderTop: `1px solid ${T.border}`, display: 'flex', gap: 8, flexShrink: 0 }}>
              <div style={{ flex: 1, background: T.surfaceAlt, borderRadius: 12, padding: '10px 14px', border: `1.5px solid ${focusAiInput ? T.ink : T.border}` }}>
                <input value={focusAiInput} onChange={e => setFocusAiInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendFocusAi()} placeholder={lang === 'ko' ? '질문을 입력하세요…' : 'Ask something…'} disabled={focusAiLoading} style={{ width: '100%', border: 'none', outline: 'none', background: 'transparent', fontSize: 14, color: T.ink, fontFamily: F.body }} />
              </div>
              <button onClick={() => sendFocusAi()} disabled={!focusAiInput.trim() || focusAiLoading} style={{ width: 44, height: 44, borderRadius: 999, border: 'none', background: focusAiInput.trim() && !focusAiLoading ? T.accent : T.border, cursor: focusAiInput.trim() && !focusAiLoading ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="send" size={16} color="#FFF" stroke={2} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      {!focusMode && book && <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8, background: T.surface, borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
        <button onClick={() => setScreen('library')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, color: T.inkMid, display: 'flex' }}>
          <Icon name="back" size={20} />
        </button>
        <div style={{ flex: 1, textAlign: 'center', minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: T.ink, fontFamily: F.display, letterSpacing: -0.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {book.title}
          </div>
          <div style={{ fontSize: 10.5, color: T.inkLight, fontFamily: F.mono, letterSpacing: 0.3 }}>
            {lastPage > 0
              ? `p. ${lastPage}${totalPages > 0 ? ` / ${totalPages}` : ''}${progress > 0 ? ` · ${progress}%` : ''}`
              : (lang === 'ko' ? '아직 시작 전' : 'Not started')}
          </div>
        </div>
        <button onClick={recognizeCurrentPage} title={lang === 'ko' ? '텍스트 인식 (Vision)' : 'Recognize text (Vision)'} style={{ background: 'none', border: 'none', cursor: visionOcr?.status === 'running' ? 'default' : 'pointer', padding: 6, color: T.inkMid, display: 'flex', fontSize: 14, opacity: visionOcr?.status === 'running' ? 0.4 : 1 }}>🔍</button>
        <button onClick={() => setShowVocabRange(true)} title={lang === 'ko' ? '어휘 생성' : 'Generate vocab'} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, color: T.inkMid, display: 'flex', fontSize: 14 }}>📚</button>
        <button onClick={() => setShowQuizRange(true)} title={lang === 'ko' ? '퀴즈 생성' : 'Generate quiz'} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, color: T.inkMid, display: 'flex', fontSize: 14 }}>🎯</button>
        <div style={{ width: 1, height: 16, background: T.border, margin: '0 2px' }} />
        <button onClick={() => setSidebar(sidebar === 'notes' ? null : 'notes')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, color: sidebar === 'notes' ? T.accent : T.inkMid, display: 'flex', position: 'relative' }}>
          <Icon name="note" size={18} />
          {(notes.length + highlights.length) > 0 && <span style={{ position: 'absolute', top: 3, right: 3, width: 7, height: 7, borderRadius: '50%', background: T.accent }} />}
        </button>
        <button onClick={handleToggleBookmark} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, color: isBookmarkedPage ? T.accent : T.inkMid, display: 'flex', fontSize: 16 }}>★</button>
        <button onClick={() => setScreen('knowledge')} title={lang === 'ko' ? '지식 보기' : 'View knowledge'} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, color: T.inkMid, display: 'flex', fontSize: 14 }}>📖</button>
        <button onClick={() => setFocusMode(true)} title={lang === 'ko' ? '집중 모드 [F]' : 'Focus mode [F]'} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, color: T.inkMid, display: 'flex' }}>
          <Icon name="spark" size={18} />
        </button>
      </div>}

      {/* Notes sidebar */}
      {sidebar === 'notes' && (
        <div style={{ background: T.surface, borderBottom: `1px solid ${T.border}`, padding: '12px 18px', flexShrink: 0, maxHeight: 260, overflowY: 'auto' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: T.inkLight, letterSpacing: 1.3, textTransform: 'uppercase', fontFamily: F.body, marginBottom: 10 }}>
            {lang === 'ko' ? '메모 & 하이라이트' : 'Notes & Highlights'} · {notes.length + highlights.length}
          </div>
          {highlights.length === 0 && notes.length === 0 && (
            <div style={{ fontSize: 13, color: T.inkLight, fontFamily: F.body, padding: '8px 0' }}>
              {lang === 'ko' ? '아직 없어요. 아래 ✦ 버튼으로 추가하세요.' : 'None yet. Tap ✦ below to add.'}
            </div>
          )}
          {highlights.map(h => (
            <div key={h.id} style={{ background: h.color || '#FFF3B0', borderRadius: 8, padding: '8px 10px', marginBottom: 7 }}>
              <p style={{ fontSize: 12.5, lineHeight: 1.55, color: T.ink, fontFamily: F.display, margin: 0 }}>{h.text}</p>
              {h.page > 0 && <div style={{ fontSize: 10, color: T.inkLight, fontFamily: F.mono, marginTop: 4 }}>p. {h.page}</div>}
            </div>
          ))}
          {notes.map(n => (
            <div key={n.id} style={{ background: T.surfaceAlt, borderRadius: 8, padding: '8px 10px', marginBottom: 7, borderLeft: `3px solid ${T.accent}` }}>
              <p style={{ fontSize: 12.5, lineHeight: 1.55, color: T.ink, fontFamily: F.body, margin: 0 }}>{n.text}</p>
              {n.page > 0 && <div style={{ fontSize: 10, color: T.inkLight, fontFamily: F.mono, marginTop: 4 }}>p. {n.page}</div>}
            </div>
          ))}
        </div>
      )}

      {/* PDF viewer */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative', display: 'flex', flexDirection: 'column' }}>
        <PdfViewer
          ref={pdfViewerRef}
          fileId={book.id}
          source={book.source || 'drive'}
          book={book}
          page={pdfPage}
          apiKeys={apiKeys}
          annotations={pdfAnnotations}
          onAnnotationAdd={(annot) => {
            const entry = addPdfAnnotation({ bookId: book.id, ...annot });
            setPdfAnnotations(prev => [entry, ...prev]);
          }}
          onTotalPages={(n) => { if (n && !getBookMeta(book.id)?.pages) setBookMeta(book.id, { pages: n }); }}
          onPageChange={(delta) => adjustPage(delta)}
          zoom={readerSettings.zoom}
          bg={readerSettings.bg}
          lang={lang}
        />
      </div>

      {/* Bottom bar — 집중 모드에서 숨김 */}
      {!focusMode && <div style={{ background: T.surface, borderTop: `1px solid ${T.border}`, padding: '10px 14px 12px', flexShrink: 0 }}>
        {/* Progress row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 10, fontFamily: F.mono, color: saveFeedback ? T.secondary : T.inkLight, fontWeight: saveFeedback ? 700 : 400, transition: 'color .3s', minWidth: 28, textAlign: 'right' }}>
            {saveFeedback ? '✓' : (progress > 0 ? `${progress}%` : '—')}
          </span>
          <div style={{ flex: 1 }}><ProgressBar value={progress} height={3} /></div>
          {lastPage > 0 && (
            <span style={{ fontSize: 10, color: T.inkLight, fontFamily: F.mono, minWidth: 40 }}>
              {totalPages > 0 ? `${lastPage}/${totalPages}` : `p.${lastPage}`}
            </span>
          )}
        </div>

        {/* Actions row */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
          {/* Quick page tracker: − | page | + */}
          <div style={{ flex: 1, display: 'flex', borderRadius: 10, border: `1px solid ${T.border}`, overflow: 'hidden', background: T.surfaceAlt }}>
            <button
              onClick={() => adjustPage(-1)}
              style={{ padding: '8px 14px', background: 'none', border: 'none', borderRight: `1px solid ${T.border}`, color: T.inkMid, fontSize: 18, cursor: 'pointer', lineHeight: 1, flexShrink: 0 }}
            >−</button>
            <button
              onClick={() => setShowPageLog(true)}
              style={{ flex: 1, background: 'none', border: 'none', color: lastPage > 0 ? T.ink : T.inkLight, fontSize: 13, fontWeight: lastPage > 0 ? 600 : 400, fontFamily: F.mono, cursor: 'pointer', padding: '0 6px' }}
            >
              {lastPage > 0 ? `p. ${lastPage}` : (lang === 'ko' ? '페이지 입력' : 'Log page')}
            </button>
            <button
              onClick={() => adjustPage(1)}
              style={{ padding: '8px 14px', background: 'none', border: 'none', borderLeft: `1px solid ${T.border}`, color: T.inkMid, fontSize: 18, cursor: 'pointer', lineHeight: 1, flexShrink: 0 }}
            >+</button>
          </div>

          {/* Note button */}
          <button
            onClick={() => setShowAddNote(true)}
            style={{ flexShrink: 0, background: T.ink, color: '#FFF', border: 'none', borderRadius: 10, padding: '8px 14px', fontSize: 12, fontWeight: 600, fontFamily: F.body, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}
          >
            <Icon name="spark" size={12} color="#FFF" stroke={2} /> {lang === 'ko' ? '메모' : 'Note'}
          </button>
        </div>
      </div>}

      <style>{`@keyframes pulse{0%,100%{opacity:.3;transform:scale(.9)}50%{opacity:1;transform:scale(1)}}`}</style>

      {showAddNote && (
        <AddNoteSheet book={book} lang={lang} onClose={() => setShowAddNote(false)} onSaved={() => setRefreshKey(k => k + 1)} />
      )}

      {showPageLog && (
        <PageLogSheet
          book={book}
          lang={lang}
          meta={meta}
          onClose={() => setShowPageLog(false)}
          onSaved={onPageSaved}
          onNavigate={(p) => onPageSaved(p)}
        />
      )}

      {/* 5-2: 선택 텍스트 AI */}
      {selectedText && (
        <TextSelectionAI
          selectedText={selectedText}
          position={selectionPos}
          book={book}
          onClose={() => setSelectedText('')}
          lang={lang}
          apiKeys={apiKeys}
        />
      )}

      {/* 5-5: 단어 즉시 검색 */}
      {selectedWord && (
        <WordDefinition
          word={selectedWord}
          context={wordContext}
          position={wordPos}
          onClose={() => setSelectedWord('')}
          lang={lang}
          apiKeys={apiKeys}
        />
      )}

      {/* 범위 선택 모달 */}
      {showVocabRange && (
        <RangeSelector
          type="vocab"
          lang={lang}
          bookId={book.id}
          currentPage={pdfPage}
          totalPages={totalPages}
          onConfirm={({ startPage, endPage }) => {
            setShowVocabRange(false);
            generateVocabInRange(startPage, endPage);
          }}
          onCancel={() => setShowVocabRange(false)}
        />
      )}

      {showQuizRange && (
        <RangeSelector
          type="quiz"
          lang={lang}
          bookId={book.id}
          currentPage={pdfPage}
          totalPages={totalPages}
          onConfirm={({ startPage, endPage }) => {
            setShowQuizRange(false);
            generateQuizInRange(startPage, endPage);
          }}
          onCancel={() => setShowQuizRange(false)}
        />
      )}

      {genFeedback && (
        <div style={{ position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)', zIndex: 1100, background: T.ink, color: T.surface, padding: '10px 18px', borderRadius: 10, fontSize: 13, fontWeight: 600, fontFamily: F.body, boxShadow: '0 4px 20px rgba(0,0,0,.3)', maxWidth: '90vw', textAlign: 'center' }}>
          {genFeedback}
        </div>
      )}

      {/* 텍스트 인식(Vision) 결과 시트 */}
      {visionOcr && (
        <VisionTextSheet
          lang={lang}
          state={visionOcr}
          onClose={() => setVisionOcr(null)}
          onSaveNote={(text, pageNum) => {
            addNote({ bookId: book.id, bookTitle: book.title, text: text.slice(0, 2000), page: pageNum, tags: ['OCR'] });
            setNotes(getNotes().filter(n => n.bookId === book.id));
            showGenFeedback(lang === 'ko' ? '✓ 메모로 저장됨' : '✓ Saved as note');
          }}
          onAskAI={() => {
            setVisionOcr(null);
            setScreen('ai'); // 인식 텍스트는 pageTextCache 를 통해 AI 컨텍스트로 사용됨
          }}
        />
      )}

      {quizData && (
        <QuizModal
          book={book}
          pageTexts={quizData.range ? [`p.${quizData.range.startPage}-${quizData.range.endPage}`] : []}
          lang={lang}
          apiKeys={apiKeys}
          onClose={() => setQuizData(null)}
          initialQuiz={quizData}
        />
      )}
    </div>
  );
}
