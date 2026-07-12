import { useState, useEffect, useRef } from 'react';
import { useTheme } from '../context.jsx';
import { Button, Icon, BookCover } from '../components.jsx';
import { addLocalBook, addLocalBooksNative, usesNativePicker } from '../utils/localBooks.js';
import { DriveBookPicker } from '../components/DriveBookPicker.jsx';

/* ════════════════════════════════════════════════════════════════
   Add Book / Scan flow
   ════════════════════════════════════════════════════════════════ */

export function AddBookFlow({ lang, onCancel, onComplete, userConfig, onUpdateConfig }) {
  const { T, F } = useTheme();
  const [step, setStep] = useState("source"); // source | drivePicker | capture | ocr | metadata | done
  const [source, setSource] = useState(null); // 'scan' | 'pdf' | 'photos' | 'drive'
  const [pages, setPages] = useState([]); // captured pages
  const [progress, setProgress] = useState(0);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef(null);
  const ko = lang === 'ko';

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
  const [meta, setMeta] = useState({
    title: lang === "ko" ? "" : "",
    titleEn: "",
    author: "",
    year: "",
    coverColor: "#8B6B47",
  });

  // OCR progress simulation
  useEffect(() => {
    if (step !== "ocr") return;
    setProgress(0);
    const id = setInterval(() => {
      setProgress(p => {
        if (p >= 100) { clearInterval(id); setTimeout(() => { 
          setMeta({
            title: lang === "ko" ? "전략의 본질" : "The Essence of Strategy",
            titleEn: "The Essence of Strategy",
            author: lang === "ko" ? "헨리 민츠버그" : "Henry Mintzberg",
            year: "1994",
            coverColor: "#8B6B47",
          });
          setStep("metadata"); 
        }, 400); return 100; }
        return p + 4;
      });
    }, 70);
    return () => clearInterval(id);
  }, [step]);

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
            {{
              source:   lang === "ko" ? "어떻게 추가하시겠어요?" : "How would you like to add?",
              capture:  lang === "ko" ? "책 촬영" : "Capture pages",
              ocr:      lang === "ko" ? "스캔 중" : "Scanning",
              metadata: lang === "ko" ? "정보 확인" : "Confirm info",
              done:     lang === "ko" ? "완료" : "Done",
            }[step]}
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
      {step === "source" && <SourceStep lang={lang} importing={importing} setSource={setSource} onPick={s => {
        // 'pdf' = 실제 로컬 PDF 가져오기 (데모 OCR 우회)
        if (s === "pdf") { handleImportPdf(); return; }
        // 'drive' = 실제 Google Drive 폴더 탐색기
        if (s === "drive") { setStep("drivePicker"); return; }
        setSource(s);
        setStep(s === "scan" || s === "photos" ? "capture" : "ocr");
      }} />}
      {step === "capture" && <CaptureStep lang={lang} pages={pages} setPages={setPages} onDone={() => setStep("ocr")} />}
      {step === "ocr" && <OCRStep lang={lang} progress={progress} pages={pages.length || 24} />}
      {step === "metadata" && <MetadataStep lang={lang} meta={meta} setMeta={setMeta} onSave={() => setStep("done")} />}
      {step === "done" && <DoneStep lang={lang} meta={meta} onLibrary={onComplete} />}
    </div>
  );
}

/* ── Source step ───────────────────────────────────────── */
function SourceStep({ lang, onPick, importing }) {
  const { T, F } = useTheme();
  // PDF 가져오기 / Drive 탐색기는 실제 동작. 카메라 스캔·사진 라이브러리는 데모.
  const sources = [
    { k: "pdf",    icon: "📄", title: lang === "ko" ? "PDF 파일 가져오기" : "Import PDF",
      sub: lang === "ko" ? "이미 갖고 있는 PDF를 서재에 추가 (오프라인)" : "Add a PDF you already have (offline)",
      tag: lang === "ko" ? "추천" : "Recommended" },
    { k: "drive",  icon: "🗂️", title: lang === "ko" ? "Google Drive에서 가져오기" : "Import from Google Drive",
      sub: lang === "ko" ? "Drive 폴더를 탐색해 책 또는 폴더 단위로 추가" : "Browse your Drive and add books or whole folders",
      tag: null },
    { k: "scan",   icon: "📷", title: lang === "ko" ? "카메라로 스캔" : "Scan with camera",
      sub: lang === "ko" ? "책을 페이지별로 촬영해 OCR 처리 (데모)" : "Photograph pages, then OCR (demo)",
      tag: null },
    { k: "photos", icon: "🖼", title: lang === "ko" ? "사진 라이브러리" : "From Photos",
      sub: lang === "ko" ? "기존에 촬영한 사진들에서 선택 (데모)" : "Pick existing photos (demo)", tag: null },
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
            boxShadow: `0 2px 12px -8px ${T.ink}22`, width: "100%", opacity: busy ? 0.7 : 1,
          }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, background: isPdf ? T.accent + '22' : T.surfaceAlt, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, flexShrink: 0 }}>
              {busy ? '⏳' : s.icon}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ marginBottom: 4, lineHeight: 1.2 }}>
                <span style={{ fontSize: 14.5, fontWeight: 600, color: T.ink, fontFamily: F.display, letterSpacing: -0.2 }}>{s.title}</span>
                {s.tag && (
                  <span style={{ fontSize: 9.5, fontWeight: 700, padding: "2px 7px", borderRadius: 999, background: T.accent, color: "#FFF", fontFamily: F.body, letterSpacing: 0.3, textTransform: "uppercase", marginLeft: 7, verticalAlign: "middle", whiteSpace: "nowrap" }}>{s.tag}</span>
                )}
              </div>
              <div style={{ fontSize: 12, color: T.inkLight, fontFamily: F.body, lineHeight: 1.45 }}>{s.sub}</div>
            </div>
            <Icon name="forward" size={16} color={T.inkFaint} />
          </button>
          );
        })}
      </div>

      <div style={{ marginTop: 22, padding: "14px 16px", background: T.accentSoft, borderRadius: 12, display: "flex", gap: 10, alignItems: "flex-start" }}>
        <Icon name="lightning" size={14} color={T.accent} />
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: T.accentDeep, fontFamily: F.body, marginBottom: 3 }}>
            {lang === "ko" ? "Gemini가 자동으로 OCR 처리" : "Gemini handles OCR automatically"}
          </div>
          <div style={{ fontSize: 11.5, color: T.accentDeep, fontFamily: F.body, lineHeight: 1.5, opacity: 0.85 }}>
            {lang === "ko" ? "한글·영문·일문·중문 인식 / 표·각주 보존" : "Korean · English · Japanese · Chinese / preserves tables and footnotes"}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Capture step ─────────────────────────────────────── */
function CaptureStep({ lang, pages, setPages, onDone }) {
  const { T, F } = useTheme();
  const [autoMode, setAutoMode] = useState(true);

  const shoot = () => {
    setPages(p => [...p, { id: Date.now(), n: p.length + 1 }]);
  };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "#0A0805" }}>
      {/* Viewfinder */}
      <div style={{ flex: 1, position: "relative", display: "flex", alignItems: "center", justifyContent: "center", padding: 18 }}>
        {/* Mock paper preview */}
        <div style={{
          width: "85%", aspectRatio: "0.72",
          background: "linear-gradient(165deg, #F5F1E8 0%, #E8DFCC 100%)",
          borderRadius: 4, boxShadow: "0 20px 60px rgba(0,0,0,.5)",
          position: "relative", overflow: "hidden",
        }}>
          {/* Faux text lines */}
          <div style={{ padding: "30px 22px", display: "flex", flexDirection: "column", gap: 6 }}>
            {[0.85, 0.7, 0.92, 0.8, 0.6, 0.95, 0.75, 0.88, 0.5, 0.9, 0.82, 0.7, 0.85, 0.65, 0.9].map((w, i) => (
              <div key={i} style={{ width: `${w * 100}%`, height: 4, background: "rgba(0,0,0,.32)", borderRadius: 1 }} />
            ))}
          </div>
          {/* Corner markers */}
          {[[12, 12, "tl"], [12, 12, "tr"], [12, 12, "bl"], [12, 12, "br"]].map(([sz, , corner], i) => (
            <div key={i} style={{
              position: "absolute",
              top: corner.startsWith("t") ? -2 : "auto",
              bottom: corner.startsWith("b") ? -2 : "auto",
              left: corner.endsWith("l") ? -2 : "auto",
              right: corner.endsWith("r") ? -2 : "auto",
              width: 22, height: 22,
              borderTop: corner.startsWith("t") ? "3px solid #B8440A" : "none",
              borderBottom: corner.startsWith("b") ? "3px solid #B8440A" : "none",
              borderLeft: corner.endsWith("l") ? "3px solid #B8440A" : "none",
              borderRight: corner.endsWith("r") ? "3px solid #B8440A" : "none",
            }} />
          ))}
        </div>

        {/* Auto-detect badge */}
        {autoMode && (
          <div style={{ position: "absolute", top: 18, left: 18, background: "rgba(184,68,10,.92)", color: "#FFF", padding: "5px 11px", borderRadius: 999, fontSize: 11, fontWeight: 600, fontFamily: F.body, display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 6, height: 6, borderRadius: 999, background: "#FFF", animation: "pulse 1.4s ease infinite" }} />
            {lang === "ko" ? "페이지 자동 감지" : "Auto-detecting page"}
          </div>
        )}
      </div>

      {/* Captured thumbs row */}
      {pages.length > 0 && (
        <div style={{ padding: "10px 16px", background: "rgba(0,0,0,.4)" }}>
          <div style={{ display: "flex", gap: 6, overflowX: "auto" }}>
            {pages.map((p, i) => (
              <div key={p.id} style={{ width: 44, height: 56, borderRadius: 3, background: "#F5F1E8", flexShrink: 0, position: "relative", overflow: "hidden" }}>
                <div style={{ padding: "6px 4px", display: "flex", flexDirection: "column", gap: 2 }}>
                  {[0.8, 0.65, 0.9, 0.7, 0.85, 0.6].map((w, j) => (
                    <div key={j} style={{ width: `${w * 100}%`, height: 1.5, background: "rgba(0,0,0,.3)" }} />
                  ))}
                </div>
                <div style={{ position: "absolute", top: 2, right: 2, width: 14, height: 14, borderRadius: 999, background: "#B8440A", color: "#FFF", fontSize: 8, fontFamily: F.mono, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {p.n}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bottom controls */}
      <div style={{ padding: "16px 24px 24px", background: "#0A0805", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14 }}>
        <button onClick={() => setAutoMode(!autoMode)} style={{
          background: "none", border: "none", cursor: "pointer", color: "#FFF", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: 0, opacity: 0.8,
        }}>
          <div style={{ width: 38, height: 38, borderRadius: 999, background: autoMode ? "#B8440A" : "rgba(255,255,255,.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon name="spark" size={16} color="#FFF" stroke={2} />
          </div>
          <span style={{ fontSize: 10, fontFamily: F.body, fontWeight: 500 }}>Auto</span>
        </button>

        {/* Shutter */}
        <button onClick={shoot} style={{
          width: 70, height: 70, borderRadius: 999, border: "4px solid #FFF",
          background: "transparent", cursor: "pointer", padding: 4, position: "relative",
        }}>
          <div style={{ width: "100%", height: "100%", borderRadius: 999, background: "#FFF", transition: "transform .1s" }} />
        </button>

        <button onClick={onDone} disabled={pages.length === 0} style={{
          background: pages.length > 0 ? "rgba(255,255,255,.18)" : "rgba(255,255,255,.06)",
          border: "none", padding: "10px 14px", borderRadius: 12,
          color: pages.length > 0 ? "#FFF" : "rgba(255,255,255,.4)",
          fontSize: 12, fontWeight: 600, fontFamily: F.body, cursor: pages.length > 0 ? "pointer" : "default",
          display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
        }}>
          <span style={{ fontSize: 18, fontFamily: F.display, fontWeight: 600 }}>{pages.length}</span>
          <span style={{ fontSize: 10, letterSpacing: 0.4 }}>{lang === "ko" ? "완료" : "Done"}</span>
        </button>
      </div>
    </div>
  );
}

/* ── OCR step ─────────────────────────────────────────── */
function OCRStep({ lang, progress, pages }) {
  const { T, F } = useTheme();
  const stages = lang === "ko"
    ? [
      { p: 25,  label: "이미지 전처리" },
      { p: 55,  label: "Gemini OCR 처리" },
      { p: 80,  label: "텍스트 정렬 · 단락 복원" },
      { p: 100, label: "메타데이터 추출" },
    ]
    : [
      { p: 25,  label: "Image preprocessing" },
      { p: 55,  label: "Gemini OCR processing" },
      { p: 80,  label: "Layout & paragraph recovery" },
      { p: 100, label: "Metadata extraction" },
    ];

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "28px 24px", display: "flex", flexDirection: "column", justifyContent: "center", gap: 28 }}>
      <div style={{ textAlign: "center" }}>
        <div style={{
          width: 76, height: 76, borderRadius: 22, background: T.accent,
          display: "flex", alignItems: "center", justifyContent: "center",
          margin: "0 auto 16px", boxShadow: `0 12px 30px ${T.accent}55`,
          animation: "spin 8s linear infinite",
        }}>
          <Icon name="spark" size={36} color="#FFF" stroke={1.5} />
        </div>
        <div style={{ fontSize: 11, fontWeight: 700, color: T.accent, letterSpacing: 1.6, textTransform: "uppercase", fontFamily: F.body, marginBottom: 5 }}>
          {lang === "ko" ? "AI 스캔 중" : "AI scanning"}
        </div>
        <div style={{ fontSize: 24, fontWeight: 600, color: T.ink, fontFamily: F.display, letterSpacing: -0.5, marginBottom: 4 }}>
          {progress}%
        </div>
        <div style={{ fontSize: 13, color: T.inkLight, fontFamily: F.body }}>
          {lang === "ko" ? `${pages}페이지 처리 중…` : `Processing ${pages} pages…`}
        </div>
      </div>

      {/* Big progress bar */}
      <div style={{ width: "100%", height: 6, background: T.border, borderRadius: 999, overflow: "hidden" }}>
        <div style={{ width: `${progress}%`, height: "100%", background: `linear-gradient(90deg, ${T.accent}, ${T.accentGlow})`, borderRadius: 999, transition: "width .4s ease" }} />
      </div>

      {/* Stages */}
      <div style={{ background: T.surface, borderRadius: 16, padding: 16, border: `1px solid ${T.border}` }}>
        {stages.map((s, i) => {
          const done = progress >= s.p;
          const active = progress < s.p && (i === 0 || progress >= stages[i - 1].p);
          return (
            <div key={i} style={{
              display: "flex", alignItems: "center", gap: 11, padding: "8px 0",
              borderBottom: i < stages.length - 1 ? `1px solid ${T.border}` : "none",
            }}>
              <div style={{
                width: 22, height: 22, borderRadius: 999, flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: done ? T.secondary : active ? T.accent : T.surfaceAlt,
                color: "#FFF", border: !done && !active ? `1.5px solid ${T.border}` : "none",
              }}>
                {done ? <Icon name="check" size={12} color="#FFF" stroke={2.5} /> : active ? <span style={{ width: 6, height: 6, borderRadius: 999, background: "#FFF", animation: "pulse 1.2s ease infinite" }} /> : null}
              </div>
              <span style={{ flex: 1, fontSize: 13, color: done ? T.ink : active ? T.ink : T.inkLight, fontFamily: F.body, fontWeight: done || active ? 500 : 400 }}>
                {s.label}
              </span>
              {done && <span style={{ fontSize: 10, color: T.secondary, fontFamily: F.mono }}>✓</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Metadata step ────────────────────────────────────── */
function MetadataStep({ lang, meta, setMeta, onSave }) {
  const { T, F } = useTheme();
  const colors = ["#8B6B47", "#B8440A", "#3E6B5F", "#4D5E7E", "#6A4566", "#5C6B33", "#7A4F6D"];

  const Field = ({ label, value, onChange, mono }) => (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: T.inkLight, letterSpacing: 1.2, textTransform: "uppercase", fontFamily: F.body, marginBottom: 6 }}>{label}</div>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          width: "100%", padding: "11px 13px", borderRadius: 10,
          border: `1.5px solid ${T.border}`, background: T.surface,
          fontSize: 14, color: T.ink, fontFamily: mono ? F.mono : F.body, outline: "none",
        }}
      />
    </div>
  );

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "20px 22px 28px" }}>
      {/* AI extracted banner */}
      <div style={{ background: T.accentSoft, borderRadius: 10, padding: "9px 12px", display: "flex", alignItems: "center", gap: 8, marginBottom: 18 }}>
        <Icon name="spark" size={13} color={T.accent} />
        <span style={{ fontSize: 11.5, color: T.accentDeep, fontFamily: F.body }}>
          {lang === "ko" ? "Gemini가 추출한 정보입니다. 필요시 수정하세요." : "Extracted by Gemini. Edit if needed."}
        </span>
      </div>

      {/* Cover preview */}
      <div style={{ display: "flex", gap: 16, marginBottom: 18, alignItems: "flex-start" }}>
        <BookCover book={{
          title: meta.title || (lang === "ko" ? "제목" : "Title"),
          titleEn: meta.titleEn || meta.title || "Title",
          author: meta.author || (lang === "ko" ? "저자" : "Author"),
          authorEn: meta.author || "Author",
          cover: meta.coverColor,
          spine: meta.coverColor,
        }} size={92} lang={lang} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: T.inkLight, letterSpacing: 1.2, textTransform: "uppercase", fontFamily: F.body, marginBottom: 8 }}>
            {lang === "ko" ? "표지 색상" : "Cover color"}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {colors.map(c => (
              <button key={c} onClick={() => setMeta(m => ({ ...m, coverColor: c }))} style={{
                width: 28, height: 28, borderRadius: 7, background: c, border: meta.coverColor === c ? `2.5px solid ${T.ink}` : `2px solid ${T.border}`,
                cursor: "pointer", padding: 0, transition: "border .15s",
              }} />
            ))}
          </div>
        </div>
      </div>

      <Field label={lang === "ko" ? "제목" : "Title"} value={meta.title} onChange={v => setMeta(m => ({ ...m, title: v }))} />
      <Field label={lang === "ko" ? "원제 (선택)" : "Original title (optional)"} value={meta.titleEn} onChange={v => setMeta(m => ({ ...m, titleEn: v }))} />
      <Field label={lang === "ko" ? "저자" : "Author"} value={meta.author} onChange={v => setMeta(m => ({ ...m, author: v }))} />
      <Field label={lang === "ko" ? "출간년도" : "Year"} value={meta.year} onChange={v => setMeta(m => ({ ...m, year: v }))} mono />

      <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
        <Button variant="ghost" style={{ flex: 1 }}>
          {lang === "ko" ? "초안 저장" : "Save draft"}
        </Button>
        <Button variant="accent" onClick={onSave} style={{ flex: 1.6 }}>
          <Icon name="cloud" size={14} color="#FFF" /> {lang === "ko" ? "서재에 저장" : "Save to Library"}
        </Button>
      </div>
    </div>
  );
}

/* ── Done step ────────────────────────────────────────── */
function DoneStep({ lang, meta, onLibrary }) {
  const { T, F } = useTheme();
  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "28px 24px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 18, textAlign: "center" }}>
      <div style={{ position: "relative" }}>
        <BookCover book={{
          title: meta.title,
          titleEn: meta.titleEn || meta.title,
          author: meta.author,
          authorEn: meta.author,
          cover: meta.coverColor,
          spine: meta.coverColor,
        }} size={130} lang={lang} />
        <div style={{ position: "absolute", bottom: -10, right: -14, width: 38, height: 38, borderRadius: 999, background: T.secondary, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 8px 20px ${T.secondary}55` }}>
          <Icon name="check" size={20} color="#FFF" stroke={2.5} />
        </div>
      </div>

      <div>
        <div style={{ fontSize: 10, fontWeight: 700, color: T.secondary, letterSpacing: 1.6, textTransform: "uppercase", fontFamily: F.body, marginBottom: 6 }}>
          {lang === "ko" ? "서재에 추가됨" : "Added to library"}
        </div>
        <div style={{ fontSize: 22, fontWeight: 600, color: T.ink, fontFamily: F.display, letterSpacing: -0.5, lineHeight: 1.2, marginBottom: 6 }}>
          {meta.title}
        </div>
        <div style={{ fontSize: 13, color: T.inkLight, fontFamily: F.body }}>
          {meta.author} {meta.year && `· ${meta.year}`}
        </div>
      </div>

      <div style={{ background: T.surface, borderRadius: 14, padding: 14, width: "100%", border: `1px solid ${T.border}` }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: T.inkLight, letterSpacing: 1.2, textTransform: "uppercase", fontFamily: F.body, marginBottom: 8 }}>
          {lang === "ko" ? "Drive에 저장됨" : "Saved to Drive"}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: T.ink, fontFamily: F.mono }}>
          <Icon name="folder" size={13} color={T.accent} />
          MyLibrary/books/<span style={{ color: T.accent, fontWeight: 600 }}>{(meta.titleEn || meta.title).replace(/\s+/g, "_")}.pdf</span>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, width: "100%" }}>
        <Button variant="ghost" style={{ flex: 1 }}>
          {lang === "ko" ? "다른 책 추가" : "Add another"}
        </Button>
        <Button variant="accent" onClick={onLibrary} style={{ flex: 1.4 }}>
          {lang === "ko" ? "지금 읽기" : "Start reading"} <Icon name="play" size={12} color="#FFF" />
        </Button>
      </div>
    </div>
  );
}

