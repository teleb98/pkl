import { useState, useEffect } from 'react';
import { useTheme } from '../context.jsx';
import {
  computeLocalHealthInterest, fetchCookingHealthSignal, fetchWwwHealthSignal, combineHealthSignals,
} from '../utils/lifestyleSignal.js';

/* ── 라이프스타일 인사이트 — 건강 지향 축 ─────────────────────────
   서재(로컬)·부엌·서점의 건강 지향 신호를 종합해 보여준다. 모바일/데스크톱
   양쪽에서 재사용(BookCompare/MonthlyRetro와 동일 패턴). 마운트 시 1회 계산하고,
   결과를 onSignal 콜백으로 부모에 전달해 "다음 읽을 책 추천" 가중치로 재사용한다.
   신호가 전혀 없으면(label='none') 아무것도 렌더링하지 않는다(조용히 사라짐). */
const SOURCE_LABEL = { pkl: '서재', cooking: '부엌', www: '서점' };
const LABEL_KO = { high: '뚜렷함', medium: '보통', low: '약함' };
const LABEL_EN = { high: 'Strong', medium: 'Moderate', low: 'Slight' };

export function LifestyleInsight({ lang, onSignal }) {
  const { T, F } = useTheme();
  const [combined, setCombined] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const pkl = computeLocalHealthInterest();
      const [cooking, www] = await Promise.all([fetchCookingHealthSignal(), fetchWwwHealthSignal()]);
      const result = combineHealthSignals({
        pkl: pkl.label !== 'none' ? pkl : null,
        cooking, www,
      });
      if (cancelled) return;
      setCombined(result);
      setLoading(false);
      onSignal?.(result);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading || !combined || combined.label === 'none') return null;

  const labelMap = lang === 'ko' ? LABEL_KO : LABEL_EN;
  return (
    <div style={{ background: T.accentSoft, borderRadius: 14, padding: '12px 14px', marginBottom: 14, width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: T.accentDeep, fontFamily: F.body }}>
          💡 {lang === 'ko' ? '라이프스타일 인사이트 · 건강 지향' : 'Lifestyle Insight · Health'}
        </span>
        <span style={{ fontSize: 10, fontWeight: 700, color: T.accent, fontFamily: F.body }}>
          {labelMap[combined.label] || combined.label}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {combined.sources.map(s => (
          <span
            key={s.key}
            style={{ fontSize: 10.5, color: T.inkMid, background: T.surface, padding: '3px 8px', borderRadius: 999, fontFamily: F.body }}
          >
            {SOURCE_LABEL[s.key] || s.key} {s.score}%
          </span>
        ))}
      </div>
    </div>
  );
}
