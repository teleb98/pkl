import { useState } from 'react';
import { useTheme } from '../context.jsx';
import { Icon } from '../components.jsx';

/* 뷰어 '텍스트 인식' 결과 시트 — 인식된 텍스트 + 활용 액션.
   인식 텍스트는 pageTextCache 에 저장돼 AI 채팅·전문 검색·어휘/퀴즈 생성에
   자동으로 활용된다. 시트는 그 위에 즉시 활용 동선(복사/메모/AI 질문)을 제공.

   state: { status: 'running'|'done'|'error', pageNum, text?, engine?, enginePct? } */
export function VisionTextSheet({ lang, state, onClose, onAskAI, onSaveNote }) {
  const { T, F } = useTheme();
  const ko = lang === 'ko';
  const [copied, setCopied] = useState(false);
  const [noteSaved, setNoteSaved] = useState(false);
  if (!state) return null;
  const { status, pageNum, text, engine, enginePct } = state;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* clipboard 권한 없음 */ }
  };

  const actionBtn = (onClick, label, active) => (
    <button
      onClick={onClick}
      style={{ flex: 1, fontSize: 12.5, fontWeight: 600, color: active ? T.secondary : T.ink, background: active ? T.secondarySoft : T.surfaceAlt, border: `1px solid ${active ? T.secondary + '55' : T.border}`, borderRadius: 10, padding: '11px 8px', cursor: 'pointer', fontFamily: F.body, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, transition: 'all .15s' }}
    >
      {label}
    </button>
  );

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1200, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: T.surface, borderRadius: '20px 20px 0 0', padding: '18px 20px 26px', width: '100%', maxWidth: 560, maxHeight: '75vh', display: 'flex', flexDirection: 'column', boxShadow: '0 -8px 40px rgba(0,0,0,.25)' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <span style={{ fontSize: 16 }}>🔍</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.ink, fontFamily: F.display }}>
              {ko ? '텍스트 인식' : 'Text Recognition'}
            </div>
            <div style={{ fontSize: 11, color: T.inkLight, fontFamily: F.mono }}>
              p.{pageNum}{engine ? ` · ${engine}` : ''}
            </div>
          </div>
          <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 8, border: 'none', background: T.surfaceAlt, cursor: 'pointer', color: T.inkLight, fontSize: 15, lineHeight: 1 }}>×</button>
        </div>

        {status === 'running' && (
          <div style={{ padding: '28px 0 34px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 30, height: 30, borderRadius: '50%', border: `3px solid ${T.border}`, borderTopColor: T.accent, animation: 'spin .8s linear infinite' }} />
            <div style={{ fontSize: 13, color: T.inkMid, fontFamily: F.body }}>
              {engine
                ? (ko ? `${engine} 인식 중…${enginePct != null ? ` ${enginePct}%` : ''}` : `${engine} recognizing…${enginePct != null ? ` ${enginePct}%` : ''}`)
                : (ko ? '페이지를 인식하는 중…' : 'Recognizing page…')}
            </div>
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          </div>
        )}

        {status === 'error' && (
          <div style={{ padding: '24px 0 30px', textAlign: 'center' }}>
            <div style={{ fontSize: 13.5, color: T.ink, fontFamily: F.body, marginBottom: 6 }}>
              {ko ? '텍스트를 인식하지 못했어요' : 'Could not recognize text'}
            </div>
            <div style={{ fontSize: 12, color: T.inkLight, fontFamily: F.body, lineHeight: 1.6 }}>
              {ko ? '이미지 화질이 낮거나 글자가 없는 페이지일 수 있습니다.' : 'The page may be low quality or contain no text.'}
            </div>
          </div>
        )}

        {status === 'done' && (
          <>
            {/* 인식 텍스트 */}
            <div style={{ flex: 1, overflowY: 'auto', background: T.surfaceAlt, borderRadius: 12, padding: '13px 15px', border: `1px solid ${T.border}`, marginBottom: 12, minHeight: 80 }}>
              <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.75, color: T.ink, fontFamily: F.body, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{text}</p>
            </div>

            {/* 활용 안내 */}
            <div style={{ display: 'flex', gap: 7, alignItems: 'flex-start', marginBottom: 12 }}>
              <Icon name="spark" size={12} color={T.secondary} />
              <span style={{ fontSize: 11.5, color: T.inkLight, fontFamily: F.body, lineHeight: 1.5 }}>
                {ko
                  ? '인식된 텍스트는 이 책의 AI 채팅·전문 검색·어휘/퀴즈 생성에 자동으로 활용됩니다.'
                  : 'Recognized text is now available to AI chat, full-text search, and vocab/quiz generation for this book.'}
              </span>
            </div>

            {/* 액션 */}
            <div style={{ display: 'flex', gap: 8 }}>
              {actionBtn(copy, copied ? (ko ? '✓ 복사됨' : '✓ Copied') : (ko ? '📋 복사' : '📋 Copy'), copied)}
              {onSaveNote && actionBtn(
                () => { if (noteSaved) return; onSaveNote(text, pageNum); setNoteSaved(true); },
                noteSaved ? (ko ? '✓ 메모 저장됨' : '✓ Saved') : (ko ? '📝 메모로 저장' : '📝 Save as note'),
                noteSaved,
              )}
              {onAskAI && actionBtn(() => onAskAI(text, pageNum), ko ? '✨ AI에게 질문' : '✨ Ask AI', false)}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
