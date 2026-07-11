import { useState, useEffect } from 'react';
import { useGoogleAuth } from '../utils/useGoogleAuth.js';
import { MD_SAMPLES, i18n } from '../data.js';
import { useTheme } from '../context.jsx';
import { Button, Icon, SectionLabel } from '../components.jsx';

export function DriveSaveSheet({ lang, book, onClose, userConfig, onUpdateConfig }) {
  const { T, F } = useTheme();
  const t = i18n[lang];
  const [unit, setUnit] = useState('chapter');
  const [chapter, setChapter] = useState(book.chapters[3]);
  const [date, setDate] = useState('2026-05-22');
  const [step, setStep] = useState('config'); // config | auth | saving | done | error
  const [authStatus, setAuthStatus] = useState('idle'); // idle | pending | ok | fail

  const fileName = unit === 'chapter'
    ? `${(lang === 'ko' ? book.title : book.titleEn).replace(/\s+/g, '_')}_Ch3.md`
    : unit === 'date'
      ? `session_${date}.md`
      : `${(lang === 'ko' ? book.title : book.titleEn).replace(/\s+/g, '_')}_full.md`;
  const md = MD_SAMPLES[lang];

  // Drive OAuth — 저장 버튼 눌렀을 때 여기서 요청
  const requestDriveAuth = useGoogleAuth({
    scope: 'https://www.googleapis.com/auth/drive.file',
    prompt: 'consent',
    hint: userConfig?.googleUser?.email || '',
    onSuccess: async ({ access_token }) => {
      setAuthStatus('ok');
      if (onUpdateConfig) {
        const updated = { ...(userConfig || {}), driveAccessToken: access_token };
        onUpdateConfig(updated);
      }
      setStep('saving');
    },
    onError: () => {
      setAuthStatus('fail');
      setStep('error');
    },
  });

  const handleSave = () => {
    if (userConfig?.driveAccessToken) {
      // 토큰 있으면 바로 저장
      setStep('saving');
    } else {
      // 토큰 없으면 Drive 권한 요청
      setAuthStatus('pending');
      requestDriveAuth();
    }
  };

  useEffect(() => {
    if (step === 'saving') {
      const id = setTimeout(() => setStep('done'), 1500);
      return () => clearTimeout(id);
    }
  }, [step]);

  const Backdrop = ({ children }) => (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,15,8,.55)', zIndex: 300, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: T.surface, borderRadius: '22px 22px 0 0', width: '100%', maxWidth: 500, maxHeight: '92vh', overflowY: 'auto', padding: '12px 22px 28px', boxShadow: '0 -20px 60px rgba(0,0,0,.3)' }}>
        <div style={{ width: 38, height: 4, background: T.border, borderRadius: 2, margin: '0 auto 16px' }} />
        {children}
      </div>
    </div>
  );

  if (step === 'saving') return (
    <Backdrop>
      <div style={{ padding: '32px 12px', textAlign: 'center' }}>
        <Icon name="cloud" size={48} color={T.accent} stroke={1.4} />
        <div style={{ fontSize: 17, fontWeight: 600, color: T.ink, fontFamily: F.display, marginTop: 12, marginBottom: 6 }}>{t.savingToDrive}</div>
        <div style={{ fontSize: 12, color: T.inkLight, fontFamily: F.mono }}>MyLibrary/summaries/{fileName}</div>
      </div>
    </Backdrop>
  );

  if (step === 'done') return (
    <Backdrop>
      <div style={{ padding: '24px 12px 8px', textAlign: 'center' }}>
        <div style={{ width: 56, height: 56, borderRadius: 999, background: T.secondarySoft, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
          <Icon name="check" size={28} color={T.secondary} stroke={2.4} />
        </div>
        <div style={{ fontSize: 19, fontWeight: 600, color: T.ink, fontFamily: F.display, marginBottom: 6 }}>{t.savedSuccess}</div>
        <div style={{ fontSize: 13, color: T.inkLight, fontFamily: F.body, marginBottom: 18 }}>
          {lang === 'ko' ? 'Google Drive에 Markdown으로 저장되었습니다' : 'Saved as Markdown to Google Drive'}
        </div>
        <div style={{ background: T.surfaceAlt, borderRadius: 12, padding: 14, marginBottom: 16, textAlign: 'left', border: `1px solid ${T.border}` }}>
          <div style={{ fontSize: 10, color: T.inkLight, fontFamily: F.body, letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 4 }}>{t.saveLocation}</div>
          <div style={{ fontSize: 12.5, color: T.ink, fontFamily: F.mono, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="folder" size={13} color={T.accent} />MyLibrary/summaries/
          </div>
          <div style={{ fontSize: 13, color: T.accent, fontFamily: F.mono, fontWeight: 600, marginTop: 4, paddingLeft: 19 }}>{fileName}</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="ghost" onClick={onClose} style={{ flex: 1 }}>{t.close}</Button>
          <Button variant="primary" style={{ flex: 1 }}><Icon name="cloud" size={14} color="#FFF" /> {lang === 'ko' ? 'Drive 열기' : 'Open Drive'}</Button>
        </div>
      </div>
    </Backdrop>
  );

  if (step === 'error') return (
    <Backdrop>
      <div style={{ padding: '24px 12px 8px', textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
        <div style={{ fontSize: 17, fontWeight: 600, color: T.ink, fontFamily: F.display, marginBottom: 8 }}>
          {lang === 'ko' ? 'Drive 권한이 필요합니다' : 'Drive Permission Required'}
        </div>
        <div style={{ fontSize: 13, color: T.inkLight, fontFamily: F.body, lineHeight: 1.65, marginBottom: 20 }}>
          {lang === 'ko'
            ? 'Google Drive에 저장하려면 Drive 접근 권한이 필요합니다.'
            : 'Drive access permission is required to save to Google Drive.'}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="ghost" onClick={onClose} style={{ flex: 1 }}>{lang === 'ko' ? '취소' : 'Cancel'}</Button>
          <Button variant="accent" onClick={() => { setAuthStatus('pending'); requestDriveAuth(); }} style={{ flex: 1.5 }}>
            {lang === 'ko' ? '다시 시도' : 'Try Again'}
          </Button>
        </div>
      </div>
    </Backdrop>
  );

  // Preview step
  if (step === 'preview') return (
    <Backdrop>
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, color: T.accent, letterSpacing: 1.4, textTransform: 'uppercase', fontFamily: F.body, marginBottom: 4 }}>
          {lang === 'ko' ? '생성 완료' : 'Generated'}
        </div>
        <div style={{ fontSize: 19, fontWeight: 600, color: T.ink, fontFamily: F.display, marginBottom: 4 }}>
          {lang === 'ko' ? '미리보기' : 'Preview'}
        </div>
        <div style={{ fontSize: 12, color: T.inkLight, fontFamily: F.mono, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 5 }}>
          <Icon name="doc" size={12} color={T.inkLight} /> {fileName}
        </div>
        <div style={{ background: '#1B1814', borderRadius: 12, padding: 14, maxHeight: 240, overflowY: 'auto', marginBottom: 14 }}>
          <pre style={{ fontSize: 11, color: '#D8D0BF', fontFamily: F.mono, margin: 0, whiteSpace: 'pre-wrap', lineHeight: 1.65 }}>{md}</pre>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 16 }}>
          {[{ v: '7', l: t.highlights }, { v: '3', l: t.notes }, { v: '1', l: t.aiChat }].map((s, i) => (
            <div key={i} style={{ background: T.surfaceAlt, borderRadius: 10, padding: '10px 6px', textAlign: 'center', border: `1px solid ${T.border}` }}>
              <div style={{ fontSize: 17, fontWeight: 600, color: T.ink, fontFamily: F.display }}>{s.v}</div>
              <div style={{ fontSize: 10, color: T.inkLight, fontFamily: F.body }}>{s.l}</div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="ghost" onClick={() => setStep('config')} style={{ flex: 1 }}>
            <Icon name="back" size={14} /> {t.edit}
          </Button>
          <Button variant="accent" onClick={handleSave} style={{ flex: 1.6 }}>
            <Icon name="cloud" size={14} color="#FFF" /> {t.saveToDrive}
          </Button>
        </div>
      </div>
    </Backdrop>
  );

  // Config step (default)
  return (
    <Backdrop>
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, color: T.accent, letterSpacing: 1.4, textTransform: 'uppercase', fontFamily: F.body, marginBottom: 4 }}>
          {lang === 'ko' ? 'AI 요약 & Drive' : 'AI Summary & Drive'}
        </div>
        <div style={{ fontSize: 22, fontWeight: 600, color: T.ink, fontFamily: F.display, marginBottom: 4, letterSpacing: -0.5 }}>{t.generateSummary}</div>
        <div style={{ fontSize: 13, color: T.inkLight, fontFamily: F.body, marginBottom: 18, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon name="library" size={12} color={T.inkLight} />
          {lang === 'ko' ? book.title : book.titleEn}
        </div>
        <SectionLabel>{t.summaryUnit}</SectionLabel>
        <div style={{ display: 'flex', gap: 6, marginBottom: 18 }}>
          {[{ k: 'date', icon: 'clock', label: t.byDate }, { k: 'chapter', icon: 'list', label: t.byChapter }, { k: 'whole', icon: 'library', label: t.wholeBook }].map(o => {
            const active = unit === o.k;
            return (
              <button key={o.k} onClick={() => setUnit(o.k)} style={{ flex: 1, padding: '14px 8px', borderRadius: 12, border: `1.5px solid ${active ? T.accent : T.border}`, background: active ? T.accentSoft : T.surface, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, transition: 'all .2s' }}>
                <Icon name={o.icon} size={18} color={active ? T.accent : T.inkMid} />
                <span style={{ fontSize: 11.5, fontWeight: 600, color: active ? T.accentDeep : T.inkMid, fontFamily: F.body }}>{o.label}</span>
              </button>
            );
          })}
        </div>
        {unit === 'chapter' && (
          <div style={{ marginBottom: 18 }}>
            <SectionLabel>{lang === 'ko' ? '챕터 선택' : 'Select chapter'}</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {book.chapters.map(ch => {
                const sel = chapter === ch;
                return (
                  <button key={ch} onClick={() => setChapter(ch)} style={{ padding: '11px 14px', borderRadius: 10, border: `1.5px solid ${sel ? T.accent : T.border}`, background: sel ? T.accentSoft : T.surface, color: sel ? T.accentDeep : T.ink, fontSize: 13, fontFamily: F.body, textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span>{ch}</span>
                    {sel && <Icon name="check" size={14} color={T.accent} stroke={2.2} />}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {unit === 'date' && (
          <div style={{ marginBottom: 18 }}>
            <SectionLabel>{lang === 'ko' ? '날짜 선택' : 'Select date'}</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {['2026-05-22', '2026-05-21', '2026-05-20', '2026-05-18'].map(d => {
                const sel = date === d;
                return (
                  <button key={d} onClick={() => setDate(d)} style={{ padding: '11px 14px', borderRadius: 10, border: `1.5px solid ${sel ? T.accent : T.border}`, background: sel ? T.accentSoft : T.surface, color: sel ? T.accentDeep : T.ink, fontSize: 13, fontFamily: F.mono, textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span>{d}</span>
                    {sel && <Icon name="check" size={14} color={T.accent} stroke={2.2} />}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        <div style={{ background: T.surfaceAlt, borderRadius: 10, padding: '12px 14px', marginBottom: 18, border: `1px solid ${T.border}` }}>
          <div style={{ fontSize: 10, color: T.inkLight, fontFamily: F.body, letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 4 }}>{t.saveLocation}</div>
          <div style={{ fontSize: 12, color: T.ink, fontFamily: F.mono, display: 'flex', alignItems: 'center', gap: 5 }}>
            <Icon name="folder" size={12} color={T.accent} />MyLibrary/summaries/<span style={{ color: T.accent, fontWeight: 600 }}>{fileName}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="ghost" onClick={onClose} style={{ flex: 1 }}>{t.cancel}</Button>
          <Button variant="accent" onClick={() => setStep('preview')} style={{ flex: 1.8 }}>
            <Icon name="spark" size={14} color="#FFF" stroke={2} /> {t.generateSummary}
          </Button>
        </div>
      </div>
    </Backdrop>
  );
}
