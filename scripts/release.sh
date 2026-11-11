#!/usr/bin/env bash
# Выпуск приложений одной командой (трекер #413) — эта копия лежит в проекте как scripts/release.sh.
# Всё общее — tracker/scripts/release.sh (свежий origin/main трекера): сборка на mac3 из origin/main, «что едет»,
# метка release/<платформа>/…, журнал выкладок. Что запускать — scripts/release.conf.
#   scripts/release.sh ios|android|mac [--check] [--card N] [-- аргументы команды проекта]
#   scripts/release.sh what ios|android|mac         что смержено с прошлого выпуска
for T in "${SHIP_TRACKER:-}" "$HOME/projects/tracker" /Users/vasily/projects/tracker "$HOME/projects/apps-support"; do
  [ -n "$T" ] && [ -f "$T/scripts/board.sh" ] && [ -d "$T/.git" ] || continue
  git -C "$T" fetch -q origin main 2>/dev/null || true
  f="$(mktemp)"; git -C "$T" show origin/main:scripts/release.sh > "$f" && { bash "$f" "$@"; r=$?; rm -f "$f"; exit $r; }
done
echo "✗ нет клона трекера (~/projects/tracker)"; exit 1
