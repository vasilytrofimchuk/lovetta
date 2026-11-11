#!/usr/bin/env bash
# Тесты одной командой (трекер #412) — эта копия лежит в каждом проекте как scripts/test.sh.
# Всё общее — tracker/scripts/test-project.sh (свежий origin/main трекера): зависимости, браузер Playwright, своя тестовая
# база Postgres без root (tracker/scripts/test-db.sh). Что запускать — SHIP_TEST в scripts/ship.conf.
#   scripts/test.sh                     тесты проекта
#   scripts/test.sh <команда…>          другая команда в том же окружении (npx playwright test --project=ui …)
for T in "${SHIP_TRACKER:-}" "$HOME/projects/tracker" /Users/vasily/projects/tracker; do
  [ -n "$T" ] && [ -d "$T/.git" ] || continue
  git -C "$T" fetch -q origin main 2>/dev/null || true
  SHIP_TRACKER="$T" exec bash -c "$(git -C "$T" show origin/main:scripts/test-project.sh)" test.sh "$@"
done
echo "✗ нет клона трекера (~/projects/tracker)"; exit 1
