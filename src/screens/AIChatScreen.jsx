import { useState, useEffect, useRef } from 'react';
import { i18n } from '../data.js';
import { useTheme } from '../context.jsx';
import { Icon, ScreenHeader } from '../components.jsx';
import { getBookMeta, getBookIndex, getNotes, getAllHighlightsByBook, getAiChat, saveAiChat, getWikiConfig, getWikiIndex } from '../store.js';
import { BookCompare } from '../components/BookCompare.jsx';
import { MonthlyRetro } from '../components/MonthlyRetro.jsx';
import { buildMetaContext } from '../scanBook.js';
import { getPageText, getDocumentText, getPageImage } from '../pageTextCache.js';
import { ensureBookText } from '../utils/ensureBookText.js';
import { queryBookIndex, formatRagContext } from '../utils/ragIndex.js';
import { semanticSearchAll, formatLibraryContext } from '../utils/ragSearch.js';
import { formatWikiContext } from '../utils/wikiSearch.js';
import { searchWiki } from '../utils/wikiVector.js';
import { showError } from '../utils/toast.js';

async function callClaude(apiKey, systemPrompt, history, userMsg, pageImageBase64 = null) {
  const histMsgs = history.map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content }));
  const userContent = pageImageBase64
    ? [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: pageImageBase64 } }, { type: 'text', text: userMsg }]
    : userMsg;
  const messages = [...histMsgs, { role: 'user', content: userContent }];
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 1024, system: systemPrompt, messages }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `HTTP ${res.status}`);
  }
  const data = await res.json();
  return data.content?.[0]?.text || '';
}

async function callGemini(apiKey, systemPrompt, history, userMsg, pageImageBase64 = null) {
  const histContents = history.map(m => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.content }] }));
  const userParts = pageImageBase64
    ? [{ inline_data: { mime_type: 'image/jpeg', data: pageImageBase64 } }, { text: userMsg }]
    : [{ text: userMsg }];
  const contents = [...histContents, { role: 'user', parts: userParts }];
  const res = await fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents,
        systemInstruction: { parts: [{ text: systemPrompt }] },
        generationConfig: { maxOutputTokens: 1024 },
      }),
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `HTTP ${res.status}`);
  }
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

function buildSystemPrompt(mode, book, notes, highlights, lang, hasPageImage = false) {
  const bookMeta = book?.id ? getBookMeta(book.id) : null;
  const bookName = bookMeta?.aiTitle || book?.title || '';
  const metaCtx  = buildMetaContext(bookMeta, lang);
  const noteContext = [...highlights.slice(0, 5).map(h => `[하이라이트] ${h.text}`), ...notes.slice(0, 5).map(n => `[메모] ${n.text}`)].join('\n');
  const noteCtx = noteContext ? (lang === 'ko' ? `\n\n[사용자 독서 메모]\n${noteContext}` : `\n\n[User Reading Notes]\n${noteContext}`) : '';

  const doc = book?.id ? getDocumentText(book.id) : null;
  const currentPage = book?.id ? getPageText(book.id) : null;
  const pageCtx = doc
    ? (lang === 'ko'
      ? `\n\n[문서 내용 — ${doc.firstPage}~${doc.lastPage}p, 총 ${doc.pageCount}페이지 추출]\n${doc.text}`
      : `\n\n[Document Content — p.${doc.firstPage}–${doc.lastPage}, ${doc.pageCount} pages extracted]\n${doc.text}`)
    : (currentPage?.text
      ? (lang === 'ko'
        ? `\n\n[현재 열린 페이지 — ${currentPage.pageNum}p]\n${currentPage.text}`
        : `\n\n[Currently Viewed Page — p.${currentPage.pageNum}]\n${currentPage.text}`)
      : '');

  const imageCtx = hasPageImage && !doc && !currentPage?.text
    ? (lang === 'ko'
      ? '\n\n[이미지 인식 모드] 현재 열린 페이지의 이미지가 첨부됩니다. 이미지를 직접 분석하여 답변하세요. 텍스트 추출이 불가능한 스캔 PDF입니다.'
      : '\n\n[Image Recognition Mode] An image of the current page is attached. Analyze the image directly. This is a scanned PDF without extractable text.')
    : '';

  const ctx = metaCtx + pageCtx + imageCtx + noteCtx;

  const noAccessKo = `아래 제공된 문서 텍스트 또는 이미지, 메타데이터, 사용자 메모를 바탕으로 답변하세요.`;
  const noAccessEn = `Answer based on the document text or image, metadata, and user notes provided below.`;

  if (mode === 'socratic') {
    return lang === 'ko'
      ? `당신은 소크라테스식 독서 토론 파트너입니다. 사용자가 《${bookName}》을 읽고 있습니다.\n${noAccessKo}${ctx}\n\n직접 답변하기보다 깊은 사고를 유도하는 질문을 던지세요. 반드시 한국어로 답변하세요.`
      : `You are a Socratic discussion partner. The user is reading 《${bookName}》.\n${noAccessEn}${ctx}\n\nAsk thought-provoking questions rather than giving direct answers.`;
  }
  if (mode === 'context') {
    return lang === 'ko'
      ? `당신은 《${bookName}》 독서 도우미입니다.\n${noAccessKo}${ctx}\n\n책의 맥락과 주제에 초점을 맞춰 구체적으로 답변하세요. 반드시 한국어로 답변하세요.`
      : `You are a reading assistant for 《${bookName}》.\n${noAccessEn}${ctx}\n\nFrame your answers in the context of the book's themes and concepts.`;
  }
  return lang === 'ko'
    ? `당신은 《${bookName}》 독서 도우미입니다.\n${noAccessKo}${ctx}\n\n명확하고 간결하게 답변하세요. 반드시 한국어로 답변하세요.`
    : `You are a reading assistant for 《${bookName}》.\n${noAccessEn}${ctx}\n\nAnswer clearly and concisely.`;
}

// Exported for unit testing only
export { callClaude as _callClaude, callGemini as _callGemini, buildSystemPrompt as _buildSystemPrompt };

export function AIChatScreen({ lang, apiKeys, currentBook, onOpenBook, setScreen }) {
  const { T, F } = useTheme();
  const t = i18n[lang];
  const [tab, setTab] = useState('chat'); // 'chat' | 'compare'
  const [mode, setMode] = useState('quick');
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [notes, setNotes] = useState([]);
  const [highlights, setHighlights] = useState([]);
  const [libraryWide, setLibraryWide] = useState(false); // 서재 전체(RAG 통합 DB) 참고 여부
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  const hasKey = !!(apiKeys?.claude || apiKeys?.gemini);
  const aiLabel = apiKeys?.claude ? 'Claude' : apiKeys?.gemini ? 'Gemini' : (lang === 'ko' ? 'AI 미연결' : 'No AI');

  // Restore or reset conversation when book changes
  useEffect(() => {
    if (!currentBook) { setMessages([]); return; }
    const bookNotes = getNotes().filter(n => n.bookId === currentBook.id);
    const bookHighlights = getAllHighlightsByBook(currentBook.id);
    setNotes(bookNotes);
    setHighlights(bookHighlights);
    const greeting = lang === 'ko'
      ? `《${currentBook.title}》에 대해 무엇이든 질문하세요.${bookNotes.length + bookHighlights.length > 0 ? ` 저장된 메모 ${bookNotes.length + bookHighlights.length}개를 참고할 수 있어요.` : ''}`
      : `Ask me anything about 《${currentBook.title}》.${bookNotes.length + bookHighlights.length > 0 ? ` I can reference your ${bookNotes.length + bookHighlights.length} saved notes.` : ''}`;
    const greetingMsg = { role: 'ai', content: greeting };
    const saved = getAiChat(currentBook.id);
    setMessages(saved?.length ? [greetingMsg, ...saved] : [greetingMsg]);
    setMode('quick');
  }, [currentBook?.id, lang]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading]);

  const suggested = currentBook
    ? (lang === 'ko'
      ? [`《${currentBook.title}》 핵심 요약`, '저자의 핵심 주장은?', '이 책의 실용적 교훈은?', '비판적 시각으로 보면?']
      : [`Summarize 《${currentBook.title}》`, "Author's main argument?", 'Practical takeaways?', 'Critique this book'])
    : [];

  const send = async (text) => {
    const txt = (text || input).trim();
    if (!txt || loading || !currentBook) return;
    const history = messages.slice(1).map(m => ({ role: m.role, content: m.content }));
    const newMessages = [...messages, { role: 'user', content: txt }];
    setMessages(newMessages);
    setInput('');
    setLoading(true);
    try {
      // 업로드된 책 기반 답변 보장 — 텍스트 캐시가 비었으면 캐시 PDF에서 추출
      if (!getDocumentText(currentBook.id)) {
        await ensureBookText(currentBook);
      }
      // Use captured image when page has no extractable text (scanned PDF)
      const cachedImg = getPageImage(currentBook.id);
      const docText = getDocumentText(currentBook.id);
      const pageImg = cachedImg && !docText ? cachedImg.base64 : null;
      // RAG: 질문과 가장 관련 있는 구절을 벡터 인덱스에서 검색해 프롬프트에 추가 (인덱스 없으면 조용히 스킵)
      let ragCtx = '';
      try {
        const hits = await queryBookIndex(currentBook.id, txt, { geminiKey: apiKeys?.gemini, topK: 5 });
        ragCtx = formatRagContext(hits, lang);
      } catch { /* RAG 조회 실패는 무시 — 기존 문서 컨텍스트로 계속 진행 */ }
      // 서재 전체 참고(켜짐): 지금까지 스캔·인덱싱한 다른 책들의 RAG DB도 가로질러 검색.
      // 읽은 책이 쌓일수록 이전 책의 관련 구절이 답변에 함께 활용된다.
      if (libraryWide) {
        try {
          const otherHits = await semanticSearchAll(txt, {
            geminiKey: apiKeys?.gemini, total: 5,
            bookIds: getBookIndex().map(b => b.id).filter(id => id !== currentBook.id),
          });
          const titleOf = (id) => getBookIndex().find(b => b.id === id)?.title || id;
          ragCtx += formatLibraryContext(otherHits, titleOf, lang);
        } catch { /* 서재 전체 검색 실패는 무시 — 현재 책 컨텍스트로 계속 진행 */ }
      }
      // cw_wiki 연동 시: 사용자가 직접 쓴 위키에서 질문 관련 노트를 찾아 컨텍스트에 추가
      // (시맨틱 검색 우선, 벡터 없으면 토큰 검색 폴백)
      try {
        if (getWikiConfig().connected) {
          ragCtx += formatWikiContext(await searchWiki(txt, getWikiIndex(), { geminiKey: apiKeys?.gemini }), lang);
        }
      } catch { /* 위키 검색 실패는 무시 */ }
      const systemPrompt = buildSystemPrompt(mode, currentBook, notes, highlights, lang, !!pageImg) + ragCtx;
      let reply;
      if (apiKeys?.claude) reply = await callClaude(apiKeys.claude, systemPrompt, history, txt, pageImg);
      else if (apiKeys?.gemini) reply = await callGemini(apiKeys.gemini, systemPrompt, history, txt, pageImg);
      else reply = lang === 'ko' ? 'AI 키가 연결되지 않았습니다. 설정에서 API 키를 추가하세요.' : 'No AI key. Add an API key in settings.';
      setMessages(prev => {
        const next = [...prev, { role: 'ai', content: reply }];
        saveAiChat(currentBook.id, next);
        return next;
      });
    } catch (e) {
      setMessages(prev => [...prev, { role: 'ai', content: lang === 'ko' ? `오류: ${e.message}` : `Error: ${e.message}` }]);
      showError(
        lang === 'ko' ? `AI 응답 실패: ${e.message}` : `AI request failed: ${e.message}`,
        () => send(txt), // 재시도
        lang === 'ko' ? '재시도' : 'Retry'
      );
    } finally {
      setLoading(false);
    }
  };

  const modes = [
    { k: 'quick',    icon: 'lightning', label: lang === 'ko' ? '빠른 답변' : 'Quick' },
    { k: 'context',  icon: 'link',      label: lang === 'ko' ? '맥락 분석' : 'Context' },
    { k: 'socratic', icon: 'column',    label: lang === 'ko' ? '소크라테스' : 'Socratic' },
  ];

  const meta = currentBook ? getBookMeta(currentBook.id) : {};

  /* ── No book selected ── */
  if (!currentBook) {
    return (
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column' }}>
        <ScreenHeader subtitle={lang === 'ko' ? 'AI 독서 도우미' : 'AI Reading Assistant'} title={t.aiChat} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 32, textAlign: 'center' }}>
          <div style={{ width: 72, height: 72, borderRadius: 20, background: T.accentSoft, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="spark" size={32} color={T.accent} />
          </div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 600, color: T.ink, fontFamily: F.display, marginBottom: 8 }}>
              {lang === 'ko' ? '읽고 있는 책을 먼저 선택하세요' : 'Select a book to start'}
            </div>
            <div style={{ fontSize: 13, color: T.inkLight, fontFamily: F.body, lineHeight: 1.65, maxWidth: 260 }}>
              {lang === 'ko' ? '서재에서 책을 열면 AI와 그 책에 대해 대화할 수 있어요.' : 'Open a book from your library to chat with AI about it.'}
            </div>
          </div>
          <button onClick={() => setScreen && setScreen('library')} style={{ padding: '12px 24px', borderRadius: 12, border: 'none', background: T.accent, color: '#FFF', fontSize: 14, fontWeight: 600, fontFamily: F.body, cursor: 'pointer' }}>
            {lang === 'ko' ? '서재로 이동' : 'Go to Library'}
          </button>
        </div>
      </div>
    );
  }

  /* ── No API key ── */
  if (!hasKey) {
    return (
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column' }}>
        <ScreenHeader subtitle={lang === 'ko' ? 'AI 미연결' : 'AI not connected'} title={t.aiChat} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 32, textAlign: 'center' }}>
          <div style={{ width: 72, height: 72, borderRadius: 20, background: T.accentSoft, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="settings" size={32} color={T.accent} />
          </div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 600, color: T.ink, fontFamily: F.display, marginBottom: 8 }}>
              {lang === 'ko' ? 'AI 키를 연결해주세요' : 'Connect an AI key'}
            </div>
            <div style={{ fontSize: 13, color: T.inkLight, fontFamily: F.body, lineHeight: 1.65, maxWidth: 280 }}>
              {lang === 'ko'
                ? '설정(⚙)에서 Claude 또는 Gemini API 키를 추가하면 AI 대화를 시작할 수 있어요.'
                : 'Add a Claude or Gemini API key in Settings (⚙) to start chatting with AI.'}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ padding: '10px 22px 0', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: T.inkLight, letterSpacing: 1.1, textTransform: 'uppercase', fontFamily: F.body }}>
              {t.aiChat}
            </div>
            <div style={{ fontSize: 20, fontWeight: 600, color: T.ink, fontFamily: F.display, letterSpacing: -0.4, lineHeight: 1.2 }}>
              {lang === 'ko' ? 'AI 도우미' : 'AI Assistant'}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ fontSize: 10, fontWeight: 700, background: T.secondary, color: '#FFF', padding: '3px 9px', borderRadius: 999, fontFamily: F.body }}>
              LIVE · {aiLabel}
            </div>
            <button onClick={() => { if (currentBook) { const g = lang === 'ko' ? `《${currentBook.title}》에 대해 무엇이든 질문하세요.` : `Ask me anything about 《${currentBook.title}》.`; setMessages([{ role: 'ai', content: g }]); saveAiChat(currentBook.id, []); } }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, color: T.inkLight }}>
              <Icon name="close" size={14} color={T.inkLight} />
            </button>
          </div>
        </div>
      </div>

      {/* Book context strip */}
      <div style={{ margin: '0 22px 10px', background: T.accentSoft, borderRadius: 12, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10, border: `1px solid ${T.accent}22`, flexShrink: 0 }}>
        <div style={{ width: 32, height: 40, borderRadius: 6, background: T.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon name="library" size={16} color="#FFF" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: T.accentDeep, letterSpacing: 0.8, textTransform: 'uppercase', fontFamily: F.body, marginBottom: 1 }}>
            {lang === 'ko' ? '현재 책' : 'Current book'}
            {notes.length + highlights.length > 0 && (
              <span style={{ marginLeft: 6, fontWeight: 400, color: T.accent }}>
                · {lang === 'ko' ? `메모 ${notes.length + highlights.length}개` : `${notes.length + highlights.length} notes`}
              </span>
            )}
          </div>
          <div style={{ fontSize: 12.5, color: T.ink, fontFamily: F.display, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {currentBook.title}
            {meta.lastPage > 0 && <span style={{ color: T.inkLight, fontWeight: 400 }}> · p.{meta.lastPage}</span>}
          </div>
          {(() => {
            const doc = getDocumentText(currentBook.id);
            const img = getPageImage(currentBook.id);
            if (doc) return <div style={{ fontSize: 9.5, color: T.accent, fontWeight: 600, fontFamily: F.body, marginTop: 2 }}>{lang === 'ko' ? `${doc.firstPage}~${doc.lastPage}p 텍스트 참조 중` : `Text: p.${doc.firstPage}–${doc.lastPage}`}</div>;
            if (img && !doc) return <div style={{ fontSize: 9.5, color: '#E65100', fontWeight: 600, fontFamily: F.body, marginTop: 2 }}>{lang === 'ko' ? `p.${img.pageNum} 이미지 인식 모드` : `p.${img.pageNum} image vision`}</div>;
            return null;
          })()}
        </div>
      </div>

      {/* 메인 탭: 채팅 / 책 비교 / 종합 회고 */}
      <div style={{ padding: '0 22px 10px', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 4, background: T.surfaceAlt, padding: 3, borderRadius: 12, border: `1px solid ${T.border}`, marginBottom: 8 }}>
          {[
            { k: 'chat',    label: lang === 'ko' ? '💬 AI 채팅' : '💬 AI Chat' },
            { k: 'compare', label: lang === 'ko' ? '📊 책 비교' : '📊 Compare' },
            { k: 'retro',   label: lang === 'ko' ? '📚 종합 회고' : '📚 Retro' },
          ].map(t2 => (
            <button key={t2.k} onClick={() => setTab(t2.k)} style={{ flex: 1, padding: '8px 4px', borderRadius: 9, border: 'none', cursor: 'pointer', background: tab === t2.k ? T.surface : 'transparent', color: tab === t2.k ? T.ink : T.inkLight, fontSize: 12, fontWeight: tab === t2.k ? 600 : 400, fontFamily: F.body, transition: 'all .15s' }}>{t2.label}</button>
          ))}
        </div>

        {tab === 'chat' && (
          <div style={{ display: 'flex', gap: 4, background: T.surfaceAlt, padding: 3, borderRadius: 12, border: `1px solid ${T.border}` }}>
            {modes.map(m => {
              const active = mode === m.k;
              return (
                <button key={m.k} onClick={() => setMode(m.k)} style={{ flex: 1, padding: '8px 4px', borderRadius: 9, border: 'none', cursor: 'pointer', background: active ? T.surface : 'transparent', color: active ? T.ink : T.inkLight, fontSize: 11.5, fontWeight: active ? 600 : 500, fontFamily: F.body, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5, boxShadow: active ? `0 1px 4px ${T.ink}15` : 'none', transition: 'all .2s' }}>
                  <Icon name={m.icon} size={12} color={active ? T.accent : T.inkLight} />{m.label}
                </button>
              );
            })}
          </div>
        )}

        {tab === 'chat' && (
          <button
            onClick={() => setLibraryWide(v => !v)}
            title={lang === 'ko' ? '스캔·인덱싱한 다른 책의 관련 구절도 답변에 참고합니다' : "Also reference related excerpts from your other scanned books"}
            style={{
              marginTop: 8, width: '100%', padding: '8px 10px', borderRadius: 10,
              border: `1px solid ${libraryWide ? T.accent + '55' : T.border}`,
              background: libraryWide ? T.accentSoft : 'transparent',
              color: libraryWide ? T.accentDeep : T.inkLight,
              fontSize: 11.5, fontFamily: F.body, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            <span>🧠</span>
            <span style={{ fontWeight: libraryWide ? 700 : 500 }}>
              {lang === 'ko' ? '서재 전체 참고' : 'Reference whole library'}
            </span>
            <span style={{ fontSize: 10, opacity: 0.75 }}>{libraryWide ? (lang === 'ko' ? '켜짐' : 'ON') : (lang === 'ko' ? '꺼짐' : 'OFF')}</span>
          </button>
        )}
      </div>

      {/* 책 비교 탭 */}
      {tab === 'compare' && (
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <BookCompare
            lang={lang}
            apiKeys={apiKeys}
            currentBook={currentBook}
            callAI={async (sys, history, msg) => {
              if (apiKeys?.claude) return callClaude(apiKeys.claude, sys, history, msg);
              if (apiKeys?.gemini) return callGemini(apiKeys.gemini, sys, history, msg);
              throw new Error('no-key');
            }}
          />
        </div>
      )}

      {/* 종합 회고 탭 — 최근 읽은 여러 책을 가로질러 AI가 분석 */}
      {tab === 'retro' && (
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <MonthlyRetro lang={lang} apiKeys={apiKeys} />
        </div>
      )}

      {/* Messages (채팅 탭에서만) */}
      {tab === 'chat' && <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '8px 22px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {messages.map((m, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
            <div style={{
              maxWidth: '84%', padding: '11px 14px',
              borderRadius: m.role === 'user' ? '16px 16px 4px 16px' : '4px 16px 16px 16px',
              background: m.role === 'user' ? T.ink : T.surface,
              color: m.role === 'user' ? T.surface : T.ink,
              border: m.role === 'user' ? 'none' : `1px solid ${T.border}`,
              fontSize: 14, lineHeight: 1.65, fontFamily: F.body, whiteSpace: 'pre-wrap',
            }}>
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div style={{ padding: '12px 16px', borderRadius: '4px 16px 16px 16px', background: T.surface, border: `1px solid ${T.border}`, display: 'flex', gap: 5, alignItems: 'center' }}>
              {[0, 1, 2].map(i => <div key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: T.inkFaint, animation: `pulse 1.2s ${i * 0.2}s infinite` }} />)}
            </div>
          </div>
        )}
        {messages.length === 1 && !loading && suggested.length > 0 && (
          <div style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {suggested.map((q, i) => (
              <button key={i} onClick={() => send(q)} style={{ padding: '8px 13px', borderRadius: 999, border: `1px solid ${T.border}`, background: T.surface, color: T.ink, fontSize: 12.5, fontFamily: F.body, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                {q}
              </button>
            ))}
          </div>
        )}
      </div>}

      {/* Input bar (채팅 탭에서만) */}
      {tab === 'chat' && <div style={{ padding: '10px 22px 12px', borderTop: `1px solid ${T.border}`, background: T.surfaceAlt, flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <div style={{ flex: 1, background: T.surface, borderRadius: 14, padding: '10px 14px', border: `1.5px solid ${input ? T.ink : T.border}`, transition: 'border .15s' }}>
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
              placeholder={lang === 'ko' ? '질문을 입력하세요…' : 'Ask a question…'}
              disabled={loading}
              style={{ width: '100%', border: 'none', outline: 'none', background: 'transparent', fontSize: 14, color: T.ink, fontFamily: F.body }}
            />
          </div>
          <button
            onClick={() => send()}
            disabled={!input.trim() || loading}
            style={{ width: 42, height: 42, borderRadius: 999, border: 'none', flexShrink: 0, background: input.trim() && !loading ? T.accent : T.border, color: '#FFF', cursor: input.trim() && !loading ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background .2s' }}
          >
            <Icon name="send" size={16} color="#FFF" stroke={2} />
          </button>
        </div>
      </div>}
      <style>{`@keyframes pulse { 0%,100%{opacity:.3;transform:scale(.9)} 50%{opacity:1;transform:scale(1)} }`}</style>
    </div>
  );
}
