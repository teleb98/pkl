import { BOOKS } from '../data.js';
import { useTheme } from '../context.jsx';
import { Button, Icon } from '../components.jsx';

export function SplashScreen({ lang, onStart }) {
  const { T, F } = useTheme();
  const stack = [
    { color: BOOKS[0].cover, accent: BOOKS[0].spine, tilt: -10, h: 168, w: 108, z: 1 },
    { color: BOOKS[3].cover, accent: BOOKS[3].spine, tilt: -2,  h: 192, w: 120, z: 3 },
    { color: BOOKS[1].cover, accent: BOOKS[1].spine, tilt:  6,  h: 158, w: 102, z: 2 },
    { color: BOOKS[2].cover, accent: BOOKS[2].spine, tilt: -4,  h: 178, w: 112, z: 2 },
  ];
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', overflow: 'hidden', position: 'relative', background: T.bg }}>
      <div style={{ width: '100%', maxWidth: 480, flex: 1, display: 'flex', flexDirection: 'column', padding: '0 28px 36px', position: 'relative' }}>
      <div style={{ position: 'absolute', top: -120, right: -100, width: 360, height: 360, borderRadius: '50%', background: T.accentSoft, opacity: 0.7, filter: 'blur(70px)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', bottom: -100, left: -80, width: 280, height: 280, borderRadius: '50%', background: T.secondarySoft, opacity: 0.5, filter: 'blur(60px)', pointerEvents: 'none' }} />
      <div style={{ marginTop: 60, position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: T.ink, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M5 19V6a2 2 0 012-2h6l5 5v10a2 2 0 01-2 2H7a2 2 0 01-2-2z" stroke="#FFF" strokeWidth="1.8" /><path d="M13 4v5h5" stroke="#FFF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /><path d="M8 14h6M8 17h4" stroke="#FFF" strokeWidth="1.6" strokeLinecap="round" /></svg>
        </div>
        <div style={{ fontSize: 11, fontWeight: 700, color: T.inkMid, letterSpacing: 3, fontFamily: F.body }}>PKL</div>
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', padding: '20px 0' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4 }}>
          {stack.map((b, i) => (
            <div key={i} style={{ width: b.w, height: b.h, background: b.color, borderRadius: '3px 3px 2px 2px', transform: `rotate(${b.tilt}deg)`, transformOrigin: 'bottom center', boxShadow: '3px 8px 24px rgba(0,0,0,.25)', position: 'relative', overflow: 'hidden', flexShrink: 0, zIndex: b.z }}>
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(115deg, rgba(255,255,255,.2) 0%, transparent 50%, rgba(0,0,0,.08) 100%)' }} />
              <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, background: b.accent }} />
            </div>
          ))}
        </div>
        <div style={{ position: 'absolute', top: 30, right: 30, fontSize: 22, color: T.accent, opacity: 0.85 }}>✦</div>
        <div style={{ position: 'absolute', bottom: 40, left: 24, fontSize: 13, color: T.accent, opacity: 0.6 }}>✦</div>
      </div>
      <div style={{ position: 'relative', textAlign: 'left', marginBottom: 28 }}>
        <h1 style={{ margin: 0, fontSize: 36, lineHeight: 1.1, fontWeight: 500, fontFamily: F.display, color: T.ink, letterSpacing: -1.2 }}>
          {lang === 'ko' ? <>{<>읽고,<br />정리하고,<br /><em style={{ color: T.accent, fontStyle: 'italic', fontWeight: 600 }}>창조하다</em>.</>}</> : <>{<>Read,<br />organize,<br /><em style={{ color: T.accent, fontStyle: 'italic', fontWeight: 600 }}>create</em>.</>}</>}
        </h1>
        <p style={{ fontSize: 14, color: T.inkLight, fontFamily: F.body, lineHeight: 1.65, margin: '14px 0 0', whiteSpace: 'pre-line' }}>
          {lang === 'ko' ? '스캔한 책을 AI와 함께\n더 깊이 읽어보세요' : 'Read your scanned books\nmore deeply with AI'}
        </p>
      </div>
      <div style={{ position: 'relative' }}>
        <Button variant="accent" full onClick={onStart} style={{ padding: 16, borderRadius: 14, fontSize: 15 }}>
          {lang === 'ko' ? '시작하기' : 'Get Started'}<Icon name="forward" size={14} color="#FFF" />
        </Button>
        <p style={{ textAlign: 'center', fontSize: 12, color: T.inkFaint, fontFamily: F.body, margin: '12px 0 0' }}>{lang === 'ko' ? 'Google 계정으로 무료로 시작' : 'Free, with your Google account'}</p>
      </div>
      </div>
    </div>
  );
}
