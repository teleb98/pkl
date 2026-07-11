import { useState, useEffect } from 'react';
import { useTheme } from '../context.jsx';
import { Icon } from '../components.jsx';
import { callAI } from '../aiClient.js';

export function TextSelectionAI({ selectedText, position, book, onClose, lang, apiKeys }) {
  const { T, F } = useTheme();
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!selectedText || !apiKeys?.claude && !apiKeys?.gemini) return;
    const askAI = async () => {
      setLoading(true);
      setError('');
      setResponse('');
      try {
        const systemPrompt = lang === 'ko'
          ? '선택된 텍스트의 의미를 1-2문장으로 간단히 설명하세요.'
          : 'Explain the key idea of the selected text in 1-2 sentences.';

        const userMsg = lang === 'ko'
          ? `다음 텍스트를 설명하세요:\n\n"${selectedText}"`
          : `Explain this text:\n\n"${selectedText}"`;

        const result = await callAI(apiKeys, systemPrompt, [], userMsg);
        setResponse(result || '');
      } catch (e) {
        setError(lang === 'ko' ? 'AI 응답 실패' : 'AI response failed');
      } finally {
        setLoading(false);
      }
    };
    askAI();
  }, [selectedText, apiKeys, lang]);

  if (!position || !selectedText) return null;

  const { x, y } = position;
  const popupW = 320;
  const popupH = loading ? 140 : response ? 180 : 100;

  return (
    <div
      style={{
        position: 'fixed',
        left: Math.max(10, Math.min(x - popupW / 2, window.innerWidth - popupW - 10)),
        top: Math.max(10, y - popupH - 10),
        width: popupW,
        zIndex: 1000,
        background: T.surface,
        borderRadius: 12,
        border: `1.5px solid ${T.border}`,
        boxShadow: `0 8px 24px rgba(0,0,0,0.25)`,
        padding: '12px',
      }}
    >
      {/* 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: T.accent, letterSpacing: 0.5, textTransform: 'uppercase', fontFamily: F.body }}>
          {lang === 'ko' ? '💡 AI 설명' : '💡 AI Explain'}
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, padding: 0, color: T.inkLight }}>
          ✕
        </button>
      </div>

      {/* 선택 텍스트 미리보기 */}
      <div style={{ fontSize: 11, color: T.inkMid, background: T.surfaceAlt, borderRadius: 8, padding: '6px 8px', marginBottom: 8, maxHeight: 40, overflow: 'hidden', fontFamily: F.body, lineHeight: 1.4 }}>
        "{selectedText.slice(0, 60)}{selectedText.length > 60 ? '...' : ''}"
      </div>

      {/* 응답 영역 */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '16px 8px', color: T.inkLight, fontSize: 12, fontFamily: F.body }}>
          ⏳ {lang === 'ko' ? '생각 중…' : 'Thinking…'}
        </div>
      ) : error ? (
        <div style={{ color: '#DC2626', fontSize: 11, padding: '8px', fontFamily: F.body }}>
          ⚠ {error}
        </div>
      ) : response ? (
        <div style={{ fontSize: 12, color: T.ink, fontFamily: F.body, lineHeight: 1.5, maxHeight: 120, overflowY: 'auto' }}>
          {response}
        </div>
      ) : null}

      {/* 하단 버튼 */}
      {response && (
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <button
            onClick={() => {
              navigator.clipboard.writeText(response);
            }}
            style={{ flex: 1, padding: '6px', borderRadius: 6, border: `1px solid ${T.border}`, background: 'transparent', color: T.inkMid, fontSize: 10, fontFamily: F.body, cursor: 'pointer' }}
          >
            📋 {lang === 'ko' ? '복사' : 'Copy'}
          </button>
          <button
            onClick={onClose}
            style={{ flex: 1, padding: '6px', borderRadius: 6, border: `1px solid ${T.border}`, background: T.accent, color: '#fff', fontSize: 10, fontFamily: F.body, cursor: 'pointer' }}
          >
            {lang === 'ko' ? '닫기' : 'Close'}
          </button>
        </div>
      )}
    </div>
  );
}
