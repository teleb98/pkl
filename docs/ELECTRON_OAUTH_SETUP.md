# Electron 데스크톱 앱 Google OAuth 설정

## 왜 별도 설정이 필요한가

Google은 **임베디드 웹뷰(Electron BrowserWindow)에서의 OAuth를 보안 정책으로 차단**합니다.
→ 웹용 클라이언트 ID로 Electron에서 로그인하면 `400 invalid_request` / "액세스 차단됨: 승인 오류".

해결: 데스크톱 앱은 **시스템 기본 브라우저 + 로컬 리다이렉트(loopback) + PKCE** 방식을 써야 합니다.
PKL은 이미 이 흐름을 구현했고 (`electron/main.cjs`의 `oauth:google` 핸들러), **데스크톱 앱용 클라이언트 ID만** 추가하면 됩니다.

## 1. Google Cloud Console에서 데스크톱 클라이언트 ID 발급

1. https://console.cloud.google.com/apis/credentials 접속 (PKL 프로젝트 선택)
2. **사용자 인증 정보 만들기 → OAuth 클라이언트 ID**
3. **애플리케이션 유형: 데스크톱 앱** 선택
4. 이름: `PKL Desktop` (자유)
5. 생성 후 **클라이언트 ID**와 **클라이언트 보안 비밀** 복사

> 데스크톱 앱 유형은 redirect URI 등록이 불필요합니다 (loopback `http://127.0.0.1:<랜덤포트>` 자동 허용).
> client_secret은 데스크톱 앱에선 "비밀"이 아니며 PKCE로 보호되므로 함께 사용해도 됩니다.

## 2. OAuth 동의 화면 스코프 확인

동의 화면(OAuth consent screen)에 다음 스코프가 등록돼 있어야 합니다:
- `openid`, `email`, `profile` (프로필)
- `https://www.googleapis.com/auth/drive.readonly` (Drive 책 읽기)
- `https://www.googleapis.com/auth/drive.file` (백업 쓰기)

테스트 모드면 **테스트 사용자**에 본인 이메일을 추가하세요.

## 3. 환경변수 설정

`.env.local`에 추가 (이미 주석 placeholder 있음):

```bash
VITE_GOOGLE_DESKTOP_CLIENT_ID=xxxxx.apps.googleusercontent.com
VITE_GOOGLE_DESKTOP_CLIENT_SECRET=xxxxx
```

> 미설정 시 웹 클라이언트 ID(`VITE_GOOGLE_CLIENT_ID`)로 폴백하지만,
> 웹 클라이언트는 loopback redirect를 허용하지 않아 실패할 수 있습니다. 데스크톱 ID 권장.

## 4. 재빌드

```bash
npm run electron:build   # .env.local 값이 빌드에 인라인됨
```

## 동작 흐름 (구현됨)

```
[앱] Google 로그인 클릭
  → main.cjs: 127.0.0.1 임의 포트로 로컬 HTTP 서버 起動
  → shell.openExternal(accounts.google.com/...&redirect_uri=http://127.0.0.1:PORT/callback)
  → [시스템 브라우저] 사용자가 Google 계정 선택·동의
  → 브라우저가 http://127.0.0.1:PORT/callback?code=... 로 리다이렉트
  → main.cjs: code + PKCE verifier → oauth2.googleapis.com/token 교환
  → access_token 을 renderer(앱)로 반환, 앱 창 포커스
```

## 참고: 웹 버전은 그대로

웹(브라우저 / Vercel)에서는 기존 `@react-oauth/google` GIS 팝업을 그대로 사용합니다.
`src/utils/useGoogleAuth.js`가 `isElectron()`으로 분기합니다.
