# Push-уведомления на Android (FCM)

Push, когда приложение в фоне или **убито**, идёт через Firebase Cloud Messaging.
Весь код уже на месте — нужно только подложить два файла из Firebase-проекта.

Архитектура: бэкенд шлёт **data-only** сообщение (без `notification`-блока) →
`InfyFirebaseMessagingService` на устройстве вызывается даже при убитом процессе и
сам строит уведомление через `AppNotifier`. Благодаря этому работают настройки
пользователя (звук/вибрация/баннеры выбирают канал) и подавление в открытом чате
во всех состояниях приложения.

Пока файлы не подложены — push отключён (всё стартует без ошибок, уведомления
работают только при запущенном приложении через realtime-сокет).

---

## 1. Android-приложение: `google-services.json`

В Firebase Console → твой проект → **Add app → Android**:

- **Android package name:** `com.infy.messenger` (точно так — это `applicationId`)
- App nickname / SHA-1 — можно пропустить (для FCM не нужны)
- **Register app → Download `google-services.json`**

Положить файл сюда:

```
mobile/android/app/google-services.json
```

Плагин `com.google.gms.google-services` применяется автоматически, как только файл
существует (см. `app/build.gradle.kts`). Файл уже в `.gitignore` — в репозиторий не
попадёт. Пересобрать APK и установить:

```bash
cd mobile/android
./gradlew assembleRelease   # или assembleDebug для теста
```

> Важно: устройство должно иметь Google Play Services. На «голых» AOSP-эмуляторах
> (без Play) FCM-токен не выдаётся.

## 2. Бэкенд: service account (приватный ключ для отправки push)

В Firebase Console → ⚙️ **Project settings → Service accounts →
Generate new private key** → скачается JSON.

На проде (`/opt/infy`) **заменить содержимое плейсхолдера** реальным ключом:

```bash
cd /opt/infy
# вставить содержимое скачанного JSON вместо плейсхолдера {}
nano backend/fcm-service-account.json
# чтобы git не пытался закоммитить ключ и не затирал его при обновлениях:
git update-index --skip-worktree backend/fcm-service-account.json
```

`docker-compose.yml` уже монтирует этот файл во все backend-роли как
`/run/secrets/fcm.json` (ro), а `.env` указывает на него:

```
FCM_SERVICE_ACCOUNT_PATH=/run/secrets/fcm.json
```

(если в `.env` этой строки нет — добавить из `.env.example`.)

Перезапустить бэкенд:

```bash
docker compose up -d --build core realtime media scheduler
```

## 3. Проверка

- В логах при старте **не должно** быть `[fcm] FCM не настроен…`. Если ключ битый —
  будет `[fcm] не удалось инициализировать Firebase Admin SDK` (push останется off,
  процесс не падает).
- Установить свежий APK, войти, **закрыть приложение** (свайпнуть из недавних).
- Со второго аккаунта прислать сообщение → на первом должно прийти системное
  уведомление. Проверить, что настройки «Звук/Вибрация/Баннеры» в приложении
  влияют на него.

## Замечания по безопасности

- `google-services.json` — не секрет (клиентский конфиг), но в репо не коммитим.
- Service-account JSON — **секрет** (позволяет слать push от имени проекта).
  Никогда не коммитить; на сервере хранить с правами `600`.
