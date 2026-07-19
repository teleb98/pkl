import { useState, useRef, useEffect } from 'react';
import { useTheme } from '../context.jsx';
import { Icon } from '../components.jsx';
import { addLocalBook, addLocalBooksNative, usesNativePicker } from '../utils/localBooks.js';
import { DriveBookPicker } from '../components/DriveBookPicker.jsx';
import { useGoogleAuth } from '../utils/useGoogleAuth.js';
import { uploadBooksToDrive, PDF_UPLOAD_SCOPE } from '../utils/drivePdfUpload.js';
import { getDriveToken } from '../utils/driveLocalCopy.js';
import { showToast } from '../utils/toast.js';

/* ════════════════════════════════════════════════════════════════
   Add Book flow — PDF 가져오기 / Drive 탐색기만 실제 동작.
   로컬 PDF 추가 완료 시 Google Drive 업로드(MyLibrary/books/)를 제안한다.
   카메라 스캔·사진 라이브러리는 아직 구현 전이라 "준비 중" 안내만 표시.
   ════════════════════════════════════════════════════════════════ */

export function AddBookFlow({ lang, onCancel, onComplete, userConfig, onUpdateConfig }) {
  const { T, F } = useTheme();
  const [step, setStep] = useState("source"); // source | drivePicker | driveOffer | driveAuto
  const [importing, setImporting] = useState(false);
  const [addedBooks, setAddedBooks] = useState([]);   // 방금 추가한 로컬 책들(업로드 제안 대상)
  const fileInputRef = useRef(null);

  // 로컬 추가 완료 → "항상 자동 업로드" 설정 + 유효 토큰이 있으면 묻지 않고 조용히 업로드,
  // 아니면 기존처럼 업로드 제안 화면으로.
  const offerUpload = (books) => {
    setAddedBooks(books);
    if (userConfig?.autoUploadPdf && getDriveToken()) setStep("driveAuto");
    else setStep("driveOffer");
  };

  // 실제 로컬 PDF 가져오기 — Electron/Capacitor(네이티브 선택) / 웹(file input)
  const handleImportPdf = async () => {
    if (usesNativePicker()) {
      setImporting(true);
      try {
        const added = await addLocalBooksNative(); // Electron 또는 Capacitor
        if (added && added.length) offerUpload(added);
        // 취소(빈 배열)면 그대로 머무름
      } finally {
        setImporting(false);
      }
    } else {
      fileInputRef.current?.click();
    }
  };

  // 웹: file input change
  const handleWebFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setImporting(true);
    try {
      const added = [];
      for (const f of files) added.push(await addLocalBook(f));
      if (added.length) offerUpload(added);
    } finally {
      setImporting(false);
      e.target.value = '';
    }
  };

  if (step === "driveAuto") {
    return (
      <DriveAutoUpload
        lang={lang}
        books={addedBooks}
        onDone={() => onComplete && onComplete(addedBooks[0])}
      />
    );
  }
  if (step === "driveOffer") {
    return (
      <DriveUploadOffer
        lang={lang}
        books={addedBooks}
        userConfig={userConfig}
        onUpdateConfig={onUpdateConfig}
        onDone={() => onComplete && onComplete(addedBooks[0])}
      />
    );
  }
  // DriveBookPicker 는 자체 헤더(브레드크럼/닫기/완료)를 가지므로 공용 탑바 없이 전체 화면 사용
  if (step === "drivePicker") {
    return (
      <div style={{ position: "absolute", inset: "44px 0 0 0", background: T.bg, display: "flex", flexDirection: "column" }}>
        <DriveBookPicker
          lang={lang}
          userConfig={userConfig}
          onUpdateConfig={onUpdateConfig}
          onClose={() => setStep("source")}
          onDone={onComplete}
        />
      </div>
    );
  }

  return (
    <div style={{ position: "absolute", inset: "44px 0 0 0", background: T.bg, display: "flex", flexDirection: "column" }}>
      {/* Top bar */}
      <div style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: 8, borderBottom: `1px solid ${T.border}`, background: T.surface }}>
        <button onClick={step === "source" ? onCancel : () => setStep(step === "metadata" ? "ocr" : step === "ocr" ? "capture" : "source")} style={{ background: "none", border: "none", cursor: "pointer", padding: 6, color: T.inkMid, display: "flex" }}>
          <Icon name={step === "source" ? "close" : "back"} size={18} />
        </button>
        <div style={{ flex: 1, textAlign: "center" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: T.inkLight, letterSpacing: 1.4, textTransform: "uppercase", fontFamily: F.body }}>
            {lang === "ko" ? "책 추가" : "Add Book"}
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: T.ink, fontFamily: F.display, marginTop: 1 }}>
            {lang === "ko" ? "어떻게 추가하시겠어요?" : "How would you like to add?"}
          </div>
        </div>
        <div style={{ width: 30, flexShrink: 0 }} />
      </div>

      {/* 웹용 숨은 file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf"
        multiple
        style={{ display: 'none' }}
        onChange={handleWebFiles}
      />

      {/* Step content */}
      <SourceStep lang={lang} importing={importing} onPick={s => {
        if (s === "pdf") { handleImportPdf(); return; }
        if (s === "drive") { setStep("drivePicker"); return; }
        // 'scan' / 'photos' — 아직 구현 전
        showToast(
          lang === "ko" ? '아직 준비 중인 기능입니다. PDF 가져오기 또는 Drive를 이용해주세요.' : 'Not available yet. Please use Import PDF or Google Drive for now.',
          { type: 'info' }
        );
      }} />
    </div>
  );
}

/* ── 조용한 자동 업로드 — "항상 자동 업로드" 설정 + 유효 토큰이 있을 때, 팝업 없이
   바로 업로드하고 짧게 결과만 보여준 뒤 서재로 넘어간다(실패해도 로컬 추가는 유지). ── */
function DriveAutoUpload({ lang, books, onDone }) {
  const { T, F } = useTheme();
  const ko = lang === 'ko';
  const [result, setResult] = useState(null); // {done,failed,total} | 'error' | null(진행 중)

  useEffect(() => {
    let alive = true;
    const token = getDriveToken();
    if (!token) { setResult('error'); return; }
    uploadBooksToDrive(token, books)
      .then(res => { if (alive) setResult(res); })
      .catch(() => { if (alive) setResult('error'); });
    return () => { alive = false; };
  }, []); // books 는 마운트 시 1회 스냅샷

  useEffect(() => {
    if (result === null) return;
    const id = setTimeout(onDone, result === 'error' ? 900 : 1100);
    return () => clearTimeout(id);
  }, [result]);

  return (
    <div style={{ position: "absolute", inset: "44px 0 0 0", background: T.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 380, background: T.surface, borderRadius: 18, border: `1px solid ${T.border}`, padding: "26px 24px", textAlign: "center", boxShadow: `0 8px 30px -14px ${T.ink}44` }}>
        <div style={{ fontSize: 34 }}>{result && result !== 'error' ? '✅' : '☁️'}</div>
        <div style={{ fontSize: 15.5, fontWeight: 700, color: T.ink, fontFamily: F.display, marginTop: 12 }}>
          {result === null
            ? (ko ? 'Drive에 자동 업로드 중…' : 'Auto-uploading to Drive…')
            : result === 'error'
              ? (ko ? '자동 업로드를 건너뛰었어요' : 'Auto-upload skipped')
              : (ko ? '업로드 완료' : 'Upload complete')}
        </div>
        {result && result !== 'error' && (
          <div style={{ fontSize: 12.5, color: T.inkMid, fontFamily: F.body, lineHeight: 1.6, marginTop: 8 }}>
            {ko
              ? `${result.done}권 업로드${result.failed ? ` · ${result.failed}권 실패` : ''} → MyLibrary/books/`
              : `${result.done} uploaded${result.failed ? ` · ${result.failed} failed` : ''} → MyLibrary/books/`}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Drive 업로드 제안 — 로컬 추가 직후 원본 PDF 를 MyLibrary/books/ 로 백업.
   "항상 자동으로 업로드"를 체크하면 다음부터는 묻지 않고 조용히 업로드된다
   (DriveAutoUpload 로 분기, userConfig.autoUploadPdf). ── */
function DriveUploadOffer({ lang, books, userConfig, onUpdateConfig, onDone }) {
  const { T, F } = useTheme();
  const ko = lang === 'ko';
  const [status, setStatus] = useState('offer'); // offer | uploading | done | error
  const [progress, setProgress] = useState('');
  const [result, setResult] = useState(null);
  const [alwaysAuto, setAlwaysAuto] = useState(false);

  const startUpload = useGoogleAuth({
    scope: PDF_UPLOAD_SCOPE,
    onSuccess: async ({ access_token }) => {
      if (alwaysAuto && onUpdateConfig) {
        onUpdateConfig({ ...(userConfig || {}), autoUploadPdf: true });
      }
      setStatus('uploading');
      try {
        const res = await uploadBooksToDrive(access_token, books, {
          onProgress: (i, total, title) => setProgress(ko ? `${i}/${total} 《${title}》 업로드 중…` : `Uploading ${i}/${total} 《${title}》…`),
        });
        setResult(res);
        setStatus('done');
      } catch {
        setStatus('error');
      }
    },
    onError: () => setStatus('error'),
  });

  const uploading = status === 'uploading';

  return (
    <div style={{ position: "absolute", inset: "44px 0 0 0", background: T.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 380, background: T.surface, borderRadius: 18, border: `1px solid ${T.border}`, padding: "26px 24px", textAlign: "center", boxShadow: `0 8px 30px -14px ${T.ink}44` }}>
        <div style={{ fontSize: 34 }}>{status === 'done' ? '✅' : '☁️'}</div>

        {status === 'offer' && (
          <>
            <div style={{ fontSize: 15.5, fontWeight: 700, color: T.ink, fontFamily: F.display, marginTop: 12 }}>
              {ko ? `${books.length}권을 서재에 추가했어요` : `Added ${books.length} book${books.length > 1 ? 's' : ''}`}
            </div>
            <div style={{ fontSize: 12.5, color: T.inkMid, fontFamily: F.body, lineHeight: 1.6, marginTop: 8 }}>
              {ko ? 'Google Drive(MyLibrary/books/)에도 업로드해 두면 다른 기기에서도 열 수 있어요.'
                  : 'Upload to Google Drive (MyLibrary/books/) to open them on other devices too.'}
            </div>
            <div style={{ marginTop: 10, fontSize: 11.5, color: T.inkLight, fontFamily: F.body, lineHeight: 1.5, maxHeight: 66, overflowY: 'auto' }}>
              {books.slice(0, 3).map(b => `《${b.title}》`).join(' · ')}{books.length > 3 ? ` ${ko ? '외' : '+'} ${books.length - 3}` : ''}
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 14, fontSize: 12, color: T.inkMid, fontFamily: F.body, cursor: 'pointer', justifyContent: 'center' }}>
              <input type="checkbox" checked={alwaysAuto} onChange={e => setAlwaysAuto(e.target.checked)} style={{ width: 14, height: 14, accentColor: T.accent, cursor: 'pointer' }} />
              {ko ? '다음부터 묻지 않고 항상 자동 업로드' : 'Always auto-upload from now on'}
            </label>
            <button
              onClick={startUpload}
              style={{ marginTop: 16, width: '100%', padding: '12px 0', borderRadius: 12, border: 'none', background: T.accent, color: '#FFF', fontSize: 13.5, fontWeight: 700, fontFamily: F.body, cursor: 'pointer' }}
            >
              ☁️ {ko ? 'Google Drive에 업로드' : 'Upload to Google Drive'}
            </button>
            <button
              onClick={onDone}
              style={{ marginTop: 8, width: '100%', padding: '11px 0', borderRadius: 12, border: `1px solid ${T.border}`, background: 'transparent', color: T.inkMid, fontSize: 13, fontWeight: 600, fontFamily: F.body, cursor: 'pointer' }}
            >
              {ko ? '건너뛰기' : 'Skip'}
            </button>
          </>
        )}

        {uploading && (
          <>
            <div style={{ fontSize: 15.5, fontWeight: 700, color: T.ink, fontFamily: F.display, marginTop: 12 }}>
              {ko ? 'Drive에 업로드 중' : 'Uploading to Drive'}
            </div>
            <div style={{ fontSize: 12, color: T.inkMid, fontFamily: F.body, marginTop: 8 }}>{progress}</div>
          </>
        )}

        {status === 'done' && result && (
          <>
            <div style={{ fontSize: 15.5, fontWeight: 700, color: T.ink, fontFamily: F.display, marginTop: 12 }}>
              {ko ? '업로드 완료' : 'Upload complete'}
            </div>
            <div style={{ fontSize: 12.5, color: T.inkMid, fontFamily: F.body, lineHeight: 1.6, marginTop: 8 }}>
              {ko
                ? `${result.done}권 업로드${result.failed ? ` · ${result.failed}권 실패` : ''} → MyLibrary/books/`
                : `${result.done} uploaded${result.failed ? ` · ${result.failed} failed` : ''} → MyLibrary/books/`}
            </div>
            <button
              onClick={onDone}
              style={{ marginTop: 16, width: '100%', padding: '12px 0', borderRadius: 12, border: 'none', background: T.accent, color: '#FFF', fontSize: 13.5, fontWeight: 700, fontFamily: F.body, cursor: 'pointer' }}
            >
              {ko ? '서재로 가기' : 'Go to library'}
            </button>
          </>
        )}

        {status === 'error' && (
          <>
            <div style={{ fontSize: 13, color: '#C0392B', fontFamily: F.body, marginTop: 12, lineHeight: 1.5 }}>
              ⚠️ {ko ? '업로드에 실패했어요. 책은 서재에 정상 추가되어 있어요.' : 'Upload failed. Your books are still added locally.'}
            </div>
            <button
              onClick={onDone}
              style={{ marginTop: 14, width: '100%', padding: '12px 0', borderRadius: 12, border: 'none', background: T.accent, color: '#FFF', fontSize: 13.5, fontWeight: 700, fontFamily: F.body, cursor: 'pointer' }}
            >
              {ko ? '서재로 가기' : 'Go to library'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/* ── Source step ───────────────────────────────────────── */
function SourceStep({ lang, onPick, importing }) {
  const { T, F } = useTheme();
  // PDF 가져오기 / Drive 탐색기는 실제 동작. 카메라 스캔·사진 라이브러리는 아직 구현 전.
  const sources = [
    { k: "pdf",    icon: "📄", title: lang === "ko" ? "PDF 파일 가져오기" : "Import PDF",
      sub: lang === "ko" ? "이미 갖고 있는 PDF를 서재에 추가 (오프라인)" : "Add a PDF you already have (offline)",
      tag: lang === "ko" ? "추천" : "Recommended" },
    { k: "drive",  icon: "🗂️", title: lang === "ko" ? "Google Drive에서 가져오기" : "Import from Google Drive",
      sub: lang === "ko" ? "Drive 폴더를 탐색해 책 또는 폴더 단위로 추가" : "Browse your Drive and add books or whole folders",
      tag: null },
    { k: "scan",   icon: "📷", title: lang === "ko" ? "카메라로 스캔" : "Scan with camera",
      sub: lang === "ko" ? "책을 페이지별로 촬영해 인식" : "Photograph pages, then recognize text",
      tag: lang === "ko" ? "준비 중" : "Coming soon", comingSoon: true },
    { k: "photos", icon: "🖼", title: lang === "ko" ? "사진 라이브러리" : "From Photos",
      sub: lang === "ko" ? "기존에 촬영한 사진들에서 선택" : "Pick existing photos",
      tag: lang === "ko" ? "준비 중" : "Coming soon", comingSoon: true },
  ];
  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "20px 22px 28px" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {sources.map(s => {
          const isPdf = s.k === "pdf";
          const busy = isPdf && importing;
          return (
          <button key={s.k} disabled={busy} onClick={() => onPick(s.k)} style={{
            display: "flex", alignItems: "center", gap: 14, padding: "16px 16px",
            background: isPdf ? T.accentSoft : T.surface, borderRadius: 16,
            border: `1px solid ${isPdf ? T.accent + '55' : T.border}`,
            cursor: busy ? "default" : "pointer", textAlign: "left", transition: "all .15s",
            boxShadow: `0 2px 12px -8px ${T.ink}22`, width: "100%", opacity: busy ? 0.7 : (s.comingSoon ? 0.6 : 1),
          }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, background: isPdf ? T.accent + '22' : T.surfaceAlt, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, flexShrink: 0 }}>
              {busy ? '⏳' : s.icon}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ marginBottom: 4, lineHeight: 1.2 }}>
                <span style={{ fontSize: 14.5, fontWeight: 600, color: T.ink, fontFamily: F.display, letterSpacing: -0.2 }}>{s.title}</span>
                {s.tag && (
                  <span style={{ fontSize: 9.5, fontWeight: 700, padding: "2px 7px", borderRadius: 999, background: s.comingSoon ? T.inkFaint : T.accent, color: "#FFF", fontFamily: F.body, letterSpacing: 0.3, textTransform: "uppercase", marginLeft: 7, verticalAlign: "middle", whiteSpace: "nowrap" }}>{s.tag}</span>
                )}
              </div>
              <div style={{ fontSize: 12, color: T.inkLight, fontFamily: F.body, lineHeight: 1.45 }}>{s.sub}</div>
            </div>
            <Icon name="forward" size={16} color={T.inkFaint} />
          </button>
          );
        })}
      </div>
    </div>
  );
}
