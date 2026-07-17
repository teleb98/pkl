/*
 * rarebook 패밀리 스위처 — 세 서비스(서점 · 독서 서재 · 쿠킹마스터) 공통 크로스 내비게이션.
 * www / cooking 과 동일한 콘텐츠·디자인(웜 종이·책 톤). current='pkl' 로 현재 서비스 표시.
 */
export const RAREBOOK_SERVICES = [
  { id: 'www',     emoji: '📚', name: '서점', desc: '희귀 도서 스토어',      url: 'https://www.rarebook.co.kr' },
  { id: 'pkl',     emoji: '📖', name: '서재', desc: 'AI 독서 · 지식 관리',   url: 'https://pkl.rarebook.co.kr' },
  { id: 'cooking', emoji: '🍳', name: '부엌', desc: '쿠킹마스터 · AI 식단',  url: 'https://cooking.rarebook.co.kr' },
];

export function FamilySwitcher({ T, F, current = 'pkl' }) {
  const body = F?.body || 'inherit';
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, color: T.inkLight, letterSpacing: 1.2, textTransform: 'uppercase', fontFamily: body, marginBottom: 8 }}>
        rarebook 서비스
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {RAREBOOK_SERVICES.map(s => {
          const active = s.id === current;
          return (
            <a
              key={s.id}
              href={active ? undefined : s.url}
              onClick={active ? (e) => e.preventDefault() : undefined}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 13px', borderRadius: 12,
                textDecoration: 'none',
                background: active ? T.accentSoft : T.surfaceAlt,
                border: `1px solid ${active ? T.accent + '55' : T.border}`,
                cursor: active ? 'default' : 'pointer',
              }}
            >
              <span style={{ fontSize: 20, lineHeight: 1 }}>{s.emoji}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: T.ink, fontFamily: body }}>{s.name}</span>
                <span style={{ display: 'block', fontSize: 11, color: T.inkLight, fontFamily: body }}>{s.desc}</span>
              </span>
              {active && <span style={{ fontSize: 10, fontWeight: 700, color: T.accent, fontFamily: body }}>현재</span>}
            </a>
          );
        })}
      </div>
    </div>
  );
}
