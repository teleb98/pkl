/* Toaster — 전역 토스트 렌더. 앱 루트에 1개 마운트.
   showToast()/showError() (utils/toast.js)를 구독해 표시. 재시도 버튼 지원. */
import { useState, useEffect } from 'react';
import { useTheme } from '../context.jsx';
import { subscribeToast } from '../utils/toast.js';

export function Toaster() {
  const { T, F } = useTheme();
  const [toasts, setToasts] = useState([]);

  useEffect(() => subscribeToast((toast) => {
    setToasts((prev) => [...prev, toast]);
    if (toast.duration > 0) {
      setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== toast.id)), toast.duration);
    }
  }), []);

  const dismiss = (id) => setToasts((prev) => prev.filter((t) => t.id !== id));

  if (!toasts.length) return null;

  const color = (type) =>
    type === 'error' ? '#DC2626' : type === 'success' ? (T.secondary || '#16A34A') : (T.accent || '#C45C26');

  return (
    <div style={{
      position: 'fixed', left: 0, right: 0, bottom: 'calc(env(safe-area-inset-bottom) + 18px)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
      zIndex: 99999, pointerEvents: 'none', padding: '0 16px',
    }}>
      {toasts.map((t) => (
        <div key={t.id} style={{
          pointerEvents: 'auto', maxWidth: 460, width: 'fit-content',
          display: 'flex', alignItems: 'center', gap: 12,
          background: T.ink || '#222', color: '#fff',
          padding: '11px 14px', borderRadius: 12,
          boxShadow: '0 6px 24px rgba(0,0,0,.28)', fontFamily: F?.body || 'sans-serif',
          fontSize: 13.5, lineHeight: 1.5, animation: 'pklToastIn .18s ease-out',
        }}>
          <span style={{ width: 8, height: 8, borderRadius: 999, background: color(t.type), flexShrink: 0 }} />
          <span style={{ flex: 1, whiteSpace: 'pre-line' }}>{t.message}</span>
          {t.actionLabel && t.onAction && (
            <button
              onClick={() => { dismiss(t.id); try { t.onAction(); } catch {} }}
              style={{ background: 'rgba(255,255,255,.18)', color: '#fff', border: 'none',
                borderRadius: 8, padding: '5px 11px', fontSize: 12.5, fontWeight: 600,
                cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit' }}
            >{t.actionLabel}</button>
          )}
          <button onClick={() => dismiss(t.id)} aria-label="닫기"
            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,.6)',
              cursor: 'pointer', fontSize: 16, padding: 0, lineHeight: 1, flexShrink: 0 }}>×</button>
        </div>
      ))}
      <style>{`@keyframes pklToastIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}`}</style>
    </div>
  );
}
