#!/bin/bash
# macOS 공증 1회 셋업 — Apple 자격증명을 keychain 프로파일로 안전 저장(평문 암호 없음).
# 전제: Apple Developer Program 가입 + "Developer ID Application" 인증서 키체인 설치.
#       앱 암호: appleid.apple.com → 로그인 및 보안 → 앱 암호
set -e

echo "▶ PKL macOS 공증 셋업"
echo ""

# 1) Developer ID 인증서 확인
echo "1) 코드서명 인증서 확인…"
if security find-identity -p codesigning -v | grep -q "Developer ID Application"; then
  security find-identity -p codesigning -v | grep "Developer ID Application" | sed 's/^/   ✅ /'
else
  echo "   ❌ 'Developer ID Application' 인증서가 키체인에 없습니다."
  echo "      → developer.apple.com → Certificates 에서 발급·설치 후 다시 실행하세요."
  exit 1
fi
echo ""

# 2) keychain 프로파일 저장 (대화형 — Apple ID/팀ID/앱암호 입력)
PROFILE="${1:-pkl-notary}"
echo "2) 공증 자격증명을 keychain 프로파일 '$PROFILE' 로 저장합니다."
echo "   (Apple ID, 팀 ID, 앱 암호를 차례로 입력)"
xcrun notarytool store-credentials "$PROFILE" --apple-id "" --team-id "" 2>/dev/null \
  || xcrun notarytool store-credentials "$PROFILE"
echo ""

# 3) .env 에 프로파일명 기록 (빌드가 자동 사용)
ENV_FILE="$(cd "$(dirname "$0")/.." && pwd)/.env"
if grep -q "APPLE_KEYCHAIN_PROFILE" "$ENV_FILE" 2>/dev/null; then
  echo "   .env 에 APPLE_KEYCHAIN_PROFILE 이미 존재 — 수동 확인하세요."
else
  echo "APPLE_KEYCHAIN_PROFILE=$PROFILE" >> "$ENV_FILE"
  echo "3) .env 에 APPLE_KEYCHAIN_PROFILE=$PROFILE 추가됨"
fi
echo ""
echo "✅ 완료. 이제 'npm run electron:build' 시 자동으로 서명·공증됩니다."
echo "   검증: spctl --assess --type execute -vv 'release/mac-arm64/PKL ….app'"
