import { useState, useEffect, useRef } from 'react';
import { useTheme } from '../context.jsx';
import { callAI } from '../aiClient.js';
import {
  buildReviewPrompt,
  renderReviewCard,
  downloadReviewCard,
  CARD_THEMES,
} from '../utils/reviewCard.js';
import {
  getBookReview, saveBookReview,
  getNotesByBook, getHighlightsByBook,
  getBookMeta,
} from '../store.js';

export function ReviewCardModal({ book, lang = 'ko', apiKeys, onClose }) {
  const { T, F } = useTheme();
  const ko = lang === 'ko';
  const canvasRef = useRef(null);

  const [review, setReview]   = useState('');
  const [rating, setRating]   = useState(0);
  const [theme, setTheme]     = useState('warm');
  const [generating, setGenerating] = useState(false);
  const [error, setError]     = useState('');

  // 통계 계산
  const notes = book?.id ? getNotesByBook(book.id) : [];
  const highlights = book?.id ? getHighlightsByBook(book.id) : [];
  const meta = book?.id ? getBookMeta(book.id) : null;
  const stats = {
    pages: meta?.pages || 0,
    notes: notes.length,
    highlights: highlights.length,
    rating,
  };

  // 초기 로드: 저장된 리뷰 복원
  useEffect(() => {
    if (!book?.id) return;
    const saved = getBookReview(book.id);
    if (saved) {
      setReview(saved.text || '');
      setRating(saved.rating || 0);
      setTheme(saved.theme || 'warm');
    } else {
      setReview('');
      setRating(0);
    }
  }, [book?.id]);

  // 미리보기 캔버스 렌더링
  useEffect(() => {
    if (!canvasRef.current || !book) return;
    renderReviewCard(canvasRef.current, { book, review, theme, stats });
  }, [book, review, theme, rating, stats.notes, stats.highlights]);

  const generateReview = async () => {
    if (!apiKeys?.claude && !apiKeys?.gemini) {
      setError(ko ? 'API 키가 필요합니다.' : 'API key required.');
      return;
    }
    setGenerating(true);
    setError('');
    try {
      const prompt = buildReviewPrompt(book, notes, highlights, lang);
      const raw = await callAI(
        apiKeys,
        ko ? '독서 리뷰 작성 전문가입니다. 텍스트만 출력하세요.' : 'Book review expert. Output text only.',
        [],
        prompt
      );
      const cleaned = (raw || '').trim().replace(/^["']|["']$/g, '');
      setReview(cleaned);
    } catch (e) {
      setError(e.message || (ko ? 'AI 호출 실패' : 'AI call failed'));
    } finally {
      setGenerating(false);
    }
  };

  const saveAndDownload = async () => {
    if (book?.id) saveBookReview(book.id, { text: review, rating, theme });
    await downloadReviewCard({ book, review, theme, stats });
  };

  if (!book) return null;

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: '#0009', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: T.surface, borderRadius: 20, maxWidth: 720, width: '100%', maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 20px 60px #0006' }}>
        {/* 헤더 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: `1px solid ${T.border}` }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: T.ink, fontFamily: F.body }}>
            🎴 {ko ? '리뷰 카드' : 'Review Card'}
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: T.inkLight, fontSize: 22, cursor: 'pointer', padding: 0, lineHeight: 1 }}>×</button>
        </div>

        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* 미리보기 */}
          <div style={{ background: '#000', borderRadius: 12, padding: 12, display: 'flex', justifyContent: 'center' }}>
            <canvas
              ref={canvasRef}
              style={{ width: '100%', maxWidth: 360, aspectRatio: '1/1', borderRadius: 8, background: '#fff' }}
            />
          </div>

          {/* 테마 선택 */}
          <div>
            <div style={{ fontSize: 12, color: T.inkMid, marginBottom: 6, fontFamily: F.body }}>
              {ko ? '테마' : 'Theme'}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {Object.keys(CARD_THEMES).map(key => {
                const c = CARD_THEMES[key];
                return (
                  <button
                    key={key}
                    onClick={() => setTheme(key)}
                    title={key}
                    style={{
                      width: 36, height: 36, borderRadius: '50%',
                      background: `linear-gradient(135deg, ${c.from}, ${c.to})`,
                      border: theme === key ? `3px solid ${T.accent}` : `1px solid ${T.border}`,
                      cursor: 'pointer', padding: 0,
                    }}
                  />
                );
              })}
            </div>
          </div>

          {/* 별점 */}
          <div>
            <div style={{ fontSize: 12, color: T.inkMid, marginBottom: 6, fontFamily: F.body }}>
              {ko ? '평점' : 'Rating'}
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              {[1, 2, 3, 4, 5].map(n => (
                <button
                  key={n}
                  onClick={() => setRating(rating === n ? 0 : n)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 24, padding: 2, color: n <= rating ? '#fbbf24' : T.inkFaint }}
                >
                  {n <= rating ? '★' : '☆'}
                </button>
              ))}
            </div>
          </div>

          {/* 리뷰 입력 */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 12, color: T.inkMid, fontFamily: F.body }}>
                {ko ? '리뷰' : 'Review'} ({review.length})
              </span>
              <button
                onClick={generateReview}
                disabled={generating || (!apiKeys?.claude && !apiKeys?.gemini)}
                style={{ background: T.ink, color: T.surface, border: 'none', borderRadius: 8, padding: '4px 10px', fontSize: 11, fontWeight: 600, cursor: generating ? 'wait' : 'pointer', fontFamily: F.body, opacity: generating ? 0.6 : 1 }}
              >
                {generating ? (ko ? '생성 중…' : 'Generating…') : (ko ? '✨ AI 초안' : '✨ AI Draft')}
              </button>
            </div>
            <textarea
              value={review}
              onChange={(e) => setReview(e.target.value)}
              placeholder={ko ? '리뷰를 입력하거나 AI 초안을 사용하세요…' : 'Write a review or use AI draft…'}
              rows={4}
              style={{ width: '100%', boxSizing: 'border-box', padding: 10, borderRadius: 8, border: `1px solid ${T.border}`, fontSize: 13, fontFamily: F.body, background: T.surfaceAlt, color: T.ink, resize: 'vertical' }}
            />
            {error && <div style={{ fontSize: 11, color: '#dc2626', marginTop: 4 }}>{error}</div>}
          </div>

          {/* 다운로드 */}
          <button
            onClick={saveAndDownload}
            disabled={!review.trim()}
            style={{ background: T.accent, color: '#FFF', border: 'none', borderRadius: 12, padding: '14px', fontSize: 14, fontWeight: 700, cursor: review.trim() ? 'pointer' : 'not-allowed', fontFamily: F.body, opacity: review.trim() ? 1 : 0.5 }}
          >
            📥 {ko ? 'PNG로 저장' : 'Save as PNG'}
          </button>
        </div>
      </div>
    </div>
  );
}
