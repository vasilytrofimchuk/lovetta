#!/bin/bash
# Archive Lovetta for iOS and upload it straight to App Store Connect.
# "archive" always means archive + upload — there is no archive-only step.
#
#   1. npm run build:ios   (vite build -> web/ios-dist, then cap sync ios)
#   2. xcodebuild archive Release
#   3. xcodebuild -exportArchive with destination=upload, authenticated with
#      the App Store Connect API key.
#
# The version/build number is NOT auto-incremented — bump MARKETING_VERSION /
# CURRENT_PROJECT_VERSION in web/ios/App/App.xcodeproj/project.pbxproj before
# archiving a new submission. manageAppVersionAndBuildNumber is false in
# ExportOptions-upload.plist so Apple uploads exactly what was built.
#
# Usage:
#   scripts/ios-archive.sh                        archive + upload
#   scripts/ios-archive.sh <ISSUER_ID> [KEY_ID]   override ASC credentials
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

ISSUER="${1:-c4ffe75b-490f-40ce-813d-84050f986c54}"
KEYID="${2:-N8F7ND6K6D}"
KEYPATH="$HOME/.appstoreconnect/private_keys/AuthKey_${KEYID}.p8"
[ -f "$KEYPATH" ] || KEYPATH="$HOME/Downloads/AuthKey_${KEYID}.p8"
if [ ! -f "$KEYPATH" ]; then
  echo "✗ App Store Connect key not found: AuthKey_${KEYID}.p8"
  echo "  Looked in ~/.appstoreconnect/private_keys/ and ~/Downloads/"
  exit 1
fi

# Shared ASC pipeline — never two archives at once. mkdir is atomic.
LOCK="${TMPDIR:-/tmp}/lovetta-ios-archive.lock"
if ! mkdir "$LOCK" 2>/dev/null; then
  echo "✗ Another archive is already in progress (lock: $LOCK)."
  echo "  Wait for it, or if you're certain it crashed:  rmdir '$LOCK'"
  exit 1
fi
trap 'rmdir "$LOCK" 2>/dev/null || true' EXIT

PBXPROJ="web/ios/App/App.xcodeproj/project.pbxproj"
VERSION=$(grep -m1 'MARKETING_VERSION' "$PBXPROJ" | sed 's/.*= *//; s/;//')
BUILD=$(grep -m1 'CURRENT_PROJECT_VERSION' "$PBXPROJ" | sed 's/.*= *//; s/;//')
echo "==> Lovetta $VERSION (build $BUILD) — commit $(git rev-parse --short HEAD)"

echo "==> [1/3] Building web bundle + syncing Capacitor"
npm run build:ios

ARCHIVE_PATH="$HOME/Library/Developer/Xcode/Archives/$(date +%Y-%m-%d)/Lovetta-$(date +%H%M%S).xcarchive"
echo "==> [2/3] Archiving Release -> $ARCHIVE_PATH"
xcodebuild \
  -workspace web/ios/App/App.xcworkspace \
  -scheme App \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath "$ARCHIVE_PATH" \
  -allowProvisioningUpdates \
  -authenticationKeyPath "$KEYPATH" \
  -authenticationKeyID "$KEYID" \
  -authenticationKeyIssuerID "$ISSUER" \
  archive

SHIPPED=$(/usr/libexec/PlistBuddy -c "Print :CFBundleVersion" \
  "$ARCHIVE_PATH/Products/Applications/App.app/Info.plist" 2>/dev/null || echo "?")
SHIPPED_VER=$(/usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" \
  "$ARCHIVE_PATH/Products/Applications/App.app/Info.plist" 2>/dev/null || echo "?")
echo "==> Archived $SHIPPED_VER (build $SHIPPED)"

echo "==> [3/3] Uploading to App Store Connect (key $KEYID)"
OUT=$(mktemp -d)
xcodebuild -exportArchive \
  -archivePath "$ARCHIVE_PATH" \
  -exportOptionsPlist web/ios/ExportOptions-upload.plist \
  -exportPath "$OUT" \
  -allowProvisioningUpdates \
  -authenticationKeyPath "$KEYPATH" \
  -authenticationKeyID "$KEYID" \
  -authenticationKeyIssuerID "$ISSUER"

echo "==> DONE — $SHIPPED_VER build $SHIPPED uploaded. It appears in App Store Connect once Apple finishes processing."
