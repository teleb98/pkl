import { useState, useMemo, useEffect } from 'react';
import { i18n } from '../data.js';
import { useTheme } from '../context.jsx';
import { Icon, ChipRow, ScreenHeader } from '../components.jsx';
import { getNotes, getHighlights, getSearchHistory, pushSearchHistory, getBookIndex, getBookMeta } from '../store.js';
import { searchAllText } from '../pageTextCache.js';
import { getLocalBooks } from '../utils/localBooks.js';

function fmtDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
}

const HIGHLIGHT_COLORS = { yellow: '#FFF3B0', green: '#D4EDDA', blue: '#D1ECF1', red: '#F8D7DA' };

export function SearchScreen({ lang, onOpenBook }) {
  const { T, F } = useTheme();
  const t = i18n[lang];
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [history, setHistory] = useState([]);
  const [allNotes, setAllNotes] = useState([]);
  const [allHighlights, setAllHighlights] = useState([]);
  const [allBooks, setAllBooks] = useState([]);

  useEffect(() => {
    setHistory(getSearchHistory());
    setAllNotes(getNotes());
    setAllHighlights(getHighlights());
    const index = getBookIndex();
    setAllBooks(index.map(b => ({ ...b, ...getBookMeta(b.id) })));
  }, []);

  const filterOpts = [
    { key: 'all', label: lang === 'ko' ? '전체' : 'All' },
    { key: 'book', label: lang === 'ko' ? '책' : 'Books' },
    { key: 'text', label: lang === 'ko' ? '본문' : 'In-text' },
    { key: 'highlight', label: lang === 'ko' ? '하이라이트' : 'Highlights' },
    { key: 'note', label: lang === 'ko' ? '메모' : 'Notes' },
  ];

  // 전문(본문) 검색 — 추출된 책 텍스트에서 query 매칭 (뷰어/AI로 텍스트가 채워진 책)
  const textHits = useMemo(() => {
    if (!query.trim() || (filter !== 'all' && filter !== 'text')) return [];
    const titleOf = (id) => {
      const b = allBooks.find(x => x.id === id) || getLocalBooks().find(x => x.id === id);
      return b?.aiTitle || b?.title || id;
    };
    return searchAllText(query, 5).map(h => ({ ...h, bookTitle: titleOf(h.bookId) }));
  }, [query, filter, allBooks]);

  const allItems = useMemo(() => [
    ...allHighlights.map(h => ({ ...h, type: 'highlight' })),
    ...allNotes.map(n => ({ ...n, type: 'note' })),
  ].sort((a, b) => new Date(b.date) - new Date(a.date)), [allHighlights, allNotes]);

  const filteredBooks = useMemo(() => {
    if (!query.trim() || (filter !== 'all' && filter !== 'book')) return [];
    const q = query.toLowerCase();
    return allBooks.filter(b =>
      [b.title, b.aiTitle, b.aiAuthor, b.aiSummary, ...(b.aiTopics || [])]
        .filter(Boolean).some(s => s.toLowerCase().includes(q))
    );
  }, [allBooks, query, filter]);

  const filtered = useMemo(() => {
    let items = allItems;
    if (filter === 'book') return [];
    if (filter !== 'all') items = items.filter(x => x.type === filter);
    if (!query.trim()) return items;
    const q = query.toLowerCase();
    return items.filter(x => [x.text, x.bookTitle].filter(Boolean).some(s => s.toLowerCase().includes(q)));
  }, [allItems, filter, query]);

  const hl = (text) => {
    if (!query || !text) return text;
    const idx = text.toLowerCase().indexOf(query.toLowerCase());
    if (idx < 0) return text;
    return <>{text.slice(0, idx)}<mark style={{ background: '#FFF3B0', color: T.ink, padding: '0 1px', borderRadius: 2 }}>{text.slice(idx, idx + query.length)}</mark>{text.slice(idx + query.length)}</>;
  };

  const doSearch = (q) => {
    setQuery(q);
    if (q.trim()) {
      pushSearchHistory(q.trim());
      setHistory(getSearchHistory());
    }
  };

  const isEmpty = allItems.length === 0 && allBooks.length === 0;

  return (
    <div style={{ paddingBottom: 24 }}>
      <ScreenHeader subtitle={lang === 'ko' ? '통합 검색' : 'Everything'} title={t.search} />

      <div style={{ padding: '0 22px 14px' }}>
        <div style={{ background: T.surface, borderRadius: 14, padding: '11px 14px', display: 'flex', alignItems: 'center', gap: 10, border: `1.5px solid ${query ? T.ink : T.border}`, transition: 'all .2s' }}>
          <Icon name="search" size={16} color={T.inkLight} />
          <input
            value={query}
            onChange={e => doSearch(e.target.value)}
            placeholder={isEmpty ? (lang === 'ko' ? '책·메모·하이라이트를 검색하세요' : 'Search books, notes and highlights') : t.searchPlaceholder}
            style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 14, color: T.ink, fontFamily: F.body }}
          />
          {query && (
            <button onClick={() => setQuery('')} style={{ background: T.surfaceAlt, border: 'none', borderRadius: 999, width: 18, height: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="close" size={11} stroke={2} />
            </button>
          )}
        </div>
      </div>

      <div style={{ padding: '0 22px 18px' }}>
        <ChipRow options={filterOpts} value={filter} onChange={setFilter} />
      </div>

      {isEmpty ? (
        <div style={{ padding: '32px 22px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, textAlign: 'center' }}>
          <div style={{ width: 64, height: 64, borderRadius: 18, background: T.accentSoft, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="search" size={28} color={T.accent} />
          </div>
          <div>
            <div style={{ fontSize: 17, fontWeight: 600, color: T.ink, fontFamily: F.display, marginBottom: 8 }}>
              {lang === 'ko' ? '아직 검색할 내용이 없어요' : 'Nothing to search yet'}
            </div>
            <div style={{ fontSize: 13, color: T.inkLight, fontFamily: F.body, lineHeight: 1.65, maxWidth: 260 }}>
              {lang === 'ko' ? '서재에 책을 추가하거나 뷰어에서 메모와 하이라이트를 추가해보세요.' : "Add books to your library or notes while reading."}
            </div>
          </div>
        </div>
      ) : !query.trim() ? (
        <div style={{ padding: '0 22px' }}>
          {history.length > 0 && (
            <>
              <div style={{ fontSize: 10, fontWeight: 700, color: T.inkLight, letterSpacing: 1.3, textTransform: 'uppercase', fontFamily: F.body, marginBottom: 10 }}>
                {lang === 'ko' ? '최근 검색' : 'Recent'}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 22 }}>
                {history.slice(0, 6).map((s, i) => (
                  <button key={i} onClick={() => doSearch(s)} style={{ padding: '7px 12px', borderRadius: 999, border: `1px solid ${T.border}`, background: T.surface, color: T.ink, fontSize: 12, fontFamily: F.body, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <Icon name="clock" size={11} color={T.inkLight} /> {s}
                  </button>
                ))}
              </div>
            </>
          )}
          {filter !== 'book' && (
            <>
              <div style={{ fontSize: 10, fontWeight: 700, color: T.inkLight, letterSpacing: 1.3, textTransform: 'uppercase', fontFamily: F.body, marginBottom: 10 }}>
                {lang === 'ko' ? `전체 · ${filtered.length}` : `All · ${filtered.length}`}
              </div>
              {filtered.map((item, i) => <SearchCard key={item.id || i} item={item} lang={lang} T={T} F={F} hl={hl} />)}
            </>
          )}
        </div>
      ) : (
        <div style={{ padding: '0 22px' }}>
          {filteredBooks.length > 0 && (
            <>
              <div style={{ fontSize: 10, fontWeight: 700, color: T.inkLight, letterSpacing: 1.3, textTransform: 'uppercase', fontFamily: F.body, marginBottom: 10 }}>
                {lang === 'ko' ? `책 · ${filteredBooks.length}` : `Books · ${filteredBooks.length}`}
              </div>
              {filteredBooks.map(b => (
                <div key={b.id} style={{ background: T.surface, borderRadius: 12, padding: 13, marginBottom: 8, border: `1px solid ${T.border}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: T.ink, fontFamily: F.display, lineHeight: 1.3, marginBottom: 2 }}>{hl(b.aiTitle || b.title)}</div>
                      {b.aiAuthor && <div style={{ fontSize: 11.5, color: T.inkLight, fontFamily: F.body }}>{hl(b.aiAuthor)}</div>}
                    </div>
                    {onOpenBook && <button onClick={() => onOpenBook(b)} style={{ padding: '6px 12px', borderRadius: 8, border: 'none', background: T.accent, color: '#FFF', fontSize: 12, fontFamily: F.body, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>{lang === 'ko' ? '열기' : 'Open'}</button>}
                  </div>
                  {b.aiSummary && <div style={{ fontSize: 12, color: T.inkMid, fontFamily: F.body, lineHeight: 1.5, marginTop: 7 }}>{hl(b.aiSummary)}</div>}
                  {b.aiTopics?.length > 0 && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>{b.aiTopics.map((tp, i) => <span key={i} style={{ fontSize: 10, color: T.accent, background: T.accentSoft, padding: '2px 7px', borderRadius: 999, fontFamily: F.body }}>{tp}</span>)}</div>}
                </div>
              ))}
              <div style={{ height: 14 }} />
            </>
          )}
          {textHits.length > 0 && (
            <>
              <div style={{ fontSize: 10, fontWeight: 700, color: T.inkLight, letterSpacing: 1.3, textTransform: 'uppercase', fontFamily: F.body, marginBottom: 10 }}>
                {lang === 'ko' ? `본문 · ${textHits.length}` : `In-text · ${textHits.length}`}
              </div>
              {textHits.map((h, i) => (
                <div key={`${h.bookId}-${h.page}-${i}`} style={{ background: T.surface, borderRadius: 12, padding: 13, marginBottom: 8, border: `1px solid ${T.border}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: T.inkMid, fontFamily: F.body, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      📖 {h.bookTitle} <span style={{ color: T.inkLight, fontFamily: F.mono }}>· p.{h.page}</span>
                    </div>
                    {onOpenBook && <button onClick={() => onOpenBook({ id: h.bookId, title: h.bookTitle })} style={{ padding: '5px 11px', borderRadius: 8, border: 'none', background: T.accent, color: '#FFF', fontSize: 11.5, fontFamily: F.body, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>{lang === 'ko' ? '열기' : 'Open'}</button>}
                  </div>
                  <div style={{ fontSize: 12.5, color: T.inkMid, fontFamily: F.body, lineHeight: 1.55 }}>{hl(h.snippet)}</div>
                </div>
              ))}
              <div style={{ height: 14 }} />
            </>
          )}
          {filter !== 'book' && filter !== 'text' && filtered.length > 0 && (
            <>
              <div style={{ fontSize: 10, fontWeight: 700, color: T.inkLight, letterSpacing: 1.3, textTransform: 'uppercase', fontFamily: F.body, marginBottom: 10 }}>
                {lang === 'ko' ? `메모·하이라이트 · ${filtered.length}` : `Notes & Highlights · ${filtered.length}`}
              </div>
              {filtered.map((item, i) => <SearchCard key={item.id || i} item={item} lang={lang} T={T} F={F} hl={hl} />)}
            </>
          )}
          {filteredBooks.length === 0 && textHits.length === 0 && (filter === 'text' || filter === 'book' || filtered.length === 0) && (
            <div style={{ fontSize: 14, color: T.inkLight, fontFamily: F.body, textAlign: 'center', padding: '32px 0' }}>
              {lang === 'ko' ? '검색 결과가 없어요' : 'No results found'}
              {filter === 'text' && <div style={{ fontSize: 11.5, marginTop: 6 }}>{lang === 'ko' ? '뷰어에서 연 책의 본문만 검색됩니다.' : 'Only books opened in the viewer are searchable.'}</div>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SearchCard({ item, lang, T, F, hl }) {
  const isHighlight = item.type === 'highlight';
  return (
    <div style={{ background: T.surface, borderRadius: 12, padding: 13, marginBottom: 8, border: `1px solid ${T.border}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: isHighlight ? '#B7791F' : T.accent, letterSpacing: 1.1, textTransform: 'uppercase', fontFamily: F.body, background: isHighlight ? '#FEFCE8' : T.accentSoft, padding: '2px 7px', borderRadius: 999 }}>
          {isHighlight ? (lang === 'ko' ? '하이라이트' : 'Highlight') : (lang === 'ko' ? '메모' : 'Note')}
        </span>
        <span style={{ fontSize: 10, color: T.inkLight, fontFamily: F.mono }}>{item.page > 0 ? `p.${item.page}` : fmtDate(item.date)}</span>
      </div>
      {isHighlight
        ? <div style={{ background: item.color || '#FFF3B0', borderRadius: 6, padding: '8px 10px', marginBottom: 7 }}><p style={{ fontSize: 13, lineHeight: 1.55, color: T.ink, fontFamily: 'serif', margin: 0 }}>{hl(item.text)}</p></div>
        : <p style={{ fontSize: 13, lineHeight: 1.55, color: T.ink, fontFamily: F.body, margin: '0 0 7px', whiteSpace: 'pre-wrap' }}>{hl(item.text)}</p>
      }
      <div style={{ fontSize: 10.5, color: T.inkLight, fontFamily: F.body, display: 'flex', alignItems: 'center', gap: 4 }}>
        <Icon name="library" size={11} color={T.inkLight} />
        {item.bookTitle}
      </div>
    </div>
  );
}
