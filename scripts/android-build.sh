#!/bin/bash
# Build the Android app (Capacitor shell that loads https://lovetta.ai/my/).
#
#   scripts/android-build.sh            release AAB for Google Play (signed with the upload key)
#   scripts/android-build.sh --debug    debug APK only (for an emulator / adb install)
#   scripts/android-build.sh --all      both
#
# The page itself comes from the server, so web changes ship with scripts/deploy-box.sh, not with a
# new AAB. Rebuild the AAB when native things change: plugins, icons, config, version.
# Before each Play upload bump versionCode (and versionName) in web/android/app/build.gradle.
#
# Upload key: ~/.android-keys/lovetta-upload.properties (or LOVETTA_UPLOAD_PROPERTIES),
# outside the repo. Without it bundleRelease produces an unsigned bundle and this script stops.
set -euo pipefail

MODE="${1:---release}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROPS="${LOVETTA_UPLOAD_PROPERTIES:-$HOME/.android-keys/lovetta-upload.properties}"

if [ -z "${JAVA_HOME:-}" ] && [ -d "/Applications/Android Studio.app/Contents/jbr/Contents/Home" ]; then
  export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"   # JDK 21
fi
if [ -z "${ANDROID_HOME:-}" ] && [ -d "$HOME/Library/Android/sdk" ]; then
  export ANDROID_HOME="$HOME/Library/Android/sdk"
fi

cd "$ROOT/web"
echo "→ web bundle for the native shell (fallback assets)"
CAPACITOR_BUILD=1 npx vite build >/dev/null
echo "→ cap sync android"
npx cap sync android

cd "$ROOT/web/android"
case "$MODE" in
  --debug) TASKS="assembleDebug" ;;
  --all)   TASKS="assembleDebug bundleRelease" ;;
  *)       TASKS="bundleRelease" ;;
esac
if [[ "$TASKS" == *bundleRelease* ]] && [ ! -f "$PROPS" ]; then
  echo "✗ no upload key properties at $PROPS — release would be unsigned"; exit 1
fi

echo "→ gradle $TASKS"
./gradlew --console=plain -q $TASKS

for f in app/build/outputs/bundle/release/app-release.aab app/build/outputs/apk/debug/app-debug.apk; do
  [ -f "$f" ] && echo "✓ $ROOT/web/android/$f"
done
