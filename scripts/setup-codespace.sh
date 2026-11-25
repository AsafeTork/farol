#!/usr/bin/env bash
if [ "${CODESPACES:-}" != "true" ]; then echo "Execute somente dentro do Codespace; compilação local desabilitada." >&2; exit 2; fi
set -euo pipefail
mkdir -p /workspaces/farol-beta/toolchain
cd /workspaces/farol-beta/toolchain
if [ ! -x jdk17/bin/java ]; then
  curl --fail --location --retry 3 -o jdk17.tar.gz "https://api.adoptium.net/v3/binary/latest/17/ga/linux/x64/jdk/hotspot/normal/eclipse"
  mkdir -p jdk17
  tar -xzf jdk17.tar.gz -C jdk17 --strip-components=1
  rm jdk17.tar.gz
fi
export JAVA_HOME=/workspaces/farol-beta/toolchain/jdk17
export ANDROID_HOME=/workspaces/farol-beta/toolchain/android-sdk
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"
if [ ! -x gradle-8.11.1/bin/gradle ]; then
  curl --fail --location --retry 3 -o gradle.zip "https://services.gradle.org/distributions/gradle-8.11.1-bin.zip"
  curl --fail --location --retry 3 -o gradle.sha256 "https://services.gradle.org/distributions/gradle-8.11.1-bin.zip.sha256"
  printf "%s  gradle.zip\n" "$(cat gradle.sha256)" | sha256sum --check
  unzip -q gradle.zip
  rm gradle.zip gradle.sha256
fi
if [ ! -x "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" ]; then
  curl --fail --location --retry 3 -o commandlinetools.zip "https://dl.google.com/android/repository/commandlinetools-linux-13114758_latest.zip"
  mkdir -p "$ANDROID_HOME/cmdline-tools"
  unzip -q commandlinetools.zip -d "$ANDROID_HOME/cmdline-tools"
  mv "$ANDROID_HOME/cmdline-tools/cmdline-tools" "$ANDROID_HOME/cmdline-tools/latest"
  rm commandlinetools.zip
fi
set +o pipefail
yes | sdkmanager --licenses >/dev/null
set -o pipefail
sdkmanager "platforms;android-35" "build-tools;35.0.0" "platform-tools"
java -version
./gradle-8.11.1/bin/gradle --version
echo TOOLCHAIN_READY
