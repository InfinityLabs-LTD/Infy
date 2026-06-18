#!/usr/bin/env bash
# install.sh — Автономное развёртывание Infy Messenger на Ubuntu VPS
# Использование: curl -fsSL https://raw.githubusercontent.com/InfinityLabs-LTD/Infy/main/install.sh | sudo bash
set -euo pipefail

# ─── Настройки ───────────────────────────────────────────────
REPO_URL="https://github.com/InfinityLabs-LTD/Infy.git"
INSTALL_DIR="/opt/infy"
# ─────────────────────────────────────────────────────────────

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'

info()    { echo -e "${GREEN}[INFO]${NC} $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $*"; }
error()   { echo -e "${RED}[ОШИБКА]${NC} $*"; exit 1; }
section() { echo -e "\n${CYAN}══ $* ══${NC}"; }

# ── 1. Проверка прав ─────────────────────────────────────────
section "Проверка прав"
[[ $EUID -ne 0 ]] && error "Запустите от root или через sudo: sudo bash install.sh"

# ── 2. Проверка ОС ───────────────────────────────────────────
if ! grep -qi ubuntu /etc/os-release 2>/dev/null; then
    warn "Скрипт предназначен для Ubuntu. На других дистрибутивах возможны проблемы."
fi

# ── 3. Установка git ─────────────────────────────────────────
section "Установка зависимостей"
if ! command -v git &>/dev/null; then
    info "Устанавливаю git..."
    apt-get update -qq
    apt-get install -y -qq git
fi
info "git: $(git --version)"

# ── 4. Установка Docker ──────────────────────────────────────
section "Установка Docker Engine"
if command -v docker &>/dev/null; then
    info "Docker уже установлен: $(docker --version)"
else
    info "Устанавливаю Docker..."
    apt-get update -qq
    apt-get install -y -qq ca-certificates curl gnupg lsb-release
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
        | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
        https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
        > /etc/apt/sources.list.d/docker.list
    apt-get update -qq
    apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    systemctl enable --now docker
    info "Docker установлен: $(docker --version)"
fi

# ── 5. Интерактивная настройка ───────────────────────────────
# Все read читают с /dev/tty — корректно работает и при curl | bash
section "Конфигурация"

read -rp "Базовый домен (например: example.com): " DOMAIN </dev/tty
[[ -z "$DOMAIN" ]] && error "Домен не может быть пустым"

read -rp "Email для Let's Encrypt (уведомления об истечении сертификата): " LE_EMAIL </dev/tty
[[ -z "$LE_EMAIL" ]] && error "Email не может быть пустым"

while true; do
    read -rsp "Пароль для первого ADMIN-аккаунта (минимум 8 символов): " ADMIN_PASSWORD </dev/tty
    echo
    if [[ ${#ADMIN_PASSWORD} -ge 8 ]]; then
        break
    fi
    warn "Пароль слишком короткий — нужно минимум 8 символов. Попробуйте ещё раз."
done

# ── 6. Проверка DNS ──────────────────────────────────────────
section "Проверка DNS"

if ! command -v dig &>/dev/null; then
    apt-get install -y -qq dnsutils 2>/dev/null || true
fi

SERVER_IP=$(curl -4 -fsSL https://ifconfig.me 2>/dev/null) \
    || SERVER_IP=$(hostname -I | awk '{print $1}')
info "IP этого сервера: $SERVER_IP"

RESOLVED=$(dig +short "$DOMAIN" A 2>/dev/null | tail -1)
if [[ "$RESOLVED" == "$SERVER_IP" ]]; then
    info "  ✓ ${DOMAIN} → ${RESOLVED}"
else
    warn "  ✗ ${DOMAIN} указывает на '${RESOLVED:-<ничего>}', ожидается ${SERVER_IP}"
    echo
    warn "Создайте A-запись: ${DOMAIN} → ${SERVER_IP}"
    warn "Распространение DNS может занять до 48 часов."
    read -rp "Продолжить всё равно? (certbot не сработает при неверном DNS) [y/N] " CONT </dev/tty
    [[ "$CONT" =~ ^[Yy]$ ]] || error "Прервано. Сначала исправьте DNS."
fi

# ── 7. Брандмауэр (ufw) ──────────────────────────────────────
section "Настройка брандмауэра"
if command -v ufw &>/dev/null; then
    ufw --force reset
    ufw default deny incoming
    ufw default allow outgoing
    ufw allow 22/tcp   comment 'SSH'
    ufw allow 80/tcp   comment 'HTTP'
    ufw allow 443/tcp  comment 'HTTPS'
    ufw --force enable
    info "ufw включён: разрешены SSH, HTTP, HTTPS"
else
    warn "ufw не найден — настройка брандмауэра пропущена"
fi

# ── 8. Клонирование репозитория ──────────────────────────────
section "Загрузка проекта"
if [[ -d "$INSTALL_DIR/.git" ]]; then
    info "Репозиторий уже существует, обновляю..."
    git -C "$INSTALL_DIR" fetch origin
    git -C "$INSTALL_DIR" reset --hard origin/main
elif [[ -d "$INSTALL_DIR" ]]; then
    info "Директория $INSTALL_DIR существует (не git), очищаю..."
    rm -rf "$INSTALL_DIR"
    git clone "$REPO_URL" "$INSTALL_DIR"
else
    info "Клонирую репозиторий в $INSTALL_DIR..."
    git clone "$REPO_URL" "$INSTALL_DIR"
fi
info "Проект загружен в $INSTALL_DIR"

# ── 9. Генерация секретов и .env ─────────────────────────────
section "Генерация секретов"

JWT_ACCESS_SECRET=$(openssl rand -hex 64)
JWT_REFRESH_SECRET=$(openssl rand -hex 64)
DB_PASSWORD=$(openssl rand -hex 24)
MINIO_PASSWORD=$(openssl rand -hex 24)

cat > "$INSTALL_DIR/.env" <<EOF
# Сгенерировано install.sh — $(date -u +"%Y-%m-%dT%H:%M:%SZ")

POSTGRES_DB=infy
POSTGRES_USER=infy
POSTGRES_PASSWORD=${DB_PASSWORD}
DATABASE_URL=postgresql://infy:${DB_PASSWORD}@postgres:5432/infy

REDIS_URL=redis://redis:6379

JWT_ACCESS_SECRET=${JWT_ACCESS_SECRET}
JWT_REFRESH_SECRET=${JWT_REFRESH_SECRET}
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=30d

MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=${MINIO_PASSWORD}
MINIO_ENDPOINT=minio
MINIO_PORT=9000
MINIO_USE_SSL=false
MINIO_BUCKET_AVATARS=avatars
MINIO_BUCKET_MEDIA=media
MINIO_PUBLIC_URL=https://${DOMAIN}/media

DOMAIN=${DOMAIN}

RATE_LIMIT_REGISTER_MAX=5
RATE_LIMIT_REGISTER_WINDOW_MS=3600000
RATE_LIMIT_LOGIN_MAX=10
RATE_LIMIT_LOGIN_WINDOW_MS=900000
RATE_LIMIT_GLOBAL_MAX=100
RATE_LIMIT_GLOBAL_WINDOW_MS=60000

NODE_ENV=production
LOG_LEVEL=info
CORS_ORIGINS=https://${DOMAIN}
TRUSTED_PROXY=172.0.0.0/8

# ----- Почта (SMTP) — необязательно, можно настроить позже в Админке → Почта -----
# Для smtp.bz: host=connect.smtp.bz, port=587 (STARTTLS) или 465 (SSL).
# Если не заполнено здесь, настройте через Admin Panel → Почта после запуска.
MAIL_SMTP_HOST=
MAIL_SMTP_PORT=587
MAIL_SMTP_SECURE=false
MAIL_SMTP_USER=
MAIL_SMTP_PASS=
MAIL_FROM=no-reply@${DOMAIN}
MAIL_FROM_NAME=Infy
EOF

chmod 600 "$INSTALL_DIR/.env"
info "Секреты записаны в $INSTALL_DIR/.env"

# ── 10. Подготовка prod docker-compose ───────────────────────
section "Подготовка конфигурации"

# Переключаем nginx на active.conf
sed -i 's|nginx/dev.conf|nginx/active.conf|g' "$INSTALL_DIR/docker-compose.yml"

# Создаём директорию для certbot ACME-challenge на хосте
mkdir -p /var/www/certbot

# Bootstrap nginx-конфиг: только HTTP, чтобы nginx стартовал до получения TLS-сертификатов
cat > "$INSTALL_DIR/nginx/active.conf" <<NGINX_EOF
server {
    listen 80;
    server_name ${DOMAIN};

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 200 'Infy Messenger — установка в процессе...';
        add_header Content-Type text/plain;
    }
}
NGINX_EOF

info "Конфигурация подготовлена"

cd "$INSTALL_DIR"

# ── 11. Сборка и запуск контейнеров ──────────────────────────
section "Сборка и запуск контейнеров"
docker compose up -d --build
info "Контейнеры запущены"

# ── 12. Получение TLS-сертификата ────────────────────────────
section "Получение TLS-сертификата"

if ! command -v certbot &>/dev/null; then
    apt-get install -y -qq certbot
fi

info "Запрашиваю сертификат для $DOMAIN..."
certbot certonly --webroot \
    --webroot-path=/var/www/certbot \
    --email "$LE_EMAIL" \
    --agree-tos \
    --no-eff-email \
    --non-interactive \
    -d "$DOMAIN" \
    || error "Не удалось получить сертификат для $DOMAIN. Проверьте DNS и повторите."

# Настройка автообновления через cron
(crontab -l 2>/dev/null; echo "0 3 * * * certbot renew --quiet --post-hook 'docker compose -f $INSTALL_DIR/docker-compose.yml exec -T nginx nginx -s reload'") \
    | sort -u | crontab -
info "Автообновление сертификатов настроено (cron)"

# Переключаем nginx на полный prod-конфиг с TLS
sed "s/DOMAIN/${DOMAIN}/g" "$INSTALL_DIR/nginx/prod.conf" \
    > "$INSTALL_DIR/nginx/active.conf"
docker compose exec -T nginx nginx -s reload
info "nginx перезагружен с TLS-конфигурацией"

# ── 13. Миграции Prisma ──────────────────────────────────────
section "Применение миграций базы данных"
docker compose exec -T core npx prisma migrate deploy
info "Миграции применены"

# ── 14. Создание ADMIN-аккаунта ──────────────────────────────
section "Создание аккаунта администратора"
docker compose exec -T core node -e "
const { PrismaClient } = require('@prisma/client');
const argon2 = require('argon2');
async function main() {
  const prisma = new PrismaClient();
  const hash = await argon2.hash('${ADMIN_PASSWORD}');
  const user = await prisma.user.upsert({
    where: { username: 'admin' },
    create: {
      username: 'admin',
      nickname: 'Administrator',
      passwordHash: hash,
      role: 'ADMIN',
    },
    update: {},
  });
  console.log('ID администратора:', user.id);
  await prisma.\$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
"
info "Аккаунт администратора создан (логин: admin)"

# ── 15. Установка команды ic ─────────────────────────────────
section "Установка команды ic"

cat > /usr/local/bin/ic <<'SCRIPT_EOF'
#!/usr/bin/env bash
# ic — утилита управления Infy Messenger
set -euo pipefail

INSTALL_DIR="/opt/infy"
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'

info()  { echo -e "${GREEN}▶${NC} $*"; }
warn()  { echo -e "${YELLOW}⚠${NC}  $*"; }
error() { echo -e "${RED}✖${NC}  $*"; exit 1; }

[[ $EUID -ne 0 ]] && error "Запустите от root или через sudo"
cd "$INSTALL_DIR"

cmd="${1:-help}"
shift || true

case "$cmd" in

  # ── Обновление проекта ──────────────────────────────────────
  update)
    info "Обновляю код из репозитория..."
    git fetch origin
    git reset --hard origin/main
    # git reset вернул docker-compose.yml к nginx/dev.conf — восстанавливаем prod-конфиг
    CURRENT_DOMAIN=$(grep "^DOMAIN=" "$INSTALL_DIR/.env" | cut -d= -f2)
    sed -i 's|nginx/dev.conf|nginx/active.conf|g' "$INSTALL_DIR/docker-compose.yml"
    sed "s/DOMAIN/${CURRENT_DOMAIN}/g" "$INSTALL_DIR/nginx/prod.conf" \
        > "$INSTALL_DIR/nginx/active.conf"
    info "Пересобираю и перезапускаю контейнеры..."
    docker compose up -d --build
    info "Применяю миграции базы данных..."
    docker compose exec -T core npx prisma migrate deploy
    info "Готово — проект обновлён"
    ;;

  # ── Логи ────────────────────────────────────────────────────
  logs)
    # ic logs           — все сервисы, последние 100 строк + follow
    # ic logs core      — конкретный сервис
    # ic logs core 200  — конкретный сервис, N строк
    service="${1:-}"
    lines="${2:-100}"
    if [[ -n "$service" ]]; then
      docker compose logs --tail="$lines" -f "$service"
    else
      docker compose logs --tail="$lines" -f
    fi
    ;;

  # ── Статус ──────────────────────────────────────────────────
  status)
    docker compose ps
    ;;

  # ── Перезапуск ──────────────────────────────────────────────
  restart)
    service="${1:-}"
    if [[ -n "$service" ]]; then
      info "Перезапускаю $service..."
      docker compose restart "$service"
    else
      info "Перезапускаю все сервисы..."
      docker compose restart
    fi
    info "Готово"
    ;;

  # ── Остановка ───────────────────────────────────────────────
  stop)
    info "Останавливаю все контейнеры..."
    docker compose stop
    info "Контейнеры остановлены"
    ;;

  # ── Запуск ──────────────────────────────────────────────────
  start)
    info "Запускаю все контейнеры..."
    docker compose up -d
    info "Контейнеры запущены"
    ;;

  # ── Shell в контейнере ──────────────────────────────────────
  shell)
    service="${1:-core}"
    info "Открываю shell в контейнере $service..."
    docker compose exec "$service" /bin/sh
    ;;

  # ── Резервная копия БД ──────────────────────────────────────
  backup)
    BACKUP_FILE="$INSTALL_DIR/backups/db_$(date +%Y%m%d_%H%M%S).sql.gz"
    mkdir -p "$INSTALL_DIR/backups"
    info "Создаю резервную копию базы данных..."
    source "$INSTALL_DIR/.env"
    docker compose exec -T postgres \
      pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" \
      | gzip > "$BACKUP_FILE"
    info "Резервная копия сохранена: $BACKUP_FILE"
    ;;

  # ── Помощь ──────────────────────────────────────────────────
  help|--help|-h)
    echo -e "\n${CYAN}ic — управление Infy Messenger${NC}\n"
    echo "Использование: ic <команда> [аргументы]"
    echo ""
    echo "Команды:"
    printf "  ${GREEN}%-22s${NC} %s\n" "update"             "Обновить код, пересобрать контейнеры, применить миграции"
    printf "  ${GREEN}%-22s${NC} %s\n" "logs [сервис] [N]"  "Просмотр логов (все или конкретный сервис, N последних строк)"
    printf "  ${GREEN}%-22s${NC} %s\n" "status"             "Статус всех контейнеров"
    printf "  ${GREEN}%-22s${NC} %s\n" "restart [сервис]"   "Перезапустить все или конкретный сервис"
    printf "  ${GREEN}%-22s${NC} %s\n" "start"              "Запустить все контейнеры"
    printf "  ${GREEN}%-22s${NC} %s\n" "stop"               "Остановить все контейнеры"
    printf "  ${GREEN}%-22s${NC} %s\n" "shell [сервис]"     "Открыть shell в контейнере (по умолчанию: core)"
    printf "  ${GREEN}%-22s${NC} %s\n" "backup"             "Создать резервную копию базы данных"
    echo ""
    echo "Сервисы: core, realtime, media, frontend, nginx, postgres, redis, minio"
    echo ""
    ;;

  *)
    error "Неизвестная команда: $cmd. Запустите 'ic help' для справки."
    ;;
esac
SCRIPT_EOF

chmod +x /usr/local/bin/ic
info "Команда ic установлена — запустите 'ic help' для справки"

# ── 16. Готово ───────────────────────────────────────────────
section "Готово!"
echo
echo -e "${GREEN}Infy Messenger запущен!${NC}"
echo
echo "  Приложение:  https://${DOMAIN}"
echo "  API / Docs:  https://${DOMAIN}/api/docs"
echo "  Вход:        логин 'admin', пароль — тот, что вы задали"
echo
echo "Управление сервером:"
echo "  ic update          — обновить проект"
echo "  ic logs            — смотреть логи"
echo "  ic logs core       — логи конкретного сервиса"
echo "  ic status          — статус контейнеров"
echo "  ic restart core    — перезапустить сервис"
echo "  ic backup          — резервная копия БД"
echo "  ic help            — справка по всем командам"
echo
warn "Храните $INSTALL_DIR/.env в безопасности — там все секреты."
