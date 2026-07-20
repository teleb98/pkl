import { useState } from 'react';
import { useTheme } from '../context.jsx';
import { PLANS, PRO_PRICE_KRW, getPlan, isOnProWaitlist } from '../utils/plan.js';

/* ── 서재 Pro 플랜 시트 — 요금제 비교 + 업그레이드 시나리오.
   결제(PG)는 연말 사업자등록 후 제공 예정이라, CTA 는 "출시 알림 신청"(대기자 등록).
   userConfig.proWaitlistAt 에 신청 시각을 저장한다. */
export function PlanSheet({ lang, userConfig, onUpdateConfig, onClose }) {
  const { T, F } = useTheme();
  const ko = lang === 'ko';
  const plan = getPlan(userConfig);
  const [joined, setJoined] = useState(isOnProWaitlist(userConfig));

  const joinWaitlist = () => {
    onUpdateConfig && onUpdateConfig({ ...(userConfig || {}), proWaitlistAt: Date.now() });
    setJoined(true);
  };

  const Col = ({ p, highlight }) => (
    <div style={{
      flex: 1, minWidth: 0, background: highlight ? T.accentSoft : T.surface,
      border: `1px solid ${highlight ? T.accent + '55' : T.border}`, borderRadius: 16, padding: '16px 15px',
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 6 }}>
        <span style={{ fontSize: 15, fontWeight: 800, color: highlight ? T.accentDeep : T.ink, fontFamily: F.body }}>{p.name}</span>
        {plan === p.id && (
          <span style={{ fontSize: 9.5, fontWeight: 700, color: '#fff', background: T.accent, borderRadius: 999, padding: '2px 7px' }}>{ko ? '현재' : 'Current'}</span>
        )}
      </div>
      <div style={{ marginTop: 4, fontSize: 18, fontWeight: 800, color: T.ink, fontFamily: F.body }}>
        {p.priceKRW === 0 ? (ko ? '무료' : 'Free') : <>{p.priceKRW.toLocaleString()}<span style={{ fontSize: 11, color: T.inkLight, fontWeight: 600 }}>{ko ? '원/월' : ' KRW/mo'}</span></>}
      </div>
      <div style={{ marginTop: 3, fontSize: 11, color: T.inkMid, fontFamily: F.body, lineHeight: 1.5 }}>{ko ? p.tagline : p.tagline}</div>
      <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 7 }}>
        {p.features.map((f, i) => (
          <div key={i} style={{ display: 'flex', gap: 7, fontSize: 11.5, color: T.inkMid, fontFamily: F.body, lineHeight: 1.45 }}>
            <span style={{ color: highlight ? T.accent : T.inkLight, flexShrink: 0 }}>{highlight ? '★' : '·'}</span>{f}
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: T.bg, borderRadius: 20, width: '100%', maxWidth: 460, padding: '20px 20px 22px', maxHeight: '88vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,.3)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <span style={{ fontSize: 17, fontWeight: 800, color: T.ink, fontFamily: F.display }}>{ko ? '서재 Pro' : 'Library Pro'}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: T.inkMid, cursor: 'pointer', fontSize: 18 }}>✕</button>
        </div>
        <div style={{ fontSize: 12, color: T.inkMid, fontFamily: F.body, lineHeight: 1.6, marginBottom: 14 }}>
          {ko ? '지금은 내 API 키로 무료로 모든 기능을 쓸 수 있어요. Pro는 키 없이 rarebook AI로 지식 고도화를 제공합니다.'
              : 'Today everything is free with your own API key. Pro will offer rarebook-provided AI, no key needed.'}
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <Col p={PLANS.free} />
          <Col p={PLANS.pro} highlight />
        </div>

        {/* 결제 준비 중 → 출시 알림 신청 */}
        <div style={{ marginTop: 16, textAlign: 'center' }}>
          {joined ? (
            <div style={{ fontSize: 12.5, color: T.accentDeep, fontFamily: F.body, lineHeight: 1.6, background: T.accentSoft, borderRadius: 12, padding: '12px 14px' }}>
              ✅ {ko ? '출시 알림을 신청했어요. 결제가 열리면 가장 먼저 알려드릴게요.' : "You're on the waitlist. We'll notify you the moment billing opens."}
            </div>
          ) : (
            <>
              <button
                onClick={joinWaitlist}
                style={{ width: '100%', padding: '13px 0', borderRadius: 13, border: 'none', background: T.accent, color: '#fff', fontSize: 14, fontWeight: 700, fontFamily: F.body, cursor: 'pointer' }}
              >
                🔔 {ko ? `서재 Pro 출시 알림 신청 (${PRO_PRICE_KRW.toLocaleString()}원/월 예정)` : `Notify me at launch (${PRO_PRICE_KRW.toLocaleString()} KRW/mo)`}
              </button>
              <div style={{ marginTop: 8, fontSize: 10.5, color: T.inkLight, fontFamily: F.body, lineHeight: 1.5 }}>
                {ko ? '카드 결제는 준비 중입니다(연내 오픈 예정). 지금은 무료로 계속 이용하세요.'
                    : 'Card payment is coming (later this year). Keep using everything free for now.'}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
