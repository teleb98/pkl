import { useEffect, useState } from 'react';
import { useTheme } from '../context.jsx';
import { discoverBridges } from '../utils/wikiBridge.js';
import { getWikiConfig } from '../store.js';

/* ── 끊어진 연결 — 의미는 가까운데 아직 링크 안 된 위키 노트 쌍을 제안한다.
   사용자가 스스로 못 본 연결을 서재가 짚어줌. 연결·벡터가 없으면 렌더 안 함.
   (사용자 위키 본체는 건드리지 않음 — 제안 + 원문 열기만) */
export function KnowledgeBridgeCard({ lang }) {
  const { T, F } = useTheme();
  const ko = lang === 'ko';
  const [bridges, setBridges] = useState([]);

  useEffect(() => {
    let alive = true;
    if (getWikiConfig().connected) {
      discoverBridges().then(res => { if (alive) setBridges(res); }).catch(() => {});
    }
    return () => { alive = false; };
  }, []);

  if (!bridges.length) return null;

  const reasonOf = (b) => {
    if (b.sharedTags.length) return `${ko ? '공유 태그' : 'shared tag'} ${b.sharedTags.slice(0, 2).map(t => `#${t}`).join(', ')}`;
    if (b.sharedLinks.length) return `${ko ? '공통 링크' : 'shared link'} ${b.sharedLinks.slice(0, 2).map(t => `[[${t}]]`).join(', ')}`;
    return ko ? '의미가 비슷함' : 'semantically similar';
  };

  return (
    <div style={{ background: T.surface, borderRadius: 14, padding: '13px 15px', border: `1px solid ${T.border}`, marginBottom: 14 }}>
      <div style={{ fontSize: 12.5, fontWeight: 700, color: T.ink, fontFamily: F.body, marginBottom: 4 }}>
        🔀 {ko ? '끊어진 연결' : 'Missing links'}
      </div>
      <div style={{ fontSize: 11.5, color: T.inkMid, fontFamily: F.body, lineHeight: 1.5, marginBottom: 10 }}>
        {ko ? '의미는 가까운데 아직 링크로 잇지 않은 노트예요. 옵시디언에서 [[링크]]로 연결해보세요.'
            : 'Notes that are close in meaning but not yet linked. Consider connecting them with [[links]] in Obsidian.'}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {bridges.map((b, i) => (
          <div key={i} style={{ background: T.accentSoft, borderRadius: 11, padding: '10px 12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', fontFamily: 'serif' }}>
              <NoteLink note={b.a} T={T} F={F} ko={ko} />
              <span style={{ color: T.inkLight, fontSize: 13, fontWeight: 700 }}>↔</span>
              <NoteLink note={b.b} T={T} F={F} ko={ko} />
            </div>
            <div style={{ marginTop: 5, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 10, color: T.inkMid, background: T.surface, padding: '2px 7px', borderRadius: 999, fontFamily: F.body }}>{reasonOf(b)}</span>
              <span style={{ fontSize: 10, color: T.inkLight, fontFamily: F.body }}>{ko ? '유사도' : 'sim'} {(b.sim * 100).toFixed(0)}%</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function NoteLink({ note, T, F, ko }) {
  const style = { fontSize: 13, fontWeight: 600, color: T.ink, textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '42%' };
  return note.webViewLink
    ? <a href={note.webViewLink} target="_blank" rel="noopener noreferrer" title={ko ? '원문 열기' : 'Open'} style={{ ...style, borderBottom: `1px solid ${T.accent}55` }}>{note.title}</a>
    : <span style={style}>{note.title}</span>;
}
