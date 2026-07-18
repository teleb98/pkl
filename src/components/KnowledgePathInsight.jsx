import { useTheme } from '../context.jsx';

/* ── 지식 성장 경로 인사이트 — 완독 책들의 흐름(핵심 관심사 + 최근 이동)을 보여주고,
   아래 추천이 "경로의 다음 단계"임을 맥락으로 제시한다(모바일/데스크톱 공용).
   경로가 약하면(enough=false) 아무것도 렌더링하지 않는다.
   props: path(getKnowledgePath 결과), lang */
export function KnowledgePathInsight({ path, lang }) {
  const { T, F } = useTheme();
  if (!path?.enough) return null;

  const ko = lang === 'ko';
  const core = path.coreTopics.slice(0, 3).map(c => c.topic);
  const emerging = path.emergingTopics.slice(0, 3);
  if (!core.length && !emerging.length) return null;

  return (
    <div style={{ background: T.accentSoft, borderRadius: 14, padding: '12px 14px', marginBottom: 12, textAlign: 'left' }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: T.accentDeep, fontFamily: F.body, marginBottom: 8 }}>
        🧭 {ko ? '지식 성장 경로' : 'Knowledge Growth Path'}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {core.length > 0 && (
          <span style={{ fontSize: 11, color: T.inkMid, background: T.surface, padding: '4px 9px', borderRadius: 999, fontFamily: F.body }}>
            {ko ? `핵심 관심사 · ${core.join(', ')}` : `Core · ${core.join(', ')}`}
          </span>
        )}
        {emerging.length > 0 && (
          <span style={{ fontSize: 11, color: T.accent, background: T.surface, padding: '4px 9px', borderRadius: 999, fontFamily: F.body }}>
            {ko ? `최근 이동 → ${emerging.join(', ')}` : `Branching → ${emerging.join(', ')}`}
          </span>
        )}
      </div>
    </div>
  );
}
