# Infy Android

Нативный Android-клиент мессенджера Infy. Потребляет существующий REST API
(Fastify) и Socket.IO бэкенда — бэкенд не модифицируется.

## Этап 1 — фундамент + авторизация ✅

Реализовано в этом этапе:

- **Скелет Gradle** (Kotlin DSL) с version catalog (`gradle/libs.versions.toml`),
  один модуль `:app` с разбивкой по слоям Clean (data / domain / ui).
- **Стек**: Kotlin 2.0.21, AGP 8.5.2, compileSdk/targetSdk 35, minSdk 26,
  Jetpack Compose + Material 3 (тёмная/светлая тема + Material You на Android 12+),
  Hilt, Retrofit + OkHttp + kotlinx.serialization, Navigation-Compose.
- **Сетевой слой**:
  - Общий разбор `{ data }` / `{ error: { code, message } }` (`ApiEnvelope`, `apiCall`).
  - `AuthInterceptor` — добавляет `Authorization: Bearer <access>`.
  - `TokenAuthenticator` — при 401 обновляет токены через `/auth/refresh`
    **с защитой от гонок** (один рефреш на процесс, конкурентные 401 переиспользуют
    новый токен) и **одним повтором**; при невалидном/отозванном refresh — разлогин.
    Рефреш идёт через изолированный «голый» клиент, чтобы не зациклиться.
- **Безопасное хранение токенов** в Android Keystore через `EncryptedSharedPreferences`
  (`TokenStorage`).
- **Состояние сессии** (`SessionManager` / `AuthState`) как единый источник правды;
  навигация реагирует на смену состояния (splash → login / home).
- **Экраны**: Splash → Login / Register / Forgot Password, заглушка Home с выходом.
  Клиентская валидация (`AuthValidation`, зеркалит `auth.schema.ts`), обработка кодов
  ошибок бэкенда с маппингом на локализованные строки (`ErrorCode`).
- **Локализация**: все строки в `strings.xml`; ru (основной) + en, полная парность ключей.
- **Unit-тесты** валидации (`AuthValidationTest`).

### Контракт с бэкендом (из кода `backend/src/modules/auth`)

| Эндпоинт | Тело запроса | Ответ |
|----------|--------------|-------|
| `POST /auth/register` | `{ username, nickname, password, email?, birthdate? }` | `201 { data: { user, accessToken, refreshToken, sessionId } }` |
| `POST /auth/login` | `{ username, password }` | `200 { data: { user, accessToken, refreshToken, sessionId } }` |
| `POST /auth/refresh` | `{ refreshToken }` | `200 { data: { accessToken, refreshToken } }` |
| `POST /auth/forgot-password` | `{ email }` | `204` |
| `POST /auth/reset-password` | `{ token, password }` | `204` |
| `POST /auth/logout` | — (bearer) | `204` |

Базовый URL уже включает префикс `/api` (его добавляет nginx). Роуты задаются
относительными путями (`auth/login` и т.д.).

## Конфигурация окружения

Базовые URL задаются через `buildConfigField` в `app/build.gradle.kts`:

| Сборка | `API_BASE_URL` | `REALTIME_URL` |
|--------|----------------|----------------|
| **debug** | `http://10.0.2.2:80/api/` (эмулятор → nginx на хосте) | `http://10.0.2.2:80` |
| **release** | `https://infy.example.com/api/` *(заменить на боевой домен)* | `https://infy.example.com` |

`usesCleartextTraffic` включён только для debug.

> **Перед релизом**: подставить боевой домен в `release`-блок `build.gradle.kts`.

## Сборка и запуск

### Android Studio (рекомендуется)
1. Открыть папку `mobile/android` в Android Studio (Ladybug или новее).
2. Studio сама скачает Gradle wrapper, JDK и Android SDK при первом Gradle Sync.
3. Запустить конфигурацию `app` на эмуляторе (API 26+) или устройстве.

### CLI
Требуется установленный JDK 17 и Android SDK (`ANDROID_HOME`/`local.properties`).
Если в репозитории нет `gradle/wrapper/gradle-wrapper.jar` (он не коммитится как
бинарник), один раз выполните `gradle wrapper` глобально установленным Gradle 8.9,
после чего:

```bash
cd mobile/android
./gradlew :app:assembleDebug      # сборка APK
./gradlew :app:testDebugUnitTest  # unit-тесты
./gradlew :app:installDebug       # установить на подключённое устройство/эмулятор
```

`local.properties` (создаётся Studio автоматически) должен указывать путь к SDK:

```
sdk.dir=C:\\Users\\<you>\\AppData\\Local\\Android\\Sdk
```

## Структура

```
app/src/main/java/com/infy/messenger/
├── InfyApp.kt                  # @HiltAndroidApp, bootstrap сессии
├── MainActivity.kt             # хост Compose
├── core/
│   ├── config/                 # (резерв под этап realtime)
│   ├── network/                # Retrofit, envelope, ApiError, Auth interceptor/authenticator
│   ├── security/               # TokenStorage (Keystore)
│   └── di/                     # Hilt-модули
├── feature/auth/
│   ├── data/                   # AuthApi, DTO, репозиторий, SessionManager
│   ├── domain/                 # модели, контракт репозитория
│   └── ui/                     # экраны + ViewModel + валидация
└── ui/                         # навигация, тема, заглушка home
```

## Этап 2 — список чатов + переписка (real-time) ✅

- **Socket.IO** (`socket.io-client` 2.1) — авторизация access-токеном в handshake
  (`auth.token`), авто-реконнект, пересборка соединения со свежим токеном после refresh,
  разлогин при `SESSION_REVOKED`/`UNAUTHORIZED`. События нормализуются в типобезопасный
  `RealtimeEvent` (`RealtimeClient`), мост к кэшу/presence — `RealtimeSyncManager`.
- **Список диалогов** (`ChatListScreen`): последнее сообщение, непрочитанные (бейдж),
  presence-индикатор (онлайн-точка). Offline-first из Room, фоновое обновление с сервера.
- **Экран переписки** (`ConversationScreen`):
  - Курсорная пагинация истории вверх (`GET chats/:id/messages`, ULID-курсор).
  - **Оптимистичная отправка**: сообщение появляется сразу (`SENDING`), затем
    `SENT`/`FAILED`; идемпотентность по `clientMessageId`, повтор упавших.
  - Статусы доставлено/прочитано, индикатор «печатает…» (`typing_start/stop`),
    отметка прочитанного (`mark_read`), реакции, ответы (отображение цитаты).
  - **Offline-first**: лента читается из Room (`InfyDatabase`), realtime-события
    сливаются в кэш; оптимистичные записи заменяются подтверждёнными без дублей.
- **Хранилище**: Room (`chats`, `messages`), порядок ленты по `sortKey` (ULID для
  подтверждённых, `~`+время для оптимистичных — всегда внизу).
- **Unit-тесты**: маппинг сообщений и логика sortKey (`ChatMapperTest`).

> Контракты Socket.IO и REST чата сверены с `backend/src/modules/chat` и
> `backend/src/modules/realtime/socket.server.ts`.

## Что дальше (следующие этапы)

- **Этап 3** — медиа (фото/видео/голосовые/кружки).
- **Этап 4** — звонки WebRTC 1:1 (протокол сигналинга из `docs/CALLS.md`).
- **Этап 5** — профиль / настройки / сессии устройств.
- **Push** — сейчас бэкенд использует web-push (VAPID); для Android нужен FCM —
  интерфейс согласуется отдельно (TODO).
