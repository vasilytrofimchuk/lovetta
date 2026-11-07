#!/bin/bash
# Deploy origin/main to production — the shared box.
#
# Production is a Docker container on
# the shared box (`ssh tracker-box`, /opt/selectic-heroku-exit): `apps/lovetta`
# is a plain copy of the repo, and compose builds the image from it. Merging to
# main therefore ships NOTHING by itself — this script is the deploy.
#
#   scripts/deploy-box.sh              deploy origin/main
#   scripts/deploy-box.sh <sha>        same, but fail unless origin/main contains <sha>
#
# Steps: back the server copy up (apps/lovetta.bak-<ts>.tgz) → replace it with
# `git archive origin/main` → rebuild and restart the container → wait for
# /api/health. The deployed commit is written to apps/lovetta/.deployed-sha.
# A lock on the box keeps two agents from rebuilding at the same time.
set -euo pipefail

HOST="${LOVETTA_DEPLOY_HOST:-tracker-box}"
ROOT="/opt/selectic-heroku-exit"
APP="lovetta"
WANT="${1:-}"

cd "$(git rev-parse --show-toplevel)"
git fetch -q origin main
SHA="$(git rev-parse origin/main)"
if [ -n "$WANT" ] && ! git merge-base --is-ancestor "$WANT" "$SHA"; then
  echo "✗ origin/main (${SHA:0:8}) does not contain ${WANT:0:8} — nothing to deploy yet"; exit 1
fi

echo "→ deploying ${SHA:0:8} to $HOST:$ROOT/apps/$APP"
git archive --format=tar "$SHA" | ssh -o BatchMode=yes -o ConnectTimeout=20 "$HOST" "
  set -euo pipefail
  cd '$ROOT'
  exec 9>/tmp/$APP-deploy.lock
  flock -w 900 9 || { echo 'another deploy holds the lock'; exit 1; }
  ts=\$(date -u +%Y%m%d%H%M%S)
  rm -rf apps/$APP.new && mkdir apps/$APP.new
  tar -x -C apps/$APP.new
  echo '$SHA' > apps/$APP.new/.deployed-sha
  tar -czf apps/$APP.bak-\$ts.tgz -C apps $APP
  mv apps/$APP apps/$APP.old-\$ts && mv apps/$APP.new apps/$APP && rm -rf apps/$APP.old-\$ts
  echo \"  backup: apps/$APP.bak-\$ts.tgz\"
  docker compose --profile apps up -d --build $APP > build-logs/$APP-build.log 2>&1 \
    || { tail -40 build-logs/$APP-build.log; echo 'build failed — previous container is still running'; exit 1; }
  sleep 5
  docker compose ps $APP --format '  container: {{.Status}}'
  docker compose logs --since 2m $APP 2>&1 | tail -15
"

echo "→ waiting for https://lovetta.ai/api/health"
for _ in $(seq 1 30); do
  if curl -fsS --max-time 10 https://lovetta.ai/api/health >/dev/null 2>&1; then
    echo "✓ live: ${SHA:0:8} is deployed and /api/health is green"; exit 0
  fi
  sleep 4
done
echo "✗ deployed ${SHA:0:8} but /api/health is not green — ssh $HOST 'cd $ROOT && docker compose logs --tail 80 $APP'"; exit 1
