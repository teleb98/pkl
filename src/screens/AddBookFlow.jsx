import { useState, useRef } from 'react';
import { useTheme } from '../context.jsx';
import { Icon } from '../components.jsx';
import { addLocalBook, addLocalBooksNative, usesNativePicker } from '../utils/localBooks.js';
import { DriveBookPicker } from '../components/DriveBookPicker.jsx';
import { showToast } from '../utils/toast.js';

/* ════════════════════════════════════════════════════════════════
   Add Book flow — PDF 가져오기 / Drive 탐색기만 실제 동작.
   카메라 스캔·사진 라이브러리는 아직 구현 전이라 "준비 중" 안내만 표시.
   ════════════════════════════════════════════════════════════════ */

export function AddBookFlow({ lang, onCancel, onComplete, userConfig, onUpdateConfig }) {
  const { T, F } = useTheme();
  const [step, setStep] = useState("source"); // source | drivePicker
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef(null);

  // 실제 로컬 PDF 가져오기 — Electron/Capacitor(네이티브 선택) / 웹(file input)
  const handleImportPdf = async () => {
    if (usesNativePicker()) {
      setImporting(true);
      try {
        const added = await addLocalBooksNative(); // Electron 또는 Capacitor
        if (added && added.length) {
          onComplete && onComplete(added[0]); // 추가 완료 → 서재로 이동
        }
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
      let first = null;
      for (const f of files) {
        const book = await addLocalBook(f);
        if (!first) first = book;
      }
      if (first) onComplete && onComplete(first);
    } finally {
      setImporting(false);
      e.target.value = '';
    }
  };
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
