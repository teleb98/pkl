import React, { useState } from 'react';
import { useGoogleAuth, hasDesktopOAuth } from '../utils/useGoogleAuth.js';
import { isElectron, isCapacitor, usesNativePicker } from '../utils/localBooks.js';
import { useTheme } from '../context.jsx';
import { Button, Icon } from '../components.jsx';
import { PklMark } from '../Logo.jsx';

export function GoogleLogo({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}

/* ── Step bar ─────────────────────────────────────────────────── */
function StepBar({ step, lang }) {
  const { T, F } = useTheme();
  const labels = lang === 'ko'
    ? ['Google', 'AI 키', '완료']
    : ['Google', 'AI Key', 'Done'];
  return (
    <div style={{ padding: '14px 24px 0', display: 'flex', alignItems: 'flex-start' }}>
      {labels.map((label, i) => {
        const done = step > i + 1;
        const active = step === i + 1;
        return (
          <React.Fragment key={i}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, flexShrink: 0 }}>
              <div style={{
                width: 28, height: 28, borderRadius: 999,
                background: done ? T.secondary : active ? T.accent : T.border,
                color: (done || active) ? '#FFF' : T.inkFaint,
                fontSize: 12, fontWeight: 700, fontFamily: F.body,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all .25s',
              }}>
                {done ? '✓' : i + 1}
              </div>
              <span style={{
                fontSize: 10, fontWeight: active || done ? 600 : 400,
                color: active ? T.accent : done ? T.secondary : T.inkFaint,
                fontFamily: F.body, whiteSpace: 'nowrap',
              }}>{label}</span>
            </div>
            {i < 2 && (
              <div style={{ flex: 1, height: 2, background: done ? T.secondary : T.border, margin: '13px 4px 0', borderRadius: 1, transition: 'background .35s' }} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

/* ── STEP 1: Google 계정 연결 ─────────────────────────────────── */
function Step1Google({ lang, onNext }) {
  const { T, F } = useTheme();
  const [status, setStatus] = useState('idle'); // idle | connecting | connected | error
  const [user, setUser] = useState(null);
  const ko = lang === 'ko';

  // 네이티브 앱(Electron/Capacitor) + OAuth 미설정 → 임베디드 웹뷰 OAuth 차단됨, 로컬 우선 안내
  const isNativeNoOAuth = usesNativePicker() && !hasDesktopOAuth();
  const nativeIcon = isCapacitor() ? '📱' : '💻';
  const nativeTitle = isCapacitor()
    ? (ko ? '앱으로 바로 시작' : 'Start with the App')
    : (ko ? '데스크톱 앱으로 바로 시작' : 'Start with the Desktop App');

  const googleLogin = useGoogleAuth({
    scope: 'openid email profile',
    onSuccess: async ({ access_token }) => {
      setStatus('connecting');
      try {
        const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
          headers: { Authorization: `Bearer ${access_token}` },
        });
        if (!res.ok) throw new Error('Failed');
        const data = await res.json();
        setUser({ ...data, accessToken: access_token });
        setStatus('connected');
      } catch {
        setStatus('error');
      }
    },
    onError: () => setStatus('error'),
  });

  // ── 네이티브 앱(OAuth 미설정): 로컬 우선 안내 화면 ──
  if (isNativeNoOAuth) {
    return (
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px 32px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div>
          <div style={{ width: 52, height: 52, borderRadius: 14, background: T.accentSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16, fontSize: 26 }}>{nativeIcon}</div>
          <h2 style={{ margin: '0 0 8px', fontSize: 24, fontWeight: 700, fontFamily: F.display, color: T.ink, letterSpacing: -0.5, lineHeight: 1.2 }}>
            {nativeTitle}
          </h2>
          <p style={{ margin: 0, fontSize: 13.5, color: T.inkLight, fontFamily: F.body, lineHeight: 1.7 }}>
            {ko
              ? '내 기기의 PDF를 추가해 네트워크 없이 바로 읽을 수 있어요.\nGoogle 로그인 없이도 모든 핵심 기능을 사용합니다.'
              : 'Add PDFs from your device and read instantly — no network needed.\nAll core features work without Google sign-in.'}
          </p>
        </div>

        <div style={{ background: T.accentSoft, borderRadius: 14, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 11 }}>
          {(ko
            ? ['내 기기 PDF 추가·읽기 (오프라인)', 'AI 어휘·퀴즈·형광펜 (AI 키만 있으면)', '메모·하이라이트·지식 정리']
            : ['Add & read local PDFs (offline)', 'AI vocab·quiz·highlight (with AI key)', 'Notes, highlights, knowledge']
          ).map((b, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 18, height: 18, borderRadius: 999, background: T.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name="check" size={10} stroke={2.5} color="#FFF" />
              </div>
              <span style={{ fontSize: 13, color: T.accentDeep, fontFamily: F.body, lineHeight: 1.4 }}>{b}</span>
            </div>
          ))}
        </div>

        <div style={{ background: T.surfaceAlt, borderRadius: 10, padding: '11px 13px', display: 'flex', gap: 9, alignItems: 'flex-start', border: `1px solid ${T.border}` }}>
          <Icon name="cloud" size={13} color={T.inkLight} />
          <span style={{ fontSize: 12, color: T.inkLight, fontFamily: F.body, lineHeight: 1.55 }}>
            {ko
              ? 'Google Drive 연동(클라우드 책·백업)은 데스크톱 OAuth 설정 후 사용할 수 있습니다. 자세한 내용은 설정을 참고하세요.'
              : 'Google Drive sync (cloud books·backup) requires desktop OAuth setup. See Settings for details.'}
          </span>
        </div>

        <div style={{ marginTop: 'auto', paddingTop: 8 }}>
          <Button variant="accent" onClick={() => onNext({})} style={{ width: '100%', padding: '15px' }}>
            {ko ? '로컬 PDF로 시작하기' : 'Start with Local PDFs'} <Icon name="forward" size={12} color="#FFF" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px 32px', display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div>
        <div style={{ width: 52, height: 52, borderRadius: 14, background: '#E8F0FE', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
          <GoogleLogo size={28} />
        </div>
        <h2 style={{ margin: '0 0 8px', fontSize: 24, fontWeight: 700, fontFamily: F.display, color: T.ink, letterSpacing: -0.5, lineHeight: 1.2 }}>
          {lang === 'ko' ? 'Google 계정으로 시작' : 'Sign in with Google'}
        </h2>
        <p style={{ margin: 0, fontSize: 13.5, color: T.inkLight, fontFamily: F.body, lineHeight: 1.7 }}>
          {lang === 'ko'
            ? '계정을 연결하면 앱에 프로필이 표시됩니다.\nGoogle Drive 연동은 이후 설정에서 추가할 수 있습니다.'
            : 'Your profile will appear in the app.\nYou can connect Google Drive later in Settings.'}
        </p>
      </div>

      {/* Benefits */}
      <div style={{ background: '#E8F0FE', borderRadius: 14, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 11 }}>
        {(lang === 'ko'
          ? ['프로필 이름·사진 표시', 'Drive PDF 연동 준비 (설정에서 활성화)', '기기 간 동기화 기반']
          : ['Profile name & photo in app', 'Ready for Drive PDF sync (enable in Settings)', 'Foundation for cross-device sync']
        ).map((b, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 18, height: 18, borderRadius: 999, background: '#4285F4', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon name="check" size={10} stroke={2.5} color="#FFF" />
            </div>
            <span style={{ fontSize: 13, color: '#1A3F7B', fontFamily: F.body, lineHeight: 1.4 }}>{b}</span>
          </div>
        ))}
      </div>

      {/* Permissions note */}
      <div style={{ background: T.surfaceAlt, borderRadius: 10, padding: '10px 13px', display: 'flex', gap: 9, alignItems: 'flex-start', border: `1px solid ${T.border}` }}>
        <Icon name="settings" size={13} color={T.inkLight} />
        <span style={{ fontSize: 12, color: T.inkLight, fontFamily: F.body, lineHeight: 1.55 }}>
          {lang === 'ko'
            ? '요청 권한: 프로필 정보만 (이름·이메일·사진). Drive 접근은 요청하지 않습니다.'
            : 'Permissions: Profile only (name, email, photo). No Drive access requested.'}
        </span>
      </div>

      {/* Connected state */}
      {status === 'connected' && user ? (
        <div style={{ background: T.secondarySoft, borderRadius: 14, padding: '13px 15px', display: 'flex', alignItems: 'center', gap: 12 }}>
          {user.picture
            ? <img src={user.picture} alt="" style={{ width: 40, height: 40, borderRadius: 999, flexShrink: 0, objectFit: 'cover' }} />
            : <div style={{ width: 40, height: 40, borderRadius: 999, background: T.secondary, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name="check" size={20} color="#FFF" stroke={2.4} /></div>
          }
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: T.secondary, fontFamily: F.body }}>{user.name}</div>
            <div style={{ fontSize: 12, color: T.inkLight, fontFamily: F.body, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.email}</div>
          </div>
          <Icon name="check" size={18} color={T.secondary} stroke={2.4} />
        </div>
      ) : (
        <button
          onClick={() => googleLogin()}
          disabled={status === 'connecting'}
          style={{ width: '100%', padding: '15px', borderRadius: 14, border: '1.5px solid #4285F4', background: status === 'connecting' ? '#E8F0FE' : T.surface, color: '#1A3F7B', fontSize: 15, fontWeight: 600, fontFamily: F.body, cursor: status === 'connecting' ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}
        >
          <GoogleLogo size={18} />
          {status === 'connecting' ? (lang === 'ko' ? '연결 중…' : 'Connecting…') : (lang === 'ko' ? 'Google 계정 연결' : 'Connect Google Account')}
        </button>
      )}

      {status === 'error' && (
        <p style={{ margin: 0, fontSize: 12.5, color: '#D93025', fontFamily: F.body, textAlign: 'center' }}>
          {lang === 'ko' ? '연결에 실패했습니다. 다시 시도해주세요.' : 'Connection failed. Please try again.'}
        </p>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 'auto', paddingTop: 8 }}>
        <Button variant="ghost" onClick={() => onNext({})} style={{ flex: 1 }}>
          {lang === 'ko' ? '건너뛰기' : 'Skip'}
        </Button>
        <Button variant="accent" onClick={() => onNext({ googleUser: user })} disabled={status !== 'connected'} style={{ flex: 1.8, padding: '14px' }}>
          {lang === 'ko' ? '다음' : 'Next'} <Icon name="forward" size={12} color="#FFF" />
        </Button>
      </div>
    </div>
  );
}

/* ── Real API key verification ────────────────────────────────── */
async function verifyClaude(key) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 5, messages: [{ role: 'user', content: 'hi' }] }),
  });
  if (res.ok || res.status === 429) return; // 성공 or 속도 제한 = 키 유효
  const d = await res.json().catch(() => ({}));
  const msg = (d.error?.message || '').toLowerCase();
  // 크레딧/과금 오류는 키 자체는 유효함
  if (msg.includes('credit') || msg.includes('balance') || msg.includes('billing')) return;
  if (res.status === 401) throw new Error('유효하지 않은 API 키입니다');
  if (res.status === 403) throw new Error('권한 오류 — 키 설정을 확인해주세요');
  throw new Error(`오류 ${res.status}`);
}

async function verifyGemini(key) {
  const res = await fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'hi' }] }], generationConfig: { maxOutputTokens: 5 } }),
    }
  );
  if (res.status === 429) return; // quota exceeded = key is valid
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    const status = res.status;
    if (status === 400 || status === 401 || status === 403) throw new Error('유효하지 않은 API 키입니다');
    throw new Error(`오류 ${status}`);
  }
}

/* ── STEP 2: API 키 입력 ─────────────────────────────────────── */
function Step2ApiKey({ lang, onNext }) {
  const { T, F } = useTheme();
  const [keys, setKeys] = useState({ claude: '', gemini: '' });
  const [status, setStatus] = useState({ claude: 'idle', gemini: 'idle' }); // idle | verifying | ok | error
  const [show, setShow] = useState({ claude: false, gemini: false });
  const [errMsg, setErrMsg] = useState({ claude: '', gemini: '' });

  const verify = async (id) => {
    const key = keys[id].trim();
    if (!key) return;
    setStatus(s => ({ ...s, [id]: 'verifying' }));
    setErrMsg(e => ({ ...e, [id]: '' }));
    try {
      if (id === 'claude') await verifyClaude(key);
      else await verifyGemini(key);
      setStatus(s => ({ ...s, [id]: 'ok' }));
    } catch (e) {
      setStatus(s => ({ ...s, [id]: 'error' }));
      setErrMsg(em => ({ ...em, [id]: e.message }));
    }
  };

  const anyOk = Object.values(status).some(s => s === 'ok');

  const providers = [
    {
      id: 'gemini',
      name: 'Gemini',
      sub: 'Google',
      badge: lang === 'ko' ? '🆓 무료 티어 제공' : '🆓 Free tier available',
      badgeColor: '#166534',
      badgeBg: '#F0FDF4',
      desc: lang === 'ko'
        ? '신용카드 없이 무료로 시작 · 분당 15회 요청'
        : 'Start free, no credit card · 15 req/min',
      color: '#4285F4', bg: '#E8F0FE', deep: '#1A3F7B',
      icon: <GoogleLogo size={20} />,
      docsUrl: 'https://aistudio.google.com/apikey',
      docsLabel: 'aistudio.google.com/apikey',
    },
    {
      id: 'claude',
      name: 'Claude',
      sub: 'Anthropic',
      badge: lang === 'ko' ? '💳 유료' : '💳 Paid',
      badgeColor: '#92400E',
      badgeBg: '#FFFBEB',
      desc: lang === 'ko'
        ? '고품질 추론·글쓰기 · 사용량만큼 과금'
        : 'High-quality reasoning & writing · Pay per use',
      color: T.accent, bg: T.accentSoft, deep: T.accentDeep,
      icon: <div style={{ width: 20, height: 20, borderRadius: 5, background: T.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFF', fontWeight: 700, fontSize: 12 }}>✦</div>,
      docsUrl: 'https://console.anthropic.com/settings/keys',
      docsLabel: 'console.anthropic.com',
    },
  ];

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px 32px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <h2 style={{ margin: '0 0 8px', fontSize: 24, fontWeight: 700, fontFamily: F.display, color: T.ink, letterSpacing: -0.5, lineHeight: 1.2 }}>
          {lang === 'ko' ? 'AI 키 연결' : 'Connect your AI key'}
        </h2>
        <p style={{ margin: 0, fontSize: 13.5, color: T.inkLight, fontFamily: F.body, lineHeight: 1.7 }}>
          {lang === 'ko'
            ? 'AI 기능은 본인의 API 키를 사용합니다. 비용은 사용자 계정에서 직접 소비됩니다.'
            : 'AI features use your own API key. Usage costs go directly to your account.'}
        </p>
      </div>

      {providers.map(p => {
        const s = status[p.id];
        const isOk = s === 'ok';
        return (
          <div key={p.id} style={{
            borderRadius: 14,
            border: `1.5px solid ${isOk ? p.color : T.border}`,
            boxShadow: isOk ? `0 0 0 3px ${p.bg}` : 'none',
            background: T.surface,
            transition: 'all .2s',
          }}>
            {/* Provider header */}
            <div style={{ padding: '13px 14px 10px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <div style={{ width: 36, height: 36, borderRadius: 9, background: p.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {p.icon}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 3 }}>
                  <span style={{ fontSize: 14.5, fontWeight: 700, color: T.ink, fontFamily: F.body }}>{p.name}</span>
                  <span style={{ fontSize: 11.5, color: T.inkLight, fontFamily: F.body }}>{p.sub}</span>
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: p.badgeColor, background: p.badgeBg, padding: '2px 8px', borderRadius: 999, fontFamily: F.body }}>{p.badge}</span>
                  {isOk && <span style={{ fontSize: 10.5, fontWeight: 600, color: T.secondary, background: T.secondarySoft, padding: '2px 8px', borderRadius: 999, fontFamily: F.body }}>✓ {lang === 'ko' ? '연결됨' : 'Connected'}</span>}
                </div>
                <p style={{ margin: 0, fontSize: 12, color: T.inkLight, fontFamily: F.body, lineHeight: 1.5 }}>{p.desc}</p>
              </div>
            </div>

            {/* Divider */}
            <div style={{ height: 1, background: T.border, margin: '0 14px' }} />

            {/* Input area */}
            <div style={{ padding: '12px 14px 14px' }}>
              {isOk ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, background: T.secondarySoft, borderRadius: 10, padding: '11px 13px' }}>
                  <Icon name="check" size={14} color={T.secondary} stroke={2.4} />
                  <span style={{ flex: 1, fontSize: 12.5, color: T.secondary, fontFamily: F.mono, fontWeight: 600 }}>{'••••••••••••••••••••'}</span>
                  <button onClick={() => setStatus(st => ({ ...st, [p.id]: 'idle' }))} style={{ background: 'none', border: 'none', color: T.inkLight, fontSize: 12, fontFamily: F.body, cursor: 'pointer', padding: '2px 6px' }}>
                    {lang === 'ko' ? '변경' : 'Change'}
                  </button>
                </div>
              ) : (
                <>
                  <a href={p.docsUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10, padding: '9px 12px', borderRadius: 10, background: p.bg, border: `1px solid ${p.color}33`, textDecoration: 'none' }}>
                    <span style={{ fontSize: 12.5, color: p.deep, fontFamily: F.body }}>
                      {lang === 'ko' ? 'API 키 발급받기' : 'Get API key'}
                    </span>
                    <span style={{ fontSize: 11, color: p.color, fontFamily: F.mono, fontWeight: 600 }}>{p.docsLabel} ↗</span>
                  </a>

                  <div style={{ position: 'relative', marginBottom: s === 'error' ? 8 : 0 }}>
                    <input
                      type={show[p.id] ? 'text' : 'password'}
                      value={keys[p.id]}
                      onChange={e => {
                        setKeys(k => ({ ...k, [p.id]: e.target.value }));
                        setStatus(st => ({ ...st, [p.id]: 'idle' }));
                        setErrMsg(em => ({ ...em, [p.id]: '' }));
                      }}
                      onKeyDown={e => e.key === 'Enter' && verify(p.id)}
                      placeholder={lang === 'ko' ? 'API Key 붙여넣기…' : 'Paste API Key…'}
                      style={{
                        display: 'block', width: '100%', boxSizing: 'border-box',
                        padding: '15px 52px 15px 14px',
                        fontSize: 14, fontFamily: F.mono, color: T.ink,
                        background: T.surfaceAlt,
                        border: `2px solid ${s === 'error' ? '#D24339' : T.border}`,
                        borderRadius: 12, outline: 'none',
                        WebkitAppearance: 'none', appearance: 'none',
                      }}
                    />
                    <button
                      onClick={() => setShow(sh => ({ ...sh, [p.id]: !sh[p.id] }))}
                      style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 52, background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                      {show[p.id] ? '🙈' : '👁'}
                    </button>
                  </div>

                  {s === 'error' && (
                    <p style={{ margin: '0 0 8px', fontSize: 11.5, color: '#D24339', fontFamily: F.body, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                      ⚠ {errMsg[p.id] || (lang === 'ko' ? '유효하지 않은 키입니다' : 'Invalid API key')}
                    </p>
                  )}

                  <button
                    onClick={() => verify(p.id)}
                    disabled={!keys[p.id].trim() || s === 'verifying'}
                    style={{
                      display: 'block', width: '100%', marginTop: 10,
                      padding: '13px', borderRadius: 12, border: 'none',
                      background: keys[p.id].trim() ? p.color : T.border,
                      color: '#FFF', fontSize: 14, fontWeight: 600, fontFamily: F.body,
                      cursor: keys[p.id].trim() ? 'pointer' : 'default',
                    }}
                  >
                    {s === 'verifying'
                      ? (lang === 'ko' ? '검증 중…' : 'Verifying…')
                      : (lang === 'ko' ? '연결 확인' : 'Verify')}
                  </button>
                </>
              )}
            </div>
          </div>
        );
      })}

      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <Button variant="ghost" onClick={() => onNext({})} style={{ flex: 1 }}>
          {lang === 'ko' ? '나중에 설정' : 'Set up later'}
        </Button>
        <Button
          variant="accent"
          onClick={() => onNext({ apiKeys: { claude: status.claude === 'ok' ? keys.claude : '', gemini: status.gemini === 'ok' ? keys.gemini : '' } })}
          disabled={!anyOk}
          style={{ flex: 1.8, padding: '14px' }}
        >
          {lang === 'ko' ? '다음' : 'Next'} <Icon name="forward" size={12} color="#FFF" />
        </Button>
      </div>
    </div>
  );
}

/* ── STEP 3: 완료 ─────────────────────────────────────────────── */
function Step3Done({ lang, onFinish, googleUser, apiKeys }) {
  const { T, F } = useTheme();
  const hasAI = !!(apiKeys?.claude || apiKeys?.gemini);
  const hasGoogle = !!googleUser;

  const items = [
    {
      icon: hasGoogle ? '✅' : '⬜',
      label: lang === 'ko' ? 'Google 계정' : 'Google Account',
      detail: hasGoogle ? googleUser.email : (lang === 'ko' ? '건너뜀 — 설정에서 추가 가능' : 'Skipped — add later in Settings'),
    },
    {
      icon: hasAI ? '✅' : '⬜',
      label: lang === 'ko' ? 'AI 도우미' : 'AI Assistant',
      detail: hasAI
        ? [apiKeys?.gemini ? 'Gemini' : '', apiKeys?.claude ? 'Claude' : ''].filter(Boolean).join(' + ')
        : (lang === 'ko' ? '건너뜀 — 설정(⚙)에서 추가 가능' : 'Skipped — add in Settings (⚙)'),
    },
    {
      icon: '📁',
      label: lang === 'ko' ? 'Google Drive 연동' : 'Google Drive Sync',
      detail: lang === 'ko' ? '설정(⚙) → Drive 연결에서 추가' : 'Add via Settings (⚙) → Connect Drive',
    },
    {
      icon: '📝',
      label: lang === 'ko' ? '메모 · 하이라이트 · 목표' : 'Notes · Highlights · Goals',
      detail: lang === 'ko' ? '바로 사용 가능' : 'Ready to use',
    },
  ];

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px 32px', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ textAlign: 'center', paddingTop: 8 }}>
        <div style={{ fontSize: 52, marginBottom: 14 }}>📚</div>
        <h2 style={{ margin: '0 0 8px', fontSize: 26, fontWeight: 700, fontFamily: F.display, color: T.ink, letterSpacing: -0.6 }}>
          {lang === 'ko' ? '준비 완료!' : "You're all set!"}
        </h2>
        <p style={{ margin: 0, fontSize: 14, color: T.inkLight, fontFamily: F.body, lineHeight: 1.65 }}>
          {lang === 'ko' ? '서재에서 바로 독서를 시작하세요.' : 'Start reading right from your library.'}
        </p>
      </div>

      <div style={{ background: T.surface, borderRadius: 14, border: `1px solid ${T.border}`, overflow: 'hidden' }}>
        {items.map((item, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 15px', borderBottom: i < items.length - 1 ? `1px solid ${T.border}` : 'none' }}>
            <span style={{ fontSize: 18, flexShrink: 0, width: 24, textAlign: 'center' }}>{item.icon}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: T.ink, fontFamily: F.body }}>{item.label}</div>
              <div style={{ fontSize: 12, color: T.inkLight, fontFamily: F.body, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.detail}</div>
            </div>
          </div>
        ))}
      </div>

      {!hasAI && (
        <div style={{ background: T.accentSoft, borderRadius: 12, padding: '12px 14px', display: 'flex', gap: 9, alignItems: 'flex-start' }}>
          <Icon name="lightning" size={14} color={T.accent} />
          <span style={{ fontSize: 12.5, color: T.accentDeep, fontFamily: F.body, lineHeight: 1.6 }}>
            {lang === 'ko'
              ? 'AI 키 없이도 서재·메모·목표를 바로 사용할 수 있어요. 설정(⚙) → AI 키 관리에서 언제든지 추가하세요.'
              : 'Library, notes, and goals work without an AI key. Add one anytime in Settings (⚙) → AI Keys.'}
          </span>
        </div>
      )}

      <Button variant="accent" full onClick={onFinish} style={{ padding: '15px', fontSize: 15 }}>
        {lang === 'ko' ? '서재 시작하기' : 'Go to Library'} <Icon name="forward" size={13} color="#FFF" />
      </Button>
    </div>
  );
}

/* ── Shell ────────────────────────────────────────────────────── */
export function OnboardingFlow({ lang, onFinish }) {
  const { T } = useTheme();
  const [step, setStep] = useState(1);
  const [googleUser, setGoogleUser] = useState(null);
  const [apiKeys, setApiKeys] = useState({ claude: '', gemini: '' });

  const nextStep = (data = {}) => {
    if (data.googleUser) setGoogleUser(data.googleUser);
    if (data.apiKeys) setApiKeys(data.apiKeys);
    setStep(s => s + 1);
  };

  const finish = () => onFinish({ googleUser, apiKeys, driveFolder: null });

  return (
    <div style={{ position: 'absolute', inset: '44px 0 0 0', background: T.bg, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{ width: '100%', maxWidth: 480, display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '16px 0 4px' }}>
          <PklMark size={44} />
        </div>
        <StepBar step={step} lang={lang} />

        {step === 1 && <Step1Google lang={lang} onNext={nextStep} />}
        {step === 2 && <Step2ApiKey lang={lang} onNext={nextStep} />}
        {step === 3 && <Step3Done lang={lang} onFinish={finish} googleUser={googleUser} apiKeys={apiKeys} />}

        {/* Dots */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, padding: '8px 0 16px', flexShrink: 0 }}>
          {[1, 2, 3].map(s => (
            <div key={s} style={{ width: s === step ? 22 : 7, height: 7, borderRadius: 4, background: s === step ? T.accent : s < step ? T.secondary : T.border, transition: 'all .25s' }} />
          ))}
        </div>
      </div>
    </div>
  );
}
