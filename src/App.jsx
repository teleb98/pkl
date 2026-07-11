import { useState, useEffect, useCallback, useRef } from 'react';
import { useGoogleAuth } from './utils/useGoogleAuth.js';
import { isElectron } from './utils/localBooks.js';
import { ThemeContext } from './context.jsx';
import { THEMES, TYPE_PAIRS } from './data.js';
import { TabBar, Icon } from './components.jsx';
import { Toaster } from './components/Toast.jsx';
import { GoogleLogo } from './screens/OnboardingFlow.jsx';
import { LibraryScreen } from './screens/LibraryScreen.jsx';
import { ReaderScreen } from './screens/ReaderScreen.jsx';
import { SearchScreen } from './screens/SearchScreen.jsx';
import { KnowledgeScreen } from './screens/KnowledgeScreen.jsx';
import { GoalsScreen } from './screens/GoalsScreen.jsx';
import { AIChatScreen } from './screens/AIChatScreen.jsx';
import { DriveSaveSheet } from './screens/DriveSaveSheet.jsx';
import { SplashScreen } from './screens/SplashScreen.jsx';
import { OnboardingFlow } from './screens/OnboardingFlow.jsx';
import { AddBookFlow } from './screens/AddBookFlow.jsx';
import { DesktopShell } from './screens/DesktopLayout.jsx';
import { PklMark } from './Logo.jsx';
import { getBackupSettings, saveBackupSettings, appendBackupLog, getLastBackupTime, getNotesByBook, getHighlightsByBook, getBookIndex } from './store.js';
import { backupAllToDrive, DriveError } from './utils/driveBackup.js';
import { getCacheInfo, clearAllCache, deleteCachedPdf } from './utils/pdfCache.js';

/* ── Settings panel ───────────────────────────────────────────── */
function SettingsPanel({ settings, setSettings, onClose, userConfig, onUpdateConfig }) {
  const themeKey = settings.dark ? `${settings.theme}Dark` : settings.theme;
  const T = THEMES[themeKey] || THEMES.ember;
  const F = TYPE_PAIRS[settings.type] || TYPE_PAIRS.lora;
  const themes = [{ v: 'ember', label: '🟠 Ember' }, { v: 'sage', label: '🟢 Sage' }, { v: 'ink', label: '🔵 Ink' }];
  const types = [{ v: 'lora', label: 'Lora' }, { v: 'newsreader', label: 'Newsreader' }, { v: 'cormorant', label: 'Cormorant' }];
  const lang = settings.lang;

  const [claudeKey, setClaudeKey] = useState(userConfig?.apiKeys?.claude || '');
  const [geminiKey, setGeminiKey] = useState(userConfig?.apiKeys?.gemini || '');
  const [visionKey, setVisionKey] = useState(userConfig?.apiKeys?.vision || '');
  const [ocrMode, setOcrMode] = useState(userConfig?.ocrMode || 'auto'); // auto | local | cloud
  const [gemmaModelUrl, setGemmaModelUrl] = useState(userConfig?.gemmaModelUrl || ''); // 브라우저 Gemma 4 OCR 모델(.litertlm) URL
  const [showClaude, setShowClaude] = useState(false);
  const [showGemini, setShowGemini] = useState(false);
  const [showVision, setShowVision] = useState(false);
  const [saved, setSaved] = useState(false);
  const [keyTest, setKeyTest] = useState({});

  // Drive folder picker state
  const [drivePicker, setDrivePicker] = useState('idle'); // idle | loading | picking | error
  const [driveFolders, setDriveFolders] = useState([]);
  const [driveErr, setDriveErr] = useState('');

  // PDF 캐시 state
  const [cacheInfo, setCacheInfo] = useState(null);
  const [cacheClearing, setCacheClearing] = useState(false);

  const loadCacheInfo = async () => {
    const info = await getCacheInfo();
    setCacheInfo(info);
  };

  // 4-5: Drive 백업 state
  const [backupSettings, setBackupSettings] = useState(() => getBackupSettings());
  const [backupState, setBackupState] = useState('idle'); // idle | running | ok | error
  const [backupMsg, setBackupMsg] = useState('');
  const lastBackupTime = getLastBackupTime();

  const saveBackup = (patch) => {
    const next = { ...backupSettings, ...patch };
    setBackupSettings(next);
    saveBackupSettings(next);
  };

  const saveKeys = () => {
    const updated = { ...(userConfig || {}), apiKeys: { claude: claudeKey.trim(), gemini: geminiKey.trim(), vision: visionKey.trim() }, ocrMode, gemmaModelUrl: gemmaModelUrl.trim() };
    onUpdateConfig && onUpdateConfig(updated);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const testKey = async (id, key) => {
    if (!key.trim()) return;
    setKeyTest(s => ({ ...s, [id]: 'testing' }));
    try {
      let status;
      if (id === 'gemini') {
        const res = await fetch(
          'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
          {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-goog-api-key': key.trim() },
            body: JSON.stringify({ contents: [{ parts: [{ text: '1+1=' }] }] }),
          }
        );
        if (res.ok) status = 'ok';
        else if (res.status === 400 || res.status === 401 || res.status === 403) status = 'invalid-key';
        else if (res.status === 429) status = 'rate-limit';
        else status = 'error';
      } else if (id === 'vision') {
        const res = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(key.trim())}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ requests: [{ image: { content: 'R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==' }, features: [{ type: 'TEXT_DETECTION', maxResults: 1 }] }] }),
        });
        if (res.ok) status = 'ok';
        else if (res.status === 400 || res.status === 401 || res.status === 403) status = 'invalid-key';
        else if (res.status === 429) status = 'rate-limit';
        else status = 'error';
      } else {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-key': key.trim(),
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true',
          },
          body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] }),
        });
        if (res.ok) status = 'ok';
        else if (res.status === 401 || res.status === 403) status = 'invalid-key';
        else if (res.status === 429) status = 'rate-limit';
        else status = 'error';
      }
      setKeyTest(s => ({ ...s, [id]: status }));
    } catch {
      setKeyTest(s => ({ ...s, [id]: 'error' }));
    }
  };

  const connectGoogle = useGoogleAuth({
    scope: 'openid email profile',
    onSuccess: async ({ access_token }) => {
      try {
        const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
          headers: { Authorization: `Bearer ${access_token}` },
        });
        const data = await res.json();
        const updated = { ...(userConfig || {}), googleUser: { ...data, accessToken: access_token } };
        onUpdateConfig && onUpdateConfig(updated);
      } catch {}
    },
    onError: () => {},
  });

  // Drive OAuth — 폴더 목록까지 바로 가져옴
  const connectDriveFolder = useGoogleAuth({
    scope: 'https://www.googleapis.com/auth/drive.readonly',
    hint: userConfig?.googleUser?.email || '',
    onSuccess: async ({ access_token, expires_in }) => {
      setDrivePicker('loading');
      setDriveErr('');
      try {
        const token = access_token;
        const q = "mimeType='application/vnd.google-apps.folder' and 'root' in parents and trashed=false";
        const res = await fetch(
          `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)&orderBy=name&pageSize=50`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!res.ok) throw new Error(`Drive API 오류 ${res.status}`);
        const data = await res.json();
        // 토큰 저장 (만료 시각 함께 저장)
        onUpdateConfig && onUpdateConfig({
          ...(userConfig || {}),
          driveAccessToken: token,
          driveTokenExpiresAt: Date.now() + ((expires_in || 3600) * 1000),
        });
        setDriveFolders(data.files || []);
        setDrivePicker('picking');
      } catch (e) {
        setDriveErr(e.message);
        setDrivePicker('error');
      }
    },
    onError: () => { setDrivePicker('idle'); },
  });

  const selectFolder = (folder) => {
    onUpdateConfig && onUpdateConfig({ ...(userConfig || {}), driveFolder: { id: folder.id, name: folder.name } });
    setDrivePicker('idle');
  };

  // drive.file 권한 요청 (백업용)
  const requestWriteAccess = useGoogleAuth({
    scope: 'https://www.googleapis.com/auth/drive.file',
    prompt: 'consent',
    hint: userConfig?.googleUser?.email || '',
    onSuccess: ({ access_token, expires_in }) => {
      saveBackup({
        writeToken: access_token,
        writeTokenExpiresAt: Date.now() + ((expires_in || 3600) * 1000),
      });
    },
    onError: () => setBackupMsg(lang === 'ko' ? '권한 요청 실패' : 'Permission denied'),
  });

  const runManualBackup = async () => {
    const token = backupSettings.writeToken;
    if (!token) { requestWriteAccess(); return; }
    setBackupState('running');
    setBackupMsg('');
    try {
      const books = getBookIndex();
      const { succeeded, failed } = await backupAllToDrive(
        token, books, getNotesByBook, getHighlightsByBook
      );
      appendBackupLog({ status: 'ok', succeeded: succeeded.length, failed: failed.length });
      setBackupState('ok');
      setBackupMsg(lang === 'ko'
        ? `✓ ${succeeded.length}권 백업 완료${failed.length ? ` (${failed.length}권 실패)` : ''}`
        : `✓ ${succeeded.length} book(s) backed up${failed.length ? ` (${failed.length} failed)` : ''}`
      );
    } catch (e) {
      appendBackupLog({ status: 'error', error: e.message });
      if (e instanceof DriveError && e.status === 401) {
        saveBackup({ writeToken: null });
        setBackupMsg(lang === 'ko' ? '토큰 만료. 다시 연결해주세요.' : 'Token expired. Reconnect.');
      } else {
        setBackupMsg(lang === 'ko' ? `오류: ${e.message}` : `Error: ${e.message}`);
      }
      setBackupState('error');
    }
    setTimeout(() => setBackupState('idle'), 3000);
  };

  const disconnectDrive = () => {
    const upd = { ...(userConfig || {}) };
    delete upd.driveFolder;
    delete upd.driveAccessToken;
    onUpdateConfig && onUpdateConfig(upd);
    setDrivePicker('idle');
  };

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', zIndex: 500, display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: T.surface, borderRadius: '16px 16px 0 0', width: '100%', maxWidth: 380, padding: '16px 20px 32px', boxShadow: '0 -12px 40px rgba(0,0,0,.2)', margin: '0 0 0 auto', maxHeight: '85vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: T.ink, fontFamily: F.display }}>{lang === 'ko' ? '설정' : 'Settings'}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.inkMid, display: 'flex' }}><Icon name="close" size={18} color={T.inkMid} /></button>
        </div>

        {/* Theme */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: T.inkLight, letterSpacing: 1.2, textTransform: 'uppercase', fontFamily: F.body, marginBottom: 8 }}>{lang === 'ko' ? '색상 테마' : 'Theme'}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {themes.map(th => <button key={th.v} onClick={() => setSettings(s => ({ ...s, theme: th.v }))} style={{ flex: 1, padding: '10px 0', borderRadius: 10, border: `1.5px solid ${settings.theme === th.v ? T.ink : T.border}`, background: settings.theme === th.v ? T.ink : T.surface, color: settings.theme === th.v ? T.surface : T.ink, fontSize: 12, fontWeight: 600, fontFamily: F.body, cursor: 'pointer' }}>{th.label}</button>)}
          </div>
        </div>

        {/* Dark mode */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: T.inkLight, letterSpacing: 1.2, textTransform: 'uppercase', fontFamily: F.body, marginBottom: 8 }}>{lang === 'ko' ? '다크 모드' : 'Dark Mode'}</div>
          <div onClick={() => setSettings(s => ({ ...s, dark: !s.dark }))} style={{ width: 48, height: 28, borderRadius: 999, position: 'relative', cursor: 'pointer', background: settings.dark ? T.ink : T.border, transition: 'background .25s' }}>
            <div style={{ position: 'absolute', top: 3, left: settings.dark ? 23 : 3, width: 22, height: 22, borderRadius: 999, background: T.surface, transition: 'left .25s', boxShadow: '0 1px 3px rgba(0,0,0,.2)' }} />
          </div>
        </div>

        {/* Font */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: T.inkLight, letterSpacing: 1.2, textTransform: 'uppercase', fontFamily: F.body, marginBottom: 8 }}>{lang === 'ko' ? '서체' : 'Typeface'}</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {types.map(tp => <button key={tp.v} onClick={() => setSettings(s => ({ ...s, type: tp.v }))} style={{ flex: 1, padding: '8px 0', borderRadius: 9, border: `1.5px solid ${settings.type === tp.v ? T.ink : T.border}`, background: settings.type === tp.v ? T.surfaceAlt : T.surface, color: settings.type === tp.v ? T.ink : T.inkMid, fontSize: 11, fontWeight: settings.type === tp.v ? 600 : 400, fontFamily: tp.v === 'lora' ? "'Lora', serif" : tp.v === 'newsreader' ? "'Newsreader', serif" : "'Cormorant Garamond', serif", cursor: 'pointer' }}>{tp.label}</button>)}
          </div>
        </div>

        {/* Language */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: T.inkLight, letterSpacing: 1.2, textTransform: 'uppercase', fontFamily: F.body, marginBottom: 8 }}>{lang === 'ko' ? '언어' : 'Language'}</div>
          <div style={{ display: 'flex', gap: 6, background: T.surfaceAlt, padding: 3, borderRadius: 10, border: `1px solid ${T.border}` }}>
            {[{ v: 'ko', l: '한국어' }, { v: 'en', l: 'English' }].map(lg => <button key={lg.v} onClick={() => setSettings(s => ({ ...s, lang: lg.v }))} style={{ flex: 1, padding: '8px 0', borderRadius: 7, border: 'none', background: settings.lang === lg.v ? T.surface : 'transparent', color: settings.lang === lg.v ? T.ink : T.inkLight, fontSize: 13, fontWeight: settings.lang === lg.v ? 600 : 400, fontFamily: F.body, cursor: 'pointer', boxShadow: settings.lang === lg.v ? `0 1px 4px ${T.ink}15` : 'none' }}>{lg.l}</button>)}
          </div>
        </div>

        {/* Google Account */}
        <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 18, marginBottom: 16 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: T.inkLight, letterSpacing: 1.2, textTransform: 'uppercase', fontFamily: F.body, marginBottom: 10 }}>
            {lang === 'ko' ? 'Google 계정' : 'Google Account'}
          </div>
          {userConfig?.googleUser ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: T.surfaceAlt, borderRadius: 12, padding: '10px 13px', border: `1px solid ${T.border}` }}>
              {userConfig.googleUser.picture
                ? <img src={userConfig.googleUser.picture} alt="" style={{ width: 34, height: 34, borderRadius: 999, flexShrink: 0 }} />
                : <div style={{ width: 34, height: 34, borderRadius: 999, background: '#4285F4', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><GoogleLogo size={18} /></div>
              }
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: T.ink, fontFamily: F.body }}>{userConfig.googleUser.name}</div>
                <div style={{ fontSize: 11, color: T.inkLight, fontFamily: F.body, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{userConfig.googleUser.email}</div>
              </div>
              <button onClick={() => { const upd = { ...(userConfig || {}) }; delete upd.googleUser; delete upd.driveAccessToken; delete upd.driveConnected; onUpdateConfig && onUpdateConfig(upd); }} style={{ background: 'none', border: `1px solid ${T.border}`, borderRadius: 7, padding: '4px 9px', fontSize: 11, color: T.inkLight, fontFamily: F.body, cursor: 'pointer' }}>
                {lang === 'ko' ? '해제' : 'Unlink'}
              </button>
            </div>
          ) : (
            <button onClick={() => connectGoogle()} style={{ width: '100%', padding: '11px 14px', borderRadius: 12, border: `1.5px solid #4285F4`, background: T.surface, color: '#1A3F7B', fontSize: 13, fontWeight: 600, fontFamily: F.body, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <GoogleLogo size={16} />
              {lang === 'ko' ? 'Google 계정 연결' : 'Connect Google Account'}
            </button>
          )}
        </div>

        {/* Google Drive 서재 */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: T.inkLight, letterSpacing: 1.2, textTransform: 'uppercase', fontFamily: F.body, marginBottom: 10 }}>
            {lang === 'ko' ? 'Google Drive 서재' : 'Google Drive Library'}
          </div>

          {userConfig?.driveFolder ? (
            /* ── 폴더 연결됨 ── */
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#F0FDF4', borderRadius: 12, padding: '11px 13px', border: '1px solid #BBF7D0' }}>
                <span style={{ fontSize: 20, flexShrink: 0 }}>📁</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#166534', fontFamily: F.body, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {userConfig.driveFolder.name}
                  </div>
                  <div style={{ fontSize: 11, color: '#15803D', fontFamily: F.body }}>
                    {lang === 'ko' ? '서재에서 PDF를 불러옵니다' : 'PDFs are loaded into your library'}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
                  <button onClick={() => { setDrivePicker('idle'); connectDriveFolder(); }} style={{ background: 'none', border: '1px solid #BBF7D0', borderRadius: 7, padding: '3px 8px', fontSize: 10, color: '#166534', fontFamily: F.body, cursor: 'pointer' }}>
                    {lang === 'ko' ? '변경' : 'Change'}
                  </button>
                  <button onClick={disconnectDrive} style={{ background: 'none', border: '1px solid #BBF7D0', borderRadius: 7, padding: '3px 8px', fontSize: 10, color: '#6B7280', fontFamily: F.body, cursor: 'pointer' }}>
                    {lang === 'ko' ? '해제' : 'Unlink'}
                  </button>
                </div>
              </div>
            </div>
          ) : drivePicker === 'loading' ? (
            /* ── 폴더 목록 로딩 중 ── */
            <div style={{ padding: '14px', borderRadius: 12, background: T.surfaceAlt, border: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 16, height: 16, borderRadius: '50%', border: `2px solid ${T.border}`, borderTopColor: T.accent, animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: T.inkLight, fontFamily: F.body }}>
                {lang === 'ko' ? 'Drive 폴더 불러오는 중…' : 'Loading Drive folders…'}
              </span>
              <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
            </div>
          ) : drivePicker === 'picking' ? (
            /* ── 폴더 선택 UI ── */
            <div style={{ border: `1.5px solid ${T.accent}`, borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ padding: '10px 12px', background: T.accentSoft, borderBottom: `1px solid ${T.accent}33` }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: T.accentDeep, fontFamily: F.body }}>
                  {lang === 'ko' ? '서재로 사용할 폴더를 선택하세요' : 'Select a folder for your library'}
                </div>
              </div>
              <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                {driveFolders.length === 0 ? (
                  <div style={{ padding: '16px 12px', fontSize: 12, color: T.inkLight, fontFamily: F.body, textAlign: 'center' }}>
                    {lang === 'ko' ? 'Drive 루트에 폴더가 없습니다' : 'No folders found in Drive root'}
                  </div>
                ) : (
                  driveFolders.map(folder => (
                    <button key={folder.id} onClick={() => selectFolder(folder)} style={{ width: '100%', padding: '10px 12px', border: 'none', borderBottom: `1px solid ${T.border}`, background: T.surface, color: T.ink, fontSize: 13, fontFamily: F.body, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 9, textAlign: 'left' }}>
                      <span style={{ fontSize: 16, flexShrink: 0 }}>📁</span>
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{folder.name}</span>
                      <span style={{ fontSize: 11, color: T.accent, fontWeight: 600, flexShrink: 0 }}>
                        {lang === 'ko' ? '선택' : 'Select'}
                      </span>
                    </button>
                  ))
                )}
              </div>
              <button onClick={() => setDrivePicker('idle')} style={{ width: '100%', padding: '9px', border: 'none', borderTop: `1px solid ${T.border}`, background: T.surfaceAlt, color: T.inkLight, fontSize: 12, fontFamily: F.body, cursor: 'pointer' }}>
                {lang === 'ko' ? '취소' : 'Cancel'}
              </button>
            </div>
          ) : userConfig?.googleUser ? (
            /* ── 연결 버튼 (Google 계정 있음) ── */
            <div>
              <button onClick={() => connectDriveFolder()} style={{ width: '100%', padding: '11px 14px', borderRadius: 12, border: `1.5px solid #34A853`, background: T.surface, color: '#166534', fontSize: 13, fontWeight: 600, fontFamily: F.body, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <span>📁</span>
                {lang === 'ko' ? 'Drive 폴더 연결하기' : 'Connect Drive Folder'}
              </button>
              {drivePicker === 'error' && (
                <p style={{ margin: '6px 0 0', fontSize: 11, color: '#D24339', fontFamily: F.body }}>⚠ {driveErr}</p>
              )}
            </div>
          ) : (
            /* ── Google 계정 미연결 ── */
            <div style={{ padding: '11px 13px', borderRadius: 12, background: T.surfaceAlt, border: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: 9 }}>
              <span style={{ fontSize: 16 }}>📁</span>
              <span style={{ fontSize: 12, color: T.inkLight, fontFamily: F.body, lineHeight: 1.5 }}>
                {lang === 'ko' ? '위에서 Google 계정을 먼저 연결해주세요.' : 'Connect your Google account above first.'}
              </span>
            </div>
          )}
        </div>

        {/* PDF 캐시 관리 */}
        <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 18 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: T.inkLight, letterSpacing: 1.2, textTransform: 'uppercase', fontFamily: F.body, marginBottom: 12 }}>
            {lang === 'ko' ? 'PDF 캐시' : 'PDF Cache'}
          </div>
          <div style={{ background: T.surfaceAlt, borderRadius: 12, padding: '12px 14px', border: `1px solid ${T.border}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <span style={{ fontSize: 20 }}>⚡</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: T.ink, fontFamily: F.body }}>
                  {lang === 'ko' ? '로컬 캐시 (IndexedDB)' : 'Local Cache (IndexedDB)'}
                </div>
                <div style={{ fontSize: 10, color: T.inkLight, fontFamily: F.body, marginTop: 2 }}>
                  {cacheInfo == null
                    ? (lang === 'ko' ? '용량 확인 중…' : 'Checking…')
                    : cacheInfo.count === 0
                    ? (lang === 'ko' ? '캐시 없음' : 'No cache')
                    : (lang === 'ko'
                        ? `${cacheInfo.count}권 캐시됨 · ${(cacheInfo.totalBytes / 1024 / 1024).toFixed(1)} MB`
                        : `${cacheInfo.count} book(s) cached · ${(cacheInfo.totalBytes / 1024 / 1024).toFixed(1)} MB`)}
                </div>
              </div>
              <button
                onClick={loadCacheInfo}
                style={{ background: 'none', border: `1px solid ${T.border}`, borderRadius: 6, padding: '3px 8px', fontSize: 10, color: T.inkLight, cursor: 'pointer', fontFamily: F.body }}
              >
                {lang === 'ko' ? '확인' : 'Check'}
              </button>
            </div>
            <button
              onClick={async () => {
                if (cacheClearing) return;
                setCacheClearing(true);
                await clearAllCache();
                const info = await getCacheInfo();
                setCacheInfo(info);
                setCacheClearing(false);
              }}
              disabled={cacheClearing || (cacheInfo && cacheInfo.count === 0)}
              style={{
                width: '100%', padding: '9px', borderRadius: 10, border: 'none',
                background: cacheClearing ? T.border : '#EF4444',
                color: '#fff', fontSize: 12, fontWeight: 600, fontFamily: F.body,
                cursor: (cacheClearing || (cacheInfo && cacheInfo.count === 0)) ? 'default' : 'pointer',
                opacity: (cacheInfo && cacheInfo.count === 0) ? 0.4 : 1,
              }}
            >
              {cacheClearing
                ? (lang === 'ko' ? '삭제 중…' : 'Clearing…')
                : (lang === 'ko' ? '🗑 캐시 전체 삭제' : '🗑 Clear All Cache')}
            </button>
            <p style={{ margin: '8px 0 0', fontSize: 10, color: T.inkFaint, fontFamily: F.body, lineHeight: 1.6 }}>
              {lang === 'ko'
                ? '다운로드한 PDF가 브라우저에 저장되어 다음 열기부터 즉시 로드됩니다. 삭제해도 Drive 원본은 영향 없습니다.'
                : 'Downloaded PDFs are saved locally for instant loading. Clearing cache does not affect your Drive files.'}
            </p>
          </div>
        </div>

        {/* Drive 백업 */}
        <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 18 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: T.inkLight, letterSpacing: 1.2, textTransform: 'uppercase', fontFamily: F.body, marginBottom: 12 }}>
            {lang === 'ko' ? 'Drive 메모 백업' : 'Drive Notes Backup'}
          </div>

          {/* 연결 상태 + 수동 백업 */}
          <div style={{ background: T.surfaceAlt, borderRadius: 12, padding: '12px 14px', border: `1px solid ${T.border}`, marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 16 }}>{backupSettings.writeToken ? '☁️' : '🔗'}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: T.ink, fontFamily: F.body }}>
                  {backupSettings.writeToken
                    ? (lang === 'ko' ? 'Drive 백업 연결됨' : 'Drive backup connected')
                    : (lang === 'ko' ? 'Drive 쓰기 권한 필요' : 'Drive write permission needed')}
                </div>
                {lastBackupTime && (
                  <div style={{ fontSize: 10, color: T.inkLight, fontFamily: F.body, marginTop: 2 }}>
                    {lang === 'ko' ? '마지막 백업: ' : 'Last backup: '}
                    {new Date(lastBackupTime).toLocaleString(lang === 'ko' ? 'ko-KR' : 'en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </div>
                )}
              </div>
              {backupSettings.writeToken && (
                <button onClick={() => saveBackup({ writeToken: null })} style={{ background: 'none', border: `1px solid ${T.border}`, borderRadius: 6, padding: '3px 7px', fontSize: 10, color: T.inkLight, cursor: 'pointer', fontFamily: F.body }}>
                  {lang === 'ko' ? '해제' : 'Unlink'}
                </button>
              )}
            </div>

            <button
              onClick={runManualBackup}
              disabled={backupState === 'running'}
              style={{ width: '100%', padding: '10px', borderRadius: 10, border: 'none', background: backupState === 'ok' ? '#16A34A' : backupState === 'error' ? '#DC2626' : T.accent, color: '#fff', fontSize: 13, fontWeight: 600, fontFamily: F.body, cursor: backupState === 'running' ? 'default' : 'pointer', opacity: backupState === 'running' ? 0.7 : 1 }}
            >
              {backupState === 'running'
                ? (lang === 'ko' ? '⏳ 백업 중…' : '⏳ Backing up…')
                : backupState === 'ok' ? backupMsg
                : backupState === 'error' ? (lang === 'ko' ? '다시 시도' : 'Retry')
                : (backupSettings.writeToken
                    ? (lang === 'ko' ? '☁️ 지금 백업' : '☁️ Backup Now')
                    : (lang === 'ko' ? '🔗 Drive 연결 & 백업' : '🔗 Connect & Backup'))}
            </button>
            {backupMsg && backupState !== 'ok' && (
              <p style={{ margin: '6px 0 0', fontSize: 11, color: backupState === 'error' ? '#DC2626' : T.inkLight, fontFamily: F.body }}>{backupMsg}</p>
            )}
          </div>

          {/* 자동 백업 토글 */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: T.surfaceAlt, borderRadius: 10, border: `1px solid ${T.border}` }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: T.ink, fontFamily: F.body }}>{lang === 'ko' ? '세션 종료 시 자동 백업' : 'Auto-backup on session end'}</div>
              <div style={{ fontSize: 10, color: T.inkLight, fontFamily: F.body, marginTop: 1 }}>{lang === 'ko' ? '독서 세션이 끝날 때 Drive에 자동 저장' : 'Auto-save to Drive when a reading session ends'}</div>
            </div>
            <button
              onClick={() => saveBackup({ autoBackup: !backupSettings.autoBackup })}
              style={{ width: 42, height: 24, borderRadius: 12, border: 'none', background: backupSettings.autoBackup ? T.accent : T.border, cursor: 'pointer', position: 'relative', flexShrink: 0, transition: 'background .2s' }}
            >
              <span style={{ position: 'absolute', top: 3, left: backupSettings.autoBackup ? 20 : 3, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left .2s' }} />
            </button>
          </div>

          <p style={{ margin: '8px 0 0', fontSize: 10, color: T.inkFaint, fontFamily: F.body, lineHeight: 1.6 }}>
            {lang === 'ko'
              ? '메모·하이라이트가 Google Drive의 PKL/backups/ 폴더에 Markdown으로 저장됩니다.'
              : 'Notes & highlights are saved as Markdown to PKL/backups/ in your Drive.'}
          </p>
        </div>

        {/* API Keys */}
        <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 18 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: T.inkLight, letterSpacing: 1.2, textTransform: 'uppercase', fontFamily: F.body, marginBottom: 12 }}>
            {lang === 'ko' ? 'AI 키 관리' : 'AI Keys'}
          </div>
          {[
            { id: 'claude', label: 'Claude (Anthropic)', val: claudeKey, set: setClaudeKey, show: showClaude, toggleShow: () => setShowClaude(v => !v), color: T.accent },
            { id: 'gemini', label: 'Gemini (Google)', val: geminiKey, set: setGeminiKey, show: showGemini, toggleShow: () => setShowGemini(v => !v), color: '#4285F4' },
            { id: 'vision', label: 'Cloud Vision OCR (Google)', val: visionKey, set: setVisionKey, show: showVision, toggleShow: () => setShowVision(v => !v), color: '#34A853' },
          ].map(p => {
            const ts = keyTest[p.id];
            const testLabel = ts === 'testing'
              ? (lang === 'ko' ? '확인 중…' : 'Testing…')
              : (lang === 'ko' ? '테스트' : 'Test');
            const resultStyle = { fontSize: 11, fontFamily: F.body, marginTop: 5, display: 'flex', alignItems: 'center', gap: 4 };
            return (
              <div key={p.id} style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: T.inkMid, fontFamily: F.body, marginBottom: 5 }}>{p.label}</div>
                <div style={{ position: 'relative' }}>
                  <input
                    type={p.show ? 'text' : 'password'}
                    value={p.val}
                    onChange={e => { p.set(e.target.value); setSaved(false); setKeyTest(s => ({ ...s, [p.id]: null })); }}
                    placeholder={lang === 'ko' ? '키 입력…' : 'Enter key…'}
                    style={{
                      display: 'block', width: '100%', boxSizing: 'border-box',
                      padding: '12px 44px 12px 13px',
                      fontSize: 13, fontFamily: F.mono, color: T.ink,
                      background: T.surfaceAlt,
                      border: `1.5px solid ${p.val ? p.color : T.border}`,
                      borderRadius: 10, outline: 'none',
                      WebkitAppearance: 'none', appearance: 'none',
                    }}
                  />
                  <button onClick={p.toggleShow} style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 44, background: 'none', border: 'none', cursor: 'pointer', fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {p.show ? '🙈' : '👁'}
                  </button>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5 }}>
                  <button
                    onClick={() => testKey(p.id, p.val)}
                    disabled={!p.val.trim() || ts === 'testing'}
                    style={{ padding: '5px 12px', borderRadius: 7, border: `1px solid ${T.border}`, background: T.surfaceAlt, color: T.inkMid, fontSize: 11, fontFamily: F.body, cursor: p.val.trim() && ts !== 'testing' ? 'pointer' : 'default', opacity: p.val.trim() ? 1 : 0.4 }}
                  >
                    {testLabel}
                  </button>
                  {ts === 'ok' && <span style={{ ...resultStyle, color: '#16A34A' }}>✓ {lang === 'ko' ? '유효한 키입니다' : 'Valid key'}</span>}
                  {ts === 'invalid-key' && <span style={{ ...resultStyle, color: '#DC2626' }}>✗ {lang === 'ko' ? '유효하지 않은 키입니다' : 'Invalid key'}</span>}
                  {ts === 'rate-limit' && <span style={{ ...resultStyle, color: '#B45309' }}>⚠ {lang === 'ko' ? '요청 한도 초과 (키는 유효)' : 'Rate limited (key valid)'}</span>}
                  {ts === 'error' && <span style={{ ...resultStyle, color: T.inkLight }}>⚠ {lang === 'ko' ? '연결 오류, 잠시 후 재시도' : 'Connection error, retry later'}</span>}
                </div>
              </div>
            );
          })}
          {/* OCR 방식 선택 (스캔 PDF 텍스트 추출) */}
          <div style={{ marginTop: 14, marginBottom: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: T.inkMid, fontFamily: F.body, marginBottom: 6 }}>
              {lang === 'ko' ? '스캔 PDF OCR 방식' : 'Scanned PDF OCR'}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {[
                { v: 'auto',  ko: '자동',   en: 'Auto',  desc: lang === 'ko' ? '로컬 우선→클라우드' : 'Local→Cloud' },
                { v: 'local', ko: '로컬',   en: 'Local', desc: lang === 'ko' ? '오프라인·프라이버시' : 'Offline·Private' },
                { v: 'cloud', ko: '클라우드', en: 'Cloud', desc: lang === 'ko' ? '고정확(키 필요)' : 'Accurate(key)' },
              ].map(o => (
                <button key={o.v} onClick={() => { setOcrMode(o.v); setSaved(false); }}
                  style={{ flex: 1, padding: '8px 6px', borderRadius: 9, cursor: 'pointer', fontFamily: F.body,
                    border: `1.5px solid ${ocrMode === o.v ? T.accent : T.border}`,
                    background: ocrMode === o.v ? T.accentSoft : T.surfaceAlt,
                    color: ocrMode === o.v ? T.accentDeep : T.inkMid }}>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{lang === 'ko' ? o.ko : o.en}</div>
                  <div style={{ fontSize: 9, color: T.inkLight, marginTop: 2 }}>{o.desc}</div>
                </button>
              ))}
            </div>
            <div style={{ fontSize: 10.5, color: T.inkLight, fontFamily: F.body, marginTop: 6, lineHeight: 1.5 }}>
              {lang === 'ko'
                ? '로컬: Tesseract(기기 내장)·Ollama(데스크톱)·Gemma 4(브라우저) — 책 내용이 기기를 벗어나지 않습니다.'
                : 'Local: Tesseract (built-in) · Ollama (desktop) · Gemma 4 (browser) — your book never leaves the device.'}
            </div>
            {/* 브라우저 Gemma 4 OCR — WebGPU 모델 URL (선택, 고급) */}
            {ocrMode !== 'cloud' && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 10.5, fontWeight: 600, color: T.inkMid, fontFamily: F.body, marginBottom: 4 }}>
                  {lang === 'ko' ? 'Gemma 4 브라우저 OCR 모델 URL (선택)' : 'Gemma 4 browser OCR model URL (optional)'}
                </div>
                <input
                  type="text"
                  value={gemmaModelUrl}
                  onChange={e => { setGemmaModelUrl(e.target.value); setSaved(false); }}
                  placeholder="https://…/gemma-3n-E4B-it-int4-Web.litertlm"
                  style={{ display: 'block', width: '100%', boxSizing: 'border-box', padding: '9px 11px', fontSize: 11, fontFamily: F.mono, color: T.ink, background: T.surfaceAlt, border: `1px solid ${T.border}`, borderRadius: 8, outline: 'none', WebkitAppearance: 'none' }}
                />
                <div style={{ fontSize: 9.5, color: T.inkLight, fontFamily: F.body, marginTop: 4, lineHeight: 1.5 }}>
                  {lang === 'ko'
                    ? 'WebGPU 지원 브라우저에서 Gemma 4(E2B/E4B) -Web .litertlm 모델로 고품질 OCR. HuggingFace litert-community에서 받아 호스팅. (수 GB, 첫 로드 느림)'
                    : 'High-quality OCR via Gemma 4 (E2B/E4B) -Web .litertlm on WebGPU browsers. Get from HuggingFace litert-community. (multi-GB, slow first load)'}
                </div>
              </div>
            )}
          </div>

          <button onClick={saveKeys} style={{ width: '100%', marginTop: 4, padding: '12px', borderRadius: 10, border: 'none', background: saved ? T.secondary : T.accent, color: '#FFF', fontSize: 13, fontWeight: 600, fontFamily: F.body, cursor: 'pointer', transition: 'background .2s' }}>
            {saved ? (lang === 'ko' ? '✓ 저장됨' : '✓ Saved') : (lang === 'ko' ? '키 저장' : 'Save Keys')}
          </button>
        </div>

        {/* Reset */}
        <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 16, marginTop: 4 }}>
          <button
            onClick={() => {
              if (window.confirm(lang === 'ko' ? '모든 설정과 저장된 데이터를 초기화할까요?\n(메모·하이라이트·목표·검색기록 포함)' : 'Reset all settings and saved data?\n(includes notes, highlights, goals, search history)')) {
                localStorage.clear();
                window.location.reload();
              }
            }}
            style={{ width: '100%', padding: '10px', borderRadius: 10, border: `1px solid ${T.border}`, background: 'transparent', color: T.inkLight, fontSize: 12, fontFamily: F.body, cursor: 'pointer' }}
          >
            {lang === 'ko' ? '앱 초기화 (계정·데이터 전체 삭제)' : 'Reset app (clear all data)'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Mobile layout ────────────────────────────────────────────── */
function MobileLayout({ settings, setSettings, userConfig, onSaveConfig, onAuthError }) {
  const themeKey = settings.dark ? `${settings.theme}Dark` : settings.theme;
  const T = THEMES[themeKey] || THEMES.ember;
  const F = TYPE_PAIRS[settings.type] || TYPE_PAIRS.lora;
  const [view, setView] = useState(userConfig ? 'app' : 'splash');
  const [screen, setScreen] = useState('library');
  const [currentBook, setCurrentBook] = useState(null);
  const [driveBook, setDriveBook] = useState(null);
  const [showSettings, setShowSettings] = useState(false);

  const openBook = (book) => { setCurrentBook(book); setScreen('reader'); };

  const renderScreen = () => {
    const lang = settings.lang;
    if (screen === 'library')   return <LibraryScreen   lang={lang} setScreen={setScreen} openDriveSave={setDriveBook} userConfig={userConfig} onAddBook={() => setView('addbook')} onOpenBook={openBook} onAuthError={onAuthError} />;
    if (screen === 'reader')    return <ReaderScreen    lang={lang} setScreen={setScreen} openDriveSave={setDriveBook} currentBook={currentBook} apiKeys={userConfig?.apiKeys} />;
    if (screen === 'search')    return <SearchScreen    lang={lang} onOpenBook={openBook} />;
    if (screen === 'knowledge') return <KnowledgeScreen lang={lang} apiKeys={userConfig?.apiKeys} currentBook={currentBook} />;
    if (screen === 'goals')     return <GoalsScreen     lang={lang} currentBook={currentBook} onOpenBook={openBook} apiKeys={userConfig?.apiKeys} />;
    if (screen === 'ai')        return <AIChatScreen    lang={lang} apiKeys={userConfig?.apiKeys} currentBook={currentBook} />;
    return null;
  };

  return (
    <div style={{ width: '100%', height: '100%', background: T.bg, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {view === 'splash' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <SplashScreen lang={settings.lang} onStart={() => setView('onboarding')} />
        </div>
      )}
      {view === 'onboarding' && (
        <div style={{ flex: 1, background: T.bg, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <OnboardingFlow lang={settings.lang} onFinish={(data) => { if (onSaveConfig) onSaveConfig(data); setView('app'); setScreen('library'); }} />
        </div>
      )}
      {view === 'addbook' && (
        <div style={{ flex: 1, background: T.bg, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <AddBookFlow lang={settings.lang} onCancel={() => setView('app')} onComplete={(book) => { setView('app'); if (book && book.id) openBook(book); else setScreen('library'); }} />
        </div>
      )}
      {view === 'app' && (
        <>
          <div style={{ background: T.surface, borderBottom: `1px solid ${T.border}`, padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <PklMark size={28} />
              <span style={{ fontSize: 14, fontWeight: 700, color: T.ink, fontFamily: F.display, letterSpacing: -0.2 }}>PKL</span>
            </div>
            <button aria-label="설정" onClick={() => setShowSettings(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', padding: 8, margin: -4, color: T.inkMid }}>
              <Icon name="settings" size={20} color={T.inkMid} />
            </button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', position: 'relative', background: T.bg }}>
            {renderScreen()}
          </div>
          <TabBar screen={screen} setScreen={setScreen} lang={settings.lang} />
        </>
      )}
      {driveBook && <DriveSaveSheet lang={settings.lang} book={driveBook} onClose={() => setDriveBook(null)} userConfig={userConfig} onUpdateConfig={onSaveConfig} />}
      {showSettings && <SettingsPanel settings={settings} setSettings={setSettings} onClose={() => setShowSettings(false)} userConfig={userConfig} onUpdateConfig={onSaveConfig} />}
    </div>
  );
}

/* ── Root App ─────────────────────────────────────────────────── */
export default function App() {
  const [settings, setSettings] = useState({ theme: 'ember', type: 'lora', lang: 'ko', dark: false });
  const [viewW, setViewW] = useState(window.innerWidth);
  useEffect(() => {
    const fn = () => setViewW(window.innerWidth);
    window.addEventListener('resize', fn);
    return () => window.removeEventListener('resize', fn);
  }, []);

  const themeKey = settings.dark ? `${settings.theme}Dark` : settings.theme;
  const T = THEMES[themeKey] || THEMES.ember;
  const F = TYPE_PAIRS[settings.type] || TYPE_PAIRS.lora;
  const layout = viewW >= 1100 ? 'pc' : viewW >= 768 ? 'tablet' : 'mobile';

  const [userConfig, setUserConfig] = useState(() => {
    try { return JSON.parse(localStorage.getItem('pkl_config') || 'null'); } catch { return null; }
  });
  const [view, setView] = useState(() => {
    try { return JSON.parse(localStorage.getItem('pkl_config') || 'null') ? 'app' : 'splash'; } catch { return 'splash'; }
  });
  const [screen, setScreen] = useState('library');
  const [currentBook, setCurrentBook] = useState(null);
  const [driveBook, setDriveBook] = useState(null);
  const [showSettings, setShowSettings] = useState(false);

  const saveConfig = useCallback((data) => {
    if (data) { localStorage.setItem('pkl_config', JSON.stringify(data)); setUserConfig(data); }
  }, []);

  // Track current userConfig in a ref so stable callbacks can read it without stale closures
  const userConfigRef = useRef(userConfig);
  useEffect(() => { userConfigRef.current = userConfig; }, [userConfig]);

  // Silent Drive token refresh
  // - Web: GIS initTokenClient (팝업 없이 갱신)
  // - Electron: 시스템 브라우저 loopback (조용한 갱신 불가 → 사용자 재로그인)
  const refreshDriveToken = useCallback(async () => {
    if (isElectron()) {
      const clientId = import.meta.env.VITE_GOOGLE_DESKTOP_CLIENT_ID;
      const clientSecret = import.meta.env.VITE_GOOGLE_DESKTOP_CLIENT_SECRET || '';
      if (!clientId) return; // 데스크톱 ID 없으면 갱신 시도 안 함 (웹 ID 폴백 금지)
      const r = await window.electron.googleOAuth({
        clientId, clientSecret,
        scope: 'https://www.googleapis.com/auth/drive.readonly',
      });
      if (r?.ok) {
        saveConfig({
          ...userConfigRef.current,
          driveAccessToken: r.access_token,
          driveTokenExpiresAt: Date.now() + ((r.expires_in || 3600) * 1000),
        });
      }
      return;
    }
    const gis = window.google?.accounts?.oauth2;
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!gis || !clientId) return;
    const client = gis.initTokenClient({
      client_id: clientId,
      scope: 'https://www.googleapis.com/auth/drive.readonly',
      hint: userConfigRef.current?.googleUser?.email || '',
      prompt: '',
      callback: (response) => {
        if (!response.access_token) return;
        saveConfig({
          ...userConfigRef.current,
          driveAccessToken: response.access_token,
          driveTokenExpiresAt: Date.now() + ((response.expires_in || 3600) * 1000),
        });
      },
    });
    client.requestAccessToken({ prompt: '' });
  }, [saveConfig]);

  // Proactive refresh: 5 minutes before expiry
  useEffect(() => {
    const expiresAt = userConfig?.driveTokenExpiresAt;
    if (!expiresAt) return;
    const delay = Math.max(0, expiresAt - Date.now() - 5 * 60 * 1000);
    const timer = setTimeout(refreshDriveToken, delay);
    return () => clearTimeout(timer);
  }, [userConfig?.driveTokenExpiresAt, refreshDriveToken]);

  const goApp = (data) => {
    saveConfig(data);
    setView('app'); setScreen('library');
  };

  const openBook = (book) => { setCurrentBook(book); setScreen('reader'); };

  return (
    <ThemeContext.Provider value={{ T, F }}>
      <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', background: T.bg, fontFamily: F.body }}>
        {layout === 'mobile' ? (
          <MobileLayout settings={settings} setSettings={setSettings} userConfig={userConfig} onSaveConfig={saveConfig} onAuthError={refreshDriveToken} />
        ) : (
          view === 'splash' ? (
            <SplashScreen lang={settings.lang} onStart={() => setView('onboarding')} />
          ) : view === 'onboarding' ? (
            <div style={{ width: '100%', height: '100%', background: T.bg, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <OnboardingFlow lang={settings.lang} onFinish={(data) => goApp(data)} />
            </div>
          ) : view === 'addbook' ? (
            <div style={{ width: '100%', height: '100%', background: T.bg, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <AddBookFlow lang={settings.lang} onCancel={() => { setView('app'); setScreen('library'); }} onComplete={(book) => { setView('app'); if (book && book.id) openBook(book); else setScreen('library'); }} />
            </div>
          ) : (
            <div style={{ width: '100%', height: '100%', overflow: 'hidden', position: 'relative' }}>
              <DesktopShell
                layout={layout}
                lang={settings.lang}
                screen={screen}
                setScreen={setScreen}
                openDriveSave={setDriveBook}
                userConfig={userConfig}
                currentBook={currentBook}
                onOpenBook={openBook}
                onAddBook={() => setView('addbook')}
                onShowSettings={() => setShowSettings(true)}
                onAuthError={refreshDriveToken}
              />
              {driveBook && <DriveSaveSheet lang={settings.lang} book={driveBook} onClose={() => setDriveBook(null)} userConfig={userConfig} onUpdateConfig={saveConfig} />}
              {showSettings && <SettingsPanel settings={settings} setSettings={setSettings} onClose={() => setShowSettings(false)} userConfig={userConfig} onUpdateConfig={saveConfig} />}
            </div>
          )
        )}
        <Toaster />
      </div>
    </ThemeContext.Provider>
  );
}
