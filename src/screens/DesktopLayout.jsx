import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { BOOKMARKS, INDEX, DRIVE_FILES, READING_PARAGRAPHS, HIGHLIGHT, i18n, MD_SAMPLES } from '../data.js';
import { useTheme } from '../context.jsx';
import { ProgressBar, Button, Icon, ChipRow, SectionLabel, SyncBadge, TypeBadge } from '../components.jsx';
import { PklMark } from '../Logo.jsx';
import { scanBookMeta, buildMetaContext } from '../scanBook.js';
import { scanLocalBookMeta } from '../utils/localBookScan.js';
import { getPageText, getDocumentText, getPageImage, getTextForRange } from '../pageTextCache.js';
import { ensureBookText } from '../utils/ensureBookText.js';
import { showError } from '../utils/toast.js';
import { getBookMeta, setBookMeta, addNote, addHighlight, getNotes, getHighlights, deleteNote, deleteHighlight, getGoals, saveGoals, addSession, getSessions, getWeekStats, getSearchHistory, pushSearchHistory, getBookIndex, saveBookIndex, getAiChat, saveAiChat, getBookmarks, toggleBookmark, getReaderSettings, saveReaderSettings, getMonthStats, getYearStats, getBackupSettings, appendBackupLog, getNotesByBook, getHighlightsByBook, getVocabulary, addVocabularyEntry, getPdfAnnotations, addPdfAnnotation } from '../store.js';
import { renderStatsCard, downloadStatsCard, STATS_THEMES, fmtMinutes, monthName as monthLabelFn } from '../utils/statsCard.js';
import { backupBookToDrive } from '../utils/driveBackup.js';
import { PdfViewer } from '../components/PdfViewer.jsx';
import { VisionTextSheet } from '../components/VisionTextSheet.jsx';
import { KnowledgeScreen } from './KnowledgeScreen.jsx';
import { RangeSelector } from '../components/RangeSelector.jsx';
import { QuizModal } from '../components/QuizModal.jsx';
import { BookCompare } from '../components/BookCompare.jsx';
import { ShareModal } from '../components/ShareModal.jsx';
import { getLocalBooks, addLocalBook, addLocalBooksNative, removeLocalBook, localBookToBook, usesNativePicker, onElectronMenuOpenPdf } from '../utils/localBooks.js';

/* ════════════════════════════════════════════════════════════════
   Desktop shell — tablet (720+) and PC (1100+)
   ════════════════════════════════════════════════════════════════ */

export function DesktopShell({ layout, lang, screen, setScreen, openDriveSave, userConfig, currentBook, onOpenBook, onAddBook, onShowSettings, onAuthError }) {
  const { T, F } = useTheme();
  const t = i18n[lang];
  const isPC = layout === "pc";
  const [navCollapsed, setNavCollapsed] = useState(false);
  const showFullNav = isPC && !navCollapsed;
  const [openAiPanel, setOpenAiPanel] = useState(false);

  const navItems = [
    { key: "library",   icon: "library",   label: t.library },
    { key: "reader",    icon: "page",      label: lang === "ko" ? "뷰어" : "Reader" },
    { key: "search",    icon: "search",    label: t.search },
    { key: "knowledge", icon: "knowledge", label: t.knowledge },
    { key: "goals",     icon: "goals",     label: t.goals },
    { key: "ai",        icon: "ai",        label: t.aiChat },
  ];

  const gUser = userConfig?.googleUser;

  return (
    <div style={{
      width: "100%", height: "100%", background: T.bg,
      overflow: "hidden", position: "relative",
      display: "flex",
    }}>
      {/* macOS window chrome inline */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 36, background: T.surfaceAlt, borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", padding: "0 14px", zIndex: 10 }}>
        <div style={{ display: "flex", gap: 7 }}>
          {["#FF5F57", "#FFBD2E", "#28C840"].map((c, i) => (
            <div key={i} style={{ width: 12, height: 12, borderRadius: 999, background: c }} />
          ))}
        </div>
        <div style={{ flex: 1, textAlign: "center", fontSize: 12, fontWeight: 500, color: T.inkLight, fontFamily: F.body }}>
          Personal Knowledge Library
        </div>
        <button onClick={onShowSettings} style={{ width: 28, height: 28, borderRadius: 7, border: "none", background: "transparent", color: T.inkLight, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
          onMouseEnter={e => e.currentTarget.style.background = T.border}
          onMouseLeave={e => e.currentTarget.style.background = "transparent"}
        >
          <Icon name="settings" size={14} color={T.inkLight} />
        </button>
      </div>

      {/* Sidebar */}
      <div style={{
        width: showFullNav ? 232 : 72, paddingTop: 48,
        background: T.surface, borderRight: `1px solid ${T.border}`,
        display: "flex", flexDirection: "column", flexShrink: 0,
        transition: "width .22s cubic-bezier(.22,1,.36,1)",
      }}>
        {/* Brand */}
        <div style={{ padding: showFullNav ? "12px 18px 18px" : "12px 0 18px", display: "flex", alignItems: "center", gap: 10, justifyContent: showFullNav ? "space-between" : "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <PklMark size={28} />
            {showFullNav && (
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: T.ink, fontFamily: F.display, letterSpacing: -0.2, lineHeight: 1.1, whiteSpace: "nowrap" }}>
                  PKL
                </div>
                <div style={{ fontSize: 10, color: T.inkLight, fontFamily: F.body, letterSpacing: 0.5, whiteSpace: "nowrap" }}>Personal Knowledge Library</div>
              </div>
            )}
          </div>
          {isPC && (
            <button onClick={() => setNavCollapsed(!navCollapsed)} title={lang === "ko" ? "네비게이션 접기" : "Collapse nav"} style={{
              width: 26, height: 26, borderRadius: 6, border: "none",
              background: "transparent", color: T.inkLight, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            }}
              onMouseEnter={e => e.currentTarget.style.background = T.surfaceAlt}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}
            >
              <Icon name={showFullNav ? "back" : "forward"} size={13} />
            </button>
          )}
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: showFullNav ? "0 12px" : "0 10px", display: "flex", flexDirection: "column", gap: 2, overflowY: "auto" }}>
          {navItems.map(item => {
            const active = screen === item.key;
            return (
              <button key={item.key} onClick={() => setScreen(item.key)} title={!showFullNav ? item.label : undefined} style={{
                display: "flex", alignItems: "center", gap: 10, padding: showFullNav ? "9px 12px" : "10px 0",
                justifyContent: showFullNav ? "flex-start" : "center",
                borderRadius: 9, border: "none", cursor: "pointer",
                background: active ? T.accentSoft : "transparent",
                color: active ? T.accentDeep : T.inkMid,
                transition: "all .15s", textAlign: "left",
              }}>
                <Icon name={item.icon} size={showFullNav ? 17 : 19} stroke={active ? 2 : 1.6} />
                {showFullNav && <span style={{ fontSize: 13.5, fontWeight: active ? 600 : 500, fontFamily: F.body, whiteSpace: "nowrap" }}>{item.label}</span>}
              </button>
            );
          })}
        </nav>

        {/* Footer */}
        <div style={{ padding: showFullNav ? "14px 16px" : "10px 0", borderTop: `1px solid ${T.border}`, display: "flex", flexDirection: "column", gap: 10, alignItems: showFullNav ? "stretch" : "center" }}>
          {showFullNav && <SyncBadge lang={lang} compact />}
          {showFullNav ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 0" }}>
              {gUser?.picture ? (
                <img src={gUser.picture} alt="" style={{ width: 30, height: 30, borderRadius: 999, flexShrink: 0, objectFit: "cover" }} />
              ) : (
                <div style={{ width: 30, height: 30, borderRadius: 999, background: T.accent, display: "flex", alignItems: "center", justifyContent: "center", color: "#FFF", fontSize: 12, fontWeight: 700, fontFamily: F.body, flexShrink: 0 }}>
                  {(gUser?.name?.[0] || "U").toUpperCase()}
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: T.ink, fontFamily: F.body, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {gUser?.name || (lang === "ko" ? "사용자" : "User")}
                </div>
                <div style={{ fontSize: 10.5, color: T.inkLight, fontFamily: F.body, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {gUser?.email || ""}
                </div>
              </div>
            </div>
          ) : (
            gUser?.picture ? (
              <img src={gUser.picture} alt="" style={{ width: 30, height: 30, borderRadius: 999, objectFit: "cover" }} />
            ) : (
              <div style={{ width: 30, height: 30, borderRadius: 999, background: T.accent, display: "flex", alignItems: "center", justifyContent: "center", color: "#FFF", fontSize: 12, fontWeight: 700, fontFamily: F.body }}>
                {(gUser?.name?.[0] || "U").toUpperCase()}
              </div>
            )
          )}
        </div>
      </div>

      {/* Main */}
      <div style={{ flex: 1, paddingTop: 36, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
        {screen === "library"   && <DesktopLibrary lang={lang} setScreen={setScreen} openDriveSave={openDriveSave} isPC={isPC} onAddBook={onAddBook} userConfig={userConfig} onOpenBook={onOpenBook} onAuthError={onAuthError}
            onOpenBookWithAI={(book) => { if (onOpenBook) onOpenBook(book); setOpenAiPanel(true); setScreen('reader'); }}
          />}
        {screen === "reader"    && <DesktopReader lang={lang} setScreen={setScreen} openDriveSave={openDriveSave} isPC={isPC} currentBook={currentBook} apiKeys={userConfig?.apiKeys} openAiPanel={openAiPanel} onAiPanelConsumed={() => setOpenAiPanel(false)} />}
        {screen === "search"    && <DesktopSearch lang={lang} isPC={isPC} onOpenBook={onOpenBook} />}
        {screen === "knowledge" && <DesktopKnowledge lang={lang} isPC={isPC} apiKeys={userConfig?.apiKeys} currentBook={currentBook} />}
        {screen === "goals"     && <DesktopGoals lang={lang} isPC={isPC} currentBook={currentBook} onOpenBook={onOpenBook} />}
        {screen === "ai"        && <DesktopAI lang={lang} isPC={isPC} apiKeys={userConfig?.apiKeys} currentBook={currentBook} />}
      </div>
    </div>
  );
}

/* ── Common toolbar ───────────────────────────────────── */
function DesktopHeader({ title, subtitle, right }) {
  const { T, F } = useTheme();
  return (
    <div style={{ padding: "20px 28px 18px", display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, borderBottom: `1px solid ${T.border}` }}>
      <div style={{ minWidth: 0, flex: 1 }}>
        {subtitle && (
          <div style={{ fontSize: 10.5, fontWeight: 600, color: T.inkLight, letterSpacing: 1.4, textTransform: "uppercase", fontFamily: F.body, marginBottom: 5, whiteSpace: "nowrap" }}>
            {subtitle}
          </div>
        )}
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 600, fontFamily: F.display, color: T.ink, lineHeight: 1.1, letterSpacing: -0.6, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</h1>
      </div>
      {right && <div style={{ flexShrink: 0 }}>{right}</div>}
    </div>
  );
}

/* ── Auth error / retry UI (shared) ──────────────────── */
function AuthErrorOrRetry({ isAuthErr, error, lang, onRetry, onAuthError, size = "md" }) {
  const { T, F } = useTheme();
  const iconSize = size === "lg" ? 28 : 22;
  const boxSize  = size === "lg" ? 64 : 52;
  const titleSz  = size === "lg" ? 16 : 15;
  const bodySz   = size === "lg" ? 13 : 12;

  React.useEffect(() => {
    if (isAuthErr && onAuthError) onAuthError();
  }, []); // eslint-disable-line

  return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16 }}>
      <div style={{ width: boxSize, height: boxSize, borderRadius: boxSize * 0.3, background: "#FEE2E2", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Icon name="close" size={iconSize} color="#DC2626" />
      </div>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: titleSz, fontWeight: 600, color: T.ink, fontFamily: F.body, marginBottom: 8 }}>
          {isAuthErr
            ? (lang === "ko" ? "Drive 연결이 만료됐어요" : "Drive session expired")
            : (lang === "ko" ? "불러오기 실패" : "Failed to load")}
        </div>
        <div style={{ fontSize: bodySz, color: T.inkLight, fontFamily: F.body, maxWidth: 360, lineHeight: 1.6, whiteSpace: "pre-line" }}>
          {isAuthErr
            ? (lang === "ko"
              ? "Google 세션이 만료되어 자동으로 재연결 중입니다…"
              : "Google session expired. Reconnecting silently…")
            : error}
        </div>
      </div>
      <Button variant="accent" onClick={isAuthErr ? onAuthError : onRetry} style={{ padding: size === "lg" ? "10px 24px" : "10px 20px" }}>
        {isAuthErr
          ? (lang === "ko" ? "재연결" : "Reconnect")
          : (lang === "ko" ? "다시 시도" : "Retry")}
      </Button>
    </div>
  );
}

/* ── Scan UI components ───────────────────────────────── */
function ScanBanner({ lang, geminiKey, claudeKey, unscannedCount, scanning, scanDone, scanTotal, scanErrors, onStart, onStop }) {
  const { T, F } = useTheme();
  const ko = lang === 'ko';
  if (!geminiKey && !claudeKey) return null;
  if (!scanning && unscannedCount === 0) return null;

  if (scanning) {
    const pct = scanTotal > 0 ? Math.round((scanDone / scanTotal) * 100) : 0;
    return (
      <div style={{ background: T.accentSoft, borderRadius: 12, padding: "12px 16px", marginBottom: 20, border: `1px solid ${T.accent}44`, display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 20, height: 20, borderRadius: "50%", border: `2.5px solid ${T.border}`, borderTopColor: T.accent, animation: "spin 0.8s linear infinite", flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: T.ink, fontFamily: F.body, marginBottom: 4 }}>
            {ko ? `AI 문서 분석 중… (${scanDone}/${scanTotal})` : `Analyzing documents… (${scanDone}/${scanTotal})`}
          </div>
          <div style={{ height: 4, background: T.border, borderRadius: 2, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${pct}%`, background: T.accent, borderRadius: 2, transition: "width .4s ease" }} />
          </div>
        </div>
        <button onClick={onStop} style={{ fontSize: 11, color: T.inkLight, background: "none", border: `1px solid ${T.border}`, borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontFamily: F.body, whiteSpace: "nowrap" }}>
          {ko ? "중단" : "Stop"}
        </button>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  return (
    <div style={{ background: T.accentSoft, borderRadius: 12, padding: "12px 16px", marginBottom: 20, border: `1px solid ${T.accent}44`, display: "flex", alignItems: "center", gap: 12 }}>
      <Icon name="spark" size={18} color={T.accent} />
      <div style={{ flex: 1, fontSize: 13, color: T.ink, fontFamily: F.body }}>
        {ko
          ? `${unscannedCount}개 문서를 AI로 분석할 수 있습니다. 저자·요약·주제를 자동으로 추출합니다.`
          : `${unscannedCount} documents can be analyzed by AI to extract author, summary and topics.`}
      </div>
      <button onClick={onStart} style={{ fontSize: 12, fontWeight: 600, color: "#FFF", background: T.accent, border: "none", borderRadius: 8, padding: "7px 14px", cursor: "pointer", fontFamily: F.body, whiteSpace: "nowrap" }}>
        {ko ? "AI 분석 시작" : "Start AI Scan"}
      </button>
    </div>
  );
}

function ScanDot({ status }) {
  if (!status) return null;
  const colors = { scanning: '#F59E0B', done: '#22C55E', error: '#EF4444', pending: '#94A3B8' };
  const c = colors[status];
  if (!c) return null;
  return (
    <div style={{
      position: "absolute", top: 6, right: 6,
      width: 10, height: 10, borderRadius: "50%", background: c,
      boxShadow: `0 0 0 2px rgba(255,255,255,0.9)`,
      animation: status === 'scanning' ? 'pulse 1.2s ease-in-out infinite' : 'none',
    }}>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>
    </div>
  );
}

/* ── Metadata verification modal ──────────────────────── */
const TYPE_LABELS = { '소설': { ko: '소설', en: 'Novel' }, novel: { ko: '소설', en: 'Novel' }, '기술서': { ko: '기술서', en: 'Technical' }, technical: { ko: '기술서', en: 'Technical' }, 'self-help': { ko: '자기계발', en: 'Self-help' }, '자기계발': { ko: '자기계발', en: 'Self-help' }, paper: { ko: '논문', en: 'Paper' }, '논문': { ko: '논문', en: 'Paper' }, 'work-doc': { ko: '업무문서', en: 'Work doc' }, '업무문서': { ko: '업무문서', en: 'Work doc' }, essay: { ko: '에세이', en: 'Essay' }, '에세이': { ko: '에세이', en: 'Essay' }, other: { ko: '기타', en: 'Other' }, '기타': { ko: '기타', en: 'Other' } };
const LANG_LABELS = { ko: { ko: '한국어', en: 'Korean' }, en: { ko: '영어', en: 'English' }, ja: { ko: '일본어', en: 'Japanese' }, zh: { ko: '중국어', en: 'Chinese' } };

function MetaFieldBox({ label, value, T, F }) {
  return (
    <div style={{ background: T.surfaceAlt, borderRadius: 8, padding: '8px 12px' }}>
      <div style={{ fontSize: 9.5, color: T.inkLight, fontFamily: F.body, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: T.ink, fontFamily: F.body }}>{value}</div>
    </div>
  );
}

function BookDetailModal({ book, lang, geminiKey, claudeKey, accessToken, onClose, onRead, onAI, onMetaChange, onAuthError, onRemoveLocal }) {
  const { T, F } = useTheme();
  const ko = lang === 'ko';
  const [showShare, setShowShare] = React.useState(false);

  const [meta, setMeta]         = useState(() => {
    const m = getBookMeta(book.id) || {};
    if (m.aiScanStatus === 'scanning') {
      setBookMeta(book.id, { aiScanStatus: undefined });
      return { ...m, aiScanStatus: undefined };
    }
    return m;
  });
  const [scanning, setScanning] = useState(false);
  const [stepIdx, setStepIdx]   = useState(0);
  const [scanError, setScanError] = useState(null);

  const usingClaude = !!claudeKey;
  const isLocal = book.source === 'local';
  const STEPS = isLocal
    ? (ko
        ? ['PDF 텍스트 읽는 중…', '표지 비전 인식 중…', '책 정보 추출 중…']
        : ['Reading PDF text…', 'Recognizing cover…', 'Extracting book info…'])
    : ko
    ? (usingClaude
        ? ['Drive에서 파일 가져오는 중…', 'AI 메타데이터 분석 중…', 'AI 메타데이터 분석 중…']
        : ['Drive에서 파일 가져오는 중…', 'Gemini에 업로드 중…', 'AI 메타데이터 분석 중…'])
    : (usingClaude
        ? ['Fetching from Drive…', 'AI extracting metadata…', 'AI extracting metadata…']
        : ['Fetching from Drive…', 'Uploading to Gemini…', 'AI extracting metadata…']);

  useEffect(() => {
    if (!scanning) { setStepIdx(0); return; }
    const iv = setInterval(() => setStepIdx(i => (i + 1) % STEPS.length), 4000);
    return () => clearInterval(iv);
  }, [scanning]); // eslint-disable-line

  const scanStatus = scanning ? 'scanning' : (meta.aiScanStatus || null);
  // 로컬 책은 기기 내 스캔(텍스트 레이어/로컬 비전 OCR)이라 Drive 토큰·AI 키 불필요
  const hasKey     = !!((geminiKey || claudeKey) && accessToken) || isLocal;
  const isDone     = scanStatus === 'done';
  const isRunning  = scanStatus === 'scanning';
  const canScan    = hasKey && !isDone && !isRunning;

  const ctx       = buildMetaContext(meta, lang);
  const typeLabel = TYPE_LABELS[meta.aiType]?.[ko ? 'ko' : 'en'];
  const langLabel = LANG_LABELS[meta.aiLanguage]?.[ko ? 'ko' : 'en'];

  async function handleScan() {
    if (!canScan) return;
    setScanError(null);
    setScanning(true);
    setMeta(m => ({ ...m, aiScanStatus: 'scanning' }));
    setBookMeta(book.id, { aiScanStatus: 'scanning' });
    onMetaChange?.();
    try {
      const m = isLocal
        ? await scanLocalBookMeta(book, { lang, apiKeys: { claude: claudeKey, gemini: geminiKey } })
        : await scanBookMeta({
            fileId: book.id,
            fileName: book.title + '.pdf',
            mimeType: 'application/pdf',
            size: book.size,
            accessToken,
            geminiKey,
            claudeKey,
            lang,
          });
      setBookMeta(book.id, m);
      setMeta(m);
    } catch (e) {
      if (e.message === 'auth-expired') {
        setBookMeta(book.id, { aiScanStatus: undefined });
        setMeta(m => ({ ...m, aiScanStatus: undefined }));
        setScanning(false);
        onMetaChange?.();
        onAuthError?.();
        return;
      }
      const isRateLimit = e.message === 'rate-limit';
      setScanError(isRateLimit ? null : (e?.message || String(e) || 'Unknown error'));
      const err = { aiScanStatus: isRateLimit ? 'pending' : 'error', aiScannedAt: Date.now() };
      setBookMeta(book.id, err);
      setMeta(m => ({ ...m, ...err }));
    }
    setScanning(false);
    onMetaChange?.();
  }

  function handleRescan() {
    const cleared = { aiScanStatus: undefined, aiTitle: undefined, aiAuthor: undefined, aiType: undefined, aiLanguage: undefined, aiSummary: undefined, aiTopics: undefined, aiScannedAt: undefined };
    setBookMeta(book.id, cleared);
    setMeta({});
    setScanError(null);
    onMetaChange?.();
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: T.surface, borderRadius: 20, padding: 28, maxWidth: 560, width: '100%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 24px 80px rgba(0,0,0,.3)', position: 'relative' }}>
        <button onClick={onClose} style={{ position: 'absolute', top: 16, right: 16, width: 28, height: 28, borderRadius: 8, border: 'none', background: T.surfaceAlt, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.inkLight, fontSize: 16, lineHeight: 1 }}>×</button>

        {/* Book header */}
        <div style={{ display: 'flex', gap: 20, marginBottom: 22, paddingRight: 32 }}>
          <DriveCover title={book.title} size={100} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: T.ink, fontFamily: F.display, lineHeight: 1.2, letterSpacing: -0.3, marginBottom: 4, wordBreak: 'break-word' }}>
              {meta.aiTitle || book.title}
            </div>
            {meta.aiAuthor && (
              <div style={{ fontSize: 13, color: T.inkMid, fontFamily: F.body, fontStyle: 'italic', marginBottom: 6 }}>{meta.aiAuthor}</div>
            )}
            <div style={{ fontSize: 12, color: T.inkLight, fontFamily: F.body }}>
              {fmtDate(book.modifiedTime)}{book.size ? ` · ${fmtSize(book.size)}` : ''}
            </div>
            {book.progress > 0 && (
              <div style={{ marginTop: 8, maxWidth: 200 }}>
                <ProgressBar value={book.progress} height={3} />
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4, fontSize: 11, color: T.accent, fontWeight: 600, fontFamily: F.mono }}>{book.progress}%</div>
              </div>
            )}
          </div>
        </div>

        {/* ── AI 분석 섹션 ── */}
        <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 18, marginBottom: 20 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: T.inkLight, letterSpacing: 1, textTransform: 'uppercase', fontFamily: F.body, marginBottom: 12 }}>
            {ko ? 'AI 문서 분석' : 'AI Analysis'}
          </div>

          {/* 미스캔 / pending */}
          {(!scanStatus || scanStatus === 'pending') && (
            <div style={{ fontSize: 13, color: T.inkMid, fontFamily: F.body, lineHeight: 1.6 }}>
              {hasKey
                ? (ko
                    ? (scanStatus === 'pending'
                        ? 'API 요청 한도에 도달했습니다. 잠시 후 아래 AI 재분석 버튼으로 다시 시도해 주세요.'
                        : isLocal && !(geminiKey || claudeKey)
                        ? '기기 안에서 표지·속표지를 인식해 제목과 저자를 추출합니다 (외부 전송 없음). 아래 분석 버튼을 눌러 시작하세요.'
                        : '제목·저자·요약·주제를 자동으로 추출합니다. 아래 AI 분석 버튼을 눌러 시작하세요.')
                    : (scanStatus === 'pending'
                        ? 'API rate limit reached. Please retry with AI Scan after a moment.'
                        : isLocal && !(geminiKey || claudeKey)
                        ? 'Recognize the cover on-device to extract title and author (nothing leaves your device). Tap Scan below.'
                        : 'Auto-extract title, author, summary and topics. Tap AI Scan below.'))
                : (ko ? 'Gemini API 키를 설정하면 AI 분석을 사용할 수 있습니다.' : 'Set up a Gemini API key to enable AI analysis.')}
            </div>
          )}

          {/* 스캔 중 — 단계별 진행 UI */}
          {scanStatus === 'scanning' && (
            <div style={{ background: T.surfaceAlt, borderRadius: 14, padding: '18px 16px', border: `1px solid ${T.secondary}33` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
                <div style={{ position: 'relative', width: 38, height: 38, flexShrink: 0 }}>
                  <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: `3px solid ${T.border}` }} />
                  <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: `3px solid transparent`, borderTopColor: T.secondary, animation: 'dmspin .8s linear infinite' }} />
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="spark" size={14} color={T.secondary} />
                  </div>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: T.ink, fontFamily: F.body, marginBottom: 3 }}>
                    {ko ? 'AI가 문서를 분석하고 있습니다' : 'Analyzing document with AI'}
                  </div>
                  <div style={{ fontSize: 12, color: T.secondary, fontFamily: F.body, fontWeight: 500 }}>
                    {STEPS[stepIdx]}
                  </div>
                </div>
              </div>
              {/* 인디케이터 바 */}
              <div style={{ height: 4, background: T.border, borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: '55%', background: `linear-gradient(90deg,${T.secondary},${T.secondary}66)`, borderRadius: 2, animation: 'dmsweep 2s ease-in-out infinite' }} />
              </div>
              <style>{`
                @keyframes dmspin{to{transform:rotate(360deg)}}
                @keyframes dmsweep{0%{transform:translateX(-130%)}100%{transform:translateX(280%)}}
              `}</style>
            </div>
          )}

          {/* 오류 */}
          {scanStatus === 'error' && (
            <div style={{ background: '#FEF2F2', borderRadius: 12, padding: '14px 16px', border: '1px solid #FECACA' }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: '#DC2626', fontFamily: F.body, marginBottom: 4 }}>
                {ko ? '분석에 실패했습니다' : 'Scan failed'}
              </div>
              <div style={{ fontSize: 11.5, color: '#EF4444', fontFamily: F.mono, marginBottom: 6, wordBreak: 'break-word' }}>
                {scanError || (ko ? '알 수 없는 오류입니다.' : 'Unknown error.')}
              </div>
              <div style={{ fontSize: 11.5, color: '#991B1B', fontFamily: F.body }}>
                {ko ? '아래 AI 분석 버튼으로 다시 시도하세요.' : 'Tap AI Scan below to retry.'}
              </div>
            </div>
          )}

          {/* 완료 — 메타데이터 표시 */}
          {scanStatus === 'done' && (
            <>
              {(typeLabel || langLabel || meta.aiScannedAt) && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 14 }}>
                  {typeLabel && <MetaFieldBox label={ko ? '유형' : 'Type'} value={typeLabel} T={T} F={F} />}
                  {langLabel && <MetaFieldBox label={ko ? '언어' : 'Language'} value={langLabel} T={T} F={F} />}
                  {meta.aiScannedAt && <MetaFieldBox label={ko ? '분석일' : 'Scanned'} value={new Date(meta.aiScannedAt).toLocaleDateString(ko ? 'ko-KR' : 'en-US')} T={T} F={F} />}
                </div>
              )}
              {meta.aiSummary && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: T.inkLight, letterSpacing: 1, textTransform: 'uppercase', fontFamily: F.body, marginBottom: 5 }}>{ko ? '요약' : 'Summary'}</div>
                  <div style={{ fontSize: 13, color: T.ink, fontFamily: F.body, lineHeight: 1.65, background: T.surfaceAlt, borderRadius: 10, padding: '10px 12px' }}>{meta.aiSummary}</div>
                </div>
              )}
              {meta.aiTopics?.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: T.inkLight, letterSpacing: 1, textTransform: 'uppercase', fontFamily: F.body, marginBottom: 5 }}>{ko ? '핵심 주제' : 'Topics'}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {meta.aiTopics.map((tp, i) => (
                      <span key={i} style={{ fontSize: 12, color: T.accentDeep, background: T.accentSoft, borderRadius: 6, padding: '3px 10px', fontFamily: F.body }}>{tp}</span>
                    ))}
                  </div>
                </div>
              )}
              {ctx && (
                <details style={{ marginBottom: 10 }}>
                  <summary style={{ fontSize: 11, color: T.inkLight, fontFamily: F.body, cursor: 'pointer', userSelect: 'none', marginBottom: 6 }}>
                    {ko ? 'AI 컨텍스트 미리보기 ▸' : 'AI context preview ▸'}
                  </summary>
                  <pre style={{ fontSize: 11, color: T.inkMid, fontFamily: F.mono, lineHeight: 1.6, background: T.surfaceAlt, borderRadius: 10, padding: '10px 12px', whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: '6px 0 0', border: `1px solid ${T.border}` }}>
                    {ctx.trim()}
                  </pre>
                </details>
              )}
              <button onClick={handleRescan} style={{ fontSize: 11, color: T.inkLight, background: 'none', border: `1px solid ${T.border}`, borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontFamily: F.body }}>
                {ko ? '다시 분석' : 'Re-scan'}
              </button>
            </>
          )}
        </div>

        {/* 액션 버튼 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button onClick={onRead} style={{ width: '100%', fontSize: 14, fontWeight: 600, color: '#FFF', background: T.accent, border: 'none', borderRadius: 10, padding: '12px 16px', cursor: 'pointer', fontFamily: F.body, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
            <Icon name="play" size={13} color="#FFF" /> {ko ? (book.progress > 0 ? '이어 읽기' : '읽기 시작') : (book.progress > 0 ? 'Continue reading' : 'Start reading')}
          </button>

          <div style={{ display: 'flex', gap: 8 }}>
            {/* AI 채팅 — 항상 활성 */}
            <button onClick={onAI} style={{ flex: 1, fontSize: 13, fontWeight: 600, color: T.accent, background: T.accentSoft, border: `1px solid ${T.accent}44`, borderRadius: 10, padding: '11px', cursor: 'pointer', fontFamily: F.body, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <Icon name="ai" size={13} /> {ko ? 'AI 채팅' : 'AI Chat'}
            </button>

            {/* AI 분석 — 완료시 비활성, pending/error는 재시도 가능 */}
            <button
              onClick={canScan ? handleScan : undefined}
              style={{
                flex: 1, fontSize: 13, fontWeight: 600,
                color: isDone ? T.inkLight : (hasKey ? T.secondary : T.inkFaint),
                background: isDone ? T.surfaceAlt : (hasKey ? `${T.secondary}18` : T.surfaceAlt),
                border: `1px solid ${isDone ? T.border : (hasKey ? `${T.secondary}55` : T.border)}`,
                borderRadius: 10, padding: '11px',
                cursor: canScan ? 'pointer' : 'default',
                fontFamily: F.body,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                opacity: isDone ? 0.5 : (!hasKey ? 0.4 : 1),
              }}
            >
              {isDone
                ? <><span style={{ fontSize: 14, lineHeight: 1 }}>✓</span> {ko ? '분석 완료' : 'Scanned'}</>
                : isRunning
                ? <><span style={{ width: 12, height: 12, borderRadius: '50%', border: `2px solid ${T.secondary}55`, borderTopColor: T.secondary, animation: 'dmspin .8s linear infinite', display: 'inline-block' }} />{ko ? '분석 중…' : 'Scanning…'}</>
                : scanStatus === 'error'
                ? <><Icon name="spark" size={12} /> {ko ? 'AI 재분석' : 'Retry scan'}</>
                : <><Icon name="spark" size={12} /> {ko ? 'AI 분석' : 'AI Scan'}</>
              }
            </button>
          </div>

          <div style={{ display: 'flex', gap: 6 }}>
            {book.webViewLink && (
              <button onClick={() => window.open(book.webViewLink, '_blank')} style={{ flex: 1, fontSize: 12, color: T.inkLight, background: 'none', border: `1px solid ${T.border}`, borderRadius: 8, padding: '8px', cursor: 'pointer', fontFamily: F.body, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <Icon name="cloud" size={12} /> {ko ? 'Drive에서 보기' : 'View in Drive'}
              </button>
            )}
            <button onClick={() => setShowShare(true)} style={{ flex: 1, fontSize: 12, color: T.inkLight, background: 'none', border: `1px solid ${T.border}`, borderRadius: 8, padding: '8px', cursor: 'pointer', fontFamily: F.body, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <Icon name="send" size={12} /> {ko ? '공유' : 'Share'}
            </button>
            {isLocal && (
              <button
                onClick={async () => {
                  if (!window.confirm(ko ? '이 책을 기기에서 제거할까요?' : 'Remove this book from your device?')) return;
                  await removeLocalBook(book.id);
                  onRemoveLocal?.();
                  onClose();
                }}
                style={{ flex: 1, fontSize: 12, color: '#C0392B', background: 'none', border: '1px solid #C0392B44', borderRadius: 8, padding: '8px', cursor: 'pointer', fontFamily: F.body, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
              >
                × {ko ? '기기에서 제거' : 'Remove'}
              </button>
            )}
          </div>
          {showShare && <ShareModal book={book} lang={lang} onClose={() => setShowShare(false)} />}
        </div>
      </div>
    </div>
  );
}

/* ── Drive helpers ────────────────────────────────────── */
const COVER_PALETTE = [
  { cover: '#7C6B52', spine: '#5C4F3A' },
  { cover: '#3D5A47', spine: '#2D4237' },
  { cover: '#4A5568', spine: '#2D3748' },
  { cover: '#8B4513', spine: '#6B3410' },
  { cover: '#553C9A', spine: '#44337A' },
  { cover: '#2F6B4B', spine: '#1E4A33' },
  { cover: '#8B2252', spine: '#6B1A3D' },
  { cover: '#1A5276', spine: '#154360' },
];
function pickCoverColor(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return COVER_PALETTE[Math.abs(h) % COVER_PALETTE.length];
}
function DriveCover({ title, size = 100 }) {
  const c = pickCoverColor(title);
  const w = Math.round(size * 0.7);
  return (
    <div style={{ width: w, height: size, background: c.cover, borderRadius: '3px 3px 2px 2px', position: 'relative', overflow: 'hidden', boxShadow: '2px 4px 14px rgba(0,0,0,.22)', flexShrink: 0 }}>
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 5, background: c.spine }} />
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(120deg,rgba(255,255,255,.18) 0%,transparent 55%,rgba(0,0,0,.1) 100%)' }} />
      <div style={{ position: 'absolute', top: 14, left: 12, right: 8 }}>
        <div style={{ fontSize: size * 0.16, fontWeight: 700, color: 'rgba(255,255,255,0.85)', fontFamily: 'serif', lineHeight: 1.2, wordBreak: 'break-word' }}>
          {title.slice(0, 14)}{title.length > 14 ? '…' : ''}
        </div>
      </div>
      <div style={{ position: 'absolute', bottom: 9, left: 12, fontSize: 9, color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace', letterSpacing: 0.5 }}>PDF</div>
    </div>
  );
}
async function listDrivePDFs(accessToken, folderId) {
  const q = `'${folderId}' in parents and trashed=false`;
  const fields = 'nextPageToken,files(id,name,mimeType,size,modifiedTime,webViewLink)';
  let allFiles = [];
  let pageToken = null;

  do {
    const url = new URL('https://www.googleapis.com/drive/v3/files');
    url.searchParams.set('q', q);
    url.searchParams.set('fields', fields);
    url.searchParams.set('orderBy', 'modifiedTime desc');
    url.searchParams.set('pageSize', '100');
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) throw new Error('auth-expired');
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `HTTP ${res.status}`);
    }
    const data = await res.json();
    allFiles = allFiles.concat(data.files || []);
    pageToken = data.nextPageToken || null;
  } while (pageToken);

  const pdfs = allFiles.filter(f => f.mimeType === 'application/pdf' || f.name?.toLowerCase().endsWith('.pdf'));
  return pdfs.length > 0 ? pdfs : allFiles.filter(f => !f.mimeType?.includes('folder'));
}
function driveFileToBook(file) {
  let meta = {};
  try { meta = JSON.parse(localStorage.getItem(`pkl_book_${file.id}`) || '{}'); } catch { }
  return {
    id: file.id,
    title: file.name.replace(/\.pdf$/i, '').replace(/_/g, ' '),
    status: meta.status || 'unread',
    progress: meta.progress || 0,
    lastPage: meta.lastPage || 0,
    pages: meta.pages || 0,
    webViewLink: file.webViewLink,
    modifiedTime: file.modifiedTime,
    size: file.size,
  };
}
function fmtDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
}
function fmtSize(bytes) {
  if (!bytes) return '';
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)}MB` : `${(bytes / 1024).toFixed(0)}KB`;
}

/* ── DESKTOP: LIBRARY ─────────────────────────────────── */
/* ── Scan queue hook ──────────────────────────────────── */
function useScanQueue({ books, userConfig, lang, onBookScanned, onAuthError }) {
  const [scanning, setScanning]       = useState(false);
  const [scanIdx, setScanIdx]         = useState(0);
  const [scanPending, setScanPending] = useState([]);
  const [scanDone, setScanDone]       = useState(0);
  const [scanErrors, setScanErrors]   = useState(0);
  const activeRef = useRef(false);

  const geminiKey   = userConfig?.apiKeys?.gemini;
  const claudeKey   = userConfig?.apiKeys?.claude;
  const accessToken = userConfig?.driveAccessToken || userConfig?.googleUser?.accessToken;

  // On mount: reset any books stuck in 'scanning' state from a previously interrupted session
  useEffect(() => {
    books.forEach(b => {
      if (getBookMeta(b.id)?.aiScanStatus === 'scanning') {
        setBookMeta(b.id, { aiScanStatus: undefined });
      }
    });
  }, []); // eslint-disable-line

  const unscanned = useMemo(
    () => books.filter(b => !getBookMeta(b.id)?.aiScanStatus),
    [books]
  );

  const startScan = useCallback(async () => {
    if ((!geminiKey && !claudeKey) || !accessToken || activeRef.current) return;
    const queue = unscanned.map(b => b);
    if (!queue.length) return;
    setScanPending(queue.map(b => b.id));
    setScanDone(0);
    setScanErrors(0);
    setScanIdx(0);
    setScanning(true);
    activeRef.current = true;

    for (let i = 0; i < queue.length; i++) {
      if (!activeRef.current) break;
      const book = queue[i];
      setScanIdx(i);
      setBookMeta(book.id, { aiScanStatus: 'scanning' });
      onBookScanned?.();

      try {
        const meta = await scanBookMeta({
          fileId: book.id, fileName: book.title + '.pdf',
          mimeType: book.mimeType || 'application/pdf',
          size: book.size, accessToken, geminiKey, claudeKey, lang,
        });
        setBookMeta(book.id, meta);
        setScanDone(d => d + 1);
      } catch (e) {
        if (e.message === 'auth-expired') {
          setBookMeta(book.id, { aiScanStatus: undefined });
          onBookScanned?.();
          setScanning(false);
          activeRef.current = false;
          onAuthError?.();
          return;
        }
        setBookMeta(book.id, { aiScanStatus: e.message === 'rate-limit' ? 'pending' : 'error', aiScannedAt: Date.now() });
        setScanErrors(n => n + 1);
        if (e.message === 'rate-limit') await sleep(8000);
      }
      onBookScanned?.();
      if (i < queue.length - 1) await sleep(4000);
    }
    setScanning(false);
    activeRef.current = false;
  }, [geminiKey, claudeKey, accessToken, unscanned, lang, onBookScanned, onAuthError]);

  const stopScan = useCallback(() => { activeRef.current = false; setScanning(false); }, []);

  return { scanning, scanIdx, scanTotal: scanPending.length, scanDone, scanErrors, unscanned, startScan, stopScan };
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function DesktopLibrary({ lang, setScreen, openDriveSave, isPC, onAddBook, userConfig, onOpenBook, onAuthError, onOpenBookWithAI }) {
  const { T, F } = useTheme();
  const t = i18n[lang];
  const [filter, setFilter] = useState("all");

  const accessToken = userConfig?.driveAccessToken || userConfig?.googleUser?.accessToken;
  const driveFolder = userConfig?.driveFolder;
  const hasConfig = !!(accessToken && driveFolder?.id);

  const [books, setBooks] = useState([]);
  const [localBooks, setLocalBooks] = useState(() => getLocalBooks());
  const [localAdding, setLocalAdding] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [bookTick, setBookTick] = useState(0); // forces re-render when scan meta updates
  const [detailBook, setDetailBook] = useState(null); // book opened in BookDetailModal

  const load = useCallback(async () => {
    if (!hasConfig) return;
    setLoading(true);
    setError(null);
    try {
      const files = await listDrivePDFs(accessToken, driveFolder.id);
      const mapped = files.map(driveFileToBook);
      setBooks(mapped);
      saveBookIndex(mapped);
    } catch (e) {
      if (e.message === 'auth-expired') onAuthError?.();
      else setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [accessToken, driveFolder?.id, hasConfig]);

  useEffect(() => { load(); }, [load]);

  // 로컬 PDF 추가 (Electron 네이티브 다이얼로그 / 웹 file input 공통 진입점)
  const handleAddLocalElectron = useCallback(async () => {
    setLocalAdding(true);
    await addLocalBooksNative();
    setLocalBooks(getLocalBooks());
    setLocalAdding(false);
  }, []);

  // Electron: 메뉴 "파일 > PDF 추가…" (⌘O) 이벤트 구독
  useEffect(() => onElectronMenuOpenPdf(handleAddLocalElectron), [handleAddLocalElectron]);

  // 로컬 PDF "내 기기" 섹션 — 실제 서재 / 데모 양쪽에서 재사용
  const localSection = (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: T.inkLight, letterSpacing: 1.2, textTransform: "uppercase", fontFamily: F.body }}>
          💻 {lang === "ko" ? "내 기기" : "My Device"}
        </div>
        {usesNativePicker() ? (
          <button
            disabled={localAdding}
            onClick={handleAddLocalElectron}
            style={{ padding: "6px 14px", borderRadius: 20, background: T.accentSoft, color: T.accent, fontSize: 12, fontWeight: 600, fontFamily: F.body, border: "none", cursor: localAdding ? "default" : "pointer", opacity: localAdding ? 0.6 : 1 }}
          >
            {localAdding ? (lang === "ko" ? "추가 중…" : "Adding…") : `+ ${lang === "ko" ? "PDF 추가" : "Add PDF"}`}
          </button>
        ) : (
          <label style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 20, background: T.accentSoft, color: T.accent, fontSize: 12, fontWeight: 600, fontFamily: F.body, cursor: localAdding ? "default" : "pointer", opacity: localAdding ? 0.6 : 1 }}>
            <input
              type="file"
              accept=".pdf"
              multiple
              style={{ display: "none" }}
              disabled={localAdding}
              onChange={async (e) => {
                const files = Array.from(e.target.files || []);
                if (!files.length) return;
                setLocalAdding(true);
                for (const f of files) await addLocalBook(f);
                setLocalBooks(getLocalBooks());
                setLocalAdding(false);
                e.target.value = "";
              }}
            />
            {localAdding ? (lang === "ko" ? "추가 중…" : "Adding…") : `+ ${lang === "ko" ? "PDF 추가" : "Add PDF"}`}
          </label>
        )}
      </div>
    </div>
  );

  const { scanning, scanIdx, scanTotal, scanDone, scanErrors, unscanned, startScan, stopScan } =
    useScanQueue({ books, userConfig, lang, onBookScanned: () => setBookTick(t => t + 1), onAuthError });

  const bumpTick = useCallback(() => setBookTick(t => t + 1), []);

  // 로컬 책도 Drive 책과 동일한 book 형태로 그리드/피처드에 표시
  const localAsBooks = useMemo(() => localBooks.map(localBookToBook), [localBooks, bookTick]); // eslint-disable-line
  const allBooks = useMemo(() => [...localAsBooks, ...books], [localAsBooks, books]);

  const filterOpts = [
    { key: "all", label: t.allBooks },
    { key: "reading", label: t.reading },
    { key: "completed", label: t.completed },
    { key: "unread", label: t.unread },
  ];

  // ── Loading ──
  if (loading) {
    return (
      <>
        <DesktopHeader subtitle={driveFolder.name} title={t.library} />
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 14 }}>
          <div style={{ width: 40, height: 40, borderRadius: "50%", border: `3px solid ${T.border}`, borderTopColor: T.accent, animation: "spin 0.8s linear infinite" }} />
          <p style={{ fontSize: 14, color: T.inkLight, fontFamily: F.body, margin: 0 }}>
            {lang === "ko" ? "Drive에서 불러오는 중…" : "Loading from Drive…"}
          </p>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      </>
    );
  }

  // ── Error ──
  if (error) {
    const isAuthErr = /credential|invalid|token|401/i.test(error);
    return (
      <>
        <DesktopHeader subtitle={driveFolder.name} title={t.library} />
        <AuthErrorOrRetry
          isAuthErr={isAuthErr}
          error={error}
          lang={lang}
          onRetry={load}
          onAuthError={onAuthError}
          size="lg"
        />
      </>
    );
  }

  // ── Empty ──
  if (allBooks.length === 0) {
    return (
      <>
        <DesktopHeader
          subtitle={hasConfig ? driveFolder.name : (lang === "ko" ? "내 서재" : "My library")}
          title={t.library}
          right={
            <Button variant="accent" onClick={onAddBook} style={{ padding: "8px 14px" }}>
              <Icon name="library" size={14} color="#FFF" /> {lang === "ko" ? "책 추가" : "Add Book"}
            </Button>
          }
        />
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 18 }}>
          <div style={{ width: 88, height: 88, borderRadius: 26, background: T.accentSoft, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon name="library" size={40} color={T.accent} />
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 24, fontWeight: 600, color: T.ink, fontFamily: F.display, marginBottom: 10, letterSpacing: -0.4 }}>
              {lang === "ko" ? "서재가 비어 있어요" : "Your library is empty"}
            </div>
            <div style={{ fontSize: 14, color: T.inkLight, fontFamily: F.body, lineHeight: 1.65, maxWidth: 360 }}>
              {hasConfig
                ? (lang === "ko"
                    ? `📁 ${driveFolder.name} 폴더에 PDF를 추가하면 여기에 나타납니다.`
                    : `Add PDFs to 📁 ${driveFolder.name} in Google Drive to see them here.`)
                : (lang === "ko"
                    ? "기기의 PDF 파일을 추가해 나만의 서재를 시작하세요."
                    : "Add a PDF from your device to start your library.")}
            </div>
          </div>
          <Button variant="accent" onClick={onAddBook} style={{ padding: "12px 32px", fontSize: 14 }}>
            <Icon name="library" size={15} color="#FFF" /> {lang === "ko" ? "첫 책 추가하기" : "Add first book"}
          </Button>
          {hasConfig && (
            <button onClick={load} style={{ background: "none", border: "none", color: T.inkLight, fontSize: 12, fontFamily: F.body, cursor: "pointer", textDecoration: "underline" }}>
              {lang === "ko" ? "새로 고침" : "Refresh"}
            </button>
          )}
        </div>
      </>
    );
  }

  // ── Real Drive data ──
  const filtered = filter === "all" ? allBooks : allBooks.filter(b => b.status === filter);
  const featured = allBooks.find(b => b.status === "reading") || allBooks[0];

  return (
    <>
      <DesktopHeader
        subtitle={hasConfig ? driveFolder.name : (lang === "ko" ? "내 서재" : "My library")}
        title={t.library}
        right={
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <div style={{ background: T.surface, borderRadius: 10, padding: "8px 14px", border: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 8, minWidth: 220 }}>
              <Icon name="search" size={14} color={T.inkLight} />
              <input placeholder={t.searchPlaceholder} style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontSize: 13, color: T.ink, fontFamily: F.body, minWidth: 0 }} />
            </div>
            {hasConfig && (
              <button onClick={load} title={lang === "ko" ? "새로 고침" : "Refresh"} style={{ width: 36, height: 36, borderRadius: 9, border: `1px solid ${T.border}`, background: T.surface, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icon name="sync" size={15} color={T.inkLight} />
              </button>
            )}
            <Button variant="accent" onClick={onAddBook} style={{ padding: "8px 14px", fontSize: 13, whiteSpace: "nowrap" }}>
              <Icon name="library" size={14} color="#FFF" /> {lang === "ko" ? "책 추가" : "Add Book"}
            </Button>
          </div>
        }
      />
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 28px 32px" }}>
        {/* ── 로컬 PDF 섹션 ── */}
        {localSection}

        {/* AI Scan banner */}
        <ScanBanner
          lang={lang}
          geminiKey={userConfig?.apiKeys?.gemini}
          claudeKey={userConfig?.apiKeys?.claude}
          unscannedCount={unscanned.length}
          scanning={scanning}
          scanDone={scanDone}
          scanTotal={scanTotal}
          scanErrors={scanErrors}
          onStart={startScan}
          onStop={stopScan}
        />

        {/* Featured */}
        {featured && filter === "all" && (
          <div style={{ background: `linear-gradient(120deg, ${T.surface} 0%, ${T.surfaceAlt} 100%)`, borderRadius: 18, padding: 24, marginBottom: 28, border: `1px solid ${T.border}`, display: "flex", gap: 24, alignItems: "center" }}>
            <DriveCover title={featured.title} size={120} />
            <div style={{ flex: 1 }}>
              {featured.status === "reading" && (
                <div style={{ fontSize: 10, fontWeight: 700, color: T.accent, letterSpacing: 1.6, textTransform: "uppercase", fontFamily: F.body, marginBottom: 6 }}>
                  {lang === "ko" ? "읽는 중" : "Now reading"}
                </div>
              )}
              <div style={{ fontSize: 26, fontWeight: 600, color: T.ink, fontFamily: F.display, letterSpacing: -0.6, lineHeight: 1.1, marginBottom: 6 }}>
                {featured.title}
              </div>
              <div style={{ fontSize: 14, color: T.inkLight, fontFamily: F.body, marginBottom: featured.progress > 0 ? 16 : 20 }}>
                {fmtDate(featured.modifiedTime)}{featured.size ? ` · ${fmtSize(featured.size)}` : ""}
              </div>
              {featured.progress > 0 && (
                <div style={{ maxWidth: 360, marginBottom: 16 }}>
                  <ProgressBar value={featured.progress} height={5} />
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 11.5, fontFamily: F.mono, color: T.inkLight }}>
                    <span>p. {featured.lastPage}</span>
                    <span style={{ color: T.accent, fontWeight: 600 }}>{featured.progress}%</span>
                  </div>
                </div>
              )}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Button variant="accent" onClick={() => { if (onOpenBook) onOpenBook(featured); else setScreen("reader"); }} style={{ padding: "10px 18px", whiteSpace: "nowrap" }}>
                  <Icon name="play" size={12} color="#FFF" /> {featured.status === "reading" ? t.continueReading : (lang === "ko" ? "읽기 시작" : "Start Reading")}
                </Button>
                {featured.webViewLink && (
                  <Button variant="ghost" onClick={() => window.open(featured.webViewLink, "_blank")} style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                    <Icon name="cloud" size={14} /> Drive
                  </Button>
                )}
                <Button variant="ghost" onClick={() => setScreen("ai")} style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                  <Icon name="ai" size={14} /> {t.askAI}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Filter + count */}
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 18, alignItems: "center" }}>
          <ChipRow options={filterOpts} value={filter} onChange={setFilter} />
          <div style={{ fontSize: 11.5, color: T.inkLight, fontFamily: F.body, whiteSpace: "nowrap" }}>
            {filtered.length} {lang === "ko" ? "권" : "books"}
          </div>
        </div>

        {/* Grid */}
        {filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 0", color: T.inkLight, fontSize: 14, fontFamily: F.body }}>
            {lang === "ko" ? "해당 책이 없습니다" : "No books in this category"}
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: isPC ? "repeat(5, 1fr)" : "repeat(4, 1fr)", gap: 20, rowGap: 24 }}>
            {filtered.map(b => {
              const bMeta = getBookMeta(b.id);
              const scanSt = bMeta?.aiScanStatus;
              return (
              <div key={b.id + bookTick} onClick={() => setDetailBook(b)} style={{ cursor: "pointer" }}>
                <div style={{ display: "flex", justifyContent: "center", marginBottom: 10, position: "relative" }}>
                  <DriveCover title={b.title} size={isPC ? 130 : 110} />
                  <ScanDot status={scanSt} />
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, color: T.ink, fontFamily: F.display, lineHeight: 1.25, letterSpacing: -0.2, marginBottom: 3, wordBreak: "break-word" }}>
                  {bMeta?.aiTitle || b.title}
                </div>
                {bMeta?.aiAuthor && (
                  <div style={{ fontSize: 11, color: T.inkMid, fontFamily: F.body, marginBottom: 2, fontStyle: "italic" }}>{bMeta.aiAuthor}</div>
                )}
                <div style={{ fontSize: 11.5, color: T.inkLight, fontFamily: F.body, marginBottom: 6 }}>
                  {fmtDate(b.modifiedTime)}
                </div>
                {b.status === "reading" && b.progress > 0 ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <div style={{ flex: 1 }}><ProgressBar value={b.progress} height={2} /></div>
                    <span style={{ fontSize: 10, color: T.accent, fontWeight: 600, fontFamily: F.mono }}>{b.progress}%</span>
                  </div>
                ) : b.status === "completed" ? (
                  <span style={{ fontSize: 10, color: T.secondary, fontWeight: 600, fontFamily: F.body }}>✓ {lang === "ko" ? "완독" : "Done"}</span>
                ) : (
                  <span style={{ fontSize: 10, color: T.inkFaint, fontFamily: F.body, letterSpacing: 0.6, textTransform: "uppercase" }}>
                    {t.unread}
                  </span>
                )}
              </div>
              );
            })}
            <div onClick={onAddBook} style={{ cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, minHeight: 160, borderRadius: 12, border: `1.5px dashed ${T.border}` }}>
              <Icon name="library" size={24} color={T.inkLight} />
              <span style={{ fontSize: 12, color: T.inkLight, fontFamily: F.body }}>{lang === "ko" ? "책 추가" : "Add book"}</span>
            </div>
          </div>
        )}
      </div>

      {/* Book detail modal */}
      {detailBook && (
        <BookDetailModal
          book={detailBook}
          lang={lang}
          geminiKey={userConfig?.apiKeys?.gemini}
          claudeKey={userConfig?.apiKeys?.claude}
          accessToken={accessToken}
          onClose={() => setDetailBook(null)}
          onRead={() => { if (onOpenBook) onOpenBook(detailBook); else setScreen('reader'); setDetailBook(null); }}
          onAI={() => {
              if (isPC && onOpenBookWithAI) { onOpenBookWithAI(detailBook); }
              else { if (onOpenBook) onOpenBook(detailBook); setScreen('ai'); }
              setDetailBook(null);
            }}
          onMetaChange={bumpTick}
          onAuthError={onAuthError}
          onRemoveLocal={() => { setLocalBooks(getLocalBooks()); setDetailBook(null); }}
        />
      )}
    </>
  );
}

/* ── DESKTOP: READER ──────────────────────────────────── */
function DesktopReader({ lang, setScreen, openDriveSave, isPC, currentBook, apiKeys, openAiPanel, onAiPanelConsumed }) {
  const { T, F } = useTheme();
  const t = i18n[lang];
  const book = currentBook;

  const [notesPanel, setNotesPanel] = useState(true);
  const [notes, setNotes] = useState([]);
  const [highlights, setHighlights] = useState([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [noteText, setNoteText] = useState("");
  const [notePage, setNotePage] = useState("");
  const [hlText, setHlText] = useState("");
  const [hlPage, setHlPage] = useState("");
  const [hlColor, setHlColor] = useState("#FFF3B0");
  const [pageInput, setPageInput] = useState("");
  const [editingPage, setEditingPage] = useState(false);
  const [sideTab, setSideTab] = useState("notes");

  useEffect(() => {
    if (openAiPanel) {
      setSideTab("ai");
      setNotesPanel(true);
      onAiPanelConsumed?.();
    }
  }, [openAiPanel]); // eslint-disable-line
  const [aiMessages, setAiMessages] = useState([]);
  const [aiInput, setAiInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiMode, setAiMode] = useState("quick");
  const [aiModel, setAiModel] = useState(() => apiKeys?.claude ? "claude" : "gemini");
  const [aiHasError, setAiHasError] = useState(false);
  const [lastSentMsg, setLastSentMsg] = useState("");
  const [timerActive, setTimerActive] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [saveFeedback, setSaveFeedback] = useState(false);
  const [totalPageInput, setTotalPageInput] = useState("");
  const aiScrollRef = useRef(null);
  const timerRef = useRef(null);
  const sessionStart = useRef(null);
  const adjustPageRef = useRef(null);
  const pdfViewerRef = useRef(null);

  const [pdfPage, setPdfPage] = useState(1);
  const [currentPageData, setCurrentPageData] = useState(null);
  const [focusMode, setFocusMode] = useState(false);
  const [pdfAnnotations, setPdfAnnotations] = useState([]);
  const [focusAiOpen, setFocusAiOpen] = useState(false);
  const [bookmarks, setBookmarks] = useState([]);
  const [readerSettings, setReaderSettings] = useState(getReaderSettings);
  const [showReaderSettings, setShowReaderSettings] = useState(false);
  // Vocab & Quiz generation
  const [showVocabRange, setShowVocabRange] = useState(false);
  const [showQuizRange, setShowQuizRange] = useState(false);
  const [vocabLoading, setVocabLoading] = useState(false);
  const [quizLoading, setQuizLoading] = useState(false);
  const [quizData, setQuizData] = useState(null);
  const [genFeedback, setGenFeedback] = useState("");
  const focusModeRef = useRef(false);
  const focusAiRef = useRef(false);
  useEffect(() => { focusModeRef.current = focusMode; }, [focusMode]);
  useEffect(() => { focusAiRef.current = focusAiOpen; }, [focusAiOpen]);

  useEffect(() => {
    if (book) {
      setPdfPage(getBookMeta(book.id)?.lastPage || 1);
      setCurrentPageData(null);
      setBookmarks(getBookmarks(book.id));
      setPdfAnnotations(getPdfAnnotations(book.id));
    }
  }, [book?.id]); // eslint-disable-line

  /* Auto-session tracking: record time, auto-save on leave (separate from visible timer) */
  useEffect(() => {
    if (!book) return;
    sessionStart.current = Date.now();
    const cur = getBookMeta(book.id);
    if (!cur.status || cur.status === "unread") {
      setBookMeta(book.id, { status: "reading" });
    }
    return () => {
      const elapsed = Math.round((Date.now() - sessionStart.current) / 60000);
      if (elapsed >= 1) {
        addSession({ bookId: book.id, bookTitle: book.title, minutes: elapsed, pages: 0 });
      }
    };
  }, [book?.id]); // eslint-disable-line

  useEffect(() => {
    if (!book) return;
    setNotes(getNotes().filter(n => n.bookId === book.id));
    setHighlights(getHighlights().filter(h => h.bookId === book.id));
  }, [book?.id, refreshKey]);

  useEffect(() => {
    if (!book || sideTab !== "ai") return;
    if (aiMessages.length > 0) return;
    const bookNotes = getNotes().filter(n => n.bookId === book.id);
    const bookHighlights = getHighlights().filter(h => h.bookId === book.id);
    const count = bookNotes.length + bookHighlights.length;
    const greeting = lang === "ko"
      ? `《${book.title}》에 대해 질문하세요.${count > 0 ? ` 저장된 메모 ${count}개를 참고합니다.` : ""}`
      : `Ask me anything about 《${book.title}》.${count > 0 ? ` I'll reference your ${count} saved notes.` : ""}`;
    const greetingMsg = { role: "ai", content: greeting };
    const saved = getAiChat(book.id);
    setAiMessages(saved?.length ? [greetingMsg, ...saved] : [greetingMsg]);
  }, [book?.id, sideTab, lang]);

  useEffect(() => {
    if (aiScrollRef.current) aiScrollRef.current.scrollTop = aiScrollRef.current.scrollHeight;
  }, [aiMessages, aiLoading]);

  useEffect(() => {
    if (timerActive) { timerRef.current = setInterval(() => setTimerSeconds(s => s + 1), 1000); }
    else clearInterval(timerRef.current);
    return () => clearInterval(timerRef.current);
  }, [timerActive]);

  /* Keyboard shortcuts */
  useEffect(() => {
    if (!book) return;
    const handleKey = (e) => {
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target?.isContentEditable) return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        e.preventDefault(); adjustPageRef.current?.(+1);
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault(); adjustPageRef.current?.(-1);
      } else if (e.key === 'f' || e.key === 'F') {
        setFocusMode(m => !m);
      } else if ((e.key === 'a' || e.key === 'A') && focusModeRef.current) {
        if (!focusAiRef.current) {
          setFocusAiOpen(true); setSideTab("ai"); setNotesPanel(true);
        } else {
          setFocusAiOpen(false); setNotesPanel(false);
        }
      } else if (e.key === 'Escape' && focusModeRef.current) {
        if (focusAiRef.current) { setFocusAiOpen(false); setNotesPanel(false); }
        else setFocusMode(false);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [book?.id]); // eslint-disable-line

  const meta = book ? getBookMeta(book.id) : {};
  const progress = meta.progress || 0;
  const lastPage = meta.lastPage || 0;
  const totalPages = meta.pages || 0;
  const pad = n => String(n).padStart(2, "0");
  const timerLabel = `${pad(Math.floor(timerSeconds / 60))}:${pad(timerSeconds % 60)}`;

  const hasClaude = !!apiKeys?.claude;
  const hasGemini = !!apiKeys?.gemini;
  const activeModel = (aiModel === "claude" && hasClaude) ? "claude"
    : (aiModel === "gemini" && hasGemini) ? "gemini"
    : hasClaude ? "claude" : hasGemini ? "gemini" : null;
  const aiLabel = activeModel === "claude" ? "Claude" : activeModel === "gemini" ? "Gemini" : (lang === "ko" ? "AI 미연결" : "No AI");

  const docBadgeLabel = (() => {
    const doc = book?.id ? getDocumentText(book.id) : null;
    if (doc) return lang === "ko" ? `${doc.firstPage}~${doc.lastPage}p (${doc.pageCount}페이지) 텍스트 참조 중` : `p.${doc.firstPage}–${doc.lastPage} (${doc.pageCount} pages) text loaded`;
    if (currentPageData?.text) return lang === "ko" ? `p.${currentPageData.pageNum} 텍스트 참조 중` : `p.${currentPageData.pageNum} text loaded`;
    if (currentPageData?.imageBase64) return lang === "ko" ? `p.${currentPageData.pageNum} 이미지 인식 모드` : `p.${currentPageData.pageNum} image vision mode`;
    return null;
  })();

  const saveNote = () => {
    if (!book || !noteText.trim()) return;
    addNote({ bookId: book.id, bookTitle: book.title, text: noteText.trim(), page: notePage ? parseInt(notePage) : 0 });
    setNoteText(""); setNotePage(""); setRefreshKey(k => k + 1);
  };
  const saveHighlight = () => {
    if (!book || !hlText.trim()) return;
    addHighlight({ bookId: book.id, bookTitle: book.title, text: hlText.trim(), page: hlPage ? parseInt(hlPage) : 0, color: hlColor });
    setHlText(""); setHlPage(""); setRefreshKey(k => k + 1);
  };
  const adjustPage = (delta) => {
    if (!book) return;
    const cur = getBookMeta(book.id);
    const newPage = Math.max(1, (cur.lastPage || 0) + delta);
    const total = cur.pages || 0;
    const patch = { lastPage: newPage, status: 'reading' };
    if (total > 0) {
      patch.progress = Math.min(100, Math.round((newPage / total) * 100));
      if (patch.progress >= 100) patch.status = 'completed';
    }
    setBookMeta(book.id, patch);
    setPdfPage(newPage);
    setSaveFeedback(true);
    setTimeout(() => setSaveFeedback(false), 1400);
  };
  adjustPageRef.current = adjustPage;

  const savePage = () => {
    if (!book || !pageInput) { setEditingPage(false); return; }
    const p = parseInt(pageInput);
    if (isNaN(p) || p < 1) { setEditingPage(false); return; }
    const total = parseInt(totalPageInput) || meta.pages || 0;
    const patch = { lastPage: p, status: 'reading' };
    if (total > 0) {
      patch.pages = total;
      patch.progress = Math.min(100, Math.round((p / total) * 100));
      if (patch.progress >= 100) patch.status = 'completed';
    }
    setBookMeta(book.id, patch);
    setPdfPage(p);
    setSaveFeedback(true);
    setTimeout(() => setSaveFeedback(false), 1400);
    setEditingPage(false); setPageInput(""); setTotalPageInput("");
  };
  const saveSession = () => {
    if (!book || timerSeconds < 30) return;
    addSession({ bookId: book.id, bookTitle: book.title, minutes: Math.max(1, Math.round(timerSeconds / 60)), pages: 0 });
    setTimerSeconds(0); setTimerActive(false);
  };

  const sendAI = async (txt) => {
    const text = (txt || aiInput).trim();
    if (!text || aiLoading || !book || !activeModel) return;
    setLastSentMsg(text);
    setAiHasError(false);
    const history = aiMessages.slice(1).map(m => ({ role: m.role, content: m.content }));
    setAiMessages(prev => [...prev, { role: "user", content: text }]);
    setAiInput("");
    setAiLoading(true);
    try {
      // 업로드된 책 기반 답변 보장 — 텍스트 캐시가 비었으면 캐시 PDF에서 추출
      if (!getDocumentText(book.id)) {
        await ensureBookText(book);
      }
      const bookNotes = getNotes().filter(n => n.bookId === book.id);
      const bookHighlights = getHighlights().filter(h => h.bookId === book.id);
      // Use image when current page has no extractable text (scanned PDF)
      const pageImg = currentPageData?.imageBase64 && !currentPageData?.text ? currentPageData.imageBase64 : null;
      const systemPrompt = buildDesktopSystemPrompt(aiMode, book, bookNotes, bookHighlights, lang, !!pageImg);
      const effectiveKeys = activeModel === "claude" ? { claude: apiKeys.claude } : { gemini: apiKeys.gemini };
      const response = await callAI(effectiveKeys, systemPrompt, history, text, pageImg);
      setAiMessages(prev => {
        const next = [...prev, { role: "ai", content: response }];
        saveAiChat(book.id, next);
        return next;
      });
    } catch (e) {
      let code = e.message;
      // billing 에러 시 최소 테스트 콜로 실제 크레딧 상태 확인
      if (code === "billing" && activeModel === "claude" && apiKeys?.claude) {
        try {
          const verifyRes = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: { "x-api-key": apiKeys.claude, "anthropic-version": "2023-06-01", "content-type": "application/json", "anthropic-dangerous-direct-browser-access": "true" },
            body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 1, messages: [{ role: "user", content: "hi" }] }),
          });
          if (verifyRes.ok || verifyRes.status === 429) {
            // 최소 콜은 성공 → billing 오류가 아닌 일시적 오류
            code = "transient";
          }
          // 429는 rate-limit이지만 크레딧은 있음 → "transient"로 처리
        } catch { /* 네트워크 오류 → billing 코드 유지 */ }
      }
      setAiHasError(true);
      setAiMessages(prev => [...prev, { role: "ai", content: aiErrorMsg(code, lang, aiLabel) }]);
      showError(
        lang === "ko" ? "AI 응답에 실패했습니다." : "AI request failed.",
        () => sendAI(text),
        lang === "ko" ? "재시도" : "Retry"
      );
    } finally {
      setAiLoading(false);
    }
  };

  if (!book) {
    return (
      <>
        <DesktopHeader subtitle={lang === "ko" ? "뷰어" : "Reader"} title={lang === "ko" ? "뷰어" : "Reader"} />
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16 }}>
          <div style={{ width: 80, height: 80, borderRadius: 24, background: T.accentSoft, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon name="library" size={36} color={T.accent} />
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 20, fontWeight: 600, color: T.ink, fontFamily: F.display, marginBottom: 8 }}>{lang === "ko" ? "읽을 책을 서재에서 선택하세요" : "Select a book from the Library"}</div>
            <div style={{ fontSize: 14, color: T.inkLight, fontFamily: F.body }}>{lang === "ko" ? "서재에서 책을 클릭하면 여기서 열립니다." : "Click a book in the Library to open it here."}</div>
          </div>
          <Button variant="accent" onClick={() => setScreen("library")} style={{ padding: "10px 24px" }}>{lang === "ko" ? "서재로 이동" : "Go to Library"}</Button>
        </div>
      </>
    );
  }

  const isBookmarkedPage = bookmarks.includes(lastPage);

  const handleToggleBookmark = () => {
    if (!book || !lastPage) return;
    setBookmarks(toggleBookmark(book.id, lastPage));
  };

  const handleReaderSetting = (key, val) => {
    const next = { ...readerSettings, [key]: val };
    setReaderSettings(next);
    saveReaderSettings(next);
  };

  const [visionOcr, setVisionOcr] = useState(null); // 텍스트 인식 시트 상태

  // 현재 페이지 Vision/로컬 OCR → 활용 시트 (복사·메모·AI 질문)
  const recognizeCurrentPage = async () => {
    if (!book?.id || visionOcr?.status === 'running') return;
    setVisionOcr({ status: 'running', pageNum: pdfPage });
    try {
      const res = await pdfViewerRef.current?.ocrPage(pdfPage, {
        onProgress: ({ engine, pct }) => setVisionOcr(s => s?.status === 'running' ? { ...s, engine, enginePct: pct } : s),
      });
      if (res?.text) setVisionOcr({ status: 'done', ...res });
      else setVisionOcr({ status: 'error', pageNum: pdfPage });
    } catch {
      setVisionOcr({ status: 'error', pageNum: pdfPage });
    }
  };

  const showGenFeedback = (msg) => {
    setGenFeedback(msg);
    setTimeout(() => setGenFeedback(""), 3000);
  };

  // 선택 범위 텍스트 추출: 캐시에 없으면 즉석 추출(+OCR) → 전체 캐시 폴백 → throw
  const getRangeText = async (startPage, endPage) => {
    let ranged = getTextForRange(book.id, startPage, endPage);
    if (!ranged?.text) {
      showGenFeedback(lang === 'ko' ? '⏳ 페이지 텍스트 추출 중…' : '⏳ Extracting page text…');
      const result = await pdfViewerRef.current?.ensureRange(startPage, endPage, ({ pageNum, total, done, engine, enginePct }) => {
        if (engine && enginePct != null) {
          const label = enginePct < 100 && /Gemma/i.test(engine)
            ? (lang === 'ko' ? `🧠 ${engine} 모델 로딩… ${enginePct}%` : `🧠 ${engine} loading… ${enginePct}%`)
            : (lang === 'ko' ? `🔤 ${engine} 인식… ${enginePct}%` : `🔤 ${engine}… ${enginePct}%`);
          showGenFeedback(label);
        } else if (total) {
          const pct = Math.round((done / total) * 100);
          showGenFeedback(lang === 'ko' ? `⏳ OCR ${done}/${total}p (${pct}%) · ${pageNum}p` : `⏳ OCR ${done}/${total} (${pct}%)`);
        }
      });
      if (result?.ocr > 0) showGenFeedback(lang === 'ko' ? `✓ OCR ${result.ocr}페이지 완료` : `✓ OCR ${result.ocr} pages done`);
      ranged = getTextForRange(book.id, startPage, endPage);
    }
    if (ranged?.text) return ranged.text;
    const doc = getDocumentText(book.id);
    const full = typeof doc === 'string' ? doc : (doc?.text || '');
    if (full) return full;
    throw new Error('no-text');
  };

  const genErrorMsg = (e) => {
    const code = e?.message || '';
    if (code === 'no-text') {
      return lang === 'ko'
        ? '⚠️ 페이지 텍스트가 아직 없습니다. 해당 범위를 한 번 넘겨본 뒤 다시 시도하세요. (스캔 이미지 PDF는 미지원)'
        : '⚠️ No page text yet. Flip through that range once, then retry. (Scanned image PDFs unsupported)';
    }
    if (code === 'parse-failed' || code === 'invalid-format') {
      return lang === 'ko' ? '⚠️ AI 응답 형식 오류. 다시 시도하세요.' : '⚠️ AI response format error. Please retry.';
    }
    return lang === 'ko' ? `⚠️ 생성 실패: ${code}` : `⚠️ Failed: ${code}`;
  };

  const generateVocabInRange = async (startPage, endPage) => {
    if (!activeModel) { showGenFeedback(lang === 'ko' ? '⚠️ AI 키를 먼저 설정하세요' : '⚠️ Set an AI key first'); return; }
    if (!book?.id) return;
    setVocabLoading(true);
    try {
      const pageText = await getRangeText(startPage, endPage);

      const systemPrompt = lang === 'ko'
        ? '어휘 추출 전문가입니다. JSON 배열만 출력하세요. 형식: [{"word":"단어","definition":"뜻"}]'
        : 'You are a vocabulary expert. Return ONLY a JSON array. Format: [{"word":"term","definition":"meaning"}]';
      const prompt = lang === 'ko'
        ? `p.${startPage}-${endPage}에서 중요한 단어 5개를 추출하세요.\n\n${pageText.slice(0, 3000)}`
        : `Extract 5 key terms from pages ${startPage}-${endPage}.\n\n${pageText.slice(0, 3000)}`;
      const effectiveKeys = activeModel === 'claude' ? { claude: apiKeys.claude } : { gemini: apiKeys.gemini };

      const raw = await callAI(effectiveKeys, systemPrompt, [], prompt);
      const jsonMatch = raw.match(/\[[\s\S]*\]/);
      if (!jsonMatch) throw new Error('parse-failed');

      const extracted = JSON.parse(jsonMatch[0]);
      const cur = getVocabulary();
      let added = 0;
      extracted.forEach(({ word, definition }) => {
        if (word?.trim() && definition?.trim()) {
          if (!cur.some(e => e.word.toLowerCase() === word.toLowerCase().trim())) {
            addVocabularyEntry({ word: word.trim(), definition: definition.trim(), bookId: book.id, bookTitle: book.title });
            added++;
          }
        }
      });
      showGenFeedback(lang === 'ko' ? `✓ 어휘 ${added}개 추가됨 (지식에서 확인)` : `✓ Added ${added} terms (see Knowledge)`);
    } catch (e) {
      showGenFeedback(genErrorMsg(e));
    } finally {
      setVocabLoading(false);
    }
  };

  const generateQuizInRange = async (startPage, endPage) => {
    if (!activeModel) { showGenFeedback(lang === 'ko' ? '⚠️ AI 키를 먼저 설정하세요' : '⚠️ Set an AI key first'); return; }
    if (!book?.id) return;
    setQuizLoading(true);
    try {
      const pageText = await getRangeText(startPage, endPage);

      const systemPrompt = lang === 'ko'
        ? '교육용 퀴즈 전문가입니다. 유효한 JSON만 출력하세요.'
        : 'You are a quiz expert. Return ONLY valid JSON.';
      const prompt = lang === 'ko'
        ? `p.${startPage}-${endPage} 내용 기반 5지선다형 퀴즈 1문제를 만드세요.\nJSON 형식: {"question":"질문","options":["1","2","3","4","5"],"correctIndex":0,"explanation":"해설"}\n\n${pageText.slice(0, 2000)}`
        : `Create 1 multiple-choice quiz from pages ${startPage}-${endPage}.\nJSON: {"question":"q","options":["1","2","3","4","5"],"correctIndex":0,"explanation":"why"}\n\n${pageText.slice(0, 2000)}`;
      const effectiveKeys = activeModel === 'claude' ? { claude: apiKeys.claude } : { gemini: apiKeys.gemini };

      const raw = await callAI(effectiveKeys, systemPrompt, [], prompt);
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('parse-failed');

      const quiz = JSON.parse(jsonMatch[0]);
      if (quiz.question && Array.isArray(quiz.options) && typeof quiz.correctIndex === 'number') {
        setQuizData({ ...quiz, range: { startPage, endPage } });
      } else {
        throw new Error('invalid-format');
      }
    } catch (e) {
      showGenFeedback(genErrorMsg(e));
    } finally {
      setQuizLoading(false);
    }
  };

  return (
    <>
      {/* ── 집중 모드 플로팅 툴바 ── */}
      {focusMode && (
        <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", zIndex: 300, display: "flex", gap: 6, alignItems: "center", background: "rgba(20,20,20,.88)", backdropFilter: "blur(10px)", borderRadius: 14, padding: "8px 14px", boxShadow: "0 4px 24px rgba(0,0,0,.5)" }}>
          <button onClick={() => adjustPage(-1)} style={{ background: "none", border: "none", color: "#ddd", fontSize: 18, cursor: "pointer", lineHeight: 1, padding: "2px 6px" }}>‹</button>
          <span style={{ fontSize: 11, fontFamily: F.mono, color: "#ccc", minWidth: 60, textAlign: "center" }}>
            {lastPage > 0 ? `p.${lastPage}${totalPages > 0 ? ` / ${totalPages}` : ""}` : "—"}
          </span>
          <button onClick={() => adjustPage(1)} style={{ background: "none", border: "none", color: "#ddd", fontSize: 18, cursor: "pointer", lineHeight: 1, padding: "2px 6px" }}>›</button>
          <div style={{ width: 1, height: 16, background: "rgba(255,255,255,.2)", margin: "0 4px" }} />
          <button onClick={handleToggleBookmark} title={lang === "ko" ? "북마크" : "Bookmark"} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, color: isBookmarkedPage ? "#FFD700" : "#888", padding: "2px 4px" }}>★</button>
          <button onClick={() => { if (!focusAiRef.current) { setFocusAiOpen(true); setSideTab("ai"); setNotesPanel(true); } else { setFocusAiOpen(false); setNotesPanel(false); } }} title="A · AI 채팅" style={{ background: focusAiOpen ? T.accent : "rgba(255,255,255,.12)", border: "none", borderRadius: 7, cursor: "pointer", fontSize: 10, fontWeight: 700, color: focusAiOpen ? "#fff" : "#ccc", padding: "4px 8px", fontFamily: F.body }}>
            A · AI
          </button>
          <button onClick={() => setShowReaderSettings(s => !s)} title={lang === "ko" ? "읽기 설정" : "Settings"} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "#888", padding: "2px 4px" }}>⚙</button>
          <div style={{ width: 1, height: 16, background: "rgba(255,255,255,.2)", margin: "0 4px" }} />
          <button onClick={() => setFocusMode(false)} title="Esc · 집중 모드 종료" style={{ background: "none", border: "none", color: "#888", fontSize: 12, cursor: "pointer", padding: "2px 4px" }}>✕</button>
        </div>
      )}
      {/* ── 읽기 설정 패널 ── */}
      {showReaderSettings && (
        <div style={{ position: "fixed", bottom: focusMode ? 80 : 60, left: "50%", transform: "translateX(-50%)", zIndex: 310, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 14, padding: "16px 20px", boxShadow: "0 4px 24px rgba(0,0,0,.2)", minWidth: 260 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.inkLight, letterSpacing: 1, textTransform: "uppercase", fontFamily: F.body, marginBottom: 12 }}>{lang === "ko" ? "읽기 설정" : "Reader Settings"}</div>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: T.inkMid, fontFamily: F.body, marginBottom: 6 }}>{lang === "ko" ? "배경" : "Background"}</div>
            <div style={{ display: "flex", gap: 6 }}>
              {[{ k: "white", label: lang === "ko" ? "기본" : "Default", color: "#fff", border: "#ccc" }, { k: "sepia", label: "세피아", color: "#f5eddc", border: "#c4a97d" }, { k: "dark", label: "다크", color: "#1a1a2e", border: "#444" }].map(opt => (
                <button key={opt.k} onClick={() => handleReaderSetting("bg", opt.k)} style={{ flex: 1, padding: "8px 4px", borderRadius: 8, border: `2px solid ${readerSettings.bg === opt.k ? T.accent : opt.border}`, background: opt.color, cursor: "pointer", fontSize: 10, color: opt.k === "dark" ? "#eee" : "#333", fontFamily: F.body, fontWeight: readerSettings.bg === opt.k ? 700 : 400 }}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: T.inkMid, fontFamily: F.body, marginBottom: 6 }}>{lang === "ko" ? "확대" : "Zoom"} · {Math.round(readerSettings.zoom * 100)}%</div>
            <div style={{ display: "flex", gap: 4 }}>
              {[0.75, 1, 1.25, 1.5].map(z => (
                <button key={z} onClick={() => handleReaderSetting("zoom", z)} style={{ flex: 1, padding: "6px 2px", borderRadius: 7, border: `1.5px solid ${readerSettings.zoom === z ? T.accent : T.border}`, background: readerSettings.zoom === z ? T.accentSoft : T.surfaceAlt, cursor: "pointer", fontSize: 10, color: readerSettings.zoom === z ? T.accent : T.inkMid, fontFamily: F.mono, fontWeight: readerSettings.zoom === z ? 700 : 400 }}>
                  {z === 1 ? "100%" : `${z * 100}%`}
                </button>
              ))}
            </div>
          </div>
          <button onClick={() => setShowReaderSettings(false)} style={{ marginTop: 14, width: "100%", padding: "7px", borderRadius: 8, border: "none", background: T.surfaceAlt, color: T.inkMid, fontSize: 12, fontFamily: F.body, cursor: "pointer" }}>닫기</button>
        </div>
      )}
      {focusMode ? null : <DesktopHeader
        subtitle={lang === "ko" ? "뷰어" : "Reader"}
        title={book.title}
        right={
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
            {/* Reading timer */}
            <div style={{ display: "flex", alignItems: "center", gap: 1 }}>
              <button onClick={() => setTimerActive(a => !a)} title={timerActive ? (lang === "ko" ? "타이머 일시정지" : "Pause timer") : (lang === "ko" ? "타이머 시작" : "Start timer")} style={{ display: "flex", alignItems: "center", gap: 5, background: timerActive ? T.accentSoft : T.surfaceAlt, border: `1px solid ${timerActive ? T.accent : T.border}`, borderRadius: timerSeconds > 0 ? "8px 0 0 8px" : 8, padding: "5px 9px", cursor: "pointer", transition: "all .15s" }}>
                <Icon name={timerActive ? "pause" : "play"} size={10} color={timerActive ? T.accent : T.inkLight} />
                <span style={{ fontSize: 11, fontFamily: F.mono, color: timerActive ? T.accent : T.inkMid, fontWeight: 600, minWidth: 34 }}>{timerLabel}</span>
              </button>
              {timerSeconds > 0 && !timerActive && (
                <button onClick={saveSession} title={lang === "ko" ? "세션 저장" : "Save session"} style={{ height: "100%", padding: "5px 8px", background: T.secondary, border: `1px solid ${T.secondary}`, borderLeft: "none", borderRadius: "0 8px 8px 0", cursor: "pointer", display: "flex", alignItems: "center" }}>
                  <Icon name="check" size={10} color="#FFF" stroke={2.5} />
                </button>
              )}
            </div>
            {/* Page tracker with quick ±1 */}
            {editingPage ? (
              <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                <input autoFocus value={pageInput} onChange={e => setPageInput(e.target.value.replace(/\D/g, ""))} onKeyDown={e => { if (e.key === "Enter") savePage(); if (e.key === "Escape") setEditingPage(false); }} placeholder={lang === "ko" ? "현재 페이지" : "Page"} style={{ width: 72, border: `1.5px solid ${T.ink}`, borderRadius: 8, padding: "5px 9px", fontSize: 13, fontFamily: F.mono, color: T.ink, background: T.surface, outline: "none", textAlign: "center" }} />
                {!totalPages && (
                  <input value={totalPageInput} onChange={e => setTotalPageInput(e.target.value.replace(/\D/g, ""))} placeholder={lang === "ko" ? "전체 페이지" : "Total"} style={{ width: 72, border: `1px solid ${T.border}`, borderRadius: 8, padding: "5px 9px", fontSize: 13, fontFamily: F.mono, color: T.inkMid, background: T.surfaceAlt, outline: "none", textAlign: "center" }} />
                )}
                <Button variant="accent" onClick={savePage} style={{ padding: "5px 10px", fontSize: 12 }}>{lang === "ko" ? "저장" : "Save"}</Button>
                <button onClick={() => setEditingPage(false)} style={{ background: "none", border: "none", color: T.inkLight, cursor: "pointer", padding: "5px" }}>✕</button>
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", border: `1px solid ${T.border}`, borderRadius: 8, overflow: "hidden", background: T.surfaceAlt }}>
                <button onClick={() => adjustPage(-1)} style={{ padding: "5px 9px", background: "none", border: "none", borderRight: `1px solid ${T.border}`, color: T.inkMid, fontSize: 14, cursor: "pointer", lineHeight: 1 }}>−</button>
                <button onClick={() => { setPageInput(lastPage > 0 ? String(lastPage) : ""); setEditingPage(true); }} style={{ padding: "5px 9px", background: "none", border: "none", fontSize: 12, fontFamily: F.mono, color: saveFeedback ? T.secondary : (lastPage > 0 ? T.ink : T.inkLight), fontWeight: saveFeedback ? 700 : (lastPage > 0 ? 600 : 400), cursor: "pointer", whiteSpace: "nowrap", minWidth: 80, transition: "color .3s" }}>
                  {saveFeedback ? `✓ p.${lastPage}` : (lastPage > 0 ? `p.${lastPage}${progress > 0 && totalPages > 0 ? ` · ${progress}%` : ''}` : (lang === "ko" ? "페이지 기록" : "Log page"))}
                </button>
                <button onClick={() => adjustPage(1)} style={{ padding: "5px 9px", background: "none", border: "none", borderLeft: `1px solid ${T.border}`, color: T.inkMid, fontSize: 14, cursor: "pointer", lineHeight: 1 }}>+</button>
              </div>
            )}
            {/* Drive save */}
            {book.webViewLink && (
              <button onClick={() => openDriveSave(book)} title={lang === "ko" ? "Drive에 저장" : "Save to Drive"} style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${T.border}`, background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                onMouseEnter={e => e.currentTarget.style.background = T.surfaceAlt}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}
              >
                <Icon name="cloud" size={14} color={T.inkMid} />
              </button>
            )}
            {/* 텍스트 인식 (Vision) */}
            <button onClick={recognizeCurrentPage} disabled={visionOcr?.status === 'running'} title={lang === "ko" ? "텍스트 인식 (Vision)" : "Recognize text (Vision)"} style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${T.border}`, background: visionOcr?.status === 'running' ? T.surfaceAlt : "transparent", cursor: visionOcr?.status === 'running' ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, opacity: visionOcr?.status === 'running' ? 0.5 : 1 }}>{visionOcr?.status === 'running' ? "⏳" : "🔍"}</button>
            {/* Vocab generation */}
            <button onClick={() => setShowVocabRange(true)} disabled={vocabLoading} title={lang === "ko" ? "어휘 생성" : "Generate vocabulary"} style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${T.border}`, background: vocabLoading ? T.surfaceAlt : "transparent", cursor: vocabLoading ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, opacity: vocabLoading ? 0.5 : 1 }}>{vocabLoading ? "⏳" : "📚"}</button>
            {/* Quiz generation */}
            <button onClick={() => setShowQuizRange(true)} disabled={quizLoading} title={lang === "ko" ? "퀴즈 생성" : "Generate quiz"} style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${T.border}`, background: quizLoading ? T.surfaceAlt : "transparent", cursor: quizLoading ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, opacity: quizLoading ? 0.5 : 1 }}>{quizLoading ? "⏳" : "🎯"}</button>
            {/* Knowledge view */}
            <button onClick={() => setScreen("knowledge")} title={lang === "ko" ? "지식 보기" : "View knowledge"} style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${T.border}`, background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>📖</button>
            <div style={{ width: 1, height: 18, background: T.border, margin: "0 2px" }} />
            {/* Bookmark */}
            <button onClick={handleToggleBookmark} title={lang === "ko" ? "북마크" : "Bookmark"} style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${isBookmarkedPage ? T.accent : T.border}`, background: isBookmarkedPage ? T.accentSoft : "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, color: isBookmarkedPage ? T.accent : T.inkLight }}>★</button>
            {/* Reader settings */}
            <button onClick={() => setShowReaderSettings(s => !s)} title={lang === "ko" ? "읽기 설정" : "Reader settings"} style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${T.border}`, background: showReaderSettings ? T.surfaceAlt : "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: T.inkLight }}>⚙</button>
            {/* Focus mode */}
            <button onClick={() => setFocusMode(true)} title={lang === "ko" ? "집중 모드 [F]" : "Focus mode [F]"} style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${T.border}`, background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon name="spark" size={13} color={T.inkLight} />
            </button>
            {/* Panel toggle */}
            <button onClick={() => setNotesPanel(!notesPanel)} style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${T.border}`, background: notesPanel ? T.surfaceAlt : "transparent", color: notesPanel ? T.ink : T.inkLight, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon name="note" size={14} />
            </button>
          </div>
        }
      />}
      <style>{`@keyframes pulse { 0%,100%{opacity:.3;transform:scale(.9)} 50%{opacity:1;transform:scale(1)} }`}</style>
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* PDF */}
        <div style={{ flex: 1, overflow: "hidden", position: "relative", display: "flex", flexDirection: "column" }}>
          <PdfViewer
            ref={pdfViewerRef}
            fileId={book.id}
            source={book.source || "drive"}
            book={book}
            page={pdfPage}
            apiKeys={apiKeys}
            annotations={pdfAnnotations}
            onAnnotationAdd={(annot) => {
              const entry = addPdfAnnotation({ bookId: book.id, ...annot });
              setPdfAnnotations(prev => [entry, ...prev]);
            }}
            onTotalPages={(n) => { if (n && !getBookMeta(book.id)?.pages) setBookMeta(book.id, { pages: n }); }}
            onPageText={(num, txt, img) => setCurrentPageData({ pageNum: num, text: txt, imageBase64: img })}
            onPageChange={(delta) => adjustPage(delta)}
            zoom={readerSettings.zoom}
            bg={readerSettings.bg}
            lang={lang}
          />
        </div>
        {/* Notes / AI panel — show on PC always; on tablet only when panel is open */}
        {notesPanel && (isPC || sideTab === "ai") && (
          <div style={{ width: sideTab === "ai" ? 360 : 300, borderLeft: `1px solid ${T.border}`, background: T.surface, display: "flex", flexDirection: "column", flexShrink: 0, transition: "width .2s" }}>
            <div style={{ padding: "8px 10px", borderBottom: `1px solid ${T.border}`, display: "flex", gap: 3, background: T.surfaceAlt, flexShrink: 0 }}>
              {[
                { k: "notes", label: lang === "ko" ? "메모" : "Notes" },
                { k: "highlights", label: lang === "ko" ? "HL" : "HL" },
                { k: "ai", label: "AI", icon: "spark" },
              ].map(opt => (
                <button key={opt.k} onClick={() => setSideTab(opt.k)} style={{ flex: 1, padding: "6px 4px", borderRadius: 7, border: "none", background: sideTab === opt.k ? T.surface : "transparent", color: sideTab === opt.k ? (opt.k === "ai" ? T.accent : T.ink) : T.inkLight, fontSize: 11.5, fontWeight: sideTab === opt.k ? 600 : 400, fontFamily: F.body, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 3 }}>
                  {opt.icon && <Icon name={opt.icon} size={11} color={sideTab === opt.k ? T.accent : T.inkLight} />}
                  {opt.label}
                </button>
              ))}
            </div>
            {sideTab === "ai" ? (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                {/* AI control bar */}
                <div style={{ padding: "8px 12px", borderBottom: `1px solid ${T.border}`, background: T.surfaceAlt, flexShrink: 0 }}>
                  {/* Model toggle (shown when both keys available) */}
                  {hasClaude && hasGemini && (
                    <div style={{ display: "flex", gap: 3, background: T.surface, padding: 2, borderRadius: 8, border: `1px solid ${T.border}`, marginBottom: 7 }}>
                      {[{ k: "claude", l: "Claude" }, { k: "gemini", l: "Gemini" }].map(m => (
                        <button key={m.k} onClick={() => setAiModel(m.k)} style={{
                          flex: 1, padding: "5px 4px", borderRadius: 6, border: "none", cursor: "pointer",
                          background: aiModel === m.k ? T.ink : "transparent",
                          color: aiModel === m.k ? T.surface : T.inkLight,
                          fontSize: 11, fontWeight: aiModel === m.k ? 700 : 400, fontFamily: F.body,
                          transition: "all .15s",
                        }}>{m.l}</button>
                      ))}
                    </div>
                  )}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: activeModel ? T.accent : T.inkLight, fontFamily: F.body, display: "flex", alignItems: "center", gap: 5 }}>
                      <div style={{ width: 6, height: 6, borderRadius: "50%", background: activeModel ? "#22C55E" : T.border }} />
                      {aiLabel}
                    </div>
                    <button onClick={() => { setAiMessages([]); if (book) saveAiChat(book.id, []); }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 10, color: T.inkLight, fontFamily: F.body, padding: "2px 4px" }}>
                      {lang === "ko" ? "초기화" : "Clear"}
                    </button>
                  </div>
                  {docBadgeLabel && (
                    <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 6, padding: "3px 7px", background: currentPageData?.imageBase64 && !currentPageData?.text ? "#FFF3E0" : T.accentSoft, borderRadius: 6, border: `1px solid ${currentPageData?.imageBase64 && !currentPageData?.text ? "#FF9800" : T.accent}22` }}>
                      <Icon name={currentPageData?.imageBase64 && !currentPageData?.text ? "spark" : "doc"} size={9} color={currentPageData?.imageBase64 && !currentPageData?.text ? "#E65100" : T.accent} />
                      <span style={{ fontSize: 9.5, color: currentPageData?.imageBase64 && !currentPageData?.text ? "#E65100" : T.accent, fontFamily: F.body, fontWeight: 600 }}>{docBadgeLabel}</span>
                    </div>
                  )}
                  {/* Mode selector */}
                  <div style={{ display: "flex", gap: 3, background: T.surface, padding: 3, borderRadius: 8, border: `1px solid ${T.border}` }}>
                    {[
                      { k: "quick", l: lang === "ko" ? "빠른" : "Quick" },
                      { k: "context", l: lang === "ko" ? "맥락" : "Context" },
                      { k: "socratic", l: lang === "ko" ? "소크라테스" : "Socratic" },
                    ].map(m => (
                      <button key={m.k} onClick={() => setAiMode(m.k)} style={{
                        flex: 1, padding: "4px 2px", borderRadius: 6, border: "none", cursor: "pointer",
                        background: aiMode === m.k ? T.ink : "transparent",
                        color: aiMode === m.k ? T.surface : T.inkLight,
                        fontSize: 10, fontWeight: aiMode === m.k ? 600 : 400, fontFamily: F.body,
                      }}>{m.l}</button>
                    ))}
                  </div>
                </div>
                {/* Messages */}
                <div ref={aiScrollRef} style={{ flex: 1, overflowY: "auto", padding: "10px 12px", display: "flex", flexDirection: "column", gap: 7 }}>
                  {aiMessages.map((m, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
                      <div style={{
                        maxWidth: "88%", padding: "8px 11px",
                        borderRadius: m.role === "user" ? "12px 12px 3px 12px" : "3px 12px 12px 12px",
                        background: m.role === "user" ? T.ink : T.surface,
                        color: m.role === "user" ? T.surface : T.ink,
                        border: m.role === "user" ? "none" : `1px solid ${T.border}`,
                        fontSize: 12.5, lineHeight: 1.6, fontFamily: F.body, whiteSpace: "pre-wrap",
                      }}>{m.content}</div>
                    </div>
                  ))}
                  {aiLoading && (
                    <div style={{ display: "flex", justifyContent: "flex-start" }}>
                      <div style={{ padding: "8px 12px", borderRadius: "3px 12px 12px 12px", background: T.surface, border: `1px solid ${T.border}`, display: "flex", gap: 4, alignItems: "center" }}>
                        {[0,1,2].map(i => <div key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: T.inkFaint, animation: `pulse 1.2s ${i*0.2}s infinite` }} />)}
                      </div>
                    </div>
                  )}
                  {/* Suggested questions */}
                  {aiMessages.length === 1 && !aiLoading && activeModel && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 2 }}>
                      {(lang === "ko"
                        ? [`《${book.title}》 핵심 요약`, "저자의 주요 주장은?", "실용적 교훈은?", "비판적으로 보면?"]
                        : [`Summarize 《${book.title}》`, "Author's main argument?", "Practical takeaways?", "Critique this book"]
                      ).map((q, i) => (
                        <button key={i} onClick={() => sendAI(q)} style={{ padding: "5px 9px", borderRadius: 999, border: `1px solid ${T.border}`, background: T.surface, color: T.ink, fontSize: 10.5, fontFamily: F.body, cursor: "pointer", lineHeight: 1.4 }}>{q}</button>
                      ))}
                    </div>
                  )}
                  {!activeModel && aiMessages.length <= 1 && (
                    <div style={{ padding: "12px", background: T.surfaceAlt, borderRadius: 10, fontSize: 12, color: T.inkLight, fontFamily: F.body, textAlign: "center", border: `1px solid ${T.border}`, lineHeight: 1.6 }}>
                      {lang === "ko" ? "⚙ 설정에서 API 키를 연결하면\nAI를 사용할 수 있습니다" : "⚙ Connect an API key in Settings\nto use AI"}
                    </div>
                  )}
                </div>
                {/* Input */}
                <div style={{ padding: "10px 12px", borderTop: `1px solid ${T.border}`, background: T.surface, flexShrink: 0 }}>
                  {aiHasError && lastSentMsg && (
                    <button
                      onClick={() => { setAiHasError(false); sendAI(lastSentMsg); }}
                      style={{ width: "100%", marginBottom: 7, padding: "6px 10px", background: T.surfaceAlt, border: `1px solid ${T.border}`, borderRadius: 8, fontSize: 11.5, color: T.inkMid, fontFamily: F.body, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}
                    >
                      <Icon name="reload" size={11} color={T.inkMid} />
                      {lang === "ko" ? "다시 시도" : "Retry"}
                    </button>
                  )}
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <input
                      value={aiInput}
                      onChange={e => setAiInput(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendAI()}
                      disabled={aiLoading || (!apiKeys?.claude && !apiKeys?.gemini)}
                      placeholder={lang === "ko" ? "질문을 입력하세요…" : "Ask a question…"}
                      style={{ flex: 1, border: `1.5px solid ${aiInput ? T.ink : T.border}`, borderRadius: 8, padding: "7px 10px", fontSize: 12.5, color: T.ink, background: T.surfaceAlt, fontFamily: F.body, outline: "none" }}
                    />
                    <button onClick={() => sendAI()} disabled={!aiInput.trim() || aiLoading || (!apiKeys?.claude && !apiKeys?.gemini)} style={{
                      width: 34, height: 34, borderRadius: 999, border: "none",
                      background: (aiInput.trim() && !aiLoading && (apiKeys?.claude || apiKeys?.gemini)) ? T.accent : T.border,
                      cursor: (aiInput.trim() && !aiLoading && (apiKeys?.claude || apiKeys?.gemini)) ? "pointer" : "default",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <Icon name="send" size={14} color="#FFF" stroke={2} />
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ flex: 1, overflowY: "auto", padding: 14 }}>
                {sideTab === "notes" ? (
                  <>
                    <textarea value={noteText} onChange={e => setNoteText(e.target.value)} placeholder={lang === "ko" ? "메모를 입력하세요…" : "Write a note…"} style={{ width: "100%", minHeight: 80, border: `1px solid ${T.border}`, borderRadius: 10, padding: "9px 11px", fontSize: 13, fontFamily: F.body, color: T.ink, background: T.surfaceAlt, resize: "none", outline: "none", boxSizing: "border-box", marginBottom: 6 }} />
                    <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
                      <input value={notePage} onChange={e => setNotePage(e.target.value.replace(/\D/g, ""))} placeholder="p." style={{ width: 60, border: `1px solid ${T.border}`, borderRadius: 8, padding: "6px 9px", fontSize: 12, fontFamily: F.mono, color: T.ink, background: T.surfaceAlt, outline: "none" }} />
                      <Button variant="accent" onClick={saveNote} style={{ flex: 1, padding: "6px", fontSize: 12 }} disabled={!noteText.trim()}>{lang === "ko" ? "저장" : "Save"}</Button>
                    </div>
                    {notes.map(n => (
                      <div key={n.id} style={{ background: T.surfaceAlt, borderRadius: 8, padding: "9px 11px", marginBottom: 8, borderLeft: `3px solid ${T.accent}` }}>
                        <p style={{ fontSize: 12.5, lineHeight: 1.55, color: T.ink, fontFamily: F.body, margin: 0, whiteSpace: "pre-wrap" }}>{n.text}</p>
                        {n.page > 0 && <div style={{ fontSize: 10, color: T.inkLight, fontFamily: F.mono, marginTop: 4 }}>p.{n.page}</div>}
                      </div>
                    ))}
                    {notes.length === 0 && <div style={{ fontSize: 12, color: T.inkLight, fontFamily: F.body, textAlign: "center", padding: "20px 0" }}>{lang === "ko" ? "메모가 없습니다" : "No notes yet"}</div>}
                  </>
                ) : (
                  <>
                    {/* Add highlight form */}
                    <textarea value={hlText} onChange={e => setHlText(e.target.value)} placeholder={lang === "ko" ? "하이라이트할 구절 입력…" : "Paste a passage to highlight…"} style={{ width: "100%", minHeight: 70, border: `1px solid ${T.border}`, borderRadius: 10, padding: "9px 11px", fontSize: 13, fontFamily: "serif", color: T.ink, background: T.surfaceAlt, resize: "none", outline: "none", boxSizing: "border-box", marginBottom: 6 }} />
                    <div style={{ display: "flex", gap: 6, marginBottom: 14, alignItems: "center" }}>
                      <input value={hlPage} onChange={e => setHlPage(e.target.value.replace(/\D/g, ""))} placeholder="p." style={{ width: 52, border: `1px solid ${T.border}`, borderRadius: 8, padding: "6px 9px", fontSize: 12, fontFamily: F.mono, color: T.ink, background: T.surfaceAlt, outline: "none" }} />
                      <div style={{ display: "flex", gap: 4 }}>
                        {["#FFF3B0", "#BBF7D0", "#BFDBFE", "#FECACA", "#E9D5FF"].map(c => (
                          <button key={c} onClick={() => setHlColor(c)} style={{ width: 20, height: 20, borderRadius: "50%", background: c, border: hlColor === c ? `2px solid ${T.ink}` : `2px solid transparent`, cursor: "pointer", padding: 0 }} />
                        ))}
                      </div>
                      <Button variant="accent" onClick={saveHighlight} style={{ flex: 1, padding: "6px", fontSize: 12 }} disabled={!hlText.trim()}>{lang === "ko" ? "추가" : "Add"}</Button>
                    </div>
                    {highlights.map(h => (
                      <div key={h.id} style={{ background: h.color || "#FFF3B0", borderRadius: 8, padding: "9px 11px", marginBottom: 8 }}>
                        <p style={{ fontSize: 12.5, lineHeight: 1.55, color: T.ink, fontFamily: "serif", margin: 0 }}>{h.text}</p>
                        {h.page > 0 && <div style={{ fontSize: 10, color: T.inkLight, fontFamily: F.mono, marginTop: 4 }}>p.{h.page}</div>}
                      </div>
                    ))}
                    {highlights.length === 0 && <div style={{ fontSize: 12, color: T.inkLight, fontFamily: F.body, textAlign: "center", padding: "16px 0" }}>{lang === "ko" ? "하이라이트가 없습니다" : "No highlights yet"}</div>}
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 생성 피드백 토스트 */}
      {genFeedback && (
        <div style={{ position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)", zIndex: 400, background: T.ink, color: T.surface, padding: "10px 18px", borderRadius: 10, fontSize: 13, fontWeight: 600, fontFamily: F.body, boxShadow: "0 4px 20px rgba(0,0,0,.3)" }}>
          {genFeedback}
        </div>
      )}

      {/* 텍스트 인식(Vision) 결과 시트 */}
      {visionOcr && (
        <VisionTextSheet
          lang={lang}
          state={visionOcr}
          onClose={() => setVisionOcr(null)}
          onSaveNote={(text, pageNum) => {
            addNote({ bookId: book.id, bookTitle: book.title, text: text.slice(0, 2000), page: pageNum, tags: ['OCR'] });
            setNotes(getNotes().filter(n => n.bookId === book.id));
            showGenFeedback(lang === 'ko' ? '✓ 메모로 저장됨' : '✓ Saved as note');
          }}
          onAskAI={() => {
            setVisionOcr(null);
            setSideTab('ai');
            setNotesPanel(true); // 인식 텍스트는 pageTextCache 를 통해 AI 컨텍스트로 사용됨
          }}
        />
      )}

      {/* 어휘 범위 선택 */}
      {showVocabRange && (
        <RangeSelector
          type="vocab"
          lang={lang}
          bookId={book.id}
          currentPage={pdfPage}
          totalPages={totalPages || 1}
          onConfirm={({ startPage, endPage }) => { setShowVocabRange(false); generateVocabInRange(startPage, endPage); }}
          onCancel={() => setShowVocabRange(false)}
        />
      )}

      {/* 퀴즈 범위 선택 */}
      {showQuizRange && (
        <RangeSelector
          type="quiz"
          lang={lang}
          bookId={book.id}
          currentPage={pdfPage}
          totalPages={totalPages || 1}
          onConfirm={({ startPage, endPage }) => { setShowQuizRange(false); generateQuizInRange(startPage, endPage); }}
          onCancel={() => setShowQuizRange(false)}
        />
      )}

      {/* 생성된 퀴즈 표시 */}
      {quizData && (
        <QuizModal
          book={book}
          pageTexts={quizData.range ? [`p.${quizData.range.startPage}-${quizData.range.endPage}`] : []}
          lang={lang}
          apiKeys={apiKeys}
          onClose={() => setQuizData(null)}
          initialQuiz={quizData}
        />
      )}
    </>
  );
}

/* ── DESKTOP: SEARCH ──────────────────────────────────── */
function DesktopSearch({ lang, isPC, onOpenBook }) {
  const { T, F } = useTheme();
  const t = i18n[lang];
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [history, setHistory] = useState([]);
  const [allNotes, setAllNotes] = useState([]);
  const [allHighlights, setAllHighlights] = useState([]);
  const [allBooks, setAllBooks] = useState([]);

  useEffect(() => {
    setHistory(getSearchHistory());
    setAllNotes(getNotes());
    setAllHighlights(getHighlights());
    const index = getBookIndex();
    setAllBooks(index.map(b => ({ ...b, ...getBookMeta(b.id) })));
  }, []);

  const filterOpts = [
    { key: "all", label: lang === "ko" ? "전체" : "All" },
    { key: "book", label: lang === "ko" ? "책" : "Books" },
    { key: "highlight", label: lang === "ko" ? "하이라이트" : "Highlights" },
    { key: "note", label: lang === "ko" ? "메모" : "Notes" },
  ];

  const allItems = useMemo(() => [
    ...allHighlights.map(h => ({ ...h, type: "highlight" })),
    ...allNotes.map(n => ({ ...n, type: "note" })),
  ].sort((a, b) => new Date(b.date) - new Date(a.date)), [allHighlights, allNotes]);

  const filteredBooks = useMemo(() => {
    if (!query.trim() || (filter !== "all" && filter !== "book")) return [];
    const q = query.toLowerCase();
    return allBooks.filter(b =>
      [b.title, b.aiTitle, b.aiAuthor, b.aiSummary, ...(b.aiTopics || [])]
        .filter(Boolean).some(s => s.toLowerCase().includes(q))
    );
  }, [allBooks, query, filter]);

  const filtered = useMemo(() => {
    let items = allItems;
    if (filter === "book") return [];
    if (filter !== "all") items = items.filter(x => x.type === filter);
    if (!query.trim()) return items;
    const q = query.toLowerCase();
    return items.filter(x => [x.text, x.bookTitle].filter(Boolean).some(s => s.toLowerCase().includes(q)));
  }, [allItems, filter, query]);

  const doSearch = (q) => {
    setQuery(q);
    if (q.trim()) { pushSearchHistory(q.trim()); setHistory(getSearchHistory()); }
  };

  const hl = (text) => {
    if (!query || !text) return text;
    const idx = text.toLowerCase().indexOf(query.toLowerCase());
    if (idx < 0) return text;
    return <>{text.slice(0, idx)}<mark style={{ background: "#FFF3B0", color: T.ink, padding: "0 1px", borderRadius: 2 }}>{text.slice(idx, idx + query.length)}</mark>{text.slice(idx + query.length)}</>;
  };

  const isEmpty = allItems.length === 0 && allBooks.length === 0;
  const hasResults = query.trim() ? (filteredBooks.length + filtered.length > 0) : filtered.length > 0;

  return (
    <>
      <DesktopHeader subtitle={lang === "ko" ? "통합 검색" : "Everything"} title={t.search} />
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 28px 32px" }}>
        <div style={{ background: T.surface, borderRadius: 14, padding: "12px 16px", display: "flex", alignItems: "center", gap: 10, border: `1.5px solid ${query ? T.ink : T.border}`, marginBottom: 16 }}>
          <Icon name="search" size={16} color={T.inkLight} />
          <input value={query} onChange={e => doSearch(e.target.value)} placeholder={isEmpty ? (lang === "ko" ? "책·메모·하이라이트를 검색하세요" : "Search books, notes and highlights") : t.searchPlaceholder} style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontSize: 14, color: T.ink, fontFamily: F.body }} />
          {query && <button onClick={() => setQuery("")} style={{ background: T.surfaceAlt, border: "none", borderRadius: 999, width: 20, height: 20, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="close" size={12} stroke={2} /></button>}
        </div>
        <div style={{ marginBottom: 20 }}><ChipRow options={filterOpts} value={filter} onChange={setFilter} /></div>

        {isEmpty ? (
          <div style={{ textAlign: "center", padding: "60px 0" }}>
            <div style={{ width: 72, height: 72, borderRadius: 20, background: T.accentSoft, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
              <Icon name="search" size={30} color={T.accent} />
            </div>
            <div style={{ fontSize: 18, fontWeight: 600, color: T.ink, fontFamily: F.display, marginBottom: 10 }}>{lang === "ko" ? "아직 검색할 내용이 없어요" : "Nothing to search yet"}</div>
            <div style={{ fontSize: 13, color: T.inkLight, fontFamily: F.body, lineHeight: 1.65 }}>{lang === "ko" ? "서재에 책을 추가하거나 뷰어에서 메모와 하이라이트를 추가해보세요." : "Add books to your library or notes in the Reader."}</div>
          </div>
        ) : !query.trim() ? (
          <>
            {history.length > 0 && (
              <>
                <div style={{ fontSize: 10, fontWeight: 700, color: T.inkLight, letterSpacing: 1.3, textTransform: "uppercase", fontFamily: F.body, marginBottom: 10 }}>{lang === "ko" ? "최근 검색" : "Recent"}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 20 }}>
                  {history.slice(0, 8).map((s, i) => <button key={i} onClick={() => doSearch(s)} style={{ padding: "7px 12px", borderRadius: 999, border: `1px solid ${T.border}`, background: T.surface, color: T.ink, fontSize: 12, fontFamily: F.body, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5 }}><Icon name="clock" size={11} color={T.inkLight} /> {s}</button>)}
                </div>
              </>
            )}
            {filter !== "book" && (
              <>
                <div style={{ fontSize: 10, fontWeight: 700, color: T.inkLight, letterSpacing: 1.3, textTransform: "uppercase", fontFamily: F.body, marginBottom: 12 }}>{lang === "ko" ? `전체 · ${filtered.length}` : `All · ${filtered.length}`}</div>
                <div style={{ display: "grid", gridTemplateColumns: isPC ? "repeat(2, 1fr)" : "1fr", gap: 12 }}>
                  {filtered.map((item, i) => <DesktopSearchCard key={item.id || i} item={item} T={T} F={F} lang={lang} hl={hl} />)}
                </div>
              </>
            )}
          </>
        ) : (
          <>
            {filteredBooks.length > 0 && (
              <>
                <div style={{ fontSize: 10, fontWeight: 700, color: T.inkLight, letterSpacing: 1.3, textTransform: "uppercase", fontFamily: F.body, marginBottom: 12 }}>{lang === "ko" ? `책 · ${filteredBooks.length}` : `Books · ${filteredBooks.length}`}</div>
                <div style={{ display: "grid", gridTemplateColumns: isPC ? "repeat(2, 1fr)" : "1fr", gap: 12, marginBottom: 20 }}>
                  {filteredBooks.map(b => (
                    <div key={b.id} style={{ background: T.surface, borderRadius: 12, padding: 14, border: `1px solid ${T.border}`, display: "flex", flexDirection: "column", gap: 6 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: T.ink, fontFamily: F.display, lineHeight: 1.3 }}>{hl(b.aiTitle || b.title)}</div>
                          {b.aiAuthor && <div style={{ fontSize: 11, color: T.inkLight, fontFamily: F.body, marginTop: 2 }}>{hl(b.aiAuthor)}</div>}
                        </div>
                        {onOpenBook && <button onClick={() => onOpenBook(b)} style={{ padding: "5px 11px", borderRadius: 8, border: "none", background: T.accent, color: "#FFF", fontSize: 11, fontFamily: F.body, fontWeight: 600, cursor: "pointer", flexShrink: 0 }}>{lang === "ko" ? "열기" : "Open"}</button>}
                      </div>
                      {b.aiSummary && <div style={{ fontSize: 11.5, color: T.inkMid, fontFamily: F.body, lineHeight: 1.5 }}>{hl(b.aiSummary)}</div>}
                      {b.aiTopics?.length > 0 && <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>{b.aiTopics.map((tp, i) => <span key={i} style={{ fontSize: 10, color: T.accent, background: T.accentSoft, padding: "2px 7px", borderRadius: 999, fontFamily: F.body }}>{tp}</span>)}</div>}
                    </div>
                  ))}
                </div>
              </>
            )}
            {filter !== "book" && (
              <>
                <div style={{ fontSize: 10, fontWeight: 700, color: T.inkLight, letterSpacing: 1.3, textTransform: "uppercase", fontFamily: F.body, marginBottom: 12 }}>{filtered.length > 0 ? `${lang === "ko" ? "메모·하이라이트" : "Notes & Highlights"} · ${filtered.length}` : filteredBooks.length === 0 ? (lang === "ko" ? "결과 없음" : "No results") : ""}</div>
                <div style={{ display: "grid", gridTemplateColumns: isPC ? "repeat(2, 1fr)" : "1fr", gap: 12 }}>
                  {filtered.map((item, i) => <DesktopSearchCard key={item.id || i} item={item} T={T} F={F} lang={lang} hl={hl} />)}
                </div>
              </>
            )}
            {!hasResults && <div style={{ fontSize: 14, color: T.inkLight, fontFamily: F.body, textAlign: "center", padding: "40px 0" }}>{lang === "ko" ? "검색 결과가 없어요" : "No results found"}</div>}
          </>
        )}
      </div>
    </>
  );
}

function DesktopSearchCard({ item, T, F, lang, hl }) {
  const isHL = item.type === "highlight";
  return (
    <div style={{ background: T.surface, borderRadius: 12, padding: 14, border: `1px solid ${T.border}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: isHL ? "#B7791F" : T.accent, letterSpacing: 1.1, textTransform: "uppercase", fontFamily: F.body, background: isHL ? "#FEFCE8" : T.accentSoft, padding: "2px 7px", borderRadius: 999 }}>
          {isHL ? (lang === "ko" ? "하이라이트" : "Highlight") : (lang === "ko" ? "메모" : "Note")}
        </span>
        <span style={{ fontSize: 10, color: T.inkLight, fontFamily: F.mono }}>{item.page > 0 ? `p.${item.page}` : new Date(item.date).toLocaleDateString("ko-KR", { month: "short", day: "numeric" })}</span>
      </div>
      {isHL
        ? <div style={{ background: item.color || "#FFF3B0", borderRadius: 6, padding: "8px 10px", marginBottom: 7 }}><p style={{ fontSize: 13, lineHeight: 1.55, color: T.ink, fontFamily: "serif", margin: 0 }}>{hl(item.text)}</p></div>
        : <p style={{ fontSize: 13, lineHeight: 1.55, color: T.ink, fontFamily: F.body, margin: "0 0 7px", whiteSpace: "pre-wrap" }}>{hl(item.text)}</p>}
      <div style={{ fontSize: 11, color: T.inkLight, fontFamily: F.body, display: "flex", alignItems: "center", gap: 5 }}><Icon name="library" size={11} color={T.inkLight} />{item.bookTitle}</div>
    </div>
  );
}

/* ── DESKTOP: KNOWLEDGE ───────────────────────────────── */
function DesktopKnowledge({ lang, isPC, apiKeys, currentBook }) {
  const { T } = useTheme();
  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "20px 28px 32px", background: T.bg }}>
      <KnowledgeScreen lang={lang} apiKeys={apiKeys} currentBook={currentBook} />
    </div>
  );
}

function desktopComputeTodayStats() {
  const today = new Date().toISOString().slice(0, 10);
  const sessions = getSessions().filter(s => s.date.slice(0, 10) === today);
  return {
    minutes: sessions.reduce((a, s) => a + (s.minutes || 0), 0),
    pages: sessions.reduce((a, s) => a + (s.pages || 0), 0),
  };
}
function desktopComputeMonthReadDays() {
  const now = new Date();
  const prefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  return new Set(getSessions().filter(s => s.date.startsWith(prefix)).map(s => s.date.slice(0, 10)));
}

/* ── DESKTOP: GOALS ───────────────────────────────────── */
function DesktopGoals({ lang, isPC, currentBook }) {
  const { T, F } = useTheme();
  const t = i18n[lang];
  const [goals, setGoals] = useState(() => getGoals());
  const [weekStats, setWeekStats] = useState(() => getWeekStats());
  const [todayStat, setTodayStat] = useState(() => desktopComputeTodayStats());
  const [monthReadDays, setMonthReadDays] = useState(() => desktopComputeMonthReadDays());
  const [sessionActive, setSessionActive] = useState(false);
  const [sessionSeconds, setSessionSeconds] = useState(0);
  const [sessionPages, setSessionPages] = useState(0);
  const [pageInput, setPageInput] = useState("");
  const [sessionDone, setSessionDone] = useState(null);
  const timerRef = useRef(null);

  // 4-4: 통계 공유 탭
  const nowDate = new Date();
  const [goalsTab, setGoalsTab] = useState("session");
  const [statsYear, setStatsYear] = useState(nowDate.getFullYear());
  const [statsMonth, setStatsMonth] = useState(nowDate.getMonth() + 1);
  const [statsMode, setStatsMode] = useState("month");
  const [statsTheme, setStatsTheme] = useState("night");
  const statsCanvasRef = useRef(null);
  const monthStats = useMemo(() => getMonthStats(statsYear, statsMonth), [statsYear, statsMonth]);
  const yearStats  = useMemo(() => getYearStats(statsYear), [statsYear]);
  const activeStats = statsMode === "month" ? monthStats : yearStats;

  useEffect(() => {
    if (!statsCanvasRef.current) return;
    try { renderStatsCard(statsCanvasRef.current, activeStats, { theme: statsTheme, lang }); }
    catch { /* headless */ }
  }, [activeStats, statsTheme, lang]);

  useEffect(() => {
    if (sessionActive) { timerRef.current = setInterval(() => setSessionSeconds(s => s + 1), 1000); }
    else clearInterval(timerRef.current);
    return () => clearInterval(timerRef.current);
  }, [sessionActive]);

  const updateGoal = (key, val) => { const next = { ...goals, [key]: val }; setGoals(next); saveGoals(next); };
  const pad = n => String(n).padStart(2, "0");

  const calData = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDow = new Date(year, month, 1).getDay();
    const todayStr = now.toISOString().slice(0, 10);
    const monthName = now.toLocaleDateString(lang === "ko" ? "ko-KR" : "en-US", { year: "numeric", month: "long" });
    const cells = [];
    for (let i = 0; i < firstDow; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    return { year, month, daysInMonth, todayStr, monthName, cells };
  }, [lang]);

  const endSession = () => {
    setSessionActive(false);
    const minutes = Math.max(1, Math.round(sessionSeconds / 60));
    addSession({ bookId: currentBook?.id || "", bookTitle: currentBook?.title || "", minutes, pages: sessionPages });
    setSessionDone({ minutes, pages: sessionPages });
    setWeekStats(getWeekStats());
    setTodayStat(desktopComputeTodayStats());
    setMonthReadDays(desktopComputeMonthReadDays());

    // 자동 백업
    if (currentBook?.id) {
      const bs = getBackupSettings();
      if (bs.autoBackup && bs.writeToken) {
        const notes = getNotesByBook(currentBook.id);
        const highlights = getHighlightsByBook(currentBook.id);
        backupBookToDrive(bs.writeToken, currentBook, notes, highlights)
          .then(() => appendBackupLog({ status: 'ok', succeeded: 1, failed: 0, auto: true }))
          .catch(e => appendBackupLog({ status: 'error', error: e.message, auto: true }));
      }
    }
  };

  if (sessionDone) {
    return (
      <>
        <DesktopHeader subtitle={lang === "ko" ? "오늘의 결과" : "Session result"} title={lang === "ko" ? "독서 완료!" : "Session done!"} />
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 28px 32px" }}>
          <div style={{ background: `linear-gradient(160deg, ${T.accent}, ${T.accentDeep})`, borderRadius: 20, padding: "28px 24px", color: "#FFF", marginBottom: 20, display: "flex", gap: 24, alignItems: "center" }}>
            <div>
              <Icon name="check-circle" size={40} color="#FFF" stroke={1.4} />
              <div style={{ fontSize: 32, fontFamily: F.display, fontWeight: 600, marginTop: 10, letterSpacing: -0.5 }}>{lang === "ko" ? "잘 하셨어요!" : "Great session!"}</div>
              <div style={{ fontSize: 15, marginTop: 6, opacity: 0.85, fontFamily: F.body }}>{sessionDone.minutes}{lang === "ko" ? "분" : "min"}{sessionDone.pages > 0 ? ` · ${sessionDone.pages}p` : ""}{currentBook ? ` · ${currentBook.title.slice(0, 24)}` : ""}</div>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: isPC ? "repeat(4, 1fr)" : "repeat(2, 1fr)", gap: 14, marginBottom: 24 }}>
            {[{ icon: "clock", label: lang === "ko" ? "독서 시간" : "Time", v: `${sessionDone.minutes}m` }, { icon: "page", label: lang === "ko" ? "읽은 페이지" : "Pages", v: sessionDone.pages > 0 ? `+${sessionDone.pages}` : "-" }, { icon: "fire", label: lang === "ko" ? "이번 주" : "This week", v: `${weekStats.totalMinutes}m` }, { icon: "spark", label: lang === "ko" ? "연속" : "Streak", v: `${weekStats.streak}d` }].map((s, i) => (
              <div key={i} style={{ background: T.surface, borderRadius: 16, padding: 18, border: `1px solid ${T.border}` }}>
                <Icon name={s.icon} size={16} color={T.accent} />
                <div style={{ fontSize: 26, fontWeight: 600, color: T.ink, fontFamily: F.display, marginTop: 8, letterSpacing: -0.4 }}>{s.v}</div>
                <div style={{ fontSize: 11, color: T.inkLight, fontFamily: F.body, marginTop: 3 }}>{s.label}</div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <Button variant="ghost" onClick={() => setSessionDone(null)} style={{ padding: "12px 20px" }}>{lang === "ko" ? "닫기" : "Close"}</Button>
            <Button variant="accent" onClick={() => { setSessionDone(null); setSessionSeconds(0); setSessionActive(true); }} style={{ padding: "12px 24px" }}><Icon name="play" size={12} color="#FFF" /> {lang === "ko" ? "계속 읽기" : "Keep going"}</Button>
          </div>
        </div>
      </>
    );
  }

  if (sessionActive) {
    const elapsed = `${pad(Math.floor(sessionSeconds / 60))}:${pad(sessionSeconds % 60)}`;
    const timeProgress = Math.min(100, Math.round((Math.round(sessionSeconds / 60) / goals.dailyMinutes) * 100));
    return (
      <>
        <DesktopHeader subtitle={currentBook?.title || (lang === "ko" ? "독서 중" : "Reading")} title={lang === "ko" ? "세션 진행 중" : "Session in progress"} />
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 28px 32px", display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: isPC ? "1.4fr 1fr" : "1fr", gap: 16 }}>
            <div style={{ background: T.surface, borderRadius: 20, padding: "32px 28px", border: `1px solid ${T.border}`, textAlign: "center" }}>
              <div style={{ fontSize: 64, fontWeight: 600, fontFamily: F.mono, color: T.ink, letterSpacing: -2, lineHeight: 1 }}>{elapsed}</div>
              <div style={{ fontSize: 13, color: T.inkLight, fontFamily: F.body, marginTop: 10 }}>{lang === "ko" ? `목표 ${goals.dailyMinutes}분` : `Goal: ${goals.dailyMinutes}min`}</div>
              <div style={{ maxWidth: 240, margin: "14px auto 0" }}><ProgressBar value={timeProgress} height={5} /></div>
            </div>
            <div style={{ background: T.surface, borderRadius: 20, padding: "24px 20px", border: `1px solid ${T.border}` }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: T.inkLight, letterSpacing: 1.3, textTransform: "uppercase", fontFamily: F.body, marginBottom: 14 }}>{lang === "ko" ? "읽은 페이지" : "Pages read"}</div>
              <div style={{ display: "flex", gap: 8 }}>
                <input value={pageInput} onChange={e => setPageInput(e.target.value.replace(/\D/g, ""))} onKeyDown={e => { if (e.key === "Enter") { const p = parseInt(pageInput); if (!isNaN(p)) setSessionPages(p); setPageInput(""); } }} placeholder={lang === "ko" ? `현재 ${sessionPages}p` : `Now ${sessionPages}p`} style={{ flex: 1, border: `1.5px solid ${T.border}`, borderRadius: 10, padding: "10px 13px", fontSize: 14, fontFamily: F.mono, color: T.ink, background: T.surfaceAlt, outline: "none" }} />
                <Button variant="ghost" onClick={() => { const p = parseInt(pageInput); if (!isNaN(p)) setSessionPages(p); setPageInput(""); }} style={{ padding: "10px 14px" }}>{lang === "ko" ? "저장" : "Set"}</Button>
              </div>
              {sessionPages > 0 && <div style={{ marginTop: 12 }}><ProgressBar value={Math.min(100, Math.round((sessionPages / goals.dailyPages) * 100))} height={4} /></div>}
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <Button variant="ghost" onClick={() => { setSessionActive(false); setSessionSeconds(0); }} style={{ padding: "12px 20px" }}>{lang === "ko" ? "취소" : "Cancel"}</Button>
            <Button variant="accent" onClick={endSession} style={{ padding: "12px 28px", fontSize: 15 }}>{lang === "ko" ? "세션 종료" : "End session"}</Button>
          </div>
        </div>
      </>
    );
  }

  const achievedDays = weekStats.weekDays.filter(w => w.minutes >= goals.dailyMinutes && w.minutes > 0).length;

  return (
    <>
      <DesktopHeader subtitle={lang === "ko" ? "독서 세션 & 통계" : "Session & Stats"} title={t.todayGoal} />

      {/* 탭 전환 */}
      <div style={{ padding: "12px 28px 0" }}>
        <div style={{ display: "flex", background: T.surfaceAlt, borderRadius: 12, padding: 3, border: `1px solid ${T.border}`, maxWidth: 360 }}>
          {[
            { key: "session", label: lang === "ko" ? "📖 세션" : "📖 Session" },
            { key: "stats",   label: lang === "ko" ? "📊 통계 공유" : "📊 Stats Share" },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setGoalsTab(tab.key)}
              style={{ flex: 1, padding: "8px 0", borderRadius: 9, border: "none", background: goalsTab === tab.key ? T.surface : "transparent", color: goalsTab === tab.key ? T.ink : T.inkLight, fontSize: 13, fontWeight: goalsTab === tab.key ? 700 : 400, fontFamily: F.body, cursor: "pointer", boxShadow: goalsTab === tab.key ? `0 1px 4px ${T.ink}15` : "none", transition: "all .2s" }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── 통계 공유 탭 ── */}
      {goalsTab === "stats" && (
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 28px 32px" }}>
          <div style={{ maxWidth: 480 }}>
            <div style={{ background: T.surface, borderRadius: 16, padding: 20, border: `1px solid ${T.border}` }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: T.inkLight, letterSpacing: 1.4, textTransform: "uppercase", fontFamily: F.body, marginBottom: 14 }}>
                {lang === "ko" ? "독서 통계 이미지 만들기" : "Create Stats Image"}
              </div>

              {/* 모드 + 기간 */}
              <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
                {["month", "year"].map(m => (
                  <button key={m} onClick={() => setStatsMode(m)} style={{ padding: "6px 14px", borderRadius: 10, border: `1px solid ${statsMode === m ? T.accent : T.border}`, background: statsMode === m ? T.accentSoft : "transparent", color: statsMode === m ? T.accent : T.inkLight, fontSize: 12, fontWeight: statsMode === m ? 700 : 400, cursor: "pointer", fontFamily: F.body }}>
                    {m === "month" ? (lang === "ko" ? "월간" : "Monthly") : (lang === "ko" ? "연간" : "Yearly")}
                  </button>
                ))}
                {statsMode === "month" && (
                  <>
                    <select value={statsYear} onChange={e => setStatsYear(Number(e.target.value))} style={{ padding: "5px 8px", borderRadius: 8, border: `1px solid ${T.border}`, background: T.surfaceAlt, color: T.ink, fontSize: 12, fontFamily: F.body }}>
                      {[nowDate.getFullYear() - 1, nowDate.getFullYear()].map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                    <select value={statsMonth} onChange={e => setStatsMonth(Number(e.target.value))} style={{ padding: "5px 8px", borderRadius: 8, border: `1px solid ${T.border}`, background: T.surfaceAlt, color: T.ink, fontSize: 12, fontFamily: F.body }}>
                      {Array.from({ length: 12 }, (_, i) => i + 1).map(mo => (
                        <option key={mo} value={mo}>{monthLabelFn(mo, lang)}</option>
                      ))}
                    </select>
                  </>
                )}
                {statsMode === "year" && (
                  <select value={statsYear} onChange={e => setStatsYear(Number(e.target.value))} style={{ padding: "5px 8px", borderRadius: 8, border: `1px solid ${T.border}`, background: T.surfaceAlt, color: T.ink, fontSize: 12, fontFamily: F.body }}>
                    {[nowDate.getFullYear() - 1, nowDate.getFullYear()].map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                )}
              </div>

              {/* 테마 */}
              <div style={{ display: "flex", gap: 6, marginBottom: 14, alignItems: "center" }}>
                <span style={{ fontSize: 11, color: T.inkMid, fontFamily: F.body, marginRight: 4 }}>{lang === "ko" ? "테마" : "Theme"}</span>
                {Object.entries(STATS_THEMES).map(([key, t]) => (
                  <button key={key} onClick={() => setStatsTheme(key)} title={key} style={{ width: 28, height: 28, borderRadius: "50%", background: t.bg, border: statsTheme === key ? `3px solid ${T.accent}` : `1px solid ${T.border}`, cursor: "pointer", padding: 0, flexShrink: 0 }} />
                ))}
              </div>

              {/* Canvas 미리보기 */}
              <div style={{ background: "#000", borderRadius: 12, padding: 8, marginBottom: 14 }}>
                <canvas ref={statsCanvasRef} style={{ width: "100%", aspectRatio: "1/1", borderRadius: 8, display: "block" }} />
              </div>

              {/* 다운로드 */}
              <button
                onClick={() => downloadStatsCard(activeStats, { theme: statsTheme, lang })}
                style={{ width: "100%", padding: "13px", borderRadius: 12, border: "none", background: T.accent, color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: F.body }}
              >
                📥 {lang === "ko" ? "PNG로 저장" : "Save as PNG"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 세션 탭 ── */}
      {goalsTab === "session" && (
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 28px 32px" }}>
        {/* Top row: today's progress + goals */}
        <div style={{ display: "grid", gridTemplateColumns: isPC ? "1.2fr 1fr 1fr" : "1fr", gap: 16, marginBottom: 16 }}>
          {/* Today's progress */}
          <div style={{ background: T.surface, borderRadius: 16, padding: 20, border: `1px solid ${T.border}` }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: T.inkLight, letterSpacing: 1.4, textTransform: "uppercase", fontFamily: F.body }}>{lang === "ko" ? "오늘 달성률" : "Today's Progress"}</span>
              {todayStat.minutes >= goals.dailyMinutes ? (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 700, color: T.accent, background: T.accentSoft, padding: "2px 8px", borderRadius: 999 }}>
                  <Icon name="check" size={10} color={T.accent} /> {lang === "ko" ? "달성" : "Met!"}
                </span>
              ) : todayStat.minutes === 0 ? (
                <span style={{ fontSize: 10, color: T.inkFaint, fontFamily: F.body }}>{lang === "ko" ? "기록 없음" : "No sessions"}</span>
              ) : null}
            </div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                <span style={{ fontSize: 11, color: T.inkMid, fontFamily: F.body, display: "flex", alignItems: "center", gap: 4 }}><Icon name="clock" size={11} color={T.inkLight} /> {lang === "ko" ? "독서 시간" : "Time"}</span>
                <span style={{ fontSize: 11, fontFamily: F.mono, color: T.ink }}>{todayStat.minutes}<span style={{ color: T.inkLight }}> / {goals.dailyMinutes}{lang === "ko" ? "분" : "m"}</span></span>
              </div>
              <ProgressBar value={Math.min(100, Math.round((todayStat.minutes / goals.dailyMinutes) * 100))} height={5} />
            </div>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                <span style={{ fontSize: 11, color: T.inkMid, fontFamily: F.body, display: "flex", alignItems: "center", gap: 4 }}><Icon name="page" size={11} color={T.inkLight} /> {lang === "ko" ? "페이지" : "Pages"}</span>
                <span style={{ fontSize: 11, fontFamily: F.mono, color: T.ink }}>{todayStat.pages}<span style={{ color: T.inkLight }}> / {goals.dailyPages}p</span></span>
              </div>
              <ProgressBar value={Math.min(100, Math.round((todayStat.pages / goals.dailyPages) * 100))} height={5} />
            </div>
          </div>
          {/* Time goal */}
          <div style={{ background: T.surface, borderRadius: 16, padding: 20, border: `1px solid ${T.border}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}><Icon name="clock" size={14} color={T.inkLight} /><span style={{ fontSize: 10, fontWeight: 700, color: T.inkLight, letterSpacing: 1.4, textTransform: "uppercase", fontFamily: F.body }}>{t.timeGoal}</span></div>
            <div style={{ display: "flex", gap: 6 }}>
              {[15, 30, 60].map(m => <button key={m} onClick={() => updateGoal("dailyMinutes", m)} style={{ flex: 1, padding: "14px 0", borderRadius: 11, border: "none", cursor: "pointer", background: goals.dailyMinutes === m ? T.ink : T.surfaceAlt, color: goals.dailyMinutes === m ? T.surface : T.ink, fontFamily: F.display }}><div style={{ fontSize: 22, fontWeight: 600, letterSpacing: -0.4 }}>{m}</div><div style={{ fontSize: 10, fontFamily: F.body, opacity: 0.7, textTransform: "uppercase" }}>{lang === "ko" ? "분" : "min"}</div></button>)}
            </div>
          </div>
          {/* Page goal */}
          <div style={{ background: T.surface, borderRadius: 16, padding: 20, border: `1px solid ${T.border}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}><Icon name="page" size={14} color={T.inkLight} /><span style={{ fontSize: 10, fontWeight: 700, color: T.inkLight, letterSpacing: 1.4, textTransform: "uppercase", fontFamily: F.body }}>{t.pageGoal}</span></div>
            <div style={{ display: "flex", gap: 6 }}>
              {[10, 20, 30].map(p => <button key={p} onClick={() => updateGoal("dailyPages", p)} style={{ flex: 1, padding: "14px 0", borderRadius: 11, border: "none", cursor: "pointer", background: goals.dailyPages === p ? T.ink : T.surfaceAlt, color: goals.dailyPages === p ? T.surface : T.ink, fontFamily: F.display }}><div style={{ fontSize: 22, fontWeight: 600, letterSpacing: -0.4 }}>{p}</div><div style={{ fontSize: 10, fontFamily: F.body, opacity: 0.7, textTransform: "uppercase" }}>p</div></button>)}
            </div>
          </div>
        </div>

        {/* Second row: weekly chart + monthly calendar */}
        <div style={{ display: "grid", gridTemplateColumns: isPC ? "1.4fr 1fr" : "1fr", gap: 16, marginBottom: 16 }}>
          {/* Weekly chart */}
          <div style={{ background: T.surface, borderRadius: 16, padding: 20, border: `1px solid ${T.border}` }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: T.inkLight, letterSpacing: 1.4, textTransform: "uppercase", fontFamily: F.body }}>{t.thisWeek}</span>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {achievedDays > 0 && <span style={{ fontSize: 11, color: T.accent, fontWeight: 600, fontFamily: F.body, background: T.accentSoft, padding: "2px 8px", borderRadius: 999 }}>{lang === "ko" ? `${achievedDays}일 달성` : `${achievedDays} day${achievedDays > 1 ? "s" : ""} met`}</span>}
                {weekStats.streak > 0 && <div style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Icon name="fire" size={12} color={T.accent} /><span style={{ fontSize: 12, color: T.accent, fontWeight: 600, fontFamily: F.body }}>{weekStats.streak} {lang === "ko" ? "일 연속" : "day streak"}</span></div>}
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "flex-end", height: 76, marginBottom: 14 }}>
              {weekStats.weekDays.map((w, i) => {
                const metGoal = w.minutes >= goals.dailyMinutes && w.minutes > 0;
                const isToday = i === weekStats.weekDays.length - 1;
                return (
                  <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, height: "100%" }}>
                    <div style={{ flex: 1, width: "100%", display: "flex", alignItems: "flex-end" }}>
                      <div style={{ width: "100%", height: `${Math.max(w.v, w.minutes > 0 ? 8 : 0)}%`, background: metGoal ? T.accent : isToday ? T.accent : T.accentSoft, opacity: metGoal ? 1 : isToday ? 0.7 : 0.5, borderRadius: 3, minHeight: w.minutes > 0 ? 4 : 0 }} />
                    </div>
                    <span style={{ fontSize: 10, color: metGoal ? T.accent : T.inkLight, fontFamily: F.mono, fontWeight: metGoal ? 700 : 400 }}>{w.d}</span>
                  </div>
                );
              })}
            </div>
            {weekStats.totalMinutes > 0 || weekStats.totalPages > 0 ? (
              <div style={{ display: "flex", borderTop: `1px solid ${T.border}`, paddingTop: 10 }}>
                {[
                  { v: weekStats.totalMinutes >= 60 ? `${Math.floor(weekStats.totalMinutes / 60)}h${weekStats.totalMinutes % 60 > 0 ? `${weekStats.totalMinutes % 60}m` : ""}` : `${weekStats.totalMinutes}m`, l: lang === "ko" ? "총 시간" : "Total" },
                  { v: String(weekStats.totalPages), l: lang === "ko" ? "페이지" : "Pages" },
                  { v: String(weekStats.weekHighlights), l: lang === "ko" ? "하이라이트" : "Highlights" },
                ].map((s, i) => <div key={i} style={{ flex: 1, textAlign: "center", borderLeft: i > 0 ? `1px solid ${T.border}` : "none" }}><div style={{ fontSize: 17, fontWeight: 600, color: T.ink, fontFamily: F.display, letterSpacing: -0.3 }}>{s.v}</div><div style={{ fontSize: 10, color: T.inkLight, fontFamily: F.body, letterSpacing: 0.3 }}>{s.l}</div></div>)}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: T.inkLight, fontFamily: F.body, textAlign: "center", padding: "6px 0" }}>{lang === "ko" ? "이번 주 독서 기록이 없어요" : "No reading sessions this week yet"}</div>
            )}
          </div>

          {/* Monthly calendar */}
          <div style={{ background: T.surface, borderRadius: 16, padding: 20, border: `1px solid ${T.border}` }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: T.inkLight, letterSpacing: 1.4, textTransform: "uppercase", fontFamily: F.body }}>{calData.monthName}</span>
              {monthReadDays.size > 0 && <span style={{ fontSize: 10, color: T.inkMid, fontFamily: F.body }}>{lang === "ko" ? `${monthReadDays.size}일 독서` : `${monthReadDays.size} days`}</span>}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 4 }}>
              {(lang === "ko" ? ["일", "월", "화", "수", "목", "금", "토"] : ["S", "M", "T", "W", "T", "F", "S"]).map((d, i) => (
                <div key={i} style={{ textAlign: "center", fontSize: 9, color: T.inkFaint, fontFamily: F.mono, padding: "2px 0" }}>{d}</div>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
              {calData.cells.map((d, i) => {
                if (!d) return <div key={i} />;
                const dateStr = `${calData.year}-${String(calData.month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
                const isToday = dateStr === calData.todayStr;
                const hasReading = monthReadDays.has(dateStr);
                return (
                  <div key={i} style={{ textAlign: "center", padding: "5px 2px", borderRadius: 7, background: isToday ? T.ink : hasReading ? T.accentSoft : "transparent" }}>
                    <span style={{ fontSize: 11, fontFamily: F.mono, color: isToday ? T.surface : hasReading ? T.accent : T.inkLight, fontWeight: isToday || hasReading ? 600 : 400 }}>{d}</span>
                    {hasReading && !isToday && <div style={{ width: 4, height: 4, borderRadius: "50%", background: T.accent, margin: "1px auto 0" }} />}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {currentBook && (
          <div style={{ background: T.accentSoft, borderRadius: 14, padding: "12px 16px", border: `1px solid ${T.accent}22`, display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <Icon name="library" size={16} color={T.accent} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: T.accentDeep, letterSpacing: 0.8, textTransform: "uppercase", fontFamily: F.body }}>{lang === "ko" ? "현재 책" : "Current book"}</div>
              <div style={{ fontSize: 14, color: T.ink, fontFamily: F.display, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{currentBook.title}</div>
            </div>
          </div>
        )}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          {currentBook ? (
            <>
              <Button variant="ghost" onClick={() => setSessionActive(true)} style={{ padding: "12px 20px" }}>{lang === "ko" ? "목표 없이" : "No goal"}</Button>
              <Button variant="accent" onClick={() => { setSessionSeconds(0); setSessionPages(0); setSessionActive(true); }} style={{ padding: "12px 28px", fontSize: 15 }}><Icon name="play" size={12} color="#FFF" /> {t.startReading}</Button>
            </>
          ) : (
            <div style={{ fontSize: 13, color: T.inkLight, fontFamily: F.body, padding: "14px 0" }}>{lang === "ko" ? "서재에서 책을 선택한 뒤 시작하세요" : "Select a book from the Library to start"}</div>
          )}
        </div>
      </div>
      )}
    </>
  );
}

/* ── DESKTOP: AI CHAT ─────────────────────────────────── */
async function callAI(apiKeys, systemPrompt, history, userMsg, pageImageBase64 = null) {
  if (apiKeys?.claude) {
    const histMsgs = history.map(m => ({ role: m.role === "user" ? "user" : "assistant", content: m.content }));
    // Attach image to the current user message when available (vision mode)
    const userContent = pageImageBase64
      ? [{ type: "image", source: { type: "base64", media_type: "image/jpeg", data: pageImageBase64 } }, { type: "text", text: userMsg }]
      : userMsg;
    const msgs = [...histMsgs, { role: "user", content: userContent }];
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKeys.claude, "anthropic-version": "2023-06-01", "content-type": "application/json", "anthropic-dangerous-direct-browser-access": "true" },
      body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 1024, system: systemPrompt, messages: msgs }),
    });
    const data = await res.json();
    if (!res.ok) {
      if (res.status === 429) throw new Error("rate-limit");
      if (res.status === 401) throw new Error("invalid-key");
      const msg = (data.error?.message || "").toLowerCase();
      if (msg.includes("credit") || msg.includes("balance") || msg.includes("billing")) throw new Error("billing");
      throw new Error("api-error");
    }
    return data.content?.[0]?.text || "";
  }
  if (apiKeys?.gemini) {
    const histContents = history.map(m => ({ role: m.role === "user" ? "user" : "model", parts: [{ text: m.content }] }));
    const userParts = pageImageBase64
      ? [{ inline_data: { mime_type: "image/jpeg", data: pageImageBase64 } }, { text: userMsg }]
      : [{ text: userMsg }];
    const contents = [...histContents, { role: "user", parts: userParts }];
    const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent", {
      method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": apiKeys.gemini },
      body: JSON.stringify({ contents, systemInstruction: { parts: [{ text: systemPrompt }] }, generationConfig: { maxOutputTokens: 1024 } }),
    });
    const data = await res.json();
    if (!res.ok) {
      if (res.status === 429) throw new Error("rate-limit");
      if (res.status === 400 || res.status === 401 || res.status === 403) throw new Error("invalid-key");
      throw new Error("api-error");
    }
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  }
  throw new Error("no-key");
}

function aiErrorMsg(code, lang, modelLabel) {
  const ko = lang === "ko";
  if (code === "no-key") return ko ? "AI 키가 없습니다. 설정에서 API 키를 추가하세요." : "No AI key. Add one in Settings.";
  if (code === "rate-limit") return ko
    ? `${modelLabel} 요청 한도에 도달했습니다.\n잠시 후 다시 시도해 주세요.`
    : `${modelLabel} rate limit reached.\nPlease try again in a moment.`;
  if (code === "billing") return ko
    ? "Claude 크레딧이 부족합니다.\nanthropic.com/billing에서 충전을 확인해 주세요."
    : "Claude credit balance is low.\nPlease check anthropic.com/billing.";
  if (code === "transient") return ko
    ? "일시적인 오류가 발생했습니다.\n아래 버튼으로 다시 시도해 주세요."
    : "A temporary error occurred.\nPlease retry with the button below.";
  if (code === "invalid-key") return ko
    ? "유효하지 않은 API 키입니다.\n설정에서 키를 다시 확인해 주세요."
    : "Invalid API key.\nPlease check your key in Settings.";
  return ko ? "일시적인 오류가 발생했습니다.\n아래 버튼으로 다시 시도해 주세요." : "A temporary error occurred.\nPlease retry.";
}

function buildDesktopSystemPrompt(mode, book, notes, highlights, lang, hasPageImage = false) {
  const bookMeta = book?.id ? getBookMeta(book.id) : null;
  const bookName = bookMeta?.aiTitle || book?.title || "";
  const metaCtx  = buildMetaContext(bookMeta, lang);
  const noteContext = [...highlights.slice(0, 5).map(h => `[하이라이트] ${h.text}`), ...notes.slice(0, 5).map(n => `[메모] ${n.text}`)].join("\n");
  const noteCtx = noteContext ? (lang === "ko" ? `\n\n[사용자 독서 메모]\n${noteContext}` : `\n\n[User Reading Notes]\n${noteContext}`) : "";

  const doc = book?.id ? getDocumentText(book.id) : null;
  const currentPage = book?.id ? getPageText(book.id) : null;
  const pageCtx = doc
    ? (lang === "ko"
      ? `\n\n[문서 내용 — ${doc.firstPage}~${doc.lastPage}p, 총 ${doc.pageCount}페이지 추출]\n${doc.text}`
      : `\n\n[Document Content — p.${doc.firstPage}–${doc.lastPage}, ${doc.pageCount} pages extracted]\n${doc.text}`)
    : (currentPage?.text
      ? (lang === "ko"
        ? `\n\n[현재 열린 페이지 — ${currentPage.pageNum}p]\n${currentPage.text}`
        : `\n\n[Currently Viewed Page — p.${currentPage.pageNum}]\n${currentPage.text}`)
      : "");

  const imageCtx = hasPageImage && !doc && !currentPage?.text
    ? (lang === "ko"
      ? `\n\n[이미지 인식 모드] 현재 열린 페이지의 이미지가 첨부됩니다. 이미지를 직접 분석하여 답변하세요. 텍스트 추출이 불가능한 스캔 PDF입니다.`
      : `\n\n[Image Recognition Mode] An image of the current page is attached. Analyze the image directly. This is a scanned PDF without extractable text.`)
    : "";

  const ctx = metaCtx + pageCtx + imageCtx + noteCtx;

  const noAccessKo = `아래 제공된 문서 텍스트 또는 이미지, 메타데이터, 사용자 메모를 바탕으로 답변하세요.`;
  const noAccessEn = `Answer based on the document text or image, metadata, and user notes provided below.`;

  if (mode === "socratic") {
    return lang === "ko"
      ? `소크라테스식 독서 토론 파트너입니다. 사용자가 《${bookName}》을 읽고 있습니다.\n${noAccessKo}${ctx}\n\n직접 답변보다 생각을 이끄는 질문을 하세요. 반드시 한국어로 답변하세요.`
      : `You are a Socratic discussion partner for 《${bookName}》.\n${noAccessEn}${ctx}\n\nAsk thought-provoking questions rather than giving direct answers.`;
  }
  if (mode === "context") {
    return lang === "ko"
      ? `《${bookName}》 독서 도우미입니다.\n${noAccessKo}${ctx}\n\n책의 맥락에 초점을 맞춰 구체적으로 답변하세요. 반드시 한국어로 답변하세요.`
      : `Reading assistant for 《${bookName}》.\n${noAccessEn}${ctx}\n\nFrame answers in the book's context and themes.`;
  }
  return lang === "ko"
    ? `《${bookName}》 독서 도우미입니다.\n${noAccessKo}${ctx}\n\n명확하고 간결하게 답변하세요. 반드시 한국어로 답변하세요.`
    : `Reading assistant for 《${bookName}》.\n${noAccessEn}${ctx}\n\nAnswer clearly and concisely.`;
}

function DesktopAI({ lang, isPC, apiKeys, currentBook }) {
  const { T, F } = useTheme();
  const t = i18n[lang];
  const [tab, setTab] = useState("chat"); // "chat" | "compare"
  const [mode, setMode] = useState("quick");
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [notes, setNotes] = useState([]);
  const [highlights, setHighlights] = useState([]);
  const scrollRef = useRef(null);

  const hasKey = !!(apiKeys?.claude || apiKeys?.gemini);
  const aiLabel = apiKeys?.claude ? "Claude" : apiKeys?.gemini ? "Gemini" : (lang === "ko" ? "AI 미연결" : "No AI");

  useEffect(() => {
    if (!currentBook) { setMessages([]); return; }
    const bookNotes = getNotes().filter(n => n.bookId === currentBook.id);
    const bookHighlights = getHighlights().filter(h => h.bookId === currentBook.id);
    setNotes(bookNotes);
    setHighlights(bookHighlights);
    const greeting = lang === "ko"
      ? `《${currentBook.title}》에 대해 무엇이든 질문하세요.${bookNotes.length + bookHighlights.length > 0 ? ` 저장된 메모 ${bookNotes.length + bookHighlights.length}개를 참고합니다.` : ""}`
      : `Ask me anything about 《${currentBook.title}》.${bookNotes.length + bookHighlights.length > 0 ? ` I can reference your ${bookNotes.length + bookHighlights.length} saved notes.` : ""}`;
    setMessages([{ role: "ai", content: greeting }]);
  }, [currentBook?.id, lang]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading]);

  const suggested = currentBook
    ? (lang === "ko"
      ? [`《${currentBook.title}》 핵심 요약`, "저자의 핵심 주장은?", "이 책의 실용적 교훈은?", "비판적 시각으로 보면?"]
      : [`Summarize 《${currentBook.title}》`, "Author's main argument?", "Practical takeaways?", "Critique this book"])
    : [];

  const meta = currentBook ? getBookMeta(currentBook.id) : {};

  const send = async (txt) => {
    const text = (txt || input).trim();
    if (!text || loading || !currentBook) return;
    const history = messages.slice(1).map(m => ({ role: m.role, content: m.content }));
    setMessages(prev => [...prev, { role: "user", content: text }]);
    setInput("");
    setLoading(true);
    try {
      // 업로드된 책 기반 답변 보장
      if (!getDocumentText(currentBook.id)) {
        await ensureBookText(currentBook);
      }
      const systemPrompt = buildDesktopSystemPrompt(mode, currentBook, notes, highlights, lang);
      const response = await callAI(apiKeys, systemPrompt, history, text);
      setMessages(prev => [...prev, { role: "ai", content: response }]);
    } catch (e) {
      setMessages(prev => [...prev, { role: "ai", content: aiErrorMsg(e.message, lang, aiLabel) }]);
    } finally {
      setLoading(false);
    }
  };

  /* No book selected */
  if (!currentBook) {
    return (
      <>
        <DesktopHeader subtitle={lang === "ko" ? "AI 독서 도우미" : "AI Reading Assistant"} title={t.aiChat} />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: 40, textAlign: "center" }}>
          <div style={{ width: 72, height: 72, borderRadius: 20, background: T.accentSoft, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon name="spark" size={32} color={T.accent} />
          </div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 600, color: T.ink, fontFamily: F.display, marginBottom: 8 }}>
              {lang === "ko" ? "읽고 있는 책을 먼저 선택하세요" : "Select a book to start"}
            </div>
            <div style={{ fontSize: 14, color: T.inkLight, fontFamily: F.body, lineHeight: 1.65, maxWidth: 320 }}>
              {lang === "ko" ? "서재에서 책을 열면 AI와 그 책에 대해 대화할 수 있어요." : "Open a book from your library to chat with AI about it."}
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <DesktopHeader
        subtitle={aiLabel}
        title={t.aiChat}
        right={
          <button onClick={() => { const g = lang === "ko" ? `《${currentBook.title}》에 대해 무엇이든 질문하세요.` : `Ask me anything about 《${currentBook.title}》.`; setMessages([{ role: "ai", content: g }]); }} style={{ background: "none", border: "none", cursor: "pointer", padding: 6, color: T.inkLight, fontSize: 11, fontFamily: F.body }}>
            {lang === "ko" ? "대화 초기화" : "Clear"}
          </button>
        }
      />
      {/* 탭: 채팅 / 책 비교 */}
      <div style={{ padding: "8px 28px 0", borderBottom: `1px solid ${T.border}`, display: "flex", gap: 4, background: T.surfaceAlt, flexShrink: 0 }}>
        {[
          { k: "chat",    label: lang === "ko" ? "💬 AI 채팅" : "💬 AI Chat" },
          { k: "compare", label: lang === "ko" ? "📊 책 비교" : "📊 Compare" },
        ].map(tb => (
          <button key={tb.k} onClick={() => setTab(tb.k)} style={{
            padding: "9px 16px", border: "none", background: "transparent", cursor: "pointer",
            fontSize: 13, fontWeight: tab === tb.k ? 700 : 400, fontFamily: F.body,
            color: tab === tb.k ? T.ink : T.inkLight,
            borderBottom: tab === tb.k ? `2px solid ${T.accent}` : "2px solid transparent",
            marginBottom: -1,
          }}>{tb.label}</button>
        ))}
      </div>

      {/* 책 비교 탭 */}
      {tab === "compare" && (
        <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <BookCompare
            lang={lang}
            apiKeys={apiKeys}
            currentBook={currentBook}
            callAI={async (sys, history, msg) => callAI(apiKeys, sys, history, msg)}
          />
        </div>
      )}

      {tab === "chat" && <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {/* Context banner */}
          <div style={{ padding: "12px 28px", background: T.accentSoft, borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 36, height: 44, borderRadius: 6, background: T.accent, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Icon name="library" size={18} color="#FFF" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: T.accentDeep, letterSpacing: 0.8, textTransform: "uppercase", fontFamily: F.body, marginBottom: 1 }}>
                {lang === "ko" ? "현재 책" : "Current book"}
                {notes.length + highlights.length > 0 && (
                  <span style={{ marginLeft: 6, fontWeight: 400, color: T.accent }}>
                    · {lang === "ko" ? `메모 ${notes.length + highlights.length}개` : `${notes.length + highlights.length} notes`}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 13, color: T.ink, fontFamily: F.display, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {currentBook.title}
                {meta.lastPage > 0 && <span style={{ color: T.inkLight, fontWeight: 400 }}> · p.{meta.lastPage}</span>}
              </div>
            </div>
            {hasKey && (
              <div style={{ fontSize: 9, fontWeight: 700, background: T.secondary, color: "#FFF", padding: "2px 8px", borderRadius: 999, fontFamily: F.body, flexShrink: 0 }}>
                LIVE · {aiLabel}
              </div>
            )}
            <div style={{ display: "flex", gap: 3, background: T.surface, padding: 3, borderRadius: 9, border: `1px solid ${T.border}` }}>
              {[
                { k: "quick", icon: "lightning", l: lang === "ko" ? "빠른 답변" : "Quick" },
                { k: "context", icon: "link", l: lang === "ko" ? "맥락 분석" : "Context" },
                { k: "socratic", icon: "column", l: lang === "ko" ? "소크라테스" : "Socratic" },
              ].map(m => {
                const active = mode === m.k;
                return (
                  <button key={m.k} onClick={() => setMode(m.k)} style={{
                    padding: "6px 10px", borderRadius: 6, border: "none", cursor: "pointer",
                    background: active ? T.ink : "transparent",
                    color: active ? T.surface : T.inkLight,
                    fontSize: 11, fontWeight: 600, fontFamily: F.body,
                    display: "inline-flex", alignItems: "center", gap: 4, whiteSpace: "nowrap",
                  }}>
                    <Icon name={m.icon} size={11} color={active ? "#FFF" : T.inkLight} />
                    {m.l}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Messages */}
          <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "20px 28px", display: "flex", flexDirection: "column", gap: 12 }}>
            {messages.map((m, i) => (
              <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
                <div style={{
                  maxWidth: 540, padding: "12px 16px",
                  borderRadius: m.role === "user" ? "16px 16px 4px 16px" : "4px 16px 16px 16px",
                  background: m.role === "user" ? T.ink : T.surface,
                  color: m.role === "user" ? T.surface : T.ink,
                  border: m.role === "user" ? "none" : `1px solid ${T.border}`,
                  fontSize: 14, lineHeight: 1.65, fontFamily: F.body, whiteSpace: "pre-wrap",
                }}>{m.content}</div>
              </div>
            ))}
            {loading && (
              <div style={{ display: "flex", justifyContent: "flex-start" }}>
                <div style={{ padding: "12px 16px", borderRadius: "4px 16px 16px 16px", background: T.surface, border: `1px solid ${T.border}`, display: "flex", gap: 5, alignItems: "center" }}>
                  {[0,1,2].map(i => <div key={i} style={{ width: 7, height: 7, borderRadius: "50%", background: T.inkFaint, animation: `pulse 1.2s ${i*0.2}s infinite` }} />)}
                </div>
              </div>
            )}
            {messages.length === 1 && !loading && suggested.length > 0 && (
              <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6 }}>
                {suggested.map((q, i) => (
                  <button key={i} onClick={() => send(q)} style={{ padding: "7px 14px", borderRadius: 999, border: `1px solid ${T.border}`, background: T.surface, color: T.ink, fontSize: 12, fontFamily: F.body, cursor: "pointer", whiteSpace: "nowrap" }}>{q}</button>
                ))}
              </div>
            )}
          </div>

          {/* Input */}
          <div style={{ padding: "14px 28px", borderTop: `1px solid ${T.border}`, background: T.surface }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <div style={{ flex: 1, background: T.surfaceAlt, borderRadius: 12, padding: "10px 14px", border: `1.5px solid ${input ? T.ink : T.border}` }}>
                <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && !e.shiftKey && send()} disabled={loading} placeholder={lang === "ko" ? "질문을 입력하세요…" : "Ask a question…"} style={{ width: "100%", border: "none", outline: "none", background: "transparent", fontSize: 14, color: T.ink, fontFamily: F.body }} />
              </div>
              <button onClick={() => send()} disabled={!input.trim() || loading} style={{
                width: 42, height: 42, borderRadius: 999, border: "none",
                background: input.trim() && !loading ? T.accent : T.border, color: "#FFF",
                cursor: input.trim() && !loading ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <Icon name="send" size={16} color="#FFF" stroke={2} />
              </button>
            </div>
          </div>
        </div>
      </div>}
      <style>{`@keyframes pulse { 0%,100%{opacity:.3;transform:scale(.9)} 50%{opacity:1;transform:scale(1)} }`}</style>
    </>
  );
}
