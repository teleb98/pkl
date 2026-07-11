import { useState, useEffect } from 'react';
import { useTheme } from '../context.jsx';
import { Icon } from '../components.jsx';
import { callAI } from '../aiClient.js';
import { generateDefinitionPrompt } from '../utils/wordDefinition.js';

export function WordDefinition({ word, context, position, onClose, lang, apiKeys }) {
  const { T, F } = useTheme();
  const [definition, setDefinition] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!word || !apiKeys?.claude && !apiKeys?.gemini) return;
    const fetchDef = async () => {
      setLoading(true);
      setError('');
      setDefinition('');
      try {
        const systemPrompt = generateDefinitionPrompt(lang, word, context);
        const result = await callAI(apiKeys, systemPrompt, [], '');
        setDefinition(result || '');
      } catch (e) {
        setError(lang === 'ko' ? '정의 조회 실패' : 'Failed to fetch definition');
      } finally {
        setLoading(false);
      }
    };
    fetchDef();
  }, [word, context, apiKeys, lang]);

  if (!position || !word) return null;

  const { x, y } = position;
  const popupW = 280;
  const popupH = loading ? 120 : definition ? 160 : 80;

  return (
    <div style={{
      position: 'fixed',
      left: Math.max(10, Math.min(x - popupW / 2, window.innerWidth - popupW - 10)),
      top: Math.max(10, y - popupH - 20),
      width: popupW,
      background: T.surface,
      border: `1px solid ${T.border}`,
      borderRadius: 10,
      padding: 12,
      boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
      zIndex: 1000,
      fontFamily: F.body,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: T.accent }}>
          "{word}"
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex' }}>
          <Icon name="x" size={16} color={T.inkLight} />
        </button>
      </div>

      {loading && (
        <div style={{ fontSize: 12, color: T.inkMid, fontStyle: 'italic' }}>
          {lang === 'ko' ? '정의 조회 중...' : 'Loading definition...'}
        </div>
      )}

      {definition && (
        <div style={{ fontSize: 12, lineHeight: 1.5, color: T.ink }}>
          {definition}
        </div>
      )}

      {error && (
        <div style={{ fontSize: 11, color: '#d32f2f' }}>
          ⚠️ {error}
        </div>
      )}
    </div>
  );
}
