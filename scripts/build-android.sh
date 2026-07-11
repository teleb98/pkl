#!/bin/bash
# PKL Android APK 빌드 (Android Studio 불필요, CLI 전용)
# 사용: bash scripts/build-android.sh [debug|release]   (기본 debug)
# 요구: openjdk@21, android-commandlinetools (Homebrew)
#   release 는 android/keystore.properties + keystore/pkl-release.jks 필요
set -e

MODE="${1:-debug}"   # debug | release

# JDK 21 (Capacitor 8 플러그인이 Java 21 toolchain 요구)
export JAVA_HOME="${JAVA_HOME:-/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home}"
export ANDROID_HOME="${ANDROID_HOME:-/opt/homebrew/share/android-commandlinetools}"
export ANDROID_SDK_ROOT="$ANDROID_HOME"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "▶ 1/3  웹 빌드 + Capacitor 동기화"
npx vite build
npx cap sync android

echo "▶ 2/3  SDK 경로 설정"
echo "sdk.dir=$ANDROID_HOME" > android/local.properties

cd android
chmod +x gradlew

if [ "$MODE" = "release" ]; then
  if [ ! -f keystore.properties ]; then
    echo "❌ android/keystore.properties 없음 — 릴리스 서명 키가 필요합니다." >&2
    exit 1
  fi
  echo "▶ 3/3  릴리스 APK 빌드 (서명)"
  ./gradlew assembleRelease
  APK="$ROOT/android/app/build/outputs/apk/release/app-release.apk"
else
  echo "▶ 3/3  디버그 APK 빌드"
  ./gradlew assembleDebug
  APK="$ROOT/android/app/build/outputs/apk/debug/app-debug.apk"
fi

echo ""
echo "✅ [$MODE] APK 빌드 완료: $APK"
ls -lh "$APK" | awk '{print "   크기:", $5}'
# 서명 검증 (release)
if [ "$MODE" = "release" ]; then
  SIGNER=$(ls "$ANDROID_HOME"/build-tools/*/apksigner 2>/dev/null | sort -V | tail -1)
  [ -n "$SIGNER" ] && "$SIGNER" verify "$APK" 2>/dev/null && echo "   ✅ 서명 검증 통과"
fi
echo "   설치: adb install -r \"$APK\"  (기기/에뮬레이터 연결 시)"
