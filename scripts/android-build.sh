#!/bin/bash
# Build the Android app (Capacitor shell that loads https://lovetta.ai/my/).
#
#   scripts/android-build.sh            release AAB for Google Play (signed with the upload key)
#   scripts/android-build.sh --debug    debug APK only (for an emulator / adb install)
#   scripts/android-build.sh --all      both
#   scripts/android-build.sh --upload <track> ["release notes"]
#                                       release through the Google Play API in one go: bumps
#                                       versionCode in build.gradle, builds the AAB and puts it on the
#                                       track (internal|alpha|beta|production) with scripts/play-release.js.
#                                       Commit the bumped build.gradle afterwards.
#
# The page itself comes from the server, so web changes ship with scripts/deploy-box.sh, not with a
# new AAB. Rebuild the AAB when native things change: plugins, icons, config, version.
# Before each Play upload bump versionCode (and versionName) in web/android/app/build.gradle.
#
# Upload key: ~/.android-keys/lovetta-upload.properties (or LOVETTA_UPLOAD_PROPERTIES),
# outside the repo. Without it bundleRelease produces an unsigned bundle and this script stops.
set -euo pipefail

MODE="${1:---release}"
TRACK="${2:-}"
NOTES="${3:-}"
if [ "$MODE" = "--upload" ]; then
  [ -n "$TRACK" ] || { echo "usage: $0 --upload <internal|alpha|beta|production> [\"release notes\"]"; exit 1; }
fi
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROPS="${LOVETTA_UPLOAD_PROPERTIES:-$HOME/.android-keys/lovetta-upload.properties}"

if [ -z "${JAVA_HOME:-}" ] && [ -d "/Applications/Android Studio.app/Contents/jbr/Contents/Home" ]; then
  export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"   # JDK 21
fi
if [ -z "${ANDROID_HOME:-}" ] && [ -d "$HOME/Library/Android/sdk" ]; then
  export ANDROID_HOME="$HOME/Library/Android/sdk"
fi

GRADLE="$ROOT/web/android/app/build.gradle"
if [ "$MODE" = "--upload" ]; then
  # Next versionCode: one above both the local file and anything already uploaded to Play.
  LOCAL=$(sed -n 's/^ *versionCode \([0-9]*\).*/\1/p' "$GRADLE")
  REMOTE=$(node "$ROOT/scripts/play-release.js" --show 2>/dev/null | grep -o '\[[a-z]*\] [0-9,]*' | grep -o '[0-9]*' | sort -n | tail -1)
  NEXT=$(( (${REMOTE:-0} > LOCAL ? ${REMOTE:-0} : LOCAL) + 1 ))
  sed -i '' "s/^\( *versionCode \)[0-9]*/\1$NEXT/" "$GRADLE"
  echo "→ versionCode $NEXT"
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
  --upload) TASKS="bundleRelease" ;;
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

if [ "$MODE" = "--upload" ]; then
  echo "→ Google Play: $TRACK"
  node "$ROOT/scripts/play-release.js" --track "$TRACK" --name "$NEXT" ${NOTES:+--notes-en "$NOTES"}
fi
