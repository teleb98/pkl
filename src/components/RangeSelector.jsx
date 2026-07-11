import { useState } from 'react';
import { useTheme } from '../context.jsx';
import { Icon } from '../components.jsx';
import { getChapterRange } from '../pageTextCache.js';

export function RangeSelector({ type, lang, onConfirm, onCancel, bookId, currentPage, totalPages }) {
  const { T, F } = useTheme();
  const [range, setRange] = useState('all'); // 'all' | 'chapter' | 'custom'
  const [customStart, setCustomStart] = useState(1);
  const [customEnd, setCustomEnd] = useState(totalPages);

  // 현재 페이지가 속한 챕터 범위 (PDF 목차 기반, 없으면 현재±10p)
  const chapter = bookId ? getChapterRange(bookId, currentPage) : null;
  const chapterStart = chapter ? chapter.start : Math.max(1, (currentPage || 1) - 10);
  const chapterEnd = chapter ? (chapter.end ?? totalPages) : Math.min(totalPages || (currentPage || 1) + 10, (currentPage || 1) + 10);
  const chapterLabel = chapter
    ? (lang === 'ko' ? `📖 현재 챕터: ${chapter.title}` : `📖 Current Chapter: ${chapter.title}`)
    : (lang === 'ko' ? `📖 현재 챕터 (p.${chapterStart}–${chapterEnd})` : `📖 Current Chapter (p.${chapterStart}–${chapterEnd})`);

  const handleConfirm = () => {
    if (range === 'custom' && (customStart > customEnd || customStart < 1 || customEnd > totalPages)) {
      return;
    }
    onConfirm({
      range,
      startPage: range === 'all' ? 1 : range === 'chapter' ? chapterStart : customStart,
      endPage: range === 'all' ? totalPages : range === 'chapter' ? chapterEnd : customEnd
    });
  };

  const typeLabel = lang === 'ko'
    ? (type === 'vocab' ? '어휘' : '퀴즈')
    : (type === 'vocab' ? 'Vocabulary' : 'Quiz');

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000,
      padding: 20,
    }}>
      <div style={{
        background: T.surface, borderRadius: 16, padding: 24,
        width: '100%', maxWidth: 400,
        border: `1px solid ${T.border}`,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: T.ink, fontFamily: F.body }}>
            {lang === 'ko' ? `${typeLabel} 범위 선택` : `Select ${typeLabel} Range`}
          </div>
          <button onClick={onCancel} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            <Icon name="x" size={20} color={T.inkMid} />
          </button>
        </div>

        <div style={{ marginBottom: 20 }}>
          {[
            { k: 'all', label: lang === 'ko' ? '📚 책 전체' : '📚 Entire Book' },
            { k: 'chapter', label: chapterLabel },
            { k: 'custom', label: lang === 'ko' ? '🎯 범위 선택' : '🎯 Custom Range' },
          ].map(opt => (
            <button
              key={opt.k}
              onClick={() => setRange(opt.k)}
              style={{
                width: '100%', padding: '12px', marginBottom: 8, borderRadius: 10,
                border: `2px solid ${range === opt.k ? T.accent : T.border}`,
                background: range === opt.k ? T.accentSoft : 'transparent',
                color: range === opt.k ? T.accent : T.ink,
                fontSize: 13, fontWeight: range === opt.k ? 600 : 400,
                cursor: 'pointer', fontFamily: F.body,
                textAlign: 'left',
                transition: 'all .2s',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {range === 'custom' && (
          <div style={{ background: T.surfaceAlt, borderRadius: 10, padding: 12, marginBottom: 18 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: T.inkMid, marginBottom: 10, fontFamily: F.body }}>
              {lang === 'ko' ? '페이지 범위' : 'Page Range'}
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <div style={{ flex: 1 }}>
                <input
                  type="number"
                  min="1"
                  max={totalPages}
                  value={customStart}
                  onChange={(e) => setCustomStart(Math.max(1, parseInt(e.target.value) || 1))}
                  style={{
                    width: '100%', padding: '8px', borderRadius: 6,
                    border: `1px solid ${T.border}`, background: T.surface,
                    color: T.ink, fontSize: 12, fontFamily: F.body,
                  }}
                />
                <div style={{ fontSize: 10, color: T.inkLight, marginTop: 4, fontFamily: F.body }}>
                  {lang === 'ko' ? '시작' : 'From'}
                </div>
              </div>
              <div style={{ color: T.inkMid, fontSize: 14, fontWeight: 600 }}>-</div>
              <div style={{ flex: 1 }}>
                <input
                  type="number"
                  min="1"
                  max={totalPages}
                  value={customEnd}
                  onChange={(e) => setCustomEnd(Math.min(totalPages, parseInt(e.target.value) || totalPages))}
                  style={{
                    width: '100%', padding: '8px', borderRadius: 6,
                    border: `1px solid ${T.border}`, background: T.surface,
                    color: T.ink, fontSize: 12, fontFamily: F.body,
                  }}
                />
                <div style={{ fontSize: 10, color: T.inkLight, marginTop: 4, fontFamily: F.body }}>
                  {lang === 'ko' ? '끝' : 'To'}
                </div>
              </div>
            </div>
            {customStart > customEnd && (
              <div style={{ fontSize: 11, color: '#d32f2f', marginTop: 8, fontFamily: F.body }}>
                ⚠️ {lang === 'ko' ? '유효하지 않은 범위입니다' : 'Invalid range'}
              </div>
            )}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={onCancel}
            style={{
              flex: 1, padding: '12px', borderRadius: 10, border: `1px solid ${T.border}`,
              background: 'transparent', color: T.ink, fontSize: 13, fontWeight: 600,
              cursor: 'pointer', fontFamily: F.body,
            }}
          >
            {lang === 'ko' ? '취소' : 'Cancel'}
          </button>
          <button
            onClick={handleConfirm}
            disabled={range === 'custom' && customStart > customEnd}
            style={{
              flex: 1, padding: '12px', borderRadius: 10, border: 'none',
              background: range === 'custom' && customStart > customEnd ? T.border : T.accent,
              color: '#fff', fontSize: 13, fontWeight: 600,
              cursor: range === 'custom' && customStart > customEnd ? 'default' : 'pointer',
              fontFamily: F.body,
              opacity: range === 'custom' && customStart > customEnd ? 0.5 : 1,
            }}
          >
            {lang === 'ko' ? '확인' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}
