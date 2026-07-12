import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { i18n } from '../data.js';
import { useTheme } from '../context.jsx';
import { ProgressBar, Button, SectionLabel, Icon, ChipRow, SyncBadge, ScreenHeader } from '../components.jsx';
import { getBookMeta, setBookMeta, saveBookIndex, getReadQueue, addToQueue, removeFromQueue, moveQueueItem, getNotesByBook, getHighlightsByBook, getCollections, getCollectionsByBook } from '../store.js';
import { scanBookMeta, buildMetaContext } from '../scanBook.js';
import { scanLocalBookMeta } from '../utils/localBookScan.js';
import { printNotesAsPdf, downloadNotesAsMarkdown } from '../utils/exportNotes.js';
import { BookCollectionPicker, CollectionManager } from '../components/CollectionManager.jsx';
import { ShareModal } from '../components/ShareModal.jsx';
import { FullScanButton } from '../components/FullScanButton.jsx';
import { getLocalBooks, addLocalBook, addLocalBooksNative, removeLocalBook, localBookToBook, usesNativePicker, onElectronMenuOpenPdf, reloadLocalBookFromPath } from '../utils/localBooks.js';
import { getDriveBooks, driveBookToBook, removeDriveBook } from '../utils/driveBooks.js';

/* ── Color palette for Drive book covers ─────────────────── */
const PALETTE = [
  { cover: '#7C6B52', spine: '#5C4F3A' },
  { cover: '#3D5A47', spine: '#2D4237' },
  { cover: '#4A5568', spine: '#2D3748' },
  { cover: '#8B4513', spine: '#6B3410' },
  { cover: '#553C9A', spine: '#44337A' },
  { cover: '#2F6B4B', spine: '#1E4A33' },
  { cover: '#8B2252', spine: '#6B1A3D' },
  { cover: '#1A5276', spine: '#154360' },
];

function pickColor(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(h) % PALETTE.length];
}

function DriveCover({ title, size = 80 }) {
  const c = pickColor(title);
  const w = Math.round(size * 0.7);
  return (
    <div style={{ width: w, height: size, background: c.cover, borderRadius: '3px 3px 2px 2px', position: 'relative', overflow: 'hidden', boxShadow: '2px 4px 14px rgba(0,0,0,.22)', flexShrink: 0 }}>
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, background: c.spine }} />
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(120deg,rgba(255,255,255,.18) 0%,transparent 55%,rgba(0,0,0,.1) 100%)' }} />
      <div style={{ position: 'absolute', top: 12, left: 10, right: 6 }}>
        <div style={{ fontSize: size * 0.18, fontWeight: 700, color: 'rgba(255,255,255,0.85)', fontFamily: 'serif', lineHeight: 1.2, wordBreak: 'break-word' }}>
          {title.slice(0, 12)}{title.length > 12 ? '…' : ''}
        </div>
      </div>
      <div style={{ position: 'absolute', bottom: 8, left: 10, fontSize: 8, color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace', letterSpacing: 0.5 }}>PDF</div>
    </div>
  );
}

/* ── Drive API helpers ───────────────────────────────────── */
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

function loadMeta(fileId) {
  try { return JSON.parse(localStorage.getItem(`pkl_book_${fileId}`) || '{}'); } catch { return {}; }
}

function saveMeta(fileId, meta) {
  localStorage.setItem(`pkl_book_${fileId}`, JSON.stringify(meta));
}

function driveFileToBook(file) {
  const meta = loadMeta(file.id);
  return {
    id: file.id,
    title: file.name.replace(/\.pdf$/i, '').replace(/_/g, ' '),
    status: meta.status || 'unread',
    progress: meta.progress || 0,
    lastPage: meta.lastPage || 0,
    pages: meta.pages || 0,
    highlights: meta.highlights || 0,
    notes: meta.notes || 0,
    bookmarks: meta.bookmarks || 0,
    webViewLink: file.webViewLink,
    modifiedTime: file.modifiedTime,
    size: file.size,
    mimeType: file.mimeType,
  };
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
}

function formatSize(bytes) {
  if (!bytes) return '';
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)}MB` : `${(bytes / 1024).toFixed(0)}KB`;
}

/* ── Auth error / retry (mobile) ────────────────────────── */
function MobileAuthErrorOrRetry({ isAuthErr, error, lang, onRetry, onAuthError }) {
  const { T, F } = useTheme();

  useEffect(() => {
    if (isAuthErr && onAuthError) onAuthError();
  }, []); // eslint-disable-line

  return (
    <div style={{ padding: '32px 22px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
      <div style={{ width: 52, height: 52, borderRadius: 16, background: '#FEE2E2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="close" size={22} color="#DC2626" />
      </div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: T.ink, fontFamily: F.body, marginBottom: 6 }}>
          {isAuthErr ? (lang === 'ko' ? 'Drive 연결이 만료됐어요' : 'Drive session expired') : (lang === 'ko' ? '불러오기 실패' : 'Failed to load')}
        </div>
        <div style={{ fontSize: 12, color: T.inkLight, fontFamily: F.body, lineHeight: 1.6, maxWidth: 280, whiteSpace: 'pre-line' }}>
          {isAuthErr
            ? (lang === 'ko'
              ? 'Google 세션이 만료되어 자동으로 재연결 중입니다…'
              : 'Google session expired. Reconnecting silently…')
            : error}
        </div>
      </div>
      <Button variant="accent" onClick={isAuthErr ? onAuthError : onRetry} style={{ padding: '10px 20px' }}>
        {isAuthErr ? (lang === 'ko' ? '재연결' : 'Reconnect') : (lang === 'ko' ? '다시 시도' : 'Retry')}
      </Button>
    </div>
  );
}

/* ── Book detail bottom sheet (mobile) ───────────────────── */
const TYPE_LABELS_M = { '소설': { ko: '소설', en: 'Novel' }, novel: { ko: '소설', en: 'Novel' }, '기술서': { ko: '기술서', en: 'Technical' }, technical: { ko: '기술서', en: 'Technical' }, 'self-help': { ko: '자기계발', en: 'Self-help' }, '자기계발': { ko: '자기계발', en: 'Self-help' }, paper: { ko: '논문', en: 'Paper' }, '논문': { ko: '논문', en: 'Paper' }, 'work-doc': { ko: '업무문서', en: 'Work doc' }, '업무문서': { ko: '업무문서', en: 'Work doc' }, essay: { ko: '에세이', en: 'Essay' }, '에세이': { ko: '에세이', en: 'Essay' } };
const LANG_LABELS_M = { ko: { ko: '한국어', en: 'Korean' }, en: { ko: '영어', en: 'English' }, ja: { ko: '일본어', en: 'Japanese' }, zh: { ko: '중국어', en: 'Chinese' } };

function BookDetailSheet({ book, lang, geminiKey, claudeKey, accessToken, onClose, onRead, onAI, onMetaChange, onAuthError, onQueueChange, onCollectionsChange, removable, onRemoveBook }) {
  const { T, F } = useTheme();
  const ko = lang === 'ko';
  const [inQueue, setInQueue] = useState(() => getReadQueue().some(b => b.id === book.id));
  const [bookCollections, setBookCollections] = useState(() => getCollectionsByBook(book.id));
  const [showCollectionPicker, setShowCollectionPicker] = useState(false);
  const [showShare, setShowShare] = useState(false);

  const [meta, setMeta]           = useState(() => {
    const m = getBookMeta(book.id) || {};
    // If stuck in 'scanning' from a previous interrupted session, reset it
    if (m.aiScanStatus === 'scanning') {
      const reset = { ...m, aiScanStatus: undefined };
      setBookMeta(book.id, { aiScanStatus: undefined });
      return reset;
    }
    return m;
  });
  const [scanning, setScanning]   = useState(false);
  const [stepIdx, setStepIdx]     = useState(0);
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
  const ctx        = buildMetaContext(meta, lang);
  const typeLabel  = TYPE_LABELS_M[meta.aiType]?.[ko ? 'ko' : 'en'];
  const langLabel  = LANG_LABELS_M[meta.aiLanguage]?.[ko ? 'ko' : 'en'];

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
        : await scanBookMeta({ fileId: book.id, fileName: book.title + '.pdf', mimeType: 'application/pdf', size: book.size, accessToken, geminiKey, claudeKey, lang });
      setBookMeta(book.id, m);
      setMeta(m);
    } catch (e) {
      if (e.message === 'auth-expired') {
        const reset = { aiScanStatus: undefined };
        setBookMeta(book.id, reset);
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
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 900, display: 'flex', alignItems: 'flex-end' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: T.surface, borderRadius: '20px 20px 0 0', padding: '20px 20px 28px', width: '100%', maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 -8px 40px rgba(0,0,0,.2)' }}>
        <div style={{ width: 36, height: 4, borderRadius: 2, background: T.border, margin: '0 auto 18px' }} />

        {/* Book header */}
        <div style={{ display: 'flex', gap: 14, marginBottom: 16 }}>
          <DriveCover title={book.title} size={72} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: T.ink, fontFamily: F.display, lineHeight: 1.2, letterSpacing: -0.2, wordBreak: 'break-word', marginBottom: 3 }}>
              {meta.aiTitle || book.title}
            </div>
            {meta.aiAuthor && (
              <div style={{ fontSize: 11.5, color: T.inkMid, fontFamily: F.body, fontStyle: 'italic', marginBottom: 4 }}>{meta.aiAuthor}</div>
            )}
            <div style={{ fontSize: 11, color: T.inkLight, fontFamily: F.body }}>
              {formatDate(book.modifiedTime)}{book.size ? ` · ${formatSize(book.size)}` : ''}
            </div>
            {book.progress > 0 && (
              <div style={{ marginTop: 7, maxWidth: 160 }}>
                <ProgressBar value={book.progress} height={2} />
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 3, fontSize: 10, color: T.accent, fontWeight: 600, fontFamily: F.mono }}>{book.progress}%</div>
              </div>
            )}
          </div>
        </div>

        {/* AI scan section */}
        <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 16, marginBottom: 18 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: T.inkLight, letterSpacing: 1, textTransform: 'uppercase', fontFamily: F.body, marginBottom: 10 }}>
            {ko ? 'AI 문서 분석' : 'AI Analysis'}
          </div>

          {!scanStatus && (
            <div style={{ fontSize: 12.5, color: T.inkMid, fontFamily: F.body, lineHeight: 1.55 }}>
              {(claudeKey || geminiKey) && accessToken
                ? (ko ? '제목·저자·요약·주제를 자동 추출합니다. 아래 AI 분석 버튼을 눌러 시작하세요.' : 'Auto-extract title, author, summary and topics. Tap AI Scan below.')
                : (ko ? 'AI API 키를 설정하면 사용할 수 있습니다.' : 'Set up an AI API key to enable.')}
            </div>
          )}

          {scanStatus === 'pending' && (
            <div style={{ background: '#FFFBEB', borderRadius: 12, padding: '12px 14px', border: '1px solid #FDE68A' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#92400E', fontFamily: F.body, marginBottom: 3 }}>
                {ko ? 'API 요청 한도에 도달했습니다' : 'API rate limit reached'}
              </div>
              <div style={{ fontSize: 11, color: '#B45309', fontFamily: F.body, lineHeight: 1.5 }}>
                {ko ? '잠시 후 아래 AI 재분석 버튼으로 다시 시도하세요.' : 'Please retry with the AI Scan button after a moment.'}
              </div>
            </div>
          )}

          {scanStatus === 'scanning' && (
            <div style={{ background: T.surfaceAlt, borderRadius: 14, padding: '16px 14px', border: `1px solid ${T.secondary}33` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <div style={{ position: 'relative', width: 34, height: 34, flexShrink: 0 }}>
                  <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: `3px solid ${T.border}` }} />
                  <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: `3px solid transparent`, borderTopColor: T.secondary, animation: 'bsspin .8s linear infinite' }} />
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="spark" size={12} color={T.secondary} />
                  </div>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: T.ink, fontFamily: F.body, marginBottom: 2 }}>
                    {ko ? 'AI가 문서를 분석하고 있습니다' : 'Analyzing document with AI'}
                  </div>
                  <div style={{ fontSize: 11.5, color: T.secondary, fontFamily: F.body, fontWeight: 500 }}>
                    {STEPS[stepIdx]}
                  </div>
                </div>
              </div>
              <div style={{ height: 3, background: T.border, borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: '55%', background: `linear-gradient(90deg,${T.secondary},${T.secondary}66)`, borderRadius: 2, animation: 'bssweep 2s ease-in-out infinite' }} />
              </div>
              <style>{`@keyframes bsspin{to{transform:rotate(360deg)}}@keyframes bssweep{0%{transform:translateX(-130%)}100%{transform:translateX(280%)}}`}</style>
            </div>
          )}

          {scanStatus === 'error' && (
            <div style={{ background: '#FEF2F2', borderRadius: 12, padding: '12px 14px', border: '1px solid #FECACA' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#DC2626', fontFamily: F.body, marginBottom: 3 }}>
                {ko ? '분석에 실패했습니다' : 'Scan failed'}
              </div>
              <div style={{ fontSize: 11, color: '#EF4444', fontFamily: F.mono, marginBottom: 5, wordBreak: 'break-word' }}>
                {scanError || (ko ? '알 수 없는 오류입니다.' : 'Unknown error.')}
              </div>
              <div style={{ fontSize: 11, color: '#991B1B', fontFamily: F.body }}>
                {ko ? '아래 AI 분석 버튼으로 다시 시도하세요.' : 'Tap AI Scan below to retry.'}
              </div>
            </div>
          )}

          {scanStatus === 'done' && (
            <>
              {(typeLabel || langLabel) && (
                <div style={{ display: 'flex', gap: 7, marginBottom: 11, flexWrap: 'wrap' }}>
                  {typeLabel && <span style={{ fontSize: 11, color: T.accentDeep, background: T.accentSoft, borderRadius: 6, padding: '3px 9px', fontFamily: F.body }}>{typeLabel}</span>}
                  {langLabel && <span style={{ fontSize: 11, color: T.inkMid, background: T.surfaceAlt, borderRadius: 6, padding: '3px 9px', fontFamily: F.body }}>{langLabel}</span>}
                </div>
              )}
              {meta.aiSummary && (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: T.inkLight, letterSpacing: 1, textTransform: 'uppercase', fontFamily: F.body, marginBottom: 4 }}>{ko ? '요약' : 'Summary'}</div>
                  <div style={{ fontSize: 12.5, color: T.ink, fontFamily: F.body, lineHeight: 1.65, background: T.surfaceAlt, borderRadius: 10, padding: '9px 11px' }}>{meta.aiSummary}</div>
                </div>
              )}
              {meta.aiTopics?.length > 0 && (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: T.inkLight, letterSpacing: 1, textTransform: 'uppercase', fontFamily: F.body, marginBottom: 4 }}>{ko ? '핵심 주제' : 'Topics'}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {meta.aiTopics.map((tp, i) => (
                      <span key={i} style={{ fontSize: 11, color: T.accentDeep, background: T.accentSoft, borderRadius: 6, padding: '3px 8px', fontFamily: F.body }}>{tp}</span>
                    ))}
                  </div>
                </div>
              )}
              {ctx && (
                <details style={{ marginBottom: 8 }}>
                  <summary style={{ fontSize: 11, color: T.inkLight, fontFamily: F.body, cursor: 'pointer', userSelect: 'none', marginBottom: 5 }}>
                    {ko ? 'AI 컨텍스트 미리보기 ▸' : 'AI context preview ▸'}
                  </summary>
                  <pre style={{ fontSize: 10.5, color: T.inkMid, fontFamily: F.mono, lineHeight: 1.55, background: T.surfaceAlt, borderRadius: 10, padding: '9px 11px', whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: '5px 0 0', border: `1px solid ${T.border}` }}>
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

        {/* Action buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* Primary: Read */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onRead} style={{ flex: 1, fontSize: 14, fontWeight: 600, color: '#FFF', background: T.accent, border: 'none', borderRadius: 10, padding: '12px', cursor: 'pointer', fontFamily: F.body, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <Icon name="play" size={12} color="#FFF" /> {ko ? (book.progress > 0 ? '이어 읽기' : '읽기 시작') : (book.progress > 0 ? 'Continue' : 'Start reading')}
            </button>
            <button
              onClick={() => {
                const q = inQueue ? removeFromQueue(book.id) : addToQueue(book);
                setInQueue(!inQueue);
                onQueueChange?.(q);
              }}
              title={ko ? '읽기 대기열' : 'Reading queue'}
              style={{ flexShrink: 0, padding: '12px 14px', borderRadius: 10, border: `1.5px solid ${inQueue ? T.accent : T.border}`, background: inQueue ? T.accentSoft : 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}
            >
              {inQueue ? '📚' : '＋'}
            </button>
          </div>

          {/* Secondary: AI Chat + AI Scan side by side */}
          <div style={{ display: 'flex', gap: 8 }}>
            {/* AI 채팅 — always active */}
            <button onClick={onAI} style={{ flex: 1, fontSize: 13, fontWeight: 600, color: T.accent, background: T.accentSoft, border: `1px solid ${T.accent}44`, borderRadius: 10, padding: '11px', cursor: 'pointer', fontFamily: F.body, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
              <Icon name="ai" size={12} /> {ko ? 'AI 채팅' : 'AI Chat'}
            </button>

            {/* AI 분석 — disabled when already done */}
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
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                opacity: isDone ? 0.55 : (!hasKey ? 0.45 : 1),
              }}
            >
              {isDone
                ? <><span style={{ fontSize: 13, lineHeight: 1 }}>✓</span> {ko ? '분석 완료' : 'Scanned'}</>
                : isRunning
                ? <>{ko ? '분석 중…' : 'Scanning…'}</>
                : (scanStatus === 'error' || scanStatus === 'pending')
                ? <><Icon name="spark" size={11} /> {ko ? 'AI 재분석' : 'Retry scan'}</>
                : <><Icon name="spark" size={11} /> {ko ? 'AI 분석' : 'AI Scan'}</>
              }
            </button>
          </div>

          {/* 책 전체 텍스트 스캔 (Vision → IndexedDB 영구 저장) */}
          <FullScanButton book={book} lang={lang} />

          {/* Notes export — PDF (print) + Markdown */}
          {(() => {
            const noteCount = getNotesByBook(book.id).length + getHighlightsByBook(book.id).length;
            if (noteCount === 0) return null;
            return (
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => printNotesAsPdf(book, getNotesByBook(book.id), getHighlightsByBook(book.id))}
                  title={ko ? '독서 노트 PDF 출력' : 'Print notes as PDF'}
                  style={{ flex: 1, fontSize: 12, color: T.inkLight, background: 'none', border: `1px solid ${T.border}`, borderRadius: 8, padding: '8px', cursor: 'pointer', fontFamily: F.body, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}
                >
                  📄 {ko ? `노트 PDF (${noteCount})` : `Notes PDF (${noteCount})`}
                </button>
                <button
                  onClick={() => downloadNotesAsMarkdown(book, getNotesByBook(book.id), getHighlightsByBook(book.id))}
                  title={ko ? 'Markdown 다운로드' : 'Download Markdown'}
                  style={{ flexShrink: 0, fontSize: 12, color: T.inkLight, background: 'none', border: `1px solid ${T.border}`, borderRadius: 8, padding: '8px 12px', cursor: 'pointer', fontFamily: F.body }}
                >
                  .md
                </button>
              </div>
            );
          })()}

          {/* Collections row */}
          <button
            onClick={() => setShowCollectionPicker(true)}
            style={{ width: '100%', fontSize: 12, color: T.inkLight, background: 'none', border: `1px solid ${T.border}`, borderRadius: 8, padding: '8px 12px', cursor: 'pointer', fontFamily: F.body, display: 'flex', alignItems: 'center', gap: 6, textAlign: 'left' }}
          >
            <span>🗂️</span>
            {bookCollections.length === 0 ? (
              <span style={{ color: T.inkFaint }}>{ko ? '컬렉션 추가…' : 'Add to collection…'}</span>
            ) : (
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {bookCollections.map(c => `${c.emoji} ${c.name}`).join('  ·  ')}
              </span>
            )}
            <span style={{ color: T.inkFaint, fontSize: 10 }}>{ko ? '편집' : 'Edit'} ›</span>
          </button>

          {/* Tertiary: Drive + 공유 */}
          <div style={{ display: 'flex', gap: 6 }}>
            {book.webViewLink && (
              <button onClick={() => window.open(book.webViewLink, '_blank')} style={{ flex: 1, fontSize: 12, color: T.inkLight, background: 'none', border: `1px solid ${T.border}`, borderRadius: 8, padding: '8px', cursor: 'pointer', fontFamily: F.body, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                <Icon name="cloud" size={12} /> {ko ? 'Drive에서 보기' : 'View in Drive'}
              </button>
            )}
            <button onClick={() => setShowShare(true)} style={{ flex: 1, fontSize: 12, color: T.inkLight, background: 'none', border: `1px solid ${T.border}`, borderRadius: 8, padding: '8px', cursor: 'pointer', fontFamily: F.body, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
              <Icon name="send" size={12} /> {ko ? '공유' : 'Share'}
            </button>
            {removable && (
              <button
                onClick={async () => {
                  const isDrive = book.source === 'drive';
                  const msg = isDrive
                    ? (ko ? '이 책을 서재에서 제거할까요? (Drive 원본은 삭제되지 않습니다)' : 'Remove this book from your library? (The file stays in Drive.)')
                    : (ko ? '이 책을 기기에서 제거할까요?' : 'Remove this book from your device?');
                  if (!window.confirm(msg)) return;
                  if (isDrive) removeDriveBook(book.id); else await removeLocalBook(book.id);
                  onRemoveBook?.();
                  onClose();
                }}
                style={{ flex: 1, fontSize: 12, color: '#C0392B', background: 'none', border: '1px solid #C0392B44', borderRadius: 8, padding: '8px', cursor: 'pointer', fontFamily: F.body, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}
              >
                × {book.source === 'drive' ? (ko ? '서재에서 제거' : 'Remove') : (ko ? '기기에서 제거' : 'Remove')}
              </button>
            )}
          </div>
          {showShare && <ShareModal book={book} lang={lang} onClose={() => setShowShare(false)} />}
        </div>

        {showCollectionPicker && (
          <BookCollectionPicker
            book={book}
            lang={lang}
            onClose={() => setShowCollectionPicker(false)}
            onChange={() => {
              setBookCollections(getCollectionsByBook(book.id));
              onCollectionsChange?.();
            }}
          />
        )}
      </div>
    </div>
  );
}

/* ── Main component ──────────────────────────────────────── */
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

export function LibraryScreen({ lang, setScreen, userConfig, onAddBook, onOpenBook, onAuthError }) {
  const { T, F } = useTheme();
  const t = i18n[lang];

  const accessToken = userConfig?.driveAccessToken || userConfig?.googleUser?.accessToken;
  const driveFolder = userConfig?.driveFolder;
  const hasConfig = !!(accessToken && driveFolder?.id);

  const [books, setBooks] = useState([]);
  const [localBooks, setLocalBooks] = useState(() => getLocalBooks());
  const [driveBooksIdx, setDriveBooksIdx] = useState(() => getDriveBooks());
  const [localAdding, setLocalAdding] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');
  const [bookTick, setBookTick] = useState(0);
  const [detailBook, setDetailBook] = useState(null);
  const [readQueue, setReadQueue] = useState(() => getReadQueue());
  const [collections, setCollections] = useState(() => getCollections());
  const [collectionFilter, setCollectionFilter] = useState(''); // '' = all
  const [showCollectionMgr, setShowCollectionMgr] = useState(false);

  // Scan queue state
  const [scanning, setScanning]   = useState(false);
  const [scanDone, setScanDone]   = useState(0);
  const [scanTotal, setScanTotal] = useState(0);
  const scanActiveRef = useRef(false);
  const geminiKey = userConfig?.apiKeys?.gemini;
  const claudeKey = userConfig?.apiKeys?.claude;

  const load = useCallback(async () => {
    if (!hasConfig) return;
    setLoading(true);
    setError(null);
    try {
      const files = await listDrivePDFs(accessToken, driveFolder.id);
      const books = files.map(driveFileToBook);
      setBooks(books);
      saveBookIndex(books);
    } catch (e) {
      if (e.message === 'auth-expired') onAuthError?.();
      else setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [accessToken, driveFolder?.id, hasConfig, onAuthError]);

  useEffect(() => { load(); }, [load]);

  // Electron: 메뉴 "파일 > PDF 추가" 이벤트 구독
  useEffect(() => {
    const handleAddPdf = async () => {
      setLocalAdding(true);
      await addLocalBooksNative();
      setLocalBooks(getLocalBooks());
      setLocalAdding(false);
    };
    return onElectronMenuOpenPdf(handleAddPdf);
  }, []);

  // On mount: reset books stuck in 'scanning' from a previously interrupted session
  useEffect(() => {
    books.forEach(b => {
      if (getBookMeta(b.id)?.aiScanStatus === 'scanning') {
        setBookMeta(b.id, { aiScanStatus: undefined });
      }
    });
    setBookTick(n => n + 1);
  }, []); // eslint-disable-line

  const unscanned = useMemo(() => books.filter(b => !getBookMeta(b.id)?.aiScanStatus), [books, bookTick]); // eslint-disable-line

  const startScan = useCallback(async () => {
    if ((!geminiKey && !claudeKey) || !accessToken || scanActiveRef.current) return;
    const queue = books.filter(b => !getBookMeta(b.id)?.aiScanStatus);
    if (!queue.length) return;
    setScanTotal(queue.length);
    setScanDone(0);
    setScanning(true);
    scanActiveRef.current = true;
    for (let i = 0; i < queue.length; i++) {
      if (!scanActiveRef.current) break;
      const book = queue[i];
      setBookMeta(book.id, { aiScanStatus: 'scanning' });
      setBookTick(n => n + 1);
      try {
        const meta = await scanBookMeta({ fileId: book.id, fileName: book.title + '.pdf', mimeType: book.mimeType || 'application/pdf', size: book.size, accessToken, geminiKey, claudeKey, lang });
        setBookMeta(book.id, meta);
      } catch (e) {
        if (e.message === 'auth-expired') {
          setBookMeta(book.id, { aiScanStatus: undefined });
          setBookTick(n => n + 1);
          setScanning(false);
          scanActiveRef.current = false;
          onAuthError?.();
          return;
        }
        setBookMeta(book.id, { aiScanStatus: e.message === 'rate-limit' ? 'pending' : 'error', aiScannedAt: Date.now() });
        if (e.message === 'rate-limit') await sleep(8000);
      }
      setScanDone(d => d + 1);
      setBookTick(n => n + 1);
      if (i < queue.length - 1) await sleep(4000);
    }
    setScanning(false);
    scanActiveRef.current = false;
  }, [geminiKey, claudeKey, accessToken, books, lang, onAuthError]);

  const bumpTick = useCallback(() => setBookTick(n => n + 1), []);

  // 로컬 PDF "내 기기" 섹션 — 실제 서재 / 데모 / Drive 빈 상태 모두에서 재사용
  // (추가된 PDF가 Drive 미연동 상태에서도 서재에 바로 보이도록)
  const localSection = (
    <div style={{ padding: '0 22px 4px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <SectionLabel>💻 {lang === 'ko' ? '내 기기' : 'My Device'}</SectionLabel>
        {usesNativePicker() ? (
          <button
            disabled={localAdding}
            onClick={async () => {
              setLocalAdding(true);
              await addLocalBooksNative();
              setLocalBooks(getLocalBooks());
              setLocalAdding(false);
            }}
            style={{ padding: '5px 11px', borderRadius: 20, background: T.accentSoft, color: T.accent, fontSize: 11, fontWeight: 600, fontFamily: F.body, border: 'none', cursor: localAdding ? 'default' : 'pointer', opacity: localAdding ? 0.6 : 1 }}
          >
            {localAdding ? (lang === 'ko' ? '추가 중…' : 'Adding…') : `+ ${lang === 'ko' ? 'PDF 추가' : 'Add PDF'}`}
          </button>
        ) : (
          <label style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 11px', borderRadius: 20, background: T.accentSoft, color: T.accent, fontSize: 11, fontWeight: 600, fontFamily: F.body, cursor: localAdding ? 'default' : 'pointer', opacity: localAdding ? 0.6 : 1 }}>
            <input
              type="file"
              accept=".pdf"
              multiple
              style={{ display: 'none' }}
              disabled={localAdding}
              onChange={async (e) => {
                const files = Array.from(e.target.files || []);
                if (!files.length) return;
                setLocalAdding(true);
                for (const f of files) { await addLocalBook(f); }
                setLocalBooks(getLocalBooks());
                setLocalAdding(false);
                e.target.value = '';
              }}
            />
            {localAdding ? (lang === 'ko' ? '추가 중…' : 'Adding…') : `+ ${lang === 'ko' ? 'PDF 추가' : 'Add PDF'}`}
          </label>
        )}
      </div>
    </div>
  );

  // 로컬 책도 Drive 책과 동일한 book 형태로 그리드/피처드에 표시
  const localAsBooks = useMemo(() => localBooks.map(localBookToBook), [localBooks, bookTick]); // eslint-disable-line
  const driveAsBooks = useMemo(() => driveBooksIdx.map(driveBookToBook), [driveBooksIdx, bookTick]); // eslint-disable-line
  // Drive 폴더 동기화 목록(books)에 이미 있는 파일은 수동 추가분에서 제외 (중복 표시 방지)
  const driveManualOnly = useMemo(() => {
    const synced = new Set(books.map(b => b.id));
    return driveAsBooks.filter(b => !synced.has(b.id));
  }, [driveAsBooks, books]);
  const manualDriveIds = useMemo(() => new Set(driveBooksIdx.map(b => b.id)), [driveBooksIdx]);
  const allBooks = useMemo(() => [...localAsBooks, ...driveManualOnly, ...books], [localAsBooks, driveManualOnly, books]);

  const filterOpts = [
    { key: 'all',       label: lang === 'ko' ? '전체' : 'All' },
    { key: 'reading',   label: lang === 'ko' ? '읽는 중' : 'Reading' },
    { key: 'completed', label: lang === 'ko' ? '완독' : 'Done' },
    { key: 'unread',    label: lang === 'ko' ? '미열람' : 'Unread' },
  ];

  let filtered = filter === 'all' ? allBooks : allBooks.filter(b => b.status === filter);
  if (collectionFilter) {
    const sel = collections.find(c => c.id === collectionFilter);
    const ids = new Set(sel?.bookIds || []);
    filtered = filtered.filter(b => ids.has(b.id));
  }

  /* ── Loading ── */
  if (loading) {
    return (
      <div style={{ paddingBottom: 24 }}>
        <ScreenHeader subtitle={driveFolder.name} title={lang === 'ko' ? '서재' : 'Library'} />
        <div style={{ padding: '40px 22px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', border: `3px solid ${T.border}`, borderTopColor: T.accent, animation: 'spin 0.8s linear infinite' }} />
          <p style={{ fontSize: 13, color: T.inkLight, fontFamily: F.body, margin: 0 }}>
            {lang === 'ko' ? 'Drive에서 불러오는 중…' : 'Loading from Drive…'}
          </p>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      </div>
    );
  }

  /* ── Error ── */
  if (error) {
    const isAuthError = /credential|invalid|token|401/i.test(error);
    return (
      <div style={{ paddingBottom: 24 }}>
        <ScreenHeader subtitle={driveFolder.name} title={lang === 'ko' ? '서재' : 'Library'} />
        <MobileAuthErrorOrRetry
          isAuthErr={isAuthError}
          error={error}
          lang={lang}
          onRetry={load}
          onAuthError={onAuthError}
        />
      </div>
    );
  }

  /* ── Empty state ── */
  if (allBooks.length === 0) {
    return (
      <div style={{ paddingBottom: 24 }}>
        <ScreenHeader subtitle={hasConfig ? driveFolder.name : (lang === 'ko' ? '내 서재' : 'My library')} title={lang === 'ko' ? '서재' : 'Library'} right={hasConfig ? <SyncBadge lang={lang} /> : undefined} />
        {localSection}
        <div style={{ padding: '40px 22px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 72, height: 72, borderRadius: 20, background: T.accentSoft, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="library" size={32} color={T.accent} />
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 600, color: T.ink, fontFamily: F.display, marginBottom: 8, letterSpacing: -0.3 }}>
              {lang === 'ko' ? '서재가 비어 있어요' : 'Your library is empty'}
            </div>
            <div style={{ fontSize: 13, color: T.inkLight, fontFamily: F.body, lineHeight: 1.65, maxWidth: 260 }}>
              {hasConfig
                ? (lang === 'ko'
                    ? `📁 ${driveFolder.name} 폴더에 PDF를 추가하면 여기에 나타납니다.`
                    : `Add PDFs to 📁 ${driveFolder.name} in Google Drive to see them here.`)
                : (lang === 'ko'
                    ? '기기의 PDF 파일을 추가해 나만의 서재를 시작하세요.'
                    : 'Add a PDF from your device to start your library.')}
            </div>
          </div>
          <Button variant="accent" onClick={onAddBook} style={{ padding: '12px 24px' }}>
            <Icon name="library" size={14} color="#FFF" /> {lang === 'ko' ? '첫 책 추가하기' : 'Add first book'}
          </Button>
          {hasConfig && (
            <button onClick={load} style={{ background: 'none', border: 'none', color: T.inkLight, fontSize: 12, fontFamily: F.body, cursor: 'pointer', textDecoration: 'underline' }}>
              {lang === 'ko' ? '새로 고침' : 'Refresh'}
            </button>
          )}
        </div>
      </div>
    );
  }

  /* ── Library with books ── */
  const featured = allBooks.find(b => b.status === 'reading') || allBooks[0];

  return (
    <div style={{ paddingBottom: 24 }}>
      <ScreenHeader
        subtitle={hasConfig ? driveFolder.name : (lang === 'ko' ? '내 서재' : 'My library')}
        title={lang === 'ko' ? '서재' : 'Library'}
        right={hasConfig ? (
          <button onClick={load} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.inkLight, display: 'flex', padding: 4 }}>
            <Icon name="sync" size={16} color={T.inkLight} />
          </button>
        ) : undefined}
      />

      {localSection}

      {/* Featured / currently reading */}
      {featured && filter === 'all' && (
        <div style={{ padding: '0 22px 22px' }}>
          <SectionLabel>{lang === 'ko' ? '최근 추가' : 'Recently added'}</SectionLabel>
          <div style={{ background: T.surface, borderRadius: 18, padding: 16, border: `1px solid ${T.border}`, boxShadow: `0 2px 16px ${T.ink}0A` }}>
            <div style={{ display: 'flex', gap: 14 }}>
              <DriveCover title={featured.title} size={88} />
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  {featured.status === 'reading' && (
                    <div style={{ fontSize: 9.5, fontWeight: 700, color: T.accent, letterSpacing: 1.4, textTransform: 'uppercase', fontFamily: F.body, marginBottom: 4 }}>
                      {lang === 'ko' ? '읽는 중' : 'Reading'}
                    </div>
                  )}
                  <div style={{ fontSize: 16, fontWeight: 600, color: T.ink, fontFamily: F.display, lineHeight: 1.2, marginBottom: 4, letterSpacing: -0.3 }}>
                    {featured.title}
                  </div>
                  <div style={{ fontSize: 11, color: T.inkLight, fontFamily: F.body }}>
                    {formatDate(featured.modifiedTime)} · {formatSize(featured.size)}
                  </div>
                </div>
                {(featured.progress > 0 || featured.lastPage > 0) && (
                  <div style={{ marginTop: 8 }}>
                    {featured.progress > 0 && <ProgressBar value={featured.progress} height={4} />}
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5 }}>
                      <span style={{ fontSize: 10, color: T.inkLight, fontFamily: F.mono }}>p. {featured.lastPage}</span>
                      {featured.progress > 0 && <span style={{ fontSize: 10, color: T.accent, fontWeight: 600, fontFamily: F.body }}>{featured.progress}%</span>}
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <Button variant="accent" full onClick={() => { if (onOpenBook) onOpenBook(featured); else setScreen('reader'); }} style={{ flex: 1, padding: '10px' }}>
                <Icon name="play" size={12} color="#FFF" /> {featured.status === 'reading' ? (lang === 'ko' ? '이어 읽기' : 'Continue') : (lang === 'ko' ? '읽기 시작' : 'Start Reading')}
              </Button>
              {featured.webViewLink && (
                <Button variant="ghost" onClick={() => window.open(featured.webViewLink, '_blank')} style={{ padding: '10px 14px' }}>
                  <Icon name="folder" size={14} />
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* AI Scan banner (mobile) */}
      {(claudeKey || geminiKey) && (scanning || unscanned.length > 0) && (
        <div style={{ padding: '0 22px 14px' }}>
          <div style={{ background: T.accentSoft, borderRadius: 12, padding: '11px 14px', border: `1px solid ${T.accent}44`, display: 'flex', alignItems: 'center', gap: 10 }}>
            {scanning ? (
              <>
                <div style={{ width: 16, height: 16, borderRadius: '50%', border: `2px solid ${T.border}`, borderTopColor: T.accent, animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: T.ink, fontFamily: F.body, marginBottom: 3 }}>
                    {lang === 'ko' ? `AI 분석 중 ${scanDone}/${scanTotal}` : `Analyzing ${scanDone}/${scanTotal}`}
                  </div>
                  <div style={{ height: 3, background: T.border, borderRadius: 2 }}>
                    <div style={{ height: '100%', width: `${scanTotal > 0 ? Math.round((scanDone / scanTotal) * 100) : 0}%`, background: T.accent, borderRadius: 2, transition: 'width .4s' }} />
                  </div>
                </div>
                <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
              </>
            ) : (
              <>
                <Icon name="spark" size={16} color={T.accent} />
                <span style={{ flex: 1, fontSize: 12, color: T.ink, fontFamily: F.body }}>
                  {lang === 'ko' ? `${unscanned.length}개 문서 AI 분석 가능` : `${unscanned.length} docs ready for AI scan`}
                </span>
                <button onClick={startScan} style={{ fontSize: 11, fontWeight: 600, color: '#FFF', background: T.accent, border: 'none', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontFamily: F.body }}>
                  {lang === 'ko' ? '분석' : 'Scan'}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Filter + count */}
      <div style={{ padding: '0 22px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <ChipRow options={filterOpts} value={filter} onChange={setFilter} />
          <span style={{ fontSize: 11, color: T.inkFaint, fontFamily: F.body, whiteSpace: 'nowrap', marginLeft: 8 }}>
            {filtered.length}{lang === 'ko' ? '권' : ''}
          </span>
        </div>

        {/* Collection chips */}
        {(collections.length > 0 || collectionFilter) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
            <button
              onClick={() => setCollectionFilter('')}
              style={{ fontSize: 11, padding: '4px 10px', borderRadius: 12, border: `1px solid ${!collectionFilter ? T.accent : T.border}`, background: !collectionFilter ? T.accentSoft : 'transparent', color: !collectionFilter ? T.accent : T.inkLight, cursor: 'pointer', fontFamily: F.body }}
            >
              {lang === 'ko' ? '모든 책' : 'All'}
            </button>
            {collections.map(c => (
              <button
                key={c.id}
                onClick={() => setCollectionFilter(collectionFilter === c.id ? '' : c.id)}
                style={{ fontSize: 11, padding: '4px 10px', borderRadius: 12, border: `1px solid ${collectionFilter === c.id ? T.accent : T.border}`, background: collectionFilter === c.id ? T.accentSoft : 'transparent', color: collectionFilter === c.id ? T.accent : T.inkMid, cursor: 'pointer', fontFamily: F.body, display: 'inline-flex', alignItems: 'center', gap: 4 }}
              >
                <span>{c.emoji}</span>{c.name}<span style={{ color: T.inkFaint, fontSize: 9 }}>{c.bookIds.length}</span>
              </button>
            ))}
            <button
              onClick={() => setShowCollectionMgr(true)}
              title={lang === 'ko' ? '컬렉션 관리' : 'Manage'}
              style={{ fontSize: 11, padding: '4px 8px', borderRadius: 12, border: `1px dashed ${T.border}`, background: 'transparent', color: T.inkFaint, cursor: 'pointer', fontFamily: F.body }}
            >
              ⚙️
            </button>
          </div>
        )}
      </div>

      {/* Book grid */}
      <div style={{ padding: '0 22px' }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '20px 0', color: T.inkLight, fontSize: 13, fontFamily: F.body }}>
            {lang === 'ko' ? '해당 책이 없습니다' : 'No books in this category'}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, rowGap: 20 }}>
            {filtered.map(b => {
              const bMeta = getBookMeta(b.id);
              const scanSt = bMeta?.aiScanStatus;
              const dotColors = { scanning: '#F59E0B', done: '#22C55E', error: '#EF4444', pending: '#94A3B8' };
              return (
              <div key={b.id + bookTick} onClick={() => setDetailBook(b)} style={{ cursor: 'pointer' }}>
                <div style={{ marginBottom: 10, display: 'flex', justifyContent: 'center', position: 'relative' }}>
                  <DriveCover title={b.title} size={104} />
                  {scanSt && dotColors[scanSt] && (
                    <div style={{ position: 'absolute', top: 5, right: 5, width: 9, height: 9, borderRadius: '50%', background: dotColors[scanSt], boxShadow: '0 0 0 2px rgba(255,255,255,0.9)', animation: scanSt === 'scanning' ? 'pulse 1.2s ease-in-out infinite' : 'none' }}>
                      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>
                    </div>
                  )}
                </div>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: T.ink, fontFamily: F.display, lineHeight: 1.3, letterSpacing: -0.2, marginBottom: 2, wordBreak: 'break-word' }}>
                  {bMeta?.aiTitle || b.title}
                </div>
                {bMeta?.aiAuthor && (
                  <div style={{ fontSize: 10, color: T.inkMid, fontFamily: F.body, marginBottom: 2, fontStyle: 'italic' }}>{bMeta.aiAuthor}</div>
                )}
                <div style={{ fontSize: 10, color: T.inkLight, fontFamily: F.body, marginBottom: 6 }}>
                  {formatDate(b.modifiedTime)}
                </div>
                {b.status === 'reading' && b.progress > 0 ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <div style={{ flex: 1 }}><ProgressBar value={b.progress} height={2} /></div>
                    <span style={{ fontSize: 9.5, color: T.accent, fontWeight: 600, fontFamily: F.mono }}>{b.progress}%</span>
                  </div>
                ) : b.status === 'reading' && b.lastPage > 0 ? (
                  <span style={{ fontSize: 9.5, color: T.accent, fontWeight: 600, fontFamily: F.mono }}>p. {b.lastPage}</span>
                ) : b.status === 'completed' ? (
                  <span style={{ fontSize: 10, color: T.secondary, fontWeight: 600, fontFamily: F.body }}>✓ {lang === 'ko' ? '완독' : 'Done'}</span>
                ) : (
                  <span style={{ fontSize: 9.5, color: T.inkFaint, fontFamily: F.body, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                    {lang === 'ko' ? '미열람' : 'Unread'}
                  </span>
                )}
              </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add more books */}
      <div style={{ padding: '24px 22px 0' }}>
        <button onClick={onAddBook} style={{ width: '100%', padding: '12px', borderRadius: 14, border: `1.5px dashed ${T.border}`, background: 'transparent', color: T.inkLight, fontSize: 13, fontFamily: F.body, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <Icon name="library" size={14} color={T.inkLight} />
          {lang === 'ko' ? '책 추가하기' : 'Add book'}
        </button>
      </div>

      {/* Book detail sheet */}
      {detailBook && (
        <BookDetailSheet
          book={detailBook}
          lang={lang}
          geminiKey={userConfig?.apiKeys?.gemini}
          claudeKey={userConfig?.apiKeys?.claude}
          accessToken={accessToken}
          onClose={() => setDetailBook(null)}
          onRead={() => { if (onOpenBook) onOpenBook(detailBook); else setScreen('reader'); setDetailBook(null); }}
          onAI={() => { if (onOpenBook) onOpenBook(detailBook); setScreen('ai'); setDetailBook(null); }}
          onMetaChange={bumpTick}
          onAuthError={onAuthError}
          onQueueChange={q => setReadQueue([...q])}
          onCollectionsChange={() => setCollections(getCollections())}
          removable={detailBook.source === 'local' || manualDriveIds.has(detailBook.id)}
          onRemoveBook={() => { setLocalBooks(getLocalBooks()); setDriveBooksIdx(getDriveBooks()); setDetailBook(null); }}
        />
      )}

      {showCollectionMgr && (
        <CollectionManager
          lang={lang}
          onClose={() => setShowCollectionMgr(false)}
          onChange={(next) => { setCollections(next); if (collectionFilter && !next.some(c => c.id === collectionFilter)) setCollectionFilter(''); }}
        />
      )}

      {/* ── 3-4: 읽기 대기열 (대기열이 있을 때만) ── */}
      {readQueue.length > 0 && (
        <div style={{ padding: '0 22px 16px' }}>
          <div style={{ background: T.surface, borderRadius: 14, border: `1px solid ${T.border}`, padding: '14px 16px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: T.inkLight, letterSpacing: 1.3, textTransform: 'uppercase', fontFamily: F.body, marginBottom: 10 }}>
              {lang === 'ko' ? '📚 읽기 대기열' : '📚 Reading Queue'}
            </div>
            {readQueue.map((item, idx) => (
              <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderTop: idx > 0 ? `1px solid ${T.border}` : 'none' }}>
                <span style={{ fontSize: 11, fontFamily: F.mono, color: T.inkFaint, minWidth: 16 }}>{idx + 1}</span>
                <span style={{ flex: 1, fontSize: 13, color: T.ink, fontFamily: F.body, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</span>
                <div style={{ display: 'flex', gap: 2 }}>
                  <button onClick={() => setReadQueue(moveQueueItem(item.id, 'up'))} disabled={idx === 0} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.inkLight, padding: '2px 4px', fontSize: 12, opacity: idx === 0 ? 0.3 : 1 }}>▲</button>
                  <button onClick={() => setReadQueue(moveQueueItem(item.id, 'down'))} disabled={idx === readQueue.length - 1} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.inkLight, padding: '2px 4px', fontSize: 12, opacity: idx === readQueue.length - 1 ? 0.3 : 1 }}>▼</button>
                  <button onClick={() => setReadQueue(removeFromQueue(item.id))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.inkFaint, padding: '2px 6px', fontSize: 13 }}>✕</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Concept demo (no Drive configured) ─────────────────── */
