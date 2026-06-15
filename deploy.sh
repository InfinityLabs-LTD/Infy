#!/usr/bin/env bash
# Infy deploy: pull latest main, rebuild only what changed, migrate, restart.
# Безопасно сохраняет прод-правки docker-compose.yml (stash вокруг pull).
# Запускается на проде через команду `infy-update` (обёртка в /usr/local/bin).
set -euo pipefail

# Работаем из директории репозитория (на проде это /opt/infy)
cd "$(dirname "$(readlink -f "$0")")"

BACKEND_SVCS="core realtime media scheduler"

log() { printf '\n\033[1;35m== %s ==\033[0m\n' "$*"; }

OLD=$(git rev-parse HEAD)

log "Сохраняю локальные правки и тяну main"
STASHED=0
if ! git diff --quiet || ! git diff --cached --quiet; then
  git stash push -u -m 'infy-update autostash' >/dev/null && STASHED=1
fi
git fetch origin
git merge --ff-only origin/main
if [ "$STASHED" = 1 ]; then
  git stash pop || { echo 'КОНФЛИКТ при возврате локальных правок — разреши вручную'; exit 1; }
fi

NEW=$(git rev-parse HEAD)

if [ "$OLD" = "$NEW" ]; then
  log "Уже на последней версии ($NEW) — нечего деплоить"
  exit 0
fi

log "Обновление ${OLD:0:7} -> ${NEW:0:7}"
CHANGED=$(git diff --name-only "$OLD" "$NEW")
echo "$CHANGED" | sed 's/^/  /'

touches() { echo "$CHANGED" | grep -q "$1"; }

BUILD=""
RECREATE=""
touches '^backend/'  && { BUILD="$BUILD $BACKEND_SVCS"; RECREATE="$RECREATE $BACKEND_SVCS"; }
touches '^frontend/' && { BUILD="$BUILD frontend";       RECREATE="$RECREATE frontend"; }

if touches '^backend/prisma/migrations/'; then
  log "Применяю миграции БД"
  docker compose build core
  docker compose run --rm --no-deps --entrypoint sh core -c 'npx prisma migrate deploy'
fi

if [ -n "$(echo $BUILD | xargs)" ]; then
  log "Сборка образов:$BUILD"
  docker compose build $BUILD
fi

if touches '^docker-compose.yml' && [ -z "$RECREATE" ]; then
  RECREATE="$BACKEND_SVCS frontend"
fi

if [ -n "$(echo $RECREATE | xargs)" ]; then
  log "Пересоздаю контейнеры:$RECREATE"
  docker compose up -d $RECREATE
  log "Перезагружаю nginx"
  docker compose exec -T nginx nginx -s reload
fi

log "Проверка"
docker compose ps --format 'table {{.Name}}\t{{.Status}}'
printf 'frontend: '; curl -sk -o /dev/null -w 'HTTP %{http_code}\n' https://localhost/ || true
printf 'api:      '; curl -sk -o /dev/null -w 'HTTP %{http_code}\n' https://localhost/api/health || true

log "Готово: ${NEW:0:7}"
