/* rarebook 통합 SSO (클라이언트) — www(허브)가 .rarebook.co.kr 에 심은 rb_session 쿠키를 읽는다.
 * pkl 은 로컬 우선 앱이라 이 쿠키는 "rarebook 계정" 표시/연동용이며, 앱 사용을 막지 않는다.
 * (검증은 서버 몫 — 여기서는 표시 목적으로 payload 만 디코드) */

const HUB = 'https://rarebook.co.kr';

function readCookie(name) {
  if (typeof document === 'undefined') return null;
  const m = document.cookie.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return m ? decodeURIComponent(m[1]) : null;
}

function b64urlDecode(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  try { return decodeURIComponent(escape(atob(s))); } catch { return null; }
}

/** rb_session 쿠키의 사용자 정보를 반환 (없거나 만료면 null) */
export function readRbSession() {
  const tok = readCookie('rb_session');
  if (!tok) return null;
  const parts = tok.split('.');
  if (parts.length !== 3) return null;
  const json = b64urlDecode(parts[1]);
  if (!json) return null;
  let p;
  try { p = JSON.parse(json); } catch { return null; }
  if (p.exp && Date.now() / 1000 > p.exp) return null;
  return { provider: p.provider, providerId: p.provider_id, email: p.email, name: p.name };
}

export function clearRbCookie() {
  if (typeof document === 'undefined') return;
  document.cookie = 'rb_session=; Domain=.rarebook.co.kr; Path=/; Max-Age=0; SameSite=Lax';
  document.cookie = 'rb_session=; Path=/; Max-Age=0';
}

const here = () => (typeof window !== 'undefined' ? window.location.href : HUB);

export function hubLoginUrl(next = here()) {
  return `${HUB}/member/login?next=${encodeURIComponent(next)}`;
}

export function hubLogoutUrl(next = here()) {
  return `${HUB}/member/logout?next=${encodeURIComponent(next)}`;
}
