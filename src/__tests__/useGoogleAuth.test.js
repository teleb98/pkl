import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/* ────────────────────────────────────────────────────────────────
   useGoogleAuth — 웹/Electron OAuth 분기 검증
   - hasDesktopOAuth / googleLoginBlocked 순수 함수
   - useGoogleAuth 훅이 환경에 맞는 로그인 함수를 반환하고,
     데스크톱 ID 미설정 시 웹 ID 폴백 없이 명확한 에러를 내는지.
   useGoogleLogin(@react-oauth/google) 은 모킹.
   ─────────────────────────────────────────────────────────────── */

const webLoginFn = vi.fn();
vi.mock('@react-oauth/google', () => ({
  // useGoogleLogin 은 호출 시 onSuccess/onError 를 저장한 콜백 함수를 반환
  useGoogleLogin: (opts) => {
    webLoginFn._opts = opts;
    return webLoginFn;
  },
}));

import { hasDesktopOAuth, googleLoginBlocked, useGoogleAuth } from '../utils/useGoogleAuth.js';

function clearEnv() { delete window.electron; }

beforeEach(() => {
  clearEnv();
  webLoginFn.mockReset();
  webLoginFn._opts = null;
  vi.unstubAllEnvs();
});
afterEach(() => clearEnv());

describe('hasDesktopOAuth', () => {
  it('VITE_GOOGLE_DESKTOP_CLIENT_ID 미설정이면 false', () => {
    vi.stubEnv('VITE_GOOGLE_DESKTOP_CLIENT_ID', '');
    expect(hasDesktopOAuth()).toBe(false);
  });

  it('설정되어 있으면 true', () => {
    vi.stubEnv('VITE_GOOGLE_DESKTOP_CLIENT_ID', 'xxx.apps.googleusercontent.com');
    expect(hasDesktopOAuth()).toBe(true);
  });
});

describe('googleLoginBlocked', () => {
  it('웹 환경이면 항상 false (차단 안 함)', () => {
    vi.stubEnv('VITE_GOOGLE_DESKTOP_CLIENT_ID', '');
    expect(googleLoginBlocked()).toBe(false);
  });

  it('Electron + 데스크톱 ID 미설정 → true (차단)', () => {
    window.electron = {};
    vi.stubEnv('VITE_GOOGLE_DESKTOP_CLIENT_ID', '');
    expect(googleLoginBlocked()).toBe(true);
  });

  it('Electron + 데스크톱 ID 설정 → false (허용)', () => {
    window.electron = {};
    vi.stubEnv('VITE_GOOGLE_DESKTOP_CLIENT_ID', 'xxx.apps.googleusercontent.com');
    expect(googleLoginBlocked()).toBe(false);
  });
});

describe('useGoogleAuth — 환경 분기', () => {
  it('웹 환경: useGoogleLogin 콜백을 그대로 반환', () => {
    const onSuccess = vi.fn();
    const login = useGoogleAuth({ scope: 'openid', onSuccess, onError: vi.fn() });
    expect(login).toBe(webLoginFn); // 웹 로그인 함수
  });

  it('웹 환경: onSuccess 가 {access_token, expires_in} 로 정규화', () => {
    const onSuccess = vi.fn();
    useGoogleAuth({ scope: 'openid', onSuccess });
    // mock 이 저장한 opts 의 onSuccess 를 직접 호출
    webLoginFn._opts.onSuccess({ access_token: 'tok', expires_in: 3600, extra: 'x' });
    expect(onSuccess).toHaveBeenCalledWith({ access_token: 'tok', expires_in: 3600 });
  });

  it('Electron + 데스크톱 ID 미설정: 호출 시 폴백 없이 desktop-oauth-not-configured 에러', async () => {
    window.electron = { googleOAuth: vi.fn() };
    vi.stubEnv('VITE_GOOGLE_DESKTOP_CLIENT_ID', '');
    const onError = vi.fn();
    const login = useGoogleAuth({ scope: 'openid', onError });
    expect(login).not.toBe(webLoginFn); // Electron 분기 → 다른 함수
    await login();
    expect(onError).toHaveBeenCalledWith('desktop-oauth-not-configured');
    expect(window.electron.googleOAuth).not.toHaveBeenCalled(); // 웹 ID 폴백 안 함
  });

  it('Electron + 데스크톱 ID 설정: googleOAuth 호출 → onSuccess', async () => {
    vi.stubEnv('VITE_GOOGLE_DESKTOP_CLIENT_ID', 'desktop.apps.googleusercontent.com');
    window.electron = {
      googleOAuth: vi.fn(async () => ({ ok: true, access_token: 'AT', expires_in: 3600 })),
    };
    const onSuccess = vi.fn();
    const login = useGoogleAuth({ scope: 'openid email', onSuccess, onError: vi.fn() });
    await login();
    expect(window.electron.googleOAuth).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: 'desktop.apps.googleusercontent.com', scope: 'openid email' })
    );
    expect(onSuccess).toHaveBeenCalledWith({ access_token: 'AT', expires_in: 3600 });
  });

  it('Electron + googleOAuth 실패: onError 로 에러 전달', async () => {
    vi.stubEnv('VITE_GOOGLE_DESKTOP_CLIENT_ID', 'desktop.apps.googleusercontent.com');
    window.electron = {
      googleOAuth: vi.fn(async () => ({ ok: false, error: 'timeout' })),
    };
    const onError = vi.fn();
    const login = useGoogleAuth({ scope: 'openid', onError });
    await login();
    expect(onError).toHaveBeenCalledWith('timeout');
  });
});
