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

Gradle-проект продублирован в **корне репозитория** (`settings.gradle.kts`,
`gradlew`, `build.gradle.kts`), модуль `:app` перенаправлен на
`mobile/android/app`. Поэтому собирать можно как из корня репо, так и из
`mobile/android` — оба варианта работают независимо. Код приложения всегда
лежит в `mobile/android/app`.

### Android Studio
Открыть **корень репозитория** или папку `mobile/android` — Studio сама скачает
Gradle wrapper, JDK и Android SDK при первом Gradle Sync, затем запустить
конфигурацию `app` на эмуляторе (API 26+) или устройстве.

### VS Code (без Android Studio)
В `.vscode/` уже настроены задачи и конфиг отладки. Рекомендованные расширения
VS Code предложит установить сам (`.vscode/extensions.json`): **Android
(adelphes.android-dev-ext)**, **Kotlin (fwcd.kotlin)**, **Gradle for Java**.

Рабочий цикл:
1. Поднять эмулятор — задача **Android: Start emulator** (Ctrl+Shift+P →
   *Run Task*) или панель эмулятора VS Code.
2. Собрать и запустить — задача **Android: Run (build + install + launch)**,
   либо отдельно: **Android: Build (debug)**, **Android: Install on device**,
   **Android: Launch app**.
3. Тесты — **Android: Unit tests** (или `Run Test Task`).
4. Логи — **Android: Logcat (app only)**.
5. Отладка с точками останова — конфигурация запуска
   **«Android: запуск и отладка»** (F5; требует расширение
   `adelphes.android-dev-ext` и поднятый эмулятор).

Все задачи берут `adb`/`emulator` из `%LOCALAPPDATA%\Android\Sdk` и AVD
`Pixel_10_Pro` — поправьте `ANDROID_SDK`/`AVD_NAME` в `.vscode/tasks.json`,
если у вас другой путь к SDK или имя эмулятора.

### CLI
Требуется JDK 17 и Android SDK (`local.properties` с `sdk.dir`). Из корня репо:

```bash
./gradlew :app:assembleDebug      # сборка APK
./gradlew :app:testDebugUnitTest  # unit-тесты
./gradlew :app:installDebug       # установить на подключённое устройство/эмулятор
```

`local.properties` (создаётся Studio автоматически, git-ignored) указывает путь к SDK:

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

## Этап 3 — медиа ✅

- **Загрузка** (`MediaRepository`): `POST /media/upload` (multipart, заголовки
  `x-media-type`/`x-media-duration`) → отправка сообщением с `attachment`. Прогресс
  через `ProgressRequestBody` (стрим без буфера в RAM).
- **Просмотр** (`MediaContent` / `MessageAttachments`): URL строится из `storageKey`
  через `MediaUrlBuilder` (`{base}/media/{base64url(key)}?token=…`, Range-стриминг).
  Изображения — Coil; видео и кружки — встроенный **ExoPlayer (Media3)** с seek;
  голосовые — плеер с волной и длительностью; файлы — открытие системным интентом.
- **Запись голосовых** (`VoiceRecorder`): MediaRecorder (OGG/Opus, AAC на старых),
  кнопка-микрофон в composer (удержание), отправка как `AUDIO`.
- **Кружки** (`CircleRecorderScreen`): CameraX, круглое превью, фронт/тыл, запись
  по удержанию, отправка как `CIRCLE_VIDEO`; результат возвращается в переписку.
- **Аватары/изображения**: авторизованный Coil-URL через `MediaUrlBuilder`.
- Вложения кэшируются в Room (как JSON у сообщения), разрешения камера/микрофон
  запрашиваются в рантайме, файлы отдаются через `FileProvider`.

> Контракт загрузки/стриминга сверен с `backend/src/modules/media`.

## Этап 4 — звонки WebRTC 1:1 ✅

- **WebRTC** (`stream-webrtc-android`): mesh P2P 1:1, аудио и видео.
  `WebRtcEngine` — `PeerConnection`, локальные треки (mic + камера),
  perfect negotiation (инициатор `polite=false`, получатель `polite=true`).
- **Сигналинг** поверх того же Socket.IO (события `call:*` из `docs/CALLS.md`):
  `RealtimeClient` шлёт/принимает invite/accept/decline/cancel/hangup/signal/
  media-state; `CallManager` — оркестратор: ICE-серверы (`GET /calls/ice`,
  time-limited TURN), буферизация offer у получателя до accept, обмен SDP/ICE,
  таймер длительности, единое `StateFlow<CallState>`.
- **UI**: `CallOverlay` поверх всего приложения (исходящий/входящий/активный/
  финальный), видео через `SurfaceViewRenderer` (полноэкранно + PiP локального),
  контролы (микрофон, камера, смена камеры, динамик, завершение).
- **Системное**: `CallForegroundService` (mic+camera) на время звонка,
  `CallSystemController` — режим связи и маршрутизация динамик/разговорный.
- **Безопасность/UX**: те же JWT и membership-проверки, что на вебе; запрос
  разрешений микрофон/камера перед звонком; busy/peer-busy/taken-elsewhere.
- Кнопки 📞/📹 в шапке диалога.

> Сигнальный протокол и ICE сверены с `docs/CALLS.md`, `backend/src/modules/calls`,
> `lib/turn.ts`.

## Этап 5 — профиль / настройки / сессии ✅

- **Профиль** (`ProfileScreen`): `GET /profile/me` + `GET /profile/me/stats`,
  редактирование (nickname, bio, дата рождения, часовой пояс, интересы-хэштеги),
  загрузка аватара/обложки (`POST /profile/me/avatar|cover`, Photo Picker),
  статистика (контакты/чаты/группы/устройства). Аватары — публичный URL
  через `MediaUrlBuilder.absoluteOrNull`.
- **Настройки** (`SettingsScreen`): переключатели уведомлений (баннеры/звук/
  вибрация) и подсказок Infy AI — сохраняются через `PATCH /profile/me`.
- **Сессии устройств**: `GET /sessions` (с пометкой текущего), отзыв
  отдельной сессии (`DELETE /sessions/:id`), «завершить остальные»
  (`POST /sessions/logout-all`), полный выход.
- Вход в профиль — иконка аккаунта в шапке списка чатов.

> Контракт сверен с `backend/src/modules/profile` и `backend/src/modules/sessions`.

## Статус

Все 5 этапов реализованы. Приложение покрывает: авторизацию, чаты с real-time
и offline-кэшем, медиа (фото/видео/голосовые/кружки), звонки WebRTC 1:1,
профиль/настройки/сессии. Сборка — в Android Studio (см. выше).

> Push сейчас на web-push/VAPID (бэкенд); для Android нужен FCM — согласуется
> отдельно (TODO следующего этапа).
- **Push** — сейчас бэкенд использует web-push (VAPID); для Android нужен FCM —
  интерфейс согласуется отдельно (TODO).
