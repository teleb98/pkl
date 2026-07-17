import { useState, useMemo, useEffect, useRef } from 'react';
import { i18n } from '../data.js';
import { useTheme } from '../context.jsx';
import { ChipRow, Button, Icon, ScreenHeader } from '../components.jsx';
import {
  getNotes, getAllHighlightsMerged, getAllHighlightsByBook, deleteNote, deleteHighlight,
  getFlashcards, saveFlashcards, addFlashcard, deleteFlashcard, markFlashcard,
  getVocabulary, addVocabularyEntry, deleteVocabularyEntry,
  getBookIndex,
} from '../store.js';
import { callAI } from '../aiClient.js';
import { getDocumentText } from '../pageTextCache.js';
import { listIndexedBooks, semanticSearchAll } from '../utils/ragSearch.js';
import { printNotesAsPdf, downloadNotesAsMarkdown } from '../utils/exportNotes.js';
import { ReviewCardModal } from '../components/ReviewCardModal.jsx';
import { QuizModal } from '../components/QuizModal.jsx';

function fmtDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
}

/* ── 플립 카드 컴포넌트 ──────────────────────────────────── */
function FlipCard({ front, back, flipped, onFlip }) {
  const { T, F } = useTheme();
  return (
    <div onClick={onFlip} style={{ perspective: '1200px', cursor: 'pointer', userSelect: 'none', width: '100%' }}>
      <div style={{
        position: 'relative', width: '100%', minHeight: 180,
        transformStyle: 'preserve-3d',
        transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
        transition: 'transform 0.45s ease',
      }}>
        <div style={{ position: 'absolute', inset: 0, backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', background: T.surface, borderRadius: 18, border: `1.5px solid ${T.border}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 20px', textAlign: 'center', gap: 10 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: T.accent, letterSpacing: 1.2, textTransform: 'uppercase', fontFamily: F.body }}>Q</span>
          <p style={{ fontSize: 15, lineHeight: 1.65, color: T.ink, fontFamily: F.display, margin: 0 }}>{front}</p>
          <span style={{ fontSize: 11, color: T.inkFaint, fontFamily: F.body, marginTop: 8 }}>탭하여 답 확인</span>
        </div>
        <div style={{ position: 'absolute', inset: 0, backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', transform: 'rotateY(180deg)', background: T.accentSoft, borderRadius: 18, border: `1.5px solid ${T.accent}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 20px', textAlign: 'center', gap: 10 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: T.accent, letterSpacing: 1.2, textTransform: 'uppercase', fontFamily: F.body }}>A</span>
          <p style={{ fontSize: 14, lineHeight: 1.7, color: T.ink, fontFamily: F.body, margin: 0 }}>{back}</p>
        </div>
      </div>
    </div>
  );
}

/* ── 학습 모드 오버레이 ──────────────────────────────────── */
function StudyOverlay({ cards, bookTitle, lang, onClose, onUpdate }) {
  const { T, F } = useTheme();
  const queue = useMemo(() => cards.filter(c => !c.known), [cards]);
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [done, setDone] = useState(false);

  const card = queue[idx];
  const progress = Math.round(((cards.length - queue.length) / cards.length) * 100);

  const next = (known) => {
    onUpdate(card.id, known);
    setFlipped(false);
    if (idx + 1 >= queue.length) setDone(true);
    else setIdx(i => i + 1);
  };

  if (done || queue.length === 0) return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 400, background: T.surface, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 32 }}>
      <div style={{ fontSize: 48 }}>🎉</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: T.ink, fontFamily: F.display }}>{lang === 'ko' ? '학습 완료!' : 'Session Complete!'}</div>
      <div style={{ fontSize: 13, color: T.inkMid, fontFamily: F.body }}>
        {lang === 'ko' ? `전체 ${cards.length}장 중 모름 ${queue.length}장 학습했어요.` : `Studied ${queue.length} of ${cards.length} cards.`}
      </div>
      <Button variant="accent" onClick={onClose} style={{ marginTop: 8, padding: '12px 32px' }}>{lang === 'ko' ? '닫기' : 'Done'}</Button>
    </div>
  );

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 400, background: T.surfaceAlt, display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: `1px solid ${T.border}`, background: T.surface }}>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.inkMid, display: 'flex' }}><Icon name="back" size={20} /></button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, color: T.inkLight, fontFamily: F.body }}>{bookTitle}</div>
          <div style={{ fontSize: 10.5, color: T.inkMid, fontFamily: F.mono }}>{idx + 1} / {queue.length} · {lang === 'ko' ? '학습 중인 카드' : 'cards to review'}</div>
        </div>
      </div>
      <div style={{ height: 3, background: T.border }}><div style={{ height: '100%', width: `${progress}%`, background: T.accent, transition: 'width .3s' }} /></div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 22px', gap: 24 }}>
        <FlipCard front={card.q} back={card.a} flipped={flipped} onFlip={() => setFlipped(f => !f)} />
        {flipped && (
          <div style={{ display: 'flex', gap: 12, width: '100%' }}>
            <button onClick={() => next(false)} style={{ flex: 1, padding: '14px', borderRadius: 14, border: `1.5px solid #DC2626`, background: '#FEF2F2', color: '#DC2626', fontSize: 14, fontWeight: 700, fontFamily: F.body, cursor: 'pointer' }}>
              🔄 {lang === 'ko' ? '다시' : 'Again'}
            </button>
            <button onClick={() => next(true)} style={{ flex: 1, padding: '14px', borderRadius: 14, border: `1.5px solid #16A34A`, background: '#F0FDF4', color: '#16A34A', fontSize: 14, fontWeight: 700, fontFamily: F.body, cursor: 'pointer' }}>
              ✓ {lang === 'ko' ? '알아요' : 'Got it'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── 메인 컴포넌트 ───────────────────────────────────────── */
export function KnowledgeScreen({ lang, apiKeys, currentBook }) {
  const { T, F } = useTheme();
  const t = i18n[lang];
  const [mainTab, setMainTab] = useState('notes');   // notes | cards | vocab | quiz
  const [view, setView]       = useState('all');
  const [reviewBook, setReviewBook] = useState(null);
  const [selected, setSelected] = useState([]);
  const [items, setItems]       = useState([]);
  const [tagFilter, setTagFilter] = useState('');

  // Flashcard state
  const [fcBook, setFcBook]       = useState(currentBook?.id || '');
  const [flashcards, setFlashcards] = useState([]);
  const [fcGenerating, setFcGenerating] = useState(false);
  const [fcError, setFcError]     = useState('');
  const [studying, setStudying]   = useState(false);

  // Vocabulary state
  const [vocab, setVocab]         = useState([]);
  const [vocabGenerating, setVocabGenerating] = useState(false);
  const [vocabError, setVocabError] = useState('');

  // 5-1: Quiz state
  const [showQuiz, setShowQuiz] = useState(false);

  // 지식 베이스(RAG) state — Vision/스캔으로 만든 벡터 인덱스 활용
  const [kbBooks, setKbBooks]   = useState([]);
  const [kbQuery, setKbQuery]   = useState('');
  const [kbHits, setKbHits]     = useState([]);
  const [kbLoading, setKbLoading] = useState(false);
  const [kbSearched, setKbSearched] = useState(false);

  const books = useMemo(() => getBookIndex(), []);
  const kbTitleOf = (id) => { const b = books.find(x => x.id === id); return b?.aiTitle || b?.title || id; };

  const reload = () => {
    const notes = getNotes().map(n => ({ ...n, type: 'note' }));
    const highlights = getAllHighlightsMerged().map(h => ({ ...h, type: 'highlight' }));
    setItems([...highlights, ...notes].sort((a, b) => new Date(b.date) - new Date(a.date)));
  };

  useEffect(() => { reload(); }, []);
  useEffect(() => { setVocab(getVocabulary()); }, [mainTab]);
  useEffect(() => {
    if (mainTab !== 'kb') return;
    listIndexedBooks({ geminiKey: apiKeys?.gemini }).then(setKbBooks).catch(() => setKbBooks([]));
  }, [mainTab, apiKeys]);

  const runKbSearch = async () => {
    const q = kbQuery.trim();
    if (!q || kbLoading) return;
    setKbLoading(true); setKbHits([]); setKbSearched(true);
    try {
      const hits = await semanticSearchAll(q, { geminiKey: apiKeys?.gemini, total: 10 });
      setKbHits(hits);
    } catch { setKbHits([]); }
    finally { setKbLoading(false); }
  };
  useEffect(() => {
    if (fcBook) setFlashcards(getFlashcards(fcBook));
  }, [fcBook]);
  useEffect(() => {
    if (currentBook?.id && !fcBook) setFcBook(currentBook.id);
  }, [currentBook?.id]); // eslint-disable-line

  const toggle = (id) => setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);

  /* ── 모든 태그 수집 ── */
  const allTags = useMemo(() => {
    const tagSet = new Set();
    items.forEach(it => (it.tags || []).forEach(tg => tagSet.add(tg)));
    return [...tagSet].sort();
  }, [items]);

  const filteredItems = useMemo(() => {
    if (!tagFilter) return items;
    return items.filter(it => (it.tags || []).includes(tagFilter));
  }, [items, tagFilter]);

  const grouped = useMemo(() => {
    const src = filteredItems;
    if (view === 'book') {
      const map = {};
      src.forEach(h => { const k = h.bookTitle || '(없음)'; (map[k] = map[k] || []).push(h); });
      return map;
    }
    if (view === 'type') return {
      [lang === 'ko' ? '하이라이트' : 'Highlights']: src.filter(x => x.type === 'highlight'),
      [lang === 'ko' ? '메모' : 'Notes']: src.filter(x => x.type === 'note'),
    };
    return { _: src };
  }, [view, filteredItems, lang]);

  const deleteSelected = () => {
    selected.forEach(id => {
      const item = items.find(x => x.id === id);
      if (!item) return;
      if (item.type === 'note') deleteNote(id);
      else deleteHighlight(id);
    });
    setSelected([]); reload();
  };

  const exportMarkdown = () => {
    const target = selected.length > 0 ? items.filter(x => selected.includes(x.id)) : items;
    const byBook = {};
    [...target].sort((a, b) => new Date(a.date) - new Date(b.date)).forEach(item => {
      const k = item.bookTitle || (lang === 'ko' ? '(제목 없음)' : '(Untitled)');
      (byBook[k] = byBook[k] || []).push(item);
    });
    const dateStr = new Date().toLocaleDateString(lang === 'ko' ? 'ko-KR' : 'en-US');
    let md = lang === 'ko' ? `# 지식 노트\n\n내보낸 날짜: ${dateStr}\n\n` : `# Knowledge Notes\n\nExported: ${dateStr}\n\n`;
    Object.entries(byBook).forEach(([book, bItems]) => {
      md += `## ${book}\n\n`;
      bItems.forEach(item => {
        const page = item.page > 0 ? ` *(p.${item.page})*` : '';
        if (item.type === 'highlight') md += `> ${item.text}${page}\n\n`;
        else md += `**${lang === 'ko' ? '메모' : 'Note'}**: ${item.text}${page}\n\n`;
      });
    });
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `pkl-notes-${new Date().toISOString().slice(0, 10)}.md`;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  /* ── AI 플래시카드 생성 ── */
  const generateFlashcards = async () => {
    if (!fcBook || !apiKeys?.claude && !apiKeys?.gemini) return;
    const notes = getNotes().filter(n => n.bookId === fcBook).slice(0, 20);
    const highlights = getAllHighlightsByBook(fcBook).slice(0, 20);
    if (notes.length + highlights.length === 0) { setFcError(lang === 'ko' ? '메모나 하이라이트가 없어요.' : 'No notes or highlights found.'); return; }
    setFcGenerating(true); setFcError('');
    const bookTitle = books.find(b => b.id === fcBook)?.title || '';
    const noteText = [...highlights.map(h => `[HL] ${h.text}`), ...notes.map(n => `[메모] ${n.text}`)].join('\n');
    const prompt = lang === 'ko'
      ? `다음은 《${bookTitle}》 독서 메모입니다:\n${noteText}\n\n이 내용을 기반으로 학습용 플래시카드 5~8장을 생성하세요.\n반드시 JSON 배열만 응답: [{"q":"질문","a":"답변"},...]`
      : `Reading notes from 《${bookTitle}》:\n${noteText}\n\nGenerate 5-8 flashcards.\nReturn ONLY a JSON array: [{"q":"question","a":"answer"},...]`;
    try {
      const raw = await callAI(apiKeys, '플래시카드 생성 전문가입니다. JSON 배열만 출력하세요.', [], prompt);
      const match = raw.replace(/```json\s*|\s*```/g, '').trim().match(/\[[\s\S]*\]/);
      if (!match) throw new Error('parse error');
      const generated = JSON.parse(match[0]);
      const newCards = [...flashcards];
      generated.forEach(({ q, a }) => {
        if (q && a) {
          const card = { id: Date.now().toString(36) + Math.random().toString(36).slice(2), q, a, known: false, createdAt: Date.now() };
          newCards.push(card);
        }
      });
      saveFlashcards(fcBook, newCards);
      setFlashcards(newCards);
    } catch (e) {
      setFcError(lang === 'ko' ? `생성 실패: ${e.message}` : `Failed: ${e.message}`);
    } finally {
      setFcGenerating(false);
    }
  };

  /* ── AI 어휘 추출 ── */
  const generateVocab = async () => {
    if (!apiKeys?.claude && !apiKeys?.gemini) return;
    if (!currentBook?.id) {
      setVocabError(lang === 'ko' ? '책을 먼저 선택해주세요' : 'Please select a book first');
      return;
    }

    const doc = getDocumentText(currentBook.id);
    const pageText = typeof doc === 'string' ? doc : (doc?.text || '');

    if (!pageText || pageText.trim().length === 0) {
      setVocabError(lang === 'ko' ? '책의 내용을 불러올 수 없습니다. 뷰어에서 책을 열어주세요.' : 'Unable to load book content. Please open the book in Reader.');
      return;
    }

    setVocabGenerating(true);
    setVocabError('');

    const systemPrompt = lang === 'ko'
      ? '어휘 추출 전문가입니다. 주어진 텍스트에서 중요하고 어려운 단어를 추출합니다. JSON 배열만 출력하세요.'
      : 'You are a vocabulary expert. Extract key and difficult terms from the given text. Return ONLY a JSON array.';

    const prompt = lang === 'ko'
      ? `다음 텍스트에서 어렵거나 중요한 단어/개념 5개를 추출하세요. 각 항목은 {"word":"단어","definition":"정의"} 형식이어야 합니다.\n\n텍스트:\n${pageText.slice(0, 3000)}`
      : `Extract 5 key/difficult terms from this text. Return in format {"word":"term","definition":"definition"}.\n\nText:\n${pageText.slice(0, 3000)}`;

    try {
      const raw = await callAI(apiKeys, systemPrompt, [], prompt);

      // Try to extract JSON array from response
      const jsonMatch = raw.match(/\[[\s\S]*\]/);
      if (!jsonMatch) throw new Error(lang === 'ko' ? 'JSON 파싱 실패' : 'Failed to parse JSON');

      const extracted = JSON.parse(jsonMatch[0]);
      if (!Array.isArray(extracted)) throw new Error(lang === 'ko' ? '배열이 아닙니다' : 'Not an array');

      let cur = getVocabulary();
      let added = 0;

      extracted.forEach(({ word, definition }) => {
        if (word && definition && word.trim() && definition.trim()) {
          if (!cur.some(e => e.word.toLowerCase() === word.toLowerCase().trim())) {
            const entry = {
              id: Date.now().toString(36) + Math.random().toString(36).slice(2),
              word: word.trim(),
              definition: definition.trim(),
              bookId: currentBook.id,
              bookTitle: currentBook.title,
              createdAt: Date.now()
            };
            cur = [entry, ...cur];
            added++;
          }
        }
      });

      if (added === 0) {
        setVocabError(lang === 'ko' ? '새로운 단어를 찾지 못했습니다' : 'No new vocabulary found');
      } else {
        saveVocabulary(cur);
        setVocab(cur);
      }
    } catch (e) {
      setVocabError(lang === 'ko' ? `오류: ${e.message}` : `Error: ${e.message}`);
    } finally {
      setVocabGenerating(false);
    }
  };

  const renderItem = (item) => {
    const isHL = item.type === 'highlight';
    const sel = selected.includes(item.id);
    return (
      <div key={item.id} onClick={() => toggle(item.id)} style={{ background: sel ? T.accentSoft : T.surface, borderRadius: 12, padding: 13, marginBottom: 8, cursor: 'pointer', border: `1.5px solid ${sel ? T.accent : T.border}`, transition: 'all .15s' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: isHL ? '#B7791F' : T.accent, letterSpacing: 1.1, textTransform: 'uppercase', fontFamily: F.body, background: isHL ? '#FEFCE8' : T.accentSoft, padding: '2px 7px', borderRadius: 999 }}>
            {isHL ? (lang === 'ko' ? '하이라이트' : 'Highlight') : (lang === 'ko' ? '메모' : 'Note')}
          </span>
          <span style={{ fontSize: 10, color: T.inkLight, fontFamily: F.mono }}>{item.page > 0 ? `p.${item.page}` : fmtDate(item.date)}</span>
        </div>
        {isHL
          ? <div style={{ background: item.color || '#FFF3B0', borderRadius: 6, padding: '8px 10px', marginBottom: 7 }}><p style={{ fontSize: 13, lineHeight: 1.55, color: T.ink, fontFamily: 'serif', margin: 0 }}>{item.text}</p></div>
          : <p style={{ fontSize: 13, lineHeight: 1.55, color: T.ink, fontFamily: F.body, margin: '0 0 7px', whiteSpace: 'pre-wrap' }}>{item.text}</p>
        }
        {(item.tags || []).length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
            {item.tags.map(tg => (
              <span key={tg} onClick={e => { e.stopPropagation(); setTagFilter(t => t === tg ? '' : tg); }} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 999, background: tagFilter === tg ? T.accent : T.border, color: tagFilter === tg ? '#fff' : T.inkMid, cursor: 'pointer', fontFamily: F.body }}>#{tg}</span>
            ))}
          </div>
        )}
        <div style={{ fontSize: 10.5, color: T.inkLight, fontFamily: F.body, display: 'flex', alignItems: 'center', gap: 4 }}>
          <Icon name="library" size={11} color={T.inkLight} /> {item.bookTitle}
        </div>
      </div>
    );
  };

  const knownCount = flashcards.filter(c => c.known).length;

  return (
    <div style={{ paddingBottom: 24 }}>
      {studying && (
        <StudyOverlay
          cards={flashcards}
          bookTitle={books.find(b => b.id === fcBook)?.title || ''}
          lang={lang}
          onClose={() => { setStudying(false); setFlashcards(getFlashcards(fcBook)); }}
          onUpdate={(id, known) => {
            const updated = markFlashcard(fcBook, id, known);
            setFlashcards(updated);
          }}
        />
      )}

      <ScreenHeader
        subtitle={lang === 'ko' ? '지식 저장소' : 'Your knowledge base'}
        title={t.knowledge}
        right={
          mainTab === 'notes' && items.length > 0
            ? <button onClick={exportMarkdown} style={{ padding: '6px 12px', borderRadius: 9, border: `1px solid ${T.border}`, background: T.surface, color: T.ink, fontSize: 12, fontFamily: F.body, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <Icon name="download" size={13} color={T.inkMid} />
                {selected.length > 0 ? `${selected.length}개` : (lang === 'ko' ? '내보내기' : 'Export')}
              </button>
            : null
        }
      />

      {/* 메인 탭 */}
      <div style={{ padding: '0 22px 14px' }}>
        <div style={{ display: 'flex', gap: 4, background: T.surfaceAlt, padding: 3, borderRadius: 12, border: `1px solid ${T.border}` }}>
          {[
            { k: 'notes',  l: lang === 'ko' ? '노트' : 'Notes',      icon: 'note' },
            { k: 'cards',  l: lang === 'ko' ? '카드' : 'Cards',      icon: 'column' },
            { k: 'vocab',  l: lang === 'ko' ? '어휘' : 'Vocab',      icon: 'spark' },
            { k: 'kb',     l: lang === 'ko' ? '지식DB' : 'Base',      icon: 'search' },
            { k: 'quiz',   l: lang === 'ko' ? '퀴즈' : 'Quiz',        icon: 'help' },
          ].map(opt => (
            <button key={opt.k} onClick={() => setMainTab(opt.k)} style={{ flex: 1, padding: '9px 4px', borderRadius: 9, border: 'none', background: mainTab === opt.k ? T.surface : 'transparent', color: mainTab === opt.k ? T.ink : T.inkLight, fontSize: 12, fontWeight: mainTab === opt.k ? 700 : 400, fontFamily: F.body, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4, boxShadow: mainTab === opt.k ? `0 1px 4px ${T.ink}15` : 'none', transition: 'all .2s' }}>
              <Icon name={opt.icon} size={12} color={mainTab === opt.k ? T.accent : T.inkLight} /> {opt.l}
            </button>
          ))}
        </div>
      </div>

      {/* ── 노트 탭 ── */}
      {mainTab === 'notes' && (
        items.length === 0 ? (
          <div style={{ padding: '40px 22px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, textAlign: 'center' }}>
            <div style={{ width: 72, height: 72, borderRadius: 20, background: T.accentSoft, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="knowledge" size={32} color={T.accent} /></div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 600, color: T.ink, fontFamily: 'serif', marginBottom: 8 }}>{lang === 'ko' ? '아직 기록이 없어요' : 'No entries yet'}</div>
              <div style={{ fontSize: 13, color: T.inkLight, fontFamily: F.body, lineHeight: 1.65, maxWidth: 260 }}>{lang === 'ko' ? '뷰어에서 메모와 하이라이트를 추가하면 여기 쌓입니다.' : "Add notes and highlights in the Reader — they'll collect here."}</div>
            </div>
          </div>
        ) : (
          <>
            <div style={{ padding: '0 22px 10px' }}>
              <ChipRow options={[{ key: 'all', label: lang === 'ko' ? '전체' : 'All' }, { key: 'book', label: lang === 'ko' ? '책별' : 'By Book' }, { key: 'type', label: lang === 'ko' ? '종류별' : 'By Type' }]} value={view} onChange={v => { setView(v); setSelected([]); }} />
            </div>
            {/* 태그 필터 */}
            {allTags.length > 0 && (
              <div style={{ padding: '0 22px 10px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {allTags.map(tg => (
                  <button key={tg} onClick={() => setTagFilter(t => t === tg ? '' : tg)} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 999, border: `1px solid ${tagFilter === tg ? T.accent : T.border}`, background: tagFilter === tg ? T.accent : 'transparent', color: tagFilter === tg ? '#fff' : T.inkMid, cursor: 'pointer', fontFamily: F.body }}>#{tg}</button>
                ))}
              </div>
            )}
            {selected.length > 0 && (
              <div style={{ margin: '0 22px 14px', background: T.ink, borderRadius: 14, padding: '12px 14px', color: T.surface, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ flex: 1, fontSize: 12, fontWeight: 600, fontFamily: F.body, opacity: 0.85 }}>{selected.length}개 선택</span>
                <button onClick={deleteSelected} style={{ padding: '6px 12px', borderRadius: 9, border: 'none', background: '#DC2626', color: '#FFF', fontSize: 12, fontFamily: F.body, fontWeight: 600, cursor: 'pointer' }}>삭제</button>
                <button onClick={() => setSelected([])} style={{ background: 'none', border: 'none', color: T.surface, opacity: 0.6, cursor: 'pointer', display: 'flex' }}><Icon name="close" size={14} /></button>
              </div>
            )}
            <div style={{ padding: '0 22px' }}>
              {view === 'all' && filteredItems.map(renderItem)}
              {view !== 'all' && Object.entries(grouped).map(([groupName, gItems]) => (
                gItems.length === 0 ? null : (
                  <div key={groupName} style={{ marginBottom: 18 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: T.inkMid, fontFamily: F.body, marginBottom: 8, padding: '6px 0', borderBottom: `1px solid ${T.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="library" size={12} color={T.inkLight} /> {groupName}</span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        {view === 'book' && gItems[0]?.bookId && (() => {
                          const bookId = gItems[0].bookId;
                          const book = { id: bookId, title: groupName };
                          const allNotes = getNotes().filter(n => n.bookId === bookId);
                          const allHls = getAllHighlightsByBook(bookId);
                          return (
                            <>
                              <button
                                onClick={(e) => { e.stopPropagation(); printNotesAsPdf(book, allNotes, allHls); }}
                                title={lang === 'ko' ? '이 책의 노트 PDF 출력' : 'Print notes PDF'}
                                style={{ fontSize: 10, padding: '3px 8px', background: 'none', border: `1px solid ${T.border}`, borderRadius: 6, color: T.inkLight, cursor: 'pointer', fontFamily: F.body }}
                              >
                                📄 PDF
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); downloadNotesAsMarkdown(book, allNotes, allHls); }}
                                title={lang === 'ko' ? 'Markdown 다운로드' : 'Download Markdown'}
                                style={{ fontSize: 10, padding: '3px 8px', background: 'none', border: `1px solid ${T.border}`, borderRadius: 6, color: T.inkLight, cursor: 'pointer', fontFamily: F.body }}
                              >
                                .md
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); setReviewBook({ id: bookId, title: groupName, author: books.find(b => b.id === bookId)?.author }); }}
                                title={lang === 'ko' ? '리뷰 카드 만들기' : 'Create review card'}
                                style={{ fontSize: 10, padding: '3px 8px', background: T.accentSoft, border: `1px solid ${T.accent}55`, borderRadius: 6, color: T.accent, cursor: 'pointer', fontFamily: F.body, fontWeight: 600 }}
                              >
                                🎴 {lang === 'ko' ? '리뷰' : 'Review'}
                              </button>
                            </>
                          );
                        })()}
                        <span style={{ fontSize: 10, color: T.inkFaint, fontFamily: F.mono }}>{gItems.length}</span>
                      </span>
                    </div>
                    {gItems.map(renderItem)}
                  </div>
                )
              ))}
            </div>
          </>
        )
      )}

      {/* ── 카드 탭 ── */}
      {mainTab === 'cards' && (
        <div style={{ padding: '0 22px' }}>
          {/* 책 선택 */}
          {books.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: T.inkMid, fontFamily: F.body, marginBottom: 6 }}>{lang === 'ko' ? '책 선택' : 'Select book'}</div>
              <select value={fcBook} onChange={e => setFcBook(e.target.value)} style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: `1px solid ${T.border}`, background: T.surfaceAlt, color: T.ink, fontSize: 13, fontFamily: F.body, outline: 'none' }}>
                <option value="">{lang === 'ko' ? '책을 선택하세요' : 'Select a book'}</option>
                {books.map(b => <option key={b.id} value={b.id}>{b.title}</option>)}
              </select>
            </div>
          )}

          {/* 통계 + 액션 버튼 */}
          {fcBook && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' }}>
              <div style={{ flex: 1, background: T.surface, borderRadius: 12, padding: '10px 14px', border: `1px solid ${T.border}` }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: T.ink, fontFamily: 'serif' }}>{flashcards.length}</div>
                <div style={{ fontSize: 10, color: T.inkLight, fontFamily: F.body }}>{lang === 'ko' ? '전체 카드' : 'Total cards'}</div>
                {flashcards.length > 0 && <div style={{ fontSize: 10, color: T.accent, fontFamily: F.mono, marginTop: 2 }}>{knownCount}/{flashcards.length} {lang === 'ko' ? '완료' : 'known'}</div>}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <button onClick={generateFlashcards} disabled={fcGenerating || !fcBook || (!apiKeys?.claude && !apiKeys?.gemini)} style={{ padding: '8px 14px', borderRadius: 10, border: 'none', background: T.ink, color: T.surface, fontSize: 12, fontWeight: 600, fontFamily: F.body, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5, opacity: fcGenerating ? 0.6 : 1 }}>
                  <Icon name="spark" size={12} color={T.surface} stroke={2} />
                  {fcGenerating ? (lang === 'ko' ? '생성 중…' : 'Generating…') : (lang === 'ko' ? 'AI 생성' : 'AI Generate')}
                </button>
                {flashcards.filter(c => !c.known).length > 0 && (
                  <button onClick={() => setStudying(true)} style={{ padding: '8px 14px', borderRadius: 10, border: `1px solid ${T.accent}`, background: T.accentSoft, color: T.accent, fontSize: 12, fontWeight: 600, fontFamily: F.body, cursor: 'pointer' }}>
                    {lang === 'ko' ? '학습 시작' : 'Study'}
                  </button>
                )}
              </div>
            </div>
          )}

          {fcError && <div style={{ fontSize: 12, color: '#DC2626', fontFamily: F.body, marginBottom: 10, padding: '8px 12px', background: '#FEF2F2', borderRadius: 8 }}>{fcError}</div>}

          {/* 카드 목록 */}
          {flashcards.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: T.inkLight, fontFamily: F.body, fontSize: 13 }}>
              {fcBook ? (lang === 'ko' ? '카드가 없어요. AI 생성 버튼을 눌러보세요.' : 'No cards yet. Try AI Generate.') : (lang === 'ko' ? '책을 선택하세요.' : 'Select a book.')}
            </div>
          ) : (
            flashcards.map(card => (
              <div key={card.id} style={{ background: card.known ? '#F0FDF4' : T.surface, borderRadius: 14, padding: 14, marginBottom: 10, border: `1px solid ${card.known ? '#86EFAC' : T.border}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: T.accent, letterSpacing: 1, marginBottom: 4, fontFamily: F.body }}>Q</div>
                    <div style={{ fontSize: 13, color: T.ink, fontFamily: F.display, lineHeight: 1.55, marginBottom: 8 }}>{card.q}</div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: T.inkMid, letterSpacing: 1, marginBottom: 4, fontFamily: F.body }}>A</div>
                    <div style={{ fontSize: 12.5, color: T.inkMid, fontFamily: F.body, lineHeight: 1.6 }}>{card.a}</div>
                  </div>
                  <button onClick={() => { const cards = deleteFlashcard(fcBook, card.id); setFlashcards(cards); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.inkFaint, padding: 4, flexShrink: 0 }}><Icon name="close" size={14} /></button>
                </div>
                {card.known && <div style={{ fontSize: 10, color: '#16A34A', fontFamily: F.body, marginTop: 8, fontWeight: 600 }}>✓ {lang === 'ko' ? '학습 완료' : 'Known'}</div>}
              </div>
            ))
          )}
        </div>
      )}

      {/* ── 어휘 탭 ── */}
      {mainTab === 'vocab' && (
        <div style={{ padding: '0 22px' }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <div style={{ flex: 1, background: T.surface, borderRadius: 12, padding: '10px 14px', border: `1px solid ${T.border}` }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: T.ink, fontFamily: 'serif' }}>{vocab.length}</div>
              <div style={{ fontSize: 10, color: T.inkLight, fontFamily: F.body }}>{lang === 'ko' ? '수집된 단어' : 'Collected words'}</div>
            </div>
            <button onClick={generateVocab} disabled={vocabGenerating || (!apiKeys?.claude && !apiKeys?.gemini)} style={{ padding: '10px 14px', borderRadius: 12, border: 'none', background: T.ink, color: T.surface, fontSize: 12, fontWeight: 600, fontFamily: F.body, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5, opacity: vocabGenerating ? 0.6 : 1 }}>
              <Icon name="spark" size={12} color={T.surface} stroke={2} />
              {vocabGenerating ? (lang === 'ko' ? '추출 중…' : 'Extracting…') : (lang === 'ko' ? 'AI 어휘 추출' : 'AI Extract')}
            </button>
          </div>

          {vocabError && <div style={{ fontSize: 12, color: '#DC2626', fontFamily: F.body, marginBottom: 10, padding: '8px 12px', background: '#FEF2F2', borderRadius: 8 }}>{vocabError}</div>}

          {vocab.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: T.inkLight, fontFamily: F.body, fontSize: 13 }}>
              {lang === 'ko' ? '아직 수집된 어휘가 없어요. 뷰어에서 책을 읽은 후 AI 어휘 추출을 눌러보세요.' : 'No vocabulary yet. Open a book in Reader, then tap AI Extract.'}
            </div>
          ) : (
            vocab.map(entry => (
              <div key={entry.id} style={{ background: T.surface, borderRadius: 14, padding: 14, marginBottom: 10, border: `1px solid ${T.border}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: T.ink, fontFamily: F.display, marginBottom: 5 }}>{entry.word}</div>
                    <div style={{ fontSize: 13, color: T.inkMid, fontFamily: F.body, lineHeight: 1.6 }}>{entry.definition}</div>
                    {entry.bookTitle && <div style={{ fontSize: 10, color: T.inkFaint, fontFamily: F.body, marginTop: 6, display: 'flex', alignItems: 'center', gap: 3 }}><Icon name="library" size={10} color={T.inkFaint} /> {entry.bookTitle}</div>}
                  </div>
                  <button onClick={() => { const next = deleteVocabularyEntry(entry.id); setVocab(next); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.inkFaint, padding: 4 }}><Icon name="close" size={14} /></button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── 지식 베이스(RAG) 탭 — Vision/스캔으로 만든 벡터 인덱스를 의미 검색 ── */}
      {mainTab === 'kb' && (
        <div style={{ padding: '0 22px' }}>
          {kbBooks.length === 0 ? (
            <div style={{ padding: '40px 4px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, textAlign: 'center' }}>
              <div style={{ width: 64, height: 64, borderRadius: 18, background: T.accentSoft, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="search" size={28} color={T.accent} />
              </div>
              <div>
                <div style={{ fontSize: 17, fontWeight: 600, color: T.ink, fontFamily: F.display, marginBottom: 8 }}>
                  {lang === 'ko' ? '아직 지식 베이스가 없어요' : 'No knowledge base yet'}
                </div>
                <div style={{ fontSize: 13, color: T.inkLight, fontFamily: F.body, lineHeight: 1.65, maxWidth: 280 }}>
                  {lang === 'ko'
                    ? '뷰어에서 책을 전체 스캔(Vision)하면 RAG 인덱스가 만들어지고, 여기서 의미로 검색할 수 있어요.'
                    : 'Full-scan a book (Vision) in the viewer to build a RAG index, then search it here.'}
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* 질문 입력 */}
              <div style={{ background: T.surface, borderRadius: 14, padding: '11px 14px', display: 'flex', alignItems: 'center', gap: 10, border: `1.5px solid ${kbQuery ? T.ink : T.border}`, marginBottom: 12 }}>
                <Icon name="search" size={16} color={T.inkLight} />
                <input
                  value={kbQuery}
                  onChange={e => setKbQuery(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') runKbSearch(); }}
                  placeholder={lang === 'ko' ? '스캔한 책 전체에서 의미로 검색…' : 'Search your scanned books by meaning…'}
                  style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 14, color: T.ink, fontFamily: F.body }}
                />
                <button onClick={runKbSearch} disabled={!kbQuery.trim() || kbLoading} style={{ padding: '6px 12px', borderRadius: 8, border: 'none', background: kbQuery.trim() ? T.accent : T.border, color: '#FFF', fontSize: 12, fontWeight: 600, fontFamily: F.body, cursor: kbQuery.trim() ? 'pointer' : 'default', flexShrink: 0 }}>
                  {kbLoading ? (lang === 'ko' ? '검색 중…' : '…') : (lang === 'ko' ? '검색' : 'Search')}
                </button>
              </div>

              {/* 인덱스된 책 목록 */}
              <div style={{ fontSize: 10, fontWeight: 700, color: T.inkLight, letterSpacing: 1.3, textTransform: 'uppercase', fontFamily: F.body, marginBottom: 8 }}>
                {lang === 'ko' ? `검색 가능한 책 · ${kbBooks.length}` : `Indexed books · ${kbBooks.length}`}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 18 }}>
                {kbBooks.map(b => (
                  <span key={b.bookId} style={{ fontSize: 11.5, color: b.usable ? T.inkMid : T.inkLight, background: T.surfaceAlt, border: `1px solid ${T.border}`, padding: '5px 10px', borderRadius: 999, fontFamily: F.body, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    📖 {kbTitleOf(b.bookId)} <span style={{ fontFamily: F.mono, color: T.inkLight }}>· {b.chunkCount}</span>
                    {!b.usable && <span style={{ fontSize: 9.5, color: T.accentDeep }}>{lang === 'ko' ? '· 키필요' : '· key'}</span>}
                  </span>
                ))}
              </div>

              {/* 검색 결과(관련 구절) */}
              {kbLoading && (
                <div style={{ fontSize: 12.5, color: T.inkLight, fontFamily: F.body, padding: '4px 2px 12px' }}>
                  {lang === 'ko' ? '의미가 가까운 구절을 찾는 중…' : 'Finding related passages…'}
                </div>
              )}
              {!kbLoading && kbSearched && kbHits.length === 0 && (
                <div style={{ fontSize: 13.5, color: T.inkLight, fontFamily: F.body, textAlign: 'center', padding: '28px 0' }}>
                  {lang === 'ko' ? '관련 구절을 찾지 못했어요' : 'No related passages found'}
                </div>
              )}
              {kbHits.length > 0 && (
                <>
                  <div style={{ fontSize: 10, fontWeight: 700, color: T.accent, letterSpacing: 1.3, textTransform: 'uppercase', fontFamily: F.body, marginBottom: 10 }}>
                    {lang === 'ko' ? `관련 구절 · ${kbHits.length}` : `Passages · ${kbHits.length}`}
                  </div>
                  {kbHits.map((h, i) => (
                    <div key={`kb-${h.bookId}-${h.page}-${i}`} style={{ background: T.surface, borderRadius: 12, padding: 13, marginBottom: 8, border: `1px solid ${T.accentSoft}` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: T.inkMid, fontFamily: F.body, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          🔎 {kbTitleOf(h.bookId)} <span style={{ color: T.inkLight, fontFamily: F.mono }}>· p.{h.page}</span>
                        </div>
                        <span style={{ fontSize: 10, fontWeight: 700, color: T.accent, background: T.accentSoft, padding: '2px 7px', borderRadius: 999, fontFamily: F.mono, flexShrink: 0 }}>{Math.round(Math.max(0, h.score) * 100)}%</span>
                      </div>
                      <div style={{ fontSize: 12.5, color: T.inkMid, fontFamily: F.body, lineHeight: 1.55 }}>{h.text.length > 280 ? h.text.slice(0, 280) + '…' : h.text}</div>
                    </div>
                  ))}
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* ── 퀴즈 탭 ── */}
      {mainTab === 'quiz' && (
        !currentBook ? (
          <div style={{ padding: '40px 22px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, textAlign: 'center' }}>
            <div style={{ width: 72, height: 72, borderRadius: 20, background: T.accentSoft, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="help" size={32} color={T.accent} /></div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 600, color: T.ink, fontFamily: 'serif', marginBottom: 8 }}>{lang === 'ko' ? '책을 선택해주세요' : 'Select a book'}</div>
              <div style={{ fontSize: 13, color: T.inkLight, fontFamily: F.body, lineHeight: 1.65, maxWidth: 260 }}>{lang === 'ko' ? '뷰어에서 책을 열고 돌아오세요. 그러면 책 내용으로 퀴즈를 생성할 수 있습니다.' : 'Open a book in Reader to create quizzes based on its content.'}</div>
            </div>
          </div>
        ) : (
          <div style={{ padding: '22px' }}>
            <div style={{ background: T.surface, borderRadius: 16, padding: 18, border: `1px solid ${T.border}`, textAlign: 'center' }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: T.ink, fontFamily: F.body, marginBottom: 12 }}>
                📚 {currentBook.title}
              </div>
              <button
                onClick={() => setShowQuiz(true)}
                style={{
                  width: '100%', padding: '13px', borderRadius: 10, border: 'none',
                  background: T.accent, color: '#fff', fontSize: 14, fontWeight: 600,
                  cursor: 'pointer', fontFamily: F.body,
                }}
              >
                🎯 {lang === 'ko' ? '퀴즈 생성하기' : 'Generate Quiz'}
              </button>
            </div>
          </div>
        )
      )}

      {reviewBook && (
        <ReviewCardModal
          book={reviewBook}
          lang={lang}
          apiKeys={apiKeys}
          onClose={() => setReviewBook(null)}
        />
      )}

      {showQuiz && currentBook && (
        <QuizModal
          book={currentBook}
          pageTexts={currentBook?.id ? [getDocumentText(currentBook.id) || ''] : []}
          lang={lang}
          apiKeys={apiKeys}
          onClose={() => setShowQuiz(false)}
        />
      )}
    </div>
  );
}
