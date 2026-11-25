#!/usr/bin/env bash
if [ "${CODESPACES:-}" != "true" ]; then echo "Execute somente dentro do Codespace; compilação local desabilitada." >&2; exit 2; fi
set -euo pipefail
trap 'echo "$?" > /workspaces/farol-beta/build.exit' EXIT
export JAVA_HOME=/workspaces/farol-beta/toolchain/jdk17
export ANDROID_HOME=/workspaces/farol-beta/toolchain/android-sdk
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$JAVA_HOME/bin:/workspaces/farol-beta/toolchain/gradle-8.11.1/bin:$ANDROID_HOME/platform-tools:$PATH"
cd /workspaces/farol-beta/source/android/test-web
npm ci --ignore-scripts --no-audit --no-fund
npm test
cd ..
gradle --no-daemon --max-workers=2 testDebugUnitTest lintDebug assembleDebug
mkdir -p /workspaces/farol-beta/artifacts
cp app/build/outputs/apk/debug/app-debug.apk /workspaces/farol-beta/artifacts/Farol-0.1.1-beta.apk
cd /workspaces/farol-beta/artifacts
sha256sum Farol-0.1.1-beta.apk > SHA256SUMS
echo BUILD_SUCCESS
