import { useState } from 'react';
import { useTheme } from '../context.jsx';
import { needsLocalCopy, ensureDriveLocalCopy } from '../utils/driveLocalCopy.js';

/* Drive 책 상세에 노출 — 이미 IndexedDB 에 캐시돼 있어(과거에 열어본 적 있어)
   PdfViewer의 자동 로컬 저장 경로를 타지 않은 책도, 여기서 명시적으로
   실제 파일로 저장할 수 있게 한다(Electron 전용). 저장되면 이후 Drive
   토큰/네트워크 없이 오프라인으로 열린다. */
export function OfflineCopyButton({ book, lang, onSaved }) {
  const { T, F } = useTheme();
  const ko = lang === 'ko';
  const [status, setStatus] = useState('idle'); // idle|running|done|error

  if (!needsLocalCopy(book)) return null;

  const start = async () => {
    setStatus('running');
    try {
      await ensureDriveLocalCopy(book);
      setStatus('done');
      onSaved?.();
    } catch {
      setStatus('error');
      setTimeout(() => setStatus('idle'), 2500);
    }
  };

  if (status === 'done') {
    return (
      <div style={{ fontSize: 11.5, color: T.secondary, background: T.secondarySoft, border: `1px solid ${T.secondary}44`, borderRadius: 10, padding: '8px 12px', fontFamily: F.body, marginBottom: 8 }}>
        ✓ {ko ? '오프라인 사본이 저장됐어요' : 'Offline copy saved'}
      </div>
    );
  }

  return (
    <button
      onClick={start}
      disabled={status === 'running'}
      style={{ width: '100%', fontSize: 11.5, fontWeight: 600, color: status === 'error' ? '#C0392B' : T.accent, background: 'none', border: `1px dashed ${status === 'error' ? '#C0392B66' : T.accent + '66'}`, borderRadius: 10, padding: '8px 10px', cursor: status === 'running' ? 'default' : 'pointer', fontFamily: F.body, marginBottom: 8, opacity: status === 'running' ? 0.7 : 1 }}
    >
      {status === 'running'
        ? (ko ? '⏳ 오프라인 사본 저장 중…' : '⏳ Saving offline copy…')
        : status === 'error'
        ? (ko ? '저장 실패 — 다시 시도' : 'Failed — tap to retry')
        : `💾 ${ko ? '오프라인 사본 만들기' : 'Save offline copy'}`}
    </button>
  );
}
