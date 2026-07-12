import { useState, useEffect, useRef } from 'react';
import { useTheme } from '../context.jsx';
import { getBookText } from '../utils/bookTextDb.js';
import { scanFullBookText } from '../utils/fullBookScan.js';

/* 책 전체 텍스트 스캔 버튼 — 상세 모달(모바일/데스크톱) 공용.
   모든 페이지의 텍스트를 추출(스캔본은 Vision OCR)해 IndexedDB에 영구 저장.
   중단/이어하기 지원, 완료되면 AI·전문 검색·어휘/퀴즈가 책 전체를 활용한다. */
export function FullScanButton({ book, lang }) {
  const { T, F } = useTheme();
  const ko = lang === 'ko';
  const [st, setSt] = useState({ status: 'idle' }); // idle|running|paused|done|error
  const stopRef = useRef(false);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    (async () => {
      const rec = await getBookText(book.id);
      if (!aliveRef.current || !rec) return;
      if (rec.done) setSt({ status: 'done', pages: rec.scannedPages });
      else if (rec.scannedPages > 0) setSt({ status: 'paused', page: rec.scannedPages, total: rec.totalPages });
    })();
    return () => { aliveRef.current = false; };
  }, [book.id]);

  const start = async () => {
    stopRef.current = false;
    setSt({ status: 'running', page: 0, total: 0 });
    try {
      const res = await scanFullBookText(book, {
        lang,
        onProgress: ({ page, total, ocr }) => {
          if (aliveRef.current) setSt({ status: 'running', page, total, ocr });
        },
        shouldStop: () => stopRef.current,
      });
      if (!aliveRef.current) return;
      if (res.done) setSt({ status: 'done', pages: res.scannedPages, ocr: res.ocrPages });
      else setSt({ status: 'paused', page: res.scannedPages, total: res.totalPages });
    } catch (e) {
      if (aliveRef.current) setSt({ status: 'error', error: e.message });
    }
  };

  const { status } = st;
  const pct = status === 'running' && st.total ? Math.round((st.page / st.total) * 100) : 0;

  if (status === 'done') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: T.secondary, background: T.secondarySoft, border: `1px solid ${T.secondary}44`, borderRadius: 10, padding: '9px 12px', fontFamily: F.body }}>
        <span>✓</span>
        <span style={{ flex: 1 }}>
          {ko ? `전체 텍스트 저장됨 · ${st.pages}p` : `Full text saved · ${st.pages}p`}
          <span style={{ opacity: 0.75 }}> — {ko ? 'AI·검색·어휘가 책 전체를 활용합니다' : 'AI, search & vocab now use the whole book'}</span>
        </span>
      </div>
    );
  }

  if (status === 'running') {
    return (
      <div style={{ border: `1px solid ${T.border}`, borderRadius: 10, padding: '9px 12px', background: T.surfaceAlt }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
          <div style={{ width: 13, height: 13, borderRadius: '50%', border: `2px solid ${T.border}`, borderTopColor: T.accent, animation: 'spin .8s linear infinite', flexShrink: 0 }} />
          <span style={{ flex: 1, fontSize: 12, color: T.ink, fontFamily: F.body }}>
            {ko ? `전체 스캔 중 ${st.page}/${st.total}p` : `Scanning ${st.page}/${st.total}p`}
            {st.ocr > 0 ? ` · ${ko ? 'Vision OCR' : 'Vision OCR'} ${st.ocr}p` : ''}
          </span>
          <button onClick={() => { stopRef.current = true; }} style={{ fontSize: 11, color: T.inkLight, background: 'none', border: `1px solid ${T.border}`, borderRadius: 6, padding: '3px 9px', cursor: 'pointer', fontFamily: F.body }}>
            {ko ? '중단' : 'Stop'}
          </button>
        </div>
        <div style={{ height: 3, background: T.border, borderRadius: 2 }}>
          <div style={{ height: '100%', width: `${pct}%`, background: T.accent, borderRadius: 2, transition: 'width .3s' }} />
        </div>
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={start}
        style={{ width: '100%', fontSize: 12.5, fontWeight: 600, color: T.accent, background: T.accentSoft, border: `1px solid ${T.accent}44`, borderRadius: 10, padding: '10px', cursor: 'pointer', fontFamily: F.body, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
      >
        🔍 {status === 'paused'
          ? (ko ? `전체 스캔 이어하기 (${st.page}/${st.total}p)` : `Resume full scan (${st.page}/${st.total}p)`)
          : (ko ? '책 전체 텍스트 스캔 (Vision)' : 'Scan full book text (Vision)')}
      </button>
      {status === 'error' && (
        <div style={{ fontSize: 11, color: '#C0392B', fontFamily: F.body, marginTop: 5, lineHeight: 1.5 }}>
          {st.error === 'pdf-not-cached'
            ? (ko ? '책을 한 번 열어 기기에 캐시된 뒤 다시 시도해주세요.' : 'Open the book once to cache it, then retry.')
            : (ko ? `스캔 실패: ${st.error}` : `Scan failed: ${st.error}`)}
        </div>
      )}
      {status === 'idle' && (
        <div style={{ fontSize: 10.5, color: T.inkFaint, fontFamily: F.body, marginTop: 5, lineHeight: 1.5 }}>
          {ko ? '모든 페이지를 인식해 기기에 저장 — AI 채팅·본문 검색·어휘/퀴즈가 책 전체를 사용하게 됩니다.' : 'Recognizes every page and stores it on-device — AI, search and vocab will use the whole book.'}
        </div>
      )}
    </div>
  );
}
