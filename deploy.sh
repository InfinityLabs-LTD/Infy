#!/usr/bin/env bash
# Infy deploy: меню обслуживания прода.
#   1) Обновление     — тянет main и пересобирает только изменившееся (миграции, restart).
#   2) Пересборка всех образов — docker compose build --no-cache + пересоздание контейнеров.
#   3) Логи            — docker compose logs -f (всех сервисов или выбранного).
#   4) Перевыпуск сертификата — certbot --force-renewal для текущего домена + reload nginx.
#   5) Смена домена    — новый домен в .env, перегенерация nginx-конфига, выпуск сертификата.
# Безопасно сохраняет прод-правки docker-compose.yml (stash вокруг pull).
# Запускается на проде через команду `infy-update` (обёртка в /usr/local/bin).
#
# Неинтерактивный режим:
#   infy-update update | rebuild | logs [сервис] | renew-cert | set-domain [домен]
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

  # Миграции применяем при ЛЮБОМ изменении backend, а не только когда менялась
  # папка migrations: prisma migrate deploy идемпотентен (накатывает лишь недостающее),
  # зато БД не отстаёт от кода, если прошлый деплой не докатил миграцию до конца.
  if touches '^backend/'; then
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
  log "Применяю миграции БД"
  docker compose run --rm --no-deps --entrypoint sh core -c 'npx prisma migrate deploy'
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

# ── Утилиты для сертификатов / домена ────────────────────────────────────────

# Текущий домен из .env (DOMAIN=...).
current_domain() {
  [ -f .env ] || { echo ''; return; }
  grep '^DOMAIN=' .env | head -1 | cut -d= -f2-
}

# Перегенерировать nginx/active.conf из prod.conf под указанный домен и
# перезагрузить nginx (если контейнер запущен).
apply_nginx_domain() {
  local domain="$1"
  sed "s/DOMAIN/${domain}/g" nginx/prod.conf > nginx/active.conf
  docker compose exec -T nginx nginx -s reload 2>/dev/null \
    || docker compose up -d nginx
}

# Выпустить/перевыпустить сертификат Let's Encrypt через webroot.
# Аргументы: <домен> [extra certbot args...]. Требует certbot на хосте и
# работающего nginx, отдающего /.well-known/acme-challenge/ из /var/www/certbot.
issue_cert() {
  local domain="$1"; shift
  command -v certbot >/dev/null || { apt-get update -qq && apt-get install -y -qq certbot; }
  mkdir -p /var/www/certbot
  certbot certonly --webroot \
    --webroot-path=/var/www/certbot \
    --agree-tos --no-eff-email --non-interactive \
    -d "$domain" "$@" \
    || { echo "Не удалось получить сертификат для $domain. Проверьте DNS (A-запись -> этот сервер) и доступность 80 порта."; return 1; }
}

# ── 4) Перевыпуск сертификата текущего домена ────────────────────────────────
do_renew_cert() {
  local domain
  domain=$(current_domain)
  [ -n "$domain" ] || { echo 'DOMAIN не найден в .env — нечего перевыпускать'; exit 1; }

  log "Перевыпуск сертификата для $domain"
  issue_cert "$domain" --force-renewal || exit 1

  log "Перезагружаю nginx"
  docker compose exec -T nginx nginx -s reload || true
  log "Готово: сертификат для $domain перевыпущен"
}

# ── 5) Смена домена (с перевыпуском сертификата) ─────────────────────────────
do_change_domain() {
  local old new
  old=$(current_domain)

  if [ -n "${1:-}" ]; then
    new="$1"
  else
    printf 'Новый домен (например: app.example.com): '
    read -r new
  fi
  [ -n "$new" ] || { echo 'Домен не может быть пустым'; exit 1; }
  [ -f .env ] || { echo '.env не найден — запусти install.sh'; exit 1; }

  log "Смена домена: ${old:-<нет>} -> $new"

  # 1) Обновляем зависящие от домена переменные в .env.
  sed -i \
    -e "s|^DOMAIN=.*|DOMAIN=${new}|" \
    -e "s|^CORS_ORIGINS=.*|CORS_ORIGINS=https://${new}|" \
    -e "s|^MINIO_PUBLIC_URL=.*|MINIO_PUBLIC_URL=https://${new}/media|" \
    .env
  # APP_PUBLIC_URL — только если строка присутствует в .env.
  # (if/then, а не grep && sed: при set -e ложный grep оборвал бы скрипт.)
  if grep -q '^APP_PUBLIC_URL=' .env; then
    sed -i "s|^APP_PUBLIC_URL=.*|APP_PUBLIC_URL=https://${new}|" .env
  fi

  # 2) Bootstrap-конфиг nginx (только HTTP) для прохождения ACME-challenge
  #    нового домена — старый prod-конфиг ссылается на ещё не существующий
  #    сертификат и помешал бы nginx перезагрузиться.
  cat > nginx/active.conf <<NGINX_EOF
server {
    listen 80;
    server_name ${new};
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    location / { return 200 'Infy — смена домена...'; add_header Content-Type text/plain; }
}
NGINX_EOF
  docker compose exec -T nginx nginx -s reload 2>/dev/null || docker compose up -d nginx

  # 3) Выпускаем сертификат для нового домена.
  log "Запрашиваю сертификат для $new"
  issue_cert "$new" || { echo 'Откат: верни домен или повтори после исправления DNS'; exit 1; }

  # 4) Полный prod-конфиг с TLS под новый домен + reload.
  apply_nginx_domain "$new"

  # 5) Пересоздаём контейнеры, читающие домен из .env (CORS, публичные URL).
  log "Пересоздаю контейнеры с новым доменом"
  docker compose up -d $BACKEND_SVCS frontend

  healthcheck
  log "Готово: домен -> $new (сертификат выпущен, nginx и сервисы обновлены)"
}

healthcheck() {
  log "Проверка"
  docker compose ps --format 'table {{.Name}}\t{{.Status}}'
  printf 'frontend: '; curl -sk -o /dev/null -w 'HTTP %{http_code}\n' https://localhost/ || true
  printf 'api:      '; curl -sk -o /dev/null -w 'HTTP %{http_code}\n' https://localhost/api/health || true
}

# ── Меню / выбор действия ────────────────────────────────────────────────────
case "${1:-}" in
  update)      do_update ;;
  rebuild)     do_rebuild ;;
  logs)        do_logs "${2:-}" ;;
  renew-cert)  do_renew_cert ;;
  set-domain)  do_change_domain "${2:-}" ;;
  "")
    printf '\n\033[1;35mInfy — обслуживание прода\033[0m\n'
    printf '  1) Обновление (pull main + пересборка изменившегося)\n'
    printf '  2) Пересборка всех образов (--no-cache)\n'
    printf '  3) Логи\n'
    printf '  4) Перевыпуск сертификата (текущий домен)\n'
    printf '  5) Смена домена (с перевыпуском сертификата)\n'
    printf '\nВыбор [1-5]: '
    read -r choice
    case "$choice" in
      1) do_update ;;
      2) do_rebuild ;;
      3)
        printf 'Сервис (Enter — все): '
        read -r svc
        do_logs "$svc"
        ;;
      4) do_renew_cert ;;
      5) do_change_domain ;;
      *) echo 'Отмена'; exit 1 ;;
    esac
    ;;
  *)
    echo "Использование: infy-update [update|rebuild|logs [сервис]|renew-cert|set-domain [домен]]"
    exit 1
    ;;
esac
