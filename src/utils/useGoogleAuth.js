/* Google OAuth 추상화 훅 — Electron / Web 분기
   - Web: @react-oauth/google 의 useGoogleLogin (GIS 팝업)
   - Electron: window.electron.googleOAuth (시스템 브라우저 + loopback PKCE)
     → Google 이 임베디드 웹뷰 OAuth 를 차단하므로 필수

   사용:
     const login = useGoogleAuth({ scope, onSuccess, onError });
     login();  // 클릭 시 호출
   onSuccess 는 web/electron 모두 { access_token, expires_in } 형태로 통일.
*/
import { useGoogleLogin } from '@react-oauth/google';
import { isElectron } from './localBooks.js';

/** Electron 데스크톱 OAuth 클라이언트 ID가 설정돼 있는지.
 *  미설정이면 데스크톱에서 Google 로그인을 시도하면 안 됨 (web ID는 loopback 불가). */
export function hasDesktopOAuth() {
  return !!(import.meta.env.VITE_GOOGLE_DESKTOP_CLIENT_ID);
}

/** Electron인데 데스크톱 OAuth 미설정 → Google 로그인 비활성화해야 하는 상태 */
export function googleLoginBlocked() {
  return isElectron() && !hasDesktopOAuth();
}

export function useGoogleAuth({ scope, onSuccess, onError, hint, prompt }) {
  // 웹용 훅은 항상 호출 (Hooks 규칙). Electron 에서는 사용만 안 함.
  const webLogin = useGoogleLogin({
    onSuccess: (tokenResponse) => onSuccess?.({
      access_token: tokenResponse.access_token,
      expires_in: tokenResponse.expires_in,
    }),
    onError: () => onError?.('web-login-failed'),
    scope,
    hint,
    prompt,
  });

  if (!isElectron()) return webLogin;

  // Electron: 시스템 브라우저 loopback flow
  return async () => {
    const clientId = import.meta.env.VITE_GOOGLE_DESKTOP_CLIENT_ID;
    const clientSecret = import.meta.env.VITE_GOOGLE_DESKTOP_CLIENT_SECRET || '';
    // 데스크톱 전용 ID가 없으면 웹 ID로 폴백하지 않는다.
    // (웹 클라이언트는 loopback redirect 불가 → Google 400 invalid_request)
    if (!clientId) { onError?.('desktop-oauth-not-configured'); return; }

    const result = await window.electron.googleOAuth({ clientId, clientSecret, scope });
    if (result?.ok) {
      onSuccess?.({ access_token: result.access_token, expires_in: result.expires_in });
    } else {
      onError?.(result?.error || 'electron-oauth-failed');
    }
  };
}
