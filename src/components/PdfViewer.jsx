import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { getDocument, GlobalWorkerOptions, TextLayer } from 'pdfjs-dist/build/pdf.min.mjs';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { useTheme } from '../context.jsx';
import { setPageText, setViewedPage, setPageImage, setOutline, hasPageText } from '../pageTextCache.js';
import { getCachedPdf, cachePdf, downloadWithProgress } from '../utils/pdfCache.js';
import { reloadLocalBookFromPath } from '../utils/localBooks.js';
import { callAI } from '../aiClient.js';
import { createOcr } from '../utils/ocr/index.js';

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

function captureCanvas(canvas) {
  if (!canvas) return null;
  try {
    const MAX_W = 1200;
    let src = canvas;
    if (canvas.width > MAX_W) {
      const ratio = MAX_W / canvas.width;
      const tmp = document.createElement('canvas');
      tmp.width = MAX_W;
      tmp.height = Math.round(canvas.height * ratio);
      tmp.getContext('2d').drawImage(canvas, 0, 0, tmp.width, tmp.height);
      src = tmp;
    }
    const b64 = src.toDataURL('image/jpeg', 0.75).split(',')[1];
    return b64 || null;
  } catch { return null; }
}
export { captureCanvas as _captureCanvas };

function getDriveToken() {
  try {
    const cfg = JSON.parse(localStorage.getItem('pkl_config') || 'null');
    const token = cfg?.driveAccessToken || cfg?.googleUser?.accessToken;
    if (!token) return null;

    // 토큰 만료 확인
    const expiresAt = cfg?.driveTokenExpiresAt;
    if (expiresAt && Date.now() > expiresAt) {
      // 토큰이 만료됨 — API 호출 실패하므로 auth 에러가 발생할 것
      return null;
    }

    return token;
  } catch { return null; }
}

const TEXT_LAYER_CSS = `
.pdfTextLayer {
  position: absolute;
  inset: 0;
  overflow: hidden;
  line-height: 1;
  text-size-adjust: none;
  forced-color-adjust: none;
  transform-origin: 0 0;
  caret-color: canvastext;
  pointer-events: auto;
}
.pdfTextLayer span {
  color: transparent;
  position: absolute;
  white-space: pre;
  cursor: text;
  transform-origin: 0% 0%;
  user-select: text;
  -webkit-user-select: text;
}
.pdfTextLayer .endOfContent {
  display: block;
  position: absolute;
  inset: 100% 0 0;
  z-index: -1;
  cursor: default;
  user-select: none;
}
.pdfTextLayer ::selection {
  background: rgba(0, 0, 255, 0.25);
  color: transparent;
}
`;

/* Controlled PDF viewer — page prop is owned by parent.
   Callbacks: onTotalPages, onPageText, onPageChange(delta)
   Interactions: mouse wheel (debounced), touch swipe left/right */
const VIEWER_BG   = { white: '#555',    sepia: '#8b7355', dark: '#0f0f1e' };
const CANVAS_FILTER = { white: 'none', sepia: 'sepia(0.45) brightness(0.94)', dark: 'invert(1) hue-rotate(180deg) brightness(0.82)' };

// 설정(pkl_config.ocrMode)에서 OCR 모드 읽기 — prop 미지정 시 fallback
function readOcrMode() {
  try { return JSON.parse(localStorage.getItem('pkl_config') || '{}').ocrMode || 'auto'; }
  catch { return 'auto'; }
}

export const PdfViewer = forwardRef(function PdfViewer({ fileId, source = 'drive', book, page, onTotalPages, onPageText, onPageChange, zoom = 1, bg = 'white', lang, apiKeys, ocrMode, annotations = [], onAnnotationAdd }, ref) {
  const { T, F } = useTheme();
  const containerRef   = useRef(null);  // outer scrollable div — used for sizing & events
  const canvasRef      = useRef(null);
  const textLayerRef   = useRef(null);
  const annotCanvasRef = useRef(null); // 형광펜 오버레이
  const pdfRef          = useRef(null);
  const renderRef       = useRef(null);
  const textRenderRef   = useRef(null);
  const renderedRef     = useRef(0);
  const prevPageRef     = useRef(0);    // 이전 렌더 페이지 (방향 감지용)
  const changingPageRef = useRef(false); // 페이지 전환 중 휠/터치 중복 방지
  const [status, setStatus]     = useState('loading'); // loading | downloading | ready | error
  const [progress, setProgress] = useState(0);
  const [fromCache, setFromCache] = useState(false);
  const [errMsg, setErrMsg]     = useState('');
  const [hlColor, setHlColor]   = useState('#FFD54F');
  const [hlPopup, setHlPopup]   = useState(null); // { x, y, rects, text }
  const pageScaleRef = useRef(1); // 현재 렌더 scale, 좌표 변환용

  // 오프스크린 캔버스에서 한 페이지를 렌더링해 JPEG base64 반환
  const renderPageToImage = async (pdfPage) => {
    try {
      const vp = pdfPage.getViewport({ scale: 1.5 }); // 충분한 해상도
      const canvas = document.createElement('canvas');
      canvas.width = vp.width;
      canvas.height = vp.height;
      await pdfPage.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
      return canvas.toDataURL('image/jpeg', 0.8).split(',')[1] || null;
    } catch { return null; }
  };

  // 부모(어휘/퀴즈 생성)가 특정 페이지 범위 텍스트를 즉석 추출하도록 노출
  // 텍스트 레이어 없는 이미지 PDF는 AI Vision OCR로 폴백
  useImperativeHandle(ref, () => ({
    async ensureRange(startPage, endPage, onProgress) {
      const pdf = pdfRef.current;
      if (!pdf) return { extracted: 0, ocr: 0 };
      const first = Math.max(1, startPage || 1);
      const last = endPage == null ? pdf.numPages : Math.min(endPage, pdf.numPages);
      const MAX_PAGES = 60;
      const MAX_OCR = 20; // OCR은 비용이 있으므로 최대 20페이지
      let extracted = 0, ocrCount = 0;
      const needsOcr = []; // 텍스트 없는 페이지 모음

      // 1단계: 텍스트 레이어 추출 시도
      for (let i = first; i <= last; i++) {
        if (extracted + ocrCount >= MAX_PAGES) break;
        if (hasPageText(fileId, i)) { extracted++; continue; }
        try {
          const p = await pdf.getPage(i);
          const tc = await p.getTextContent();
          const text = tc.items.map(it => it.str).join(' ').replace(/\s+/g, ' ').trim();
          if (text) { setPageText(fileId, i, text); extracted++; }
          else needsOcr.push({ pageNum: i, pdfPage: p });
        } catch { /* skip */ }
      }

      // 2단계: 텍스트 없는 페이지 → OCR provider 체인
      //   ocrMode: 'auto'(로컬→클라우드) | 'local'(Tesseract/Ollama만) | 'cloud'(기존)
      if (needsOcr.length) {
        let _cur = { pageNum: first, done: 0 };
        // 엔진 내부 진행(모델 로드/인식 %)을 페이지 진행과 함께 상위로 전달
        const ocr = await createOcr({
          mode: ocrMode || readOcrMode(), apiKeys, lang, callAI,
          onProgress: ({ engine, pct }) => onProgress?.({ ...
            _cur, total: needsOcr.length, engine, enginePct: pct }),
        });
        for (const { pageNum, pdfPage } of needsOcr) {
          if (ocrCount >= MAX_OCR) break;
          try {
            _cur = { pageNum, done: ocrCount };
            onProgress?.({ pageNum, total: needsOcr.length, done: ocrCount });
            const imgBase64 = await renderPageToImage(pdfPage);
            if (!imgBase64) continue;
            const text = await ocr(imgBase64);
            if (text?.trim()) { setPageText(fileId, pageNum, text.trim()); ocrCount++; }
          } catch { /* 해당 페이지 건너뜀 */ }
        }
      }

      return { extracted, ocr: ocrCount };
    },
  }), [fileId, apiKeys, lang, ocrMode]); // eslint-disable-line

  const ko = lang === 'ko';

  // ── 형광펜 주석 오버레이 그리기 ──────────────────────────────
  useEffect(() => {
    const ac = annotCanvasRef.current;
    const pc = canvasRef.current;
    if (!ac || !pc) return;
    ac.width = pc.width;
    ac.height = pc.height;
    const ctx = ac.getContext('2d');
    if (!ctx) return;
    const pageAnnotations = annotations.filter(a => a.pageNum === page);
    pageAnnotations.forEach(({ rects, color }) => {
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = color || '#FFD54F';
      rects.forEach(({ x, y, w, h }) => ctx.fillRect(x, y, w, h));
    });
    ctx.globalAlpha = 1;
  }, [annotations, page, status]); // eslint-disable-line

  // 텍스트 선택 → 형광펜 팝업
  useEffect(() => {
    const container = containerRef.current;
    if (!container || status !== 'ready') return;
    const onMouseUp = (e) => {
      const sel = window.getSelection();
      const text = sel?.toString().trim();
      if (!text || !annotCanvasRef.current) return;
      const range = sel.getRangeAt(0);
      const clientRects = Array.from(range.getClientRects());
      const canvasRect = annotCanvasRef.current.getBoundingClientRect();
      const scaleX = annotCanvasRef.current.width / canvasRect.width;
      const scaleY = annotCanvasRef.current.height / canvasRect.height;
      const rects = clientRects.map(r => ({
        x: (r.left - canvasRect.left) * scaleX,
        y: (r.top - canvasRect.top) * scaleY,
        w: r.width * scaleX,
        h: r.height * scaleY,
      })).filter(r => r.w > 0 && r.h > 0);
      if (!rects.length) return;
      const last = clientRects[clientRects.length - 1];
      setHlPopup({ x: e.clientX, y: last.bottom + window.scrollY, rects, text });
    };
    container.addEventListener('mouseup', onMouseUp);
    return () => container.removeEventListener('mouseup', onMouseUp);
  }, [status]);

  // ── Load PDF (캐시 우선 → 없으면 Drive 다운로드 후 캐시 저장) ───
  useEffect(() => {
    let cancelled = false;
    let loadingTask = null;

    pdfRef.current?.destroy();
    pdfRef.current = null;
    renderedRef.current = 0;
    setStatus('loading');
    setProgress(0);
    setFromCache(false);
    setErrMsg('');

    // 로컬 파일은 Drive 토큰 불필요 — 캐시(IndexedDB)에만 있음
    const isLocal = source === 'local';
    const token = isLocal ? null : getDriveToken();
    if (!isLocal && !token) { setErrMsg('auth'); setStatus('error'); return; }

    async function loadPdf() {
      try {
        // 1. IndexedDB 캐시 확인 (Drive 캐시 + 로컬 파일 모두 여기)
        let arrayBuffer = await getCachedPdf(fileId);

        if (arrayBuffer) {
          // 캐시 히트 — 즉시 로드
          setFromCache(true);
        } else if (isLocal) {
          // Electron: filePath 가 있으면 자동 재로딩 시도
          if (book?.filePath) {
            const ok = await reloadLocalBookFromPath(book);
            if (ok) {
              arrayBuffer = await getCachedPdf(fileId);
            }
          }
          if (!arrayBuffer) {
            setErrMsg('local-missing');
            setStatus('error');
            return;
          }
          setFromCache(true);
        } else {
          // 캐시 미스 (Drive) — 다운로드 후 캐시 저장
          setStatus('downloading');
          arrayBuffer = await downloadWithProgress(fileId, token, (pct) => {
            if (!cancelled) setProgress(pct);
          });
          if (cancelled) return;
          // 백그라운드에서 캐시 저장 (로딩 차단 안 함)
          cachePdf(fileId, arrayBuffer);
        }

        if (cancelled) return;

        loadingTask = getDocument({ data: arrayBuffer, rangeChunkSize: 65536 });
        setStatus('loading');

        const pdf = await loadingTask.promise;
        if (cancelled) { pdf.destroy(); return; }

        pdfRef.current = pdf;
        onTotalPages?.(pdf.numPages);
        setStatus('ready');

        // PDF 목차 추출 (챕터 범위 선택용)
        (async () => {
          try {
            const outline = await pdf.getOutline();
            if (!outline?.length) { setOutline(fileId, null); return; }
            const chapters = [];
            for (const item of outline) {
              try {
                let dest = item.dest;
                if (typeof dest === 'string') dest = await pdf.getDestination(dest);
                const ref = Array.isArray(dest) ? dest[0] : null;
                if (!ref) continue;
                const pageIndex = await pdf.getPageIndex(ref);
                if (item.title?.trim()) chapters.push({ title: item.title.trim(), page: pageIndex + 1 });
              } catch { /* skip */ }
            }
            chapters.sort((a, b) => a.page - b.page);
            setOutline(fileId, chapters.length ? chapters : null);
          } catch { setOutline(fileId, null); }
        })();

        // 백그라운드 텍스트 추출 (최대 50페이지)
        const limit = Math.min(pdf.numPages, 50);
        for (let i = 1; i <= limit; i++) {
          if (cancelled) break;
          try {
            const p = await pdf.getPage(i);
            const tc = await p.getTextContent();
            const text = tc.items.map(it => it.str).join(' ').replace(/\s+/g, ' ').trim();
            if (text) setPageText(fileId, i, text);
          } catch { /* skip */ }
        }
      } catch (e) {
        if (cancelled) return;
        if (e.message === 'auth' || (e?.name === 'ResponseException' && (e.status === 401 || e.status === 403))) {
          setErrMsg('auth');
        } else if (e?.name !== 'AbortException') {
          setErrMsg(e.message?.slice(0, 80) || 'network error');
        }
        setStatus('error');
      }
    }

    loadPdf();

    return () => { cancelled = true; loadingTask?.destroy(); };
  }, [fileId]); // eslint-disable-line

  // ── Render page + TextLayer ───────────────────────────────────
  useEffect(() => {
    const pdf = pdfRef.current;
    const canvas = canvasRef.current;
    if (!pdf || status !== 'ready' || !canvas) return;

    const pageNum = Math.max(1, Math.min(page || 1, pdf.numPages));
    // Rerender when zoom changes even if pageNum is the same
    if (renderedRef.current === pageNum && renderedRef._zoom === zoom) return;
    renderedRef._zoom = zoom;

    async function render() {
      if (renderRef.current) { renderRef.current.cancel(); renderRef.current = null; }
      textRenderRef.current?.cancel();
      textRenderRef.current = null;

      try {
        const pdfPage = await pdf.getPage(pageNum);
        if (!canvasRef.current) return;

        const containerW = (containerRef.current?.clientWidth || 820) - 24;
        const vp = pdfPage.getViewport({ scale: 1 });
        const scale = Math.min(3, containerW / vp.width) * (zoom || 1);
        const scaled = pdfPage.getViewport({ scale });

        canvasRef.current.width  = scaled.width;
        canvasRef.current.height = scaled.height;

        if (textLayerRef.current) {
          textLayerRef.current.style.width  = `${scaled.width}px`;
          textLayerRef.current.style.height = `${scaled.height}px`;
          textLayerRef.current.replaceChildren();
        }

        const task = pdfPage.render({
          canvasContext: canvasRef.current.getContext('2d'),
          viewport: scaled,
        });
        renderRef.current = task;
        await task.promise;

        // ── 페이지 전환 방향 감지 → 스크롤 위치 설정 ──
        const prevPage = prevPageRef.current;
        if (prevPage !== 0 && prevPage !== pageNum && containerRef.current) {
          const goingForward = pageNum > prevPage;
          if (goingForward) {
            containerRef.current.scrollTop = 0;
          } else {
            containerRef.current.scrollTop = containerRef.current.scrollHeight;
          }
        }
        prevPageRef.current = pageNum;
        renderedRef.current = pageNum;
        pageScaleRef.current = scale;

        // ── 렌더 완료 후 1초간 휠/터치 차단 (호흡) ──
        if (changingPageRef.current) {
          setTimeout(() => { changingPageRef.current = false; }, 1000);
        }

        if (textLayerRef.current && TextLayer) {
          const tl = new TextLayer({
            textContentSource: pdfPage.streamTextContent(),
            container: textLayerRef.current,
            viewport: scaled,
          });
          textRenderRef.current = tl;
          await tl.render();
        }

        pdfPage.getTextContent().then(tc => {
          const text = tc.items.map(i => i.str).join(' ').replace(/\s+/g, ' ').trim();
          setViewedPage(fileId, pageNum, text || null);
          if (text) {
            onPageText?.(pageNum, text, null);
          } else {
            const imageBase64 = captureCanvas(canvasRef.current);
            if (imageBase64) setPageImage(fileId, pageNum, imageBase64);
            onPageText?.(pageNum, null, imageBase64);
          }
        }).catch(() => {
          setViewedPage(fileId, pageNum, null);
          onPageText?.(pageNum, null, null);
        });

      } catch (e) {
        if (e?.name !== 'RenderingCancelledException') console.warn('PdfViewer render', e);
      }
    }

    render();
  }, [page, status, zoom]); // eslint-disable-line

  // ── Mouse wheel → 스크롤 끝에서 페이지 전환 (PC) ───────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el || status !== 'ready') return;

    const onWheel = (e) => {
      // 이전 페이지 전환이 렌더 완료되기 전이면 차단
      if (changingPageRef.current) { e.preventDefault(); return; }

      const { scrollTop, scrollHeight, clientHeight } = el;
      const atTop    = scrollTop <= 1;
      const atBottom = scrollTop + clientHeight >= scrollHeight - 1;

      if (e.deltaY > 0 && atBottom) {
        e.preventDefault();
        changingPageRef.current = true;
        onPageChange?.(+1);
      } else if (e.deltaY < 0 && atTop) {
        e.preventDefault();
        changingPageRef.current = true;
        onPageChange?.(-1);
      }
      // 그 외: 페이지 내 자연스러운 스크롤 유지
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [status, onPageChange]);

  // ── Touch → 가로 스와이프 + 세로 경계 스크롤 페이지 전환 (모바일) ──
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let startX = 0, startY = 0, startScrollTop = 0;

    const onTouchStart = (e) => {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      startScrollTop = el.scrollTop;
    };

    const onTouchMove = (e) => {
      const dx = e.touches[0].clientX - startX;
      const dy = e.touches[0].clientY - startY;
      const fromEdge = startX < 30 || startX > window.innerWidth - 30;
      // 명확한 가로 스와이프면 브라우저 뒤로가기 방지
      if (!fromEdge && Math.abs(dx) > 15 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        e.preventDefault();
      }
    };

    const onTouchEnd = (e) => {
      // 페이지 전환 중(렌더 중 + 2초 호흡) — 모든 입력 차단
      if (changingPageRef.current) return;

      const dx = e.changedTouches[0].clientX - startX;
      const dy = e.changedTouches[0].clientY - startY; // +: 손가락 아래, -: 손가락 위
      const fromEdge = startX < 30 || startX > window.innerWidth - 30;

      // 가로 스와이프 (좌우 페이지 전환)
      if (!fromEdge && Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        changingPageRef.current = true;
        onPageChange?.(dx < 0 ? +1 : -1);
        return;
      }

      // 세로 스크롤 경계 감지
      const { scrollTop, scrollHeight, clientHeight } = el;
      const atBottom = scrollTop + clientHeight >= scrollHeight - 2;
      const atTop    = scrollTop <= 2;
      const MIN_V    = 80;

      if (dy < -MIN_V && atBottom && Math.abs(dy) > Math.abs(dx)) {
        changingPageRef.current = true;
        onPageChange?.(+1);
      } else if (dy > MIN_V && atTop && Math.abs(dy) > Math.abs(dx)) {
        changingPageRef.current = true;
        onPageChange?.(-1);
      }
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove',  onTouchMove,  { passive: false });
    el.addEventListener('touchend',   onTouchEnd,   { passive: true });

    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove',  onTouchMove);
      el.removeEventListener('touchend',   onTouchEnd);
    };
  }, [onPageChange, status]); // eslint-disable-line

  // ── Cleanup ───────────────────────────────────────────────────
  useEffect(() => () => {
    pdfRef.current?.destroy();
    pdfRef.current = null;
  }, []);

  // ── Loading / Downloading ─────────────────────────────────────
  if (status === 'loading' || status === 'downloading') {
    const isDownloading = status === 'downloading';
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 14, background: T.surfaceAlt }}>
        <div style={{ fontSize: 13, color: T.inkMid, fontFamily: F.body }}>
          {isDownloading
            ? (ko ? '☁️ Drive에서 다운로드 중…' : '☁️ Downloading from Drive…')
            : (ko ? 'PDF 불러오는 중…' : 'Loading PDF…')}
        </div>
        <div style={{ width: 200 }}>
          <div style={{ height: 4, background: T.border, borderRadius: 2, overflow: 'hidden' }}>
            {(isDownloading && progress > 0)
              ? <div style={{ height: '100%', width: `${progress}%`, background: T.accent, borderRadius: 2, transition: 'width .2s' }} />
              : <div style={{ height: '100%', width: '35%', background: T.accent, borderRadius: 2, animation: 'pdfswp 1.4s ease-in-out infinite' }} />}
          </div>
          {isDownloading && progress > 0 && (
            <div style={{ fontSize: 10, color: T.inkLight, fontFamily: F.mono, textAlign: 'center', marginTop: 4 }}>{progress}%</div>
          )}
          {isDownloading && (
            <div style={{ fontSize: 10, color: T.inkLight, fontFamily: F.body, textAlign: 'center', marginTop: 6 }}>
              {ko ? '다음 열기부터는 즉시 로드됩니다' : 'Next time it will load instantly'}
            </div>
          )}
        </div>
        <style>{`@keyframes pdfswp{0%{transform:translateX(-170%)}100%{transform:translateX(390%)}}`}</style>
      </div>
    );
  }

  // ── Error ─────────────────────────────────────────────────────
  if (status === 'error') {
    const errText = errMsg === 'auth'
      ? (ko ? 'Google Drive 인증이 만료되었습니다.\n설정에서 다시 연결해 주세요.' : 'Google Drive auth expired.\nPlease reconnect in Settings.')
      : errMsg === 'local-missing'
      ? (ko ? '로컬 파일을 찾을 수 없습니다.\n서재에서 파일을 다시 추가해 주세요.' : 'Local file not found in cache.\nPlease re-add the file from the Library.')
      : errMsg === 'network error'
      ? (ko ? 'PDF를 다운로드할 수 없습니다.\n인터넷 연결을 확인하거나 설정에서 Drive를 다시 연결해주세요.' : 'Cannot download PDF.\nCheck your internet connection or reconnect Google Drive in Settings.')
      : (ko ? `PDF 로드 실패: ${errMsg}` : `Failed to load PDF: ${errMsg}`);

    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 10, padding: 32, textAlign: 'center', background: T.surfaceAlt }}>
        <div style={{ fontSize: 13, color: T.inkMid, fontFamily: F.body, lineHeight: 1.7, maxWidth: 320, whiteSpace: 'pre-line' }}>
          {errText}
        </div>
        {errMsg !== 'auth' && errMsg !== 'local-missing' && (
          <div style={{ fontSize: 11, color: T.inkLight, fontFamily: F.mono, marginTop: 8, padding: '8px 12px', background: T.surface, borderRadius: 8, maxWidth: '100%', wordBreak: 'break-all' }}>
            {errMsg}
          </div>
        )}
      </div>
    );
  }

  // ── Canvas + TextLayer ────────────────────────────────────────
  const HL_COLORS = ['#FFD54F', '#A5D6A7', '#90CAF9', '#F48FB1', '#CE93D8'];

  return (
    <div
      ref={containerRef}
      style={{ flex: 1, overflow: 'auto', background: VIEWER_BG[bg] || '#555', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '12px 8px', transition: 'background .3s', position: 'relative' }}
    >
      <style>{TEXT_LAYER_CSS}</style>
      {/* 캐시 배지 — 캐시에서 로드된 경우 잠깐 표시 */}
      {fromCache && (
        <div style={{
          position: 'absolute', top: 10, right: 10, zIndex: 10,
          background: 'rgba(34,197,94,.85)', color: '#fff',
          fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 99,
          pointerEvents: 'none',
          animation: 'fadeout 2s 1.5s forwards',
        }}>
          {ko ? '⚡ 캐시' : '⚡ Cached'}
        </div>
      )}
      <style>{`@keyframes fadeout{to{opacity:0}}`}</style>
      <div style={{ position: 'relative', display: 'inline-block', boxShadow: '0 2px 20px rgba(0,0,0,.5)', flexShrink: 0 }}>
        <canvas ref={canvasRef} style={{ display: 'block', filter: CANVAS_FILTER[bg] || 'none', transition: 'filter .3s' }} />
        {/* 형광펜 오버레이 캔버스 */}
        <canvas
          ref={annotCanvasRef}
          style={{ position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 1 }}
        />
        <div ref={textLayerRef} className="pdfTextLayer" />
      </div>

      {/* 형광펜 팝업 */}
      {hlPopup && onAnnotationAdd && (
        <div
          onClick={e => e.stopPropagation()}
          style={{
            position: 'fixed',
            left: Math.min(hlPopup.x, window.innerWidth - 180),
            top: hlPopup.y + 4,
            zIndex: 500,
            background: '#1a1a2e',
            borderRadius: 10,
            padding: '8px 10px',
            display: 'flex', alignItems: 'center', gap: 6,
            boxShadow: '0 4px 20px rgba(0,0,0,.5)',
          }}
        >
          {HL_COLORS.map(c => (
            <button
              key={c}
              onClick={() => setHlColor(c)}
              style={{
                width: 18, height: 18, borderRadius: '50%', background: c, border: hlColor === c ? '2px solid #fff' : '2px solid transparent',
                cursor: 'pointer', padding: 0, flexShrink: 0,
              }}
            />
          ))}
          <button
            onClick={() => {
              onAnnotationAdd({ pageNum: page, rects: hlPopup.rects, color: hlColor, text: hlPopup.text });
              window.getSelection()?.removeAllRanges();
              setHlPopup(null);
            }}
            style={{ marginLeft: 4, padding: '3px 10px', borderRadius: 6, border: 'none', background: hlColor, color: '#333', fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
          >
            {ko ? '형광펜' : 'Highlight'}
          </button>
          <button onClick={() => setHlPopup(null)} style={{ background: 'none', border: 'none', color: '#aaa', cursor: 'pointer', fontSize: 14, padding: '0 2px' }}>✕</button>
        </div>
      )}
    </div>
  );
});
