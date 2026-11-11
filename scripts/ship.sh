#!/usr/bin/env bash
# Единая выкладка (трекер #399) — эта копия лежит в каждом проекте как scripts/ship.sh.
# Всё общее — tracker/scripts/ship.sh, всегда свежий origin/main трекера; своё у проекта — scripts/ship.conf.
#   scripts/ship.sh "<сообщение>" [--card N] | --no-deploy "<сообщение>" | --hold "<сообщение>" | --help
# SHIP_COMMON=<файл> — прогнать другую версию общего скрипта (проверка правок в нём).
[ -n "${SHIP_COMMON:-}" ] && exec bash "$SHIP_COMMON" "$@"
for T in "${SHIP_TRACKER:-}" "$HOME/projects/tracker" /Users/vasily/projects/tracker; do
  [ -n "$T" ] && [ -d "$T/.git" ] || continue
  git -C "$T" fetch -q origin main 2>/dev/null || true
  exec bash -c "$(git -C "$T" show origin/main:scripts/ship.sh)" ship.sh "$@"
done
echo "✗ нет клона трекера (~/projects/tracker): git clone https://github.com/vasilytrofimchuk/tracker ~/projects/tracker"; exit 1
