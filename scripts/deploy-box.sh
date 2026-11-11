#!/usr/bin/env bash
# Выкладка origin/main на общую коробку (`ssh tracker-box`, /opt/selectic-heroku-exit) — общий tracker/scripts/deploy-box.sh
# (трекер #412: десять одинаковых копий стали одной). Копия на коробке сохраняется, сборка в docker compose, проверка адреса.
#   scripts/deploy-box.sh [<sha>]      выложить origin/main (с <sha> — только если он уже в main)
# Обычно её зовёт scripts/ship.sh после слияния.
for T in "${SHIP_TRACKER:-}" "$HOME/projects/tracker" /Users/vasily/projects/tracker; do
  [ -n "$T" ] && [ -d "$T/.git" ] || continue
  git -C "$T" fetch -q origin main 2>/dev/null || true
  f="$(mktemp)"; git -C "$T" show origin/main:scripts/deploy-box.sh > "$f"
  bash "$f" 'lovetta' https://lovetta.ai/api/health "$@"; r=$?; rm -f "$f"; exit $r
done
echo "✗ нет клона трекера (~/projects/tracker)"; exit 1
