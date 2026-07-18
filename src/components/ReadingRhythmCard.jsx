import { useMemo } from 'react';
import { useTheme } from '../context.jsx';
import { getSessions } from '../store.js';
import { computeReadingRhythm, slotLabel, styleLabel } from '../utils/readingRhythm.js';

/* ── 독서 리듬 카드 — 서재 세션 데이터로 "언제·어떻게 읽는가"를 보여주고,
   주 독서 시간대에 맞춰 알림 시각을 원터치로 맞춘다(모바일/데스크톱 공용).
   세션이 충분치 않으면(리듬 판단 불가) 아무것도 렌더링하지 않는다.
   props: currentTime(현재 알림 시각 'HH:MM'), onApplyTime(time)=>void */
export function ReadingRhythmCard({ lang, currentTime, onApplyTime }) {
  const { T, F } = useTheme();
  const rhythm = useMemo(() => computeReadingRhythm(getSessions()), []);
  if (!rhythm.enough) return null;

  const ko = lang === 'ko';
  const canSuggest = rhythm.suggestedTime && rhythm.suggestedTime !== currentTime;

  return (
    <div style={{ background: T.accentSoft, borderRadius: 14, padding: '12px 14px', marginBottom: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: T.accentDeep, fontFamily: F.body, marginBottom: 8 }}>
        ⏰ {ko ? '독서 리듬' : 'Reading Rhythm'}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: canSuggest ? 10 : 0 }}>
        <span style={{ fontSize: 11, color: T.inkMid, background: T.surface, padding: '4px 9px', borderRadius: 999, fontFamily: F.body }}>
          {ko ? `주로 ${slotLabel(rhythm.dominantSlot, lang)}에` : `Mostly in the ${slotLabel(rhythm.dominantSlot, lang).toLowerCase()}`}
        </span>
        {rhythm.style && (
          <span style={{ fontSize: 11, color: T.inkMid, background: T.surface, padding: '4px 9px', borderRadius: 999, fontFamily: F.body }}>
            {styleLabel(rhythm.style, lang)} · {rhythm.avgMinutes}{ko ? '분' : 'min'}
          </span>
        )}
        {rhythm.weekendBias === 'weekend' && (
          <span style={{ fontSize: 11, color: T.inkMid, background: T.surface, padding: '4px 9px', borderRadius: 999, fontFamily: F.body }}>
            {ko ? '주말형' : 'Weekend reader'}
          </span>
        )}
        {rhythm.weekendBias === 'weekday' && (
          <span style={{ fontSize: 11, color: T.inkMid, background: T.surface, padding: '4px 9px', borderRadius: 999, fontFamily: F.body }}>
            {ko ? '평일형' : 'Weekday reader'}
          </span>
        )}
      </div>
      {canSuggest && (
        <button
          onClick={() => onApplyTime(rhythm.suggestedTime)}
          style={{ fontSize: 11.5, fontWeight: 600, color: T.accent, background: T.surface, border: `1px solid ${T.accent}55`, borderRadius: 9, padding: '7px 11px', cursor: 'pointer', fontFamily: F.body }}
        >
          🔔 {ko ? `${rhythm.suggestedTime}에 알림 맞추기` : `Set reminder to ${rhythm.suggestedTime}`}
        </button>
      )}
    </div>
  );
}
