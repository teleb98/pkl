import { useState, useRef, useEffect } from 'react';
import { useTheme } from '../context.jsx';
import { Icon } from '../components.jsx';
import { getBookIndex, getBookMeta, getNotes, getHighlights } from '../store.js';
import { getDocumentText } from '../pageTextCache.js';

/* ── 책 비교 분석 패널 ────────────────────────────────────────
   callAI prop: (systemPrompt, history, userMsg) => string
   ─────────────────────────────────────────────────────────── */
export function BookCompare({ lang, callAI, apiKeys, currentBook }) {
  const { T, F } = useTheme();
  const [bookA, setBookA] = useState(currentBook || null);
  const [bookB, setBookB] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [aspect, setAspect] = useState('all'); // 'all' | 'themes' | 'contrast' | 'recommend'
  const scrollRef = useRef(null);
  const books = getBookIndex();

  // 현재 책 바뀌면 A 갱신
  useEffect(() => {
    if (currentBook) setBookA(currentBook);
  }, [currentBook?.id]); // eslint-disable-line

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [result]);

  const buildContext = (book) => {
    if (!book) return '';
    const meta = getBookMeta(book.id);
    const notes = getNotes().filter(n => n.bookId === book.id);
    const highlights = getHighlights().filter(h => h.bookId === book.id);
    const doc = getDocumentText(book.id);
    const textSnippet = doc?.text ? doc.text.slice(0, 2000) : '';

    const parts = [`《${book.title}》`];
    if (meta.aiAuthor || book.author) parts.push(`저자: ${meta.aiAuthor || book.author}`);
    if (meta.aiSummary) parts.push(`요약: ${meta.aiSummary}`);
    if (meta.aiTopics?.length) parts.push(`주제: ${meta.aiTopics.join(', ')}`);
    if (notes.length) parts.push(`내 메모 ${notes.length}개: ${notes.slice(0, 3).map(n => n.text).join(' / ')}`);
    if (highlights.length) parts.push(`하이라이트 ${highlights.length}개: ${highlights.slice(0, 3).map(h => h.text).join(' / ')}`);
    if (textSnippet) parts.push(`본문 발췌:\n${textSnippet}`);
    return parts.join('\n');
  };

  const aspectLabel = {
    all:       lang === 'ko' ? '종합 비교' : 'Full Comparison',
    themes:    lang === 'ko' ? '공통 주제' : 'Common Themes',
    contrast:  lang === 'ko' ? '상반된 관점' : 'Contrasting Views',
    recommend: lang === 'ko' ? '독서 추천 순서' : 'Reading Order',
  };

  const aspectPrompt = {
    all: lang === 'ko'
      ? '두 책을 종합적으로 비교해주세요. 공통 주제, 상반된 관점, 시너지 포인트, 독서 추천 순서를 포함하세요.'
      : 'Compare these two books comprehensively: common themes, contrasting views, synergies, and recommended reading order.',
    themes: lang === 'ko'
      ? '두 책의 공통 주제와 핵심 개념을 비교 분석해주세요.'
      : 'Analyze the common themes and key concepts shared by both books.',
    contrast: lang === 'ko'
      ? '두 책에서 상반되거나 긴장 관계에 있는 관점, 주장, 시각을 비교해주세요.'
      : 'Compare the contrasting viewpoints, arguments, and perspectives between the two books.',
    recommend: lang === 'ko'
      ? '두 책 중 어떤 책을 먼저 읽는 것이 좋을지, 그 이유와 함께 설명해주세요.'
      : 'Which book should be read first and why? Explain the recommended reading order.',
  };

  const compare = async () => {
    if (!bookA || !bookB) return;
    if (!apiKeys?.claude && !apiKeys?.gemini) {
      setError(lang === 'ko' ? 'AI 키를 설정해주세요.' : 'Set an AI key first.');
      return;
    }
    setLoading(true);
    setResult(null);
    setError('');
    try {
      const ctxA = buildContext(bookA);
      const ctxB = buildContext(bookB);
      const sys = lang === 'ko'
        ? '당신은 독서 전문가입니다. 두 책을 깊이 있게 비교 분석하고, 마크다운 형식으로 구조화해서 답변하세요.'
        : 'You are a literary expert. Compare the two books in depth and structure your response in markdown.';
      const userMsg = `${aspectPrompt[aspect]}\n\n## 책 A\n${ctxA}\n\n## 책 B\n${ctxB}`;
      const reply = await callAI(sys, [], userMsg);
      setResult(reply);
    } catch (e) {
      setError(lang === 'ko' ? `오류: ${e.message}` : `Error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const BookPicker = ({ label, value, onChange }) => (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: T.inkLight, letterSpacing: 1, textTransform: 'uppercase', fontFamily: F.body, marginBottom: 6 }}>{label}</div>
      <select
        value={value?.id || ''}
        onChange={e => {
          const found = books.find(b => b.id === e.target.value) ||
            (currentBook?.id === e.target.value ? currentBook : null);
          onChange(found || null);
        }}
        style={{
          width: '100%', padding: '8px 10px', borderRadius: 8,
          border: `1.5px solid ${value ? T.accent : T.border}`,
          background: T.surface, color: value ? T.ink : T.inkLight,
          fontSize: 13, fontFamily: F.body, outline: 'none',
          cursor: 'pointer',
        }}
      >
        <option value="">{lang === 'ko' ? '책 선택…' : 'Select book…'}</option>
        {currentBook && <option value={currentBook.id}>{currentBook.title}</option>}
        {books.filter(b => b.id !== currentBook?.id).map(b => (
          <option key={b.id} value={b.id}>{b.title}</option>
        ))}
      </select>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* 설정 패널 */}
      <div style={{ padding: '16px 18px', borderBottom: `1px solid ${T.border}`, background: T.surfaceAlt, flexShrink: 0 }}>
        {/* 책 선택 */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
          <BookPicker label={lang === 'ko' ? '책 A' : 'Book A'} value={bookA} onChange={setBookA} />
          <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 8, color: T.inkMid, fontSize: 18, flexShrink: 0 }}>⇄</div>
          <BookPicker label={lang === 'ko' ? '책 B' : 'Book B'} value={bookB} onChange={setBookB} />
        </div>

        {/* 비교 관점 선택 */}
        <div style={{ display: 'flex', gap: 5, marginBottom: 12, flexWrap: 'wrap' }}>
          {Object.entries(aspectLabel).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setAspect(k)}
              style={{
                padding: '5px 10px', borderRadius: 20, border: 'none',
                background: aspect === k ? T.ink : T.surface,
                color: aspect === k ? T.surface : T.inkMid,
                fontSize: 12, fontWeight: aspect === k ? 600 : 400,
                fontFamily: F.body, cursor: 'pointer',
                border: `1px solid ${aspect === k ? T.ink : T.border}`,
              }}
            >{label}</button>
          ))}
        </div>

        <button
          onClick={compare}
          disabled={!bookA || !bookB || bookA.id === bookB?.id || loading}
          style={{
            width: '100%', padding: '10px', borderRadius: 10, border: 'none',
            background: (!bookA || !bookB || bookA.id === bookB?.id) ? T.border : T.accent,
            color: '#fff', fontSize: 13, fontWeight: 600, fontFamily: F.body,
            cursor: (!bookA || !bookB || bookA.id === bookB?.id || loading) ? 'default' : 'pointer',
            opacity: loading ? 0.7 : 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
          }}
        >
          <Icon name="spark" size={14} color="#fff" />
          {loading
            ? (lang === 'ko' ? '비교 분석 중…' : 'Comparing…')
            : bookA?.id === bookB?.id
            ? (lang === 'ko' ? '서로 다른 책을 선택하세요' : 'Select different books')
            : (lang === 'ko' ? `${aspectLabel[aspect]} 시작` : `Start ${aspectLabel[aspect]}`)}
        </button>

        {error && (
          <div style={{ marginTop: 8, fontSize: 12, color: '#d32f2f', fontFamily: F.body }}>⚠️ {error}</div>
        )}
      </div>

      {/* 결과 */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '18px 20px' }}>
        {!result && !loading && (
          <div style={{ textAlign: 'center', color: T.inkLight, fontFamily: F.body, fontSize: 13, padding: '48px 0' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>📖↔️📗</div>
            <div style={{ fontWeight: 600, marginBottom: 6, color: T.inkMid }}>
              {lang === 'ko' ? '두 책을 선택하고 비교하세요' : 'Select two books to compare'}
            </div>
            <div style={{ fontSize: 12, lineHeight: 1.7 }}>
              {lang === 'ko'
                ? '공통 주제, 상반된 관점, 시너지를 AI가 분석합니다'
                : 'AI analyzes common themes, contrasts, and synergies'}
            </div>
          </div>
        )}

        {loading && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: '48px 0', color: T.inkMid, fontFamily: F.body }}>
            <div style={{ display: 'flex', gap: 6 }}>
              {[0,1,2].map(i => (
                <div key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: T.accent, animation: `pulse 1.2s ${i*0.2}s infinite` }} />
              ))}
            </div>
            <style>{`@keyframes pulse{0%,100%{opacity:.3;transform:scale(.9)}50%{opacity:1;transform:scale(1)}}`}</style>
            <div style={{ fontSize: 13 }}>
              {lang === 'ko' ? `《${bookA?.title}》 ↔ 《${bookB?.title}》 비교 분석 중…` : `Comparing 《${bookA?.title}》 ↔ 《${bookB?.title}》…`}
            </div>
          </div>
        )}

        {result && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, paddingBottom: 12, borderBottom: `1px solid ${T.border}` }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.ink, fontFamily: F.body }}>
                {lang === 'ko' ? `📊 ${aspectLabel[aspect]} 결과` : `📊 ${aspectLabel[aspect]} Result`}
              </div>
              <div style={{ fontSize: 11, color: T.inkLight, fontFamily: F.body }}>
                《{bookA?.title}》 ↔ 《{bookB?.title}》
              </div>
            </div>
            <div style={{ fontSize: 13.5, color: T.ink, fontFamily: F.body, lineHeight: 1.8, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {result}
            </div>
            <button
              onClick={() => setResult(null)}
              style={{ marginTop: 20, padding: '8px 16px', borderRadius: 8, border: `1px solid ${T.border}`, background: 'transparent', color: T.inkMid, fontSize: 12, fontFamily: F.body, cursor: 'pointer' }}
            >
              {lang === 'ko' ? '다시 비교하기' : 'Compare again'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
