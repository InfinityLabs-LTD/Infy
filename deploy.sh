#!/usr/bin/env bash
# Infy deploy: меню обслуживания прода.
#   1) Обновление     — тянет main и пересобирает только изменившееся (миграции, restart).
#   2) Пересборка всех образов — docker compose build --no-cache + пересоздание контейнеров.
#   3) Логи            — docker compose logs -f (всех сервисов или выбранного).
# Безопасно сохраняет прод-правки docker-compose.yml (stash вокруг pull).
# Запускается на проде через команду `infy-update` (обёртка в /usr/local/bin).
#
# Неинтерактивный режим: infy-update update | rebuild | logs [сервис]
set -euo pipefail

# Работаем из директории репозитория (на проде это /opt/infy)
cd "$(dirname "$(readlink -f "$0")")"

BACKEND_SVCS="core realtime media scheduler"

log() { printf '\n\033[1;35m== %s ==\033[0m\n' "$*"; }

# ── 1) Обновление: pull main + пересборка изменившегося ──────────────────────
do_update() {
  local OLD NEW CHANGED BUILD RECREATE STASHED

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
    log "Если нужно пересобрать текущий код — выбери пункт 2 (Пересборка всех образов)"
    return 0
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

  healthcheck
  log "Готово: ${NEW:0:7}"
}

# ── 2) Пересборка всех образов без кэша ──────────────────────────────────────
do_rebuild() {
  log "Полная пересборка всех образов (--no-cache)"
  docker compose build --no-cache
  log "Пересоздаю все контейнеры"
  docker compose up -d --force-recreate
  log "Перезагружаю nginx"
  docker compose exec -T nginx nginx -s reload || true
  healthcheck
  log "Готово: пересборка завершена ($(git rev-parse --short HEAD))"
}

# ── 3) Логи ──────────────────────────────────────────────────────────────────
do_logs() {
  local svc="${1:-}"
  if [ -n "$svc" ]; then
    log "Логи: $svc (Ctrl+C для выхода)"
    docker compose logs -f --tail 200 "$svc"
  else
    log "Логи всех сервисов (Ctrl+C для выхода)"
    docker compose logs -f --tail 100
  fi
}

healthcheck() {
  log "Проверка"
  docker compose ps --format 'table {{.Name}}\t{{.Status}}'
  printf 'frontend: '; curl -sk -o /dev/null -w 'HTTP %{http_code}\n' https://localhost/ || true
  printf 'api:      '; curl -sk -o /dev/null -w 'HTTP %{http_code}\n' https://localhost/api/health || true
}

# ── Меню / выбор действия ────────────────────────────────────────────────────
case "${1:-}" in
  update)  do_update ;;
  rebuild) do_rebuild ;;
  logs)    do_logs "${2:-}" ;;
  "")
    printf '\n\033[1;35mInfy — обслуживание прода\033[0m\n'
    printf '  1) Обновление (pull main + пересборка изменившегося)\n'
    printf '  2) Пересборка всех образов (--no-cache)\n'
    printf '  3) Логи\n'
    printf '\nВыбор [1-3]: '
    read -r choice
    case "$choice" in
      1) do_update ;;
      2) do_rebuild ;;
      3)
        printf 'Сервис (Enter — все): '
        read -r svc
        do_logs "$svc"
        ;;
      *) echo 'Отмена'; exit 1 ;;
    esac
    ;;
  *)
    echo "Использование: infy-update [update|rebuild|logs [сервис]]"
    exit 1
    ;;
esac
