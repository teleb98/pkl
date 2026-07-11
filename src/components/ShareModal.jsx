import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { useTheme } from '../context.jsx';
import { Icon } from '../components.jsx';

/* ── 책 공유 모달 ──────────────────────────────────────────────
   shareUrl: 공유할 URL (앱 딥링크 또는 Drive webViewLink)
   title: 책 제목
   ─────────────────────────────────────────────────────────── */
export function ShareModal({ book, lang, onClose }) {
  const { T, F } = useTheme();
  const canvasRef = useRef(null);
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState('qr'); // 'qr' | 'link'

  // 딥링크: 앱 URL에 book ID를 파라미터로
  const appUrl = `${window.location.origin}/?book=${book.id}`;
  // Drive 직접 링크 (공유 설정된 경우에만 동작)
  const driveUrl = book.webViewLink || '';

  const shareUrl = tab === 'qr' ? appUrl : driveUrl || appUrl;

  useEffect(() => {
    if (!canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, appUrl, {
      width: 220,
      margin: 2,
      color: { dark: T.ink, light: T.surface },
    }).catch(() => {});
  }, [appUrl, T.ink, T.surface]);

  const copy = (url) => {
    navigator.clipboard?.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const nativeShare = () => {
    if (!navigator.share) return;
    navigator.share({ title: book.title, url: appUrl });
  };

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: T.surface, borderRadius: 20, padding: 28, width: '100%', maxWidth: 360, boxShadow: '0 24px 60px rgba(0,0,0,.3)', border: `1px solid ${T.border}` }}
      >
        {/* 헤더 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: T.ink, fontFamily: F.body }}>
              {lang === 'ko' ? '📤 책 공유' : '📤 Share Book'}
            </div>
            <div style={{ fontSize: 11, color: T.inkLight, fontFamily: F.body, marginTop: 2, maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {book.title}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
            <Icon name="x" size={20} color={T.inkMid} />
          </button>
        </div>

        {/* QR 코드 */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20, padding: 12, background: T.surfaceAlt, borderRadius: 14, border: `1px solid ${T.border}` }}>
          <canvas ref={canvasRef} style={{ borderRadius: 8 }} />
        </div>

        {/* 링크 */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: T.inkLight, letterSpacing: 1, textTransform: 'uppercase', fontFamily: F.body, marginBottom: 6 }}>
            {lang === 'ko' ? '앱 딥링크' : 'App Deep Link'}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <div style={{ flex: 1, padding: '8px 10px', borderRadius: 8, border: `1px solid ${T.border}`, background: T.surfaceAlt, fontSize: 11, fontFamily: F.mono, color: T.inkMid, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {appUrl}
            </div>
            <button
              onClick={() => copy(appUrl)}
              style={{ padding: '8px 12px', borderRadius: 8, border: 'none', background: copied ? '#22C55E' : T.accent, color: '#fff', fontSize: 12, fontWeight: 600, fontFamily: F.body, cursor: 'pointer', flexShrink: 0, transition: 'background .2s' }}
            >
              {copied ? '✓' : (lang === 'ko' ? '복사' : 'Copy')}
            </button>
          </div>
        </div>

        {driveUrl && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: T.inkLight, letterSpacing: 1, textTransform: 'uppercase', fontFamily: F.body, marginBottom: 6 }}>
              Google Drive
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <div style={{ flex: 1, padding: '8px 10px', borderRadius: 8, border: `1px solid ${T.border}`, background: T.surfaceAlt, fontSize: 11, fontFamily: F.mono, color: T.inkMid, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {driveUrl}
              </div>
              <button
                onClick={() => window.open(driveUrl, '_blank')}
                style={{ padding: '8px 12px', borderRadius: 8, border: `1px solid ${T.border}`, background: 'transparent', color: T.ink, fontSize: 12, fontFamily: F.body, cursor: 'pointer', flexShrink: 0 }}
              >
                <Icon name="cloud" size={14} color={T.inkMid} />
              </button>
            </div>
          </div>
        )}

        {/* 네이티브 공유 (모바일) */}
        {navigator.share && (
          <button
            onClick={nativeShare}
            style={{ width: '100%', padding: '12px', borderRadius: 12, border: 'none', background: T.ink, color: T.surface, fontSize: 14, fontWeight: 600, fontFamily: F.body, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
          >
            <Icon name="send" size={16} color={T.surface} stroke={2} />
            {lang === 'ko' ? '공유하기' : 'Share'}
          </button>
        )}
      </div>
    </div>
  );
}
