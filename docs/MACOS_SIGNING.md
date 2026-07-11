# macOS 코드 서명 & 공증 가이드

> 현재 DMG는 **ad-hoc 서명** → 다른 Mac에서 첫 실행 시 "확인되지 않은 개발자" 경고(우클릭→열기 1회 필요).
> Apple Developer Program으로 **정식 서명 + 공증(notarize)**하면 경고 없이 배포됩니다.
> 빌드 설정은 이미 준비됨 — **인증서 + 환경변수만** 갖추면 자동 작동.

## 준비된 것 (코드)
- `build/entitlements.mac.plist` — hardened runtime entitlements (JIT/네트워크/파일)
- `package.json` `build.mac.entitlements` + `hardenedRuntime: true`
- `scripts/notarize.cjs` — afterSign 훅 (환경변수 없으면 자동 skip → 현재 빌드 안전)

## 정식 서명·공증 하려면 (4단계)

### 1. Apple Developer Program 가입 ($99/년)
https://developer.apple.com/programs/

### 2. "Developer ID Application" 인증서 발급
- Xcode 또는 developer.apple.com → Certificates → **Developer ID Application** 생성
- 다운로드해 키체인에 설치. 확인:
  ```bash
  security find-identity -p codesigning -v | grep "Developer ID Application"
  ```

### 3. 공증용 앱 암호 생성
- https://appleid.apple.com → 로그인 및 보안 → **앱 암호** 생성

### 4. 환경변수 설정 후 빌드
```bash
npm i -D @electron/notarize          # 공증 라이브러리(1회)

export APPLE_ID="you@example.com"
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
export APPLE_TEAM_ID="XXXXXXXXXX"     # developer.apple.com Membership에서 확인
export CSC_NAME="Developer ID Application: 이름 (TEAMID)"   # 선택: 인증서 지정

npm run electron:build
```
→ electron-builder가 자동으로 서명 → `scripts/notarize.cjs`가 공증 → DMG에 스테이플.

### 검증
```bash
spctl --assess --type execute -vv "release/mac-arm64/PKL …​.app"   # → accepted
xcrun stapler validate "release/PKL …​-arm64.dmg"                  # → validated
```

## 빠른 셋업 (로컬, 권장) — keychain 프로파일
인증서 설치 후 **한 번만** 실행하면 평문 암호 없이 자동 공증됩니다:
```bash
bash scripts/setup-notarize.sh        # Apple ID/팀ID/앱암호 입력 → keychain 저장 + .env 기록
npm run electron:build                 # 이후 자동 서명·공증
```
`scripts/notarize.cjs`가 `.env`의 `APPLE_KEYCHAIN_PROFILE`(또는 APPLE_ID 3종)을 읽어 작동합니다.

## CI 자동 빌드 (GitHub Actions)
`.github/workflows/release.yml` — **`v*` 태그 push** 시 서명된 macOS DMG + Android APK 자동 빌드.
필요한 Secrets는 워크플로 상단 주석 참고 (MAC_CSC_LINK, APPLE_ID, ANDROID_KEYSTORE_BASE64 등).
Secrets 미설정 시 ad-hoc으로 폴백(빌드는 성공).

## 환경변수 없이 빌드하면?
`notarize.cjs`가 "건너뜀" 로그만 남기고 **기존처럼 ad-hoc DMG**가 나옵니다. 개발/내부 배포엔 그대로 사용 가능.
