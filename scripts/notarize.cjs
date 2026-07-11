/* electron-builder afterSign 훅 — macOS 공증(notarize).
   Apple 자격증명이 없으면 자동으로 건너뜀(현재 ad-hoc 빌드 유지).

   인증 방법 (둘 중 하나):
   A) keychain 프로파일(권장, 평문 암호 없음):
        scripts/setup-notarize.sh 로 1회 저장 → env: APPLE_KEYCHAIN_PROFILE=pkl-notary
   B) Apple ID + 앱 암호:
        APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID
   값은 .env(프로젝트 루트) 또는 환경변수로 제공. (.env 는 gitignore)
   서명에는 "Developer ID Application" 인증서가 키체인에 있어야 함.
   가이드: docs/MACOS_SIGNING.md */
const fs = require('fs');
const path = require('path');

// .env 수동 로드 (의존성 없이) — 이미 설정된 process.env 는 덮어쓰지 않음
function loadDotEnv() {
  try {
    const p = path.join(__dirname, '..', '.env');
    if (!fs.existsSync(p)) return;
    for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (m && !(m[1] in process.env)) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
      }
    }
  } catch { /* ignore */ }
}

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;
  if (electronPlatformName !== 'darwin') return;

  loadDotEnv();
  const { APPLE_KEYCHAIN_PROFILE, APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID } = process.env;

  const hasProfile = !!APPLE_KEYCHAIN_PROFILE;
  const hasAppleId = !!(APPLE_ID && APPLE_APP_SPECIFIC_PASSWORD && APPLE_TEAM_ID);
  if (!hasProfile && !hasAppleId) {
    console.log('  • notarize 건너뜀 — Apple 자격증명 미설정 (ad-hoc 빌드). docs/MACOS_SIGNING.md 참고');
    return;
  }

  let notarize;
  try { ({ notarize } = require('@electron/notarize')); }
  catch {
    console.log('  • @electron/notarize 미설치 — `npm i -D @electron/notarize`');
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appPath = `${appOutDir}/${appName}.app`;
  const opts = hasProfile
    ? { appPath, keychainProfile: APPLE_KEYCHAIN_PROFILE }          // 방법 A
    : { appPath, appleId: APPLE_ID, appleIdPassword: APPLE_APP_SPECIFIC_PASSWORD, teamId: APPLE_TEAM_ID }; // 방법 B

  console.log(`  • 공증 시작 (${hasProfile ? 'keychain profile' : 'apple-id'}): ${appName}.app`);
  await notarize({ appBundleId: 'com.pkl.app', ...opts });
  console.log('  • 공증 완료 ✅');
};
