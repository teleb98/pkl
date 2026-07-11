import { HIGHLIGHT, i18n } from './data.js';
import { useTheme } from './context.jsx';

/* ── Book cover ─────────────────────────────── */
export function BookCover({ book, size = 60, lang = 'ko' }) {
  const { T, F } = useTheme();
  const w = size;
  const h = Math.round(size * 1.42);
  const titleSize = Math.max(8, Math.round(size * 0.13));
  const authorSize = Math.max(7, Math.round(size * 0.085));
  return (
    <div style={{
      width: w, height: h, background: book.cover, borderRadius: 3,
      flexShrink: 0, position: 'relative', overflow: 'hidden',
      boxShadow: `2px 4px ${size * 0.18}px rgba(0,0,0,.22), inset 0 0 0 1px rgba(255,255,255,.06)`,
    }}>
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: Math.max(2, size * 0.04), background: book.spine }} />
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(115deg, rgba(255,255,255,.18) 0%, rgba(255,255,255,0) 35%, rgba(0,0,0,.05) 100%)' }} />
      <div style={{ position: 'absolute', left: size * 0.1, right: size * 0.08, top: size * 0.12, height: 1, background: 'rgba(255,255,255,.35)' }} />
      <div style={{ position: 'absolute', left: size * 0.12, right: size * 0.12, top: size * 0.16, height: 1, background: 'rgba(255,255,255,.18)' }} />
      <div style={{
        position: 'absolute', left: size * 0.1, right: size * 0.08, top: size * 0.28,
        color: 'rgba(255,255,255,.96)', fontSize: titleSize, fontFamily: F.display,
        lineHeight: 1.15, fontWeight: 600, letterSpacing: -0.2, textShadow: '0 1px 0 rgba(0,0,0,.15)',
      }}>
        {(lang === 'ko' ? book.title : book.titleEn).slice(0, 18)}
      </div>
      <div style={{
        position: 'absolute', left: size * 0.1, right: size * 0.08, bottom: size * 0.1,
        color: 'rgba(255,255,255,.62)', fontSize: authorSize, fontFamily: F.body,
        letterSpacing: 0.4, textTransform: 'uppercase',
      }}>
        {(lang === 'ko' ? book.author : book.authorEn).split(' ').slice(-1)[0]}
      </div>
      <div style={{ position: 'absolute', left: size * 0.12, right: size * 0.12, bottom: size * 0.06, height: 1, background: 'rgba(255,255,255,.25)' }} />
    </div>
  );
}

/* ── Progress bar ───────────────────────────── */
export function ProgressBar({ value, height = 3, color, track }) {
  const { T } = useTheme();
  return (
    <div style={{ background: track || T.border, borderRadius: 999, height, overflow: 'hidden' }}>
      <div style={{ width: `${value}%`, height: '100%', background: color || T.accent, borderRadius: 999, transition: 'width .6s cubic-bezier(.22,1,.36,1)' }} />
    </div>
  );
}

/* ── Type badge ─────────────────────────────── */
export function TypeBadge({ type, lang = 'ko' }) {
  const { T, F } = useTheme();
  const map = {
    highlight: { ko: '하이라이트', en: 'Highlight', bg: T.accentSoft, fg: T.accentDeep },
    note:      { ko: '메모',      en: 'Note',      bg: T.secondarySoft, fg: T.secondary },
    ai:        { ko: 'AI 대화',   en: 'AI Chat',   bg: T.surfaceAlt,  fg: T.inkMid },
    book:      { ko: '책',        en: 'Book',      bg: T.surface,     fg: T.inkMid },
    insight:   { ko: '인사이트',  en: 'Insight',   bg: HIGHLIGHT.blue,  fg: '#1A3F6E' },
    concept:   { ko: '개념',      en: 'Concept',   bg: HIGHLIGHT.yellow, fg: '#6F5410' },
    quote:     { ko: '인용',      en: 'Quote',     bg: HIGHLIGHT.green,  fg: '#1F5A38' },
  };
  const m = map[type] || map.note;
  return (
    <span style={{
      background: m.bg, color: m.fg, borderRadius: 4, padding: '2px 7px',
      fontSize: 10, fontWeight: 600, fontFamily: F.body, letterSpacing: 0.2,
      border: type === 'book' ? `1px solid ${T.border}` : 'none',
    }}>{lang === 'ko' ? m.ko : m.en}</span>
  );
}

/* ── Filter chip row ────────────────────────── */
export function ChipRow({ options, value, onChange }) {
  const { T, F } = useTheme();
  return (
    <div style={{ display: 'flex', gap: 6, overflowX: 'auto', scrollbarWidth: 'none' }}>
      {options.map(o => {
        const active = value === o.key;
        return (
          <button key={o.key} onClick={() => onChange(o.key)} style={{
            padding: '6px 13px', borderRadius: 999, border: `1px solid ${active ? T.ink : T.border}`,
            background: active ? T.ink : 'transparent', color: active ? T.surface : T.inkMid,
            fontSize: 12, fontWeight: 500, fontFamily: F.body, whiteSpace: 'nowrap',
            cursor: 'pointer', transition: 'all .18s', flexShrink: 0,
          }}>{o.label}</button>
        );
      })}
    </div>
  );
}

/* ── Toggle ─────────────────────────────────── */
export function Toggle({ value, onChange }) {
  const { T } = useTheme();
  return (
    <div onClick={() => onChange(!value)} style={{
      width: 42, height: 24, borderRadius: 999, position: 'relative', cursor: 'pointer',
      background: value ? T.ink : T.border, transition: 'background .25s',
    }}>
      <div style={{
        position: 'absolute', top: 2, left: value ? 20 : 2, width: 20, height: 20, borderRadius: 999,
        background: T.surface, boxShadow: '0 1px 3px rgba(0,0,0,.2)', transition: 'left .25s',
      }} />
    </div>
  );
}

/* ── Button ─────────────────────────────────── */
export function Button({ children, variant = 'primary', onClick, disabled, style, full }) {
  const { T, F } = useTheme();
  const base = {
    padding: '12px 18px', borderRadius: 12, border: 'none', cursor: disabled ? 'default' : 'pointer',
    fontSize: 14, fontWeight: 600, fontFamily: F.body, letterSpacing: 0.1,
    transition: 'all .2s', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    width: full ? '100%' : 'auto',
  };
  const styles = {
    primary: { background: disabled ? T.border : T.ink, color: disabled ? T.inkFaint : T.surface, boxShadow: disabled ? 'none' : `0 2px 12px ${T.ink}33` },
    accent:  { background: disabled ? T.border : T.accent, color: disabled ? T.inkFaint : '#FFF', boxShadow: disabled ? 'none' : `0 4px 16px ${T.accent}44` },
    ghost:   { background: 'transparent', color: T.inkMid, border: `1px solid ${T.border}` },
    subtle:  { background: T.surfaceAlt, color: T.inkMid, border: `1px solid ${T.border}` },
  };
  return <button onClick={disabled ? null : onClick} disabled={disabled} style={{ ...base, ...styles[variant], ...style }}>{children}</button>;
}

/* ── Section label ──────────────────────────── */
export function SectionLabel({ children, action }) {
  const { T, F } = useTheme();
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 8 }}>
      <span style={{ fontSize: 10, fontWeight: 700, color: T.inkLight, letterSpacing: 1.4, textTransform: 'uppercase', fontFamily: F.body, whiteSpace: 'nowrap' }}>{children}</span>
      {action && <span style={{ flexShrink: 0 }}>{action}</span>}
    </div>
  );
}

/* ── Icon set ───────────────────────────────── */
export function Icon({ name, size = 18, color, stroke = 1.6 }) {
  const c = color || 'currentColor';
  const props = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: c, strokeWidth: stroke, strokeLinecap: 'round', strokeLinejoin: 'round' };
  switch (name) {
    case 'library':    return <svg {...props}><path d="M4 19V5a1 1 0 011-1h3a1 1 0 011 1v14M9 19h6V8M15 19h4V8m-4 0h4M9 8h0M9 8l3-2 3 2" /></svg>;
    case 'search':     return <svg {...props}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>;
    case 'knowledge':  return <svg {...props}><path d="M4 5h7l2 2h7v12H4z" /><path d="M4 9h16" /></svg>;
    case 'goals':      return <svg {...props}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.5" fill={c} stroke="none" /></svg>;
    case 'ai':         return <svg {...props}><path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6z" /><circle cx="18" cy="18" r="1.5" fill={c} stroke="none" /><circle cx="6" cy="17" r="1" fill={c} stroke="none" /></svg>;
    case 'bookmark':   return <svg {...props}><path d="M6 4h12v17l-6-4-6 4V4z" /></svg>;
    case 'bookmark-fill': return <svg width={size} height={size} viewBox="0 0 24 24" fill={c}><path d="M6 4h12v17l-6-4-6 4V4z" /></svg>;
    case 'back':       return <svg {...props}><path d="m15 6-6 6 6 6" /></svg>;
    case 'forward':    return <svg {...props}><path d="m9 6 6 6-6 6" /></svg>;
    case 'close':      return <svg {...props}><path d="M6 6l12 12M18 6L6 18" /></svg>;
    case 'more':       return <svg {...props}><circle cx="5" cy="12" r="1" fill={c} stroke="none" /><circle cx="12" cy="12" r="1" fill={c} stroke="none" /><circle cx="19" cy="12" r="1" fill={c} stroke="none" /></svg>;
    case 'play':       return <svg width={size} height={size} viewBox="0 0 24 24" fill={c}><path d="M8 5v14l11-7z" /></svg>;
    case 'cloud':      return <svg {...props}><path d="M7 18a5 5 0 010-10 6 6 0 0111.5 2 4 4 0 010 8z" /></svg>;
    case 'cloud-check':return <svg {...props}><path d="M7 18a5 5 0 010-10 6 6 0 0111.5 2 4 4 0 010 8" /><path d="m9 14 2.5 2.5L17 11" /></svg>;
    case 'check':      return <svg {...props}><path d="M5 12l5 5L20 7" /></svg>;
    case 'check-circle':return <svg {...props}><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></svg>;
    case 'spark':      return <svg {...props}><path d="M12 3v6M12 15v6M3 12h6M15 12h6M5.6 5.6l4.2 4.2M14.2 14.2l4.2 4.2M5.6 18.4l4.2-4.2M14.2 9.8l4.2-4.2" /></svg>;
    case 'lightning':  return <svg width={size} height={size} viewBox="0 0 24 24" fill={c}><path d="M13 2L4 14h6l-1 8 9-12h-6z" /></svg>;
    case 'link':       return <svg {...props}><path d="M10 14a4 4 0 005.66 0l3-3a4 4 0 00-5.66-5.66l-1.5 1.5" /><path d="M14 10a4 4 0 00-5.66 0l-3 3a4 4 0 005.66 5.66l1.5-1.5" /></svg>;
    case 'column':     return <svg {...props}><path d="M4 3v18M9 5l4-2 4 2v14l-4 2-4-2z" /><path d="M13 3v18" /></svg>;
    case 'note':       return <svg {...props}><path d="M14 4H6a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2v-8z" /><path d="M14 4v6h6" /></svg>;
    case 'send':       return <svg {...props}><path d="M5 12l16-8-6 18-3-7-7-3z" /></svg>;
    case 'pause':      return <svg {...props}><rect x="6" y="5" width="4" height="14" rx="1" fill={c} stroke="none" /><rect x="14" y="5" width="4" height="14" rx="1" fill={c} stroke="none" /></svg>;
    case 'reload':     return <svg {...props}><path d="M4 4v5h5" /><path d="M4 9A9 9 0 1121 12" /></svg>;
    case 'list':       return <svg {...props}><path d="M4 6h16M4 12h16M4 18h10" /></svg>;
    case 'clock':      return <svg {...props}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>;
    case 'fire':       return <svg {...props}><path d="M12 3c0 4-4 5-4 9a4 4 0 008 0c0-2-1-3-2-4 0 2-1 3-2 3 1-3 0-6 0-8z" /></svg>;
    case 'page':       return <svg {...props}><path d="M6 4h9l5 5v11H6z" /><path d="M15 4v5h5" /></svg>;
    case 'moon':       return <svg {...props}><path d="M20 14A8 8 0 0110 4a7 7 0 1010 10z" /></svg>;
    case 'filter':     return <svg {...props}><path d="M4 5h16l-6 8v6l-4-2v-4z" /></svg>;
    case 'globe':      return <svg {...props}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18" /></svg>;
    case 'settings':   return <svg {...props}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 01-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 01-4 0v-.1A1.7 1.7 0 009 19.4a1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 01-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 010-4h.1A1.7 1.7 0 004.6 9 1.7 1.7 0 004.3 7.2l-.1-.1a2 2 0 012.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 014 0v.1A1.7 1.7 0 0015 4.6a1.7 1.7 0 001.8-.3l.1-.1a2 2 0 012.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 010 4h-.1a1.7 1.7 0 00-1.5 1z" /></svg>;
    case 'folder':     return <svg {...props}><path d="M4 7a2 2 0 012-2h4l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H6a2 2 0 01-2-2z" /></svg>;
    case 'doc':        return <svg {...props}><path d="M7 3h8l4 4v14H7z" /><path d="M15 3v4h4" /><path d="M10 13h6M10 17h4" /></svg>;
    case 'chat':       return <svg {...props}><path d="M21 12a8 8 0 01-12.7 6.5L4 20l1.4-4.3A8 8 0 1121 12z" /></svg>;
    case 'download':   return <svg {...props}><path d="M12 4v12M7 12l5 5 5-5" /><path d="M4 20h16" /></svg>;
    default:           return <svg {...props}><circle cx="12" cy="12" r="9" /></svg>;
  }
}

/* ── Sync badge ─────────────────────────────── */
export function SyncBadge({ lang = 'ko', compact }) {
  const { T, F } = useTheme();
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, padding: compact ? '3px 8px' : '5px 10px',
      borderRadius: 999, background: T.surfaceAlt, border: `1px solid ${T.border}`,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: 999, background: T.secondary }} />
      <span style={{ fontSize: 10, fontWeight: 600, color: T.inkMid, fontFamily: F.body, letterSpacing: 0.3, whiteSpace: 'nowrap' }}>
        {lang === 'ko' ? 'Drive 동기화됨' : 'Synced'}
      </span>
    </div>
  );
}

/* ── Bottom tab bar ─────────────────────────── */
export function TabBar({ screen, setScreen, lang }) {
  const { T, F } = useTheme();
  const t = i18n[lang];
  const items = [
    { key: 'library',   icon: 'library',   label: t.library },
    { key: 'search',    icon: 'search',    label: t.search },
    { key: 'knowledge', icon: 'knowledge', label: t.knowledge },
    { key: 'goals',     icon: 'goals',     label: t.goals },
    { key: 'ai',        icon: 'ai',        label: t.aiChatShort || 'AI' },
  ];
  return (
    <div style={{ borderTop: `1px solid ${T.border}`, background: T.surface, padding: '8px 4px 0', flexShrink: 0 }}>
      <div style={{ display: 'flex' }}>
        {items.map(item => {
          const active = screen === item.key;
          return (
            <button key={item.key} onClick={() => setScreen(item.key)} style={{
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
              background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0',
              color: active ? T.accent : T.inkLight, transition: 'color .2s',
            }}>
              <Icon name={item.icon} size={22} stroke={active ? 2 : 1.5} />
              <span style={{ fontSize: 9.5, fontWeight: active ? 600 : 400, fontFamily: F.body, letterSpacing: 0.2, whiteSpace: 'nowrap' }}>{item.label}</span>
            </button>
          );
        })}
      </div>
      <div style={{ height: 20 }} />
    </div>
  );
}

/* ── Screen header ──────────────────────────── */
export function ScreenHeader({ title, subtitle, right }) {
  const { T, F } = useTheme();
  return (
    <div style={{ padding: '8px 22px 14px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexShrink: 0 }}>
      <div style={{ minWidth: 0, flex: 1 }}>
        {subtitle && <div style={{ fontSize: 10, fontWeight: 600, color: T.inkLight, letterSpacing: 1.6, textTransform: 'uppercase', fontFamily: F.body, marginBottom: 4, whiteSpace: 'nowrap' }}>{subtitle}</div>}
        <h1 style={{ margin: 0, fontSize: 30, fontWeight: 600, fontFamily: F.display, color: T.ink, lineHeight: 1.05, letterSpacing: -0.8, whiteSpace: 'nowrap' }}>{title}</h1>
      </div>
      {right && <div style={{ flexShrink: 0 }}>{right}</div>}
    </div>
  );
}
