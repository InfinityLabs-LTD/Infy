# Infy — Система звонков (WebRTC)

Голосовые и видеозвонки 1:1 на базе WebRTC (mesh P2P), с сигналингом поверх
существующего Socket.IO-шлюза, собственным TURN (coturn) и premium liquid-glass
UI в фиолетовой палитре Infy.

> **Статус Phase 1 (реализовано):** личные аудио- и видеозвонки 1:1 —
> production-ready, без заглушек. Групповые звонки и SFU — спроектированы
> ниже, реализуются в Phase 2/3 поверх этого фундамента без переписывания.

---

## 1. Архитектура

```
┌──────────────┐   WebSocket (signaling)   ┌────────────────────────────┐
│  Браузер A   │◀─────────────────────────▶│  realtime (SERVICE_ROLE)   │
│ (RTCPeerConn)│                            │  socket.server.ts          │
│              │                            │  └─ calls.signaling.ts     │
└──────┬───────┘                            │       ▲          │         │
       │                                    │       │ Redis    │ Prisma  │
       │  DTLS/SRTP media (P2P)             │   pub/sub +       ▼         │
       │  ◀── напрямую если NAT позволяет   │   call:state    Postgres   │
       │  ◀── через TURN-relay если нет     └────────────────────────────┘
       ▼                                              ▲
┌──────────────┐                              ┌───────┴────────┐
│  Браузер B   │◀──── TURN relay (coturn) ───▶│  coturn        │
│ (RTCPeerConn)│      когда P2P невозможен     │  use-auth-secret│
└──────────────┘                              └────────────────┘
```

**Принципы:**

- **Сигналинг ≠ медиа.** Сервер обменивает только SDP/ICE (offer/answer/candidate)
  и события жизненного цикла. Медиапотоки идут P2P (или через TURN), сервер их
  не видит и не хранит — отсюда полное DTLS/SRTP-шифрование на уровне WebRTC.
- **Состояние звонка в Redis** (`call:state:<id>`, `call:user:<uid>`) — общее для
  всех realtime-инстансов, переживает горизонтальное масштабирование через
  существующий `@socket.io/redis-adapter`.
- **История в Postgres** (`call_sessions` + `call_participants`) — для раздела
  «Звонки», аналитики и SYSTEM-сообщений в ленте чата.
- **TURN-credentials time-limited** — бэкенд выдаёт HMAC-подписанные временные
  логин/пароль (RFC 5766 §10.2, схема coturn `use-auth-secret`), статических
  паролей у клиента нет.

---

## 2. Компоненты

### Backend (`backend/src/`)

| Файл | Роль |
|------|------|
| `prisma/schema.prisma` | модели `CallSession`, `CallParticipant`; enums `CallMedia`, `CallStatus` |
| `prisma/migrations/.../add_calls` | SQL-миграция |
| `lib/env.ts` | `STUN_URLS`, `TURN_URLS`, `TURN_SECRET`, `TURN_TTL_SEC` |
| `lib/turn.ts` | генерация ICE-серверов + time-limited TURN-credentials |
| `modules/calls/calls.service.ts` | жизненный цикл звонка в БД, история, сериализация |
| `modules/calls/calls.routes.ts` | `GET /calls/ice`, `GET /calls/history` |
| `modules/calls/calls.signaling.ts` | вся сигналинг-логика (обработчики сокета) |
| `modules/realtime/socket.server.ts` | подключает `registerCallHandlers` в connection |

### Frontend (`frontend/src/`)

| Файл | Роль |
|------|------|
| `lib/webrtc.ts` | `CallEngine` — RTCPeerConnection, perfect-negotiation, медиа, экран, статистика качества |
| `lib/callController.ts` | singleton-оркестратор: связывает сокет-сигналинг ↔ CallEngine, рингтоны, таймеры |
| `store/call.ts` | Zustand-состояние звонка для UI |
| `hooks/useCallSignaling.ts` | подписка на сокет-события звонка |
| `api/calls.ts` | REST-клиент (ICE, история) |
| `components/call/CallOverlay.tsx` | полноэкранный экран звонка (все фазы) |
| `components/call/CallControls.tsx` | стеклянные кнопки + выбор устройств |
| `components/call/QualityBadge.tsx` | индикатор качества (🟢🟡🔴 + RTT/потери) |
| `components/call/DraggableVideo.tsx` | локальное видео PiP (drag + resize) |
| `App.tsx` | монтирует `<CallLayer/>` (хук + оверлей) глобально |
| `pages/ChatPage.tsx` | кнопки 📞/📹 в шапке диалога |

### Инфраструктура

| Файл | Роль |
|------|------|
| `coturn/turnserver.conf` | конфиг coturn (use-auth-secret, relay-диапазон, deny приватных сетей) |
| `docker-compose.yml` | сервис `coturn` (host-сеть) |
| `.env.example` | переменные STUN/TURN |

---

## 3. Сигнальный протокол (Socket.IO события)

Клиент→сервер:

| Событие | Payload | Назначение |
|---------|---------|-----------|
| `call:invite` | `{ chatId, media }` → ack `{ ok, callId, error }` | инициировать звонок |
| `call:accept` | `{ callId }` → ack `{ ok }` | принять входящий |
| `call:decline` | `{ callId }` | отклонить входящий |
| `call:cancel` | `{ callId }` | отменить исходящий до ответа |
| `call:hangup` | `{ callId }` | завершить активный |
| `call:failed` | `{ callId }` | ICE не установился |
| `call:signal` | `{ callId, data }` | ретрансляция SDP/ICE второму пиру |
| `call:media-state` | `{ callId, micOn?, camOn?, screenOn? }` | mute/камера/экран |

Сервер→клиент:

| Событие | Payload | Когда |
|---------|---------|-------|
| `call:incoming` | `{ callId, chatId, media, from }` | получателю при invite |
| `call:ringing` | `{ callId, chatId, media }` | звонящему (пошёл вызов) |
| `call:accepted` | `{ callId }` | звонящему (приняли) |
| `call:signal` | `{ callId, from, data }` | другому пиру |
| `call:media-state` | `{ callId, from, ... }` | другому пиру |
| `call:ended` | `{ callId, chatId, reason, status, durationSec, by }` | обеим сторонам |
| `call:taken-elsewhere` | `{ callId }` | прочим вкладкам получателя |
| `call:peer-busy` | `{ chatId }` | звонящему, если абонент занят |

### Поток установки (perfect negotiation)

```
A: call:invite ──▶ сервер создаёт CallSession(RINGING), saveState(Redis)
                   сервер ──▶ B: call:incoming
                   сервер ──▶ A: call:ringing
A: buildEngine(polite=false) → addTrack → onnegotiationneeded → SDP offer
                   A: call:signal(offer) ──▶ сервер ──▶ B (буферизуется, движка ещё нет)
B: жмёт «Принять» → call:accept
                   сервер: RINGING→ACTIVE, answeredAt
                   сервер ──▶ A: call:accepted
B: buildEngine(polite=true) → проигрывает буфер offer → SDP answer
                   B: call:signal(answer) ──▶ сервер ──▶ A
оба: обмен ICE-кандидатами через call:signal
оба: RTCPeerConnection → connected → phase=active, таймер длительности
```

Коллизии offer'ов разрешает **perfect negotiation**: инициатор `polite=false`,
получатель `polite=true` (см. `CallEngine.handleSignal`).

---

## 4. Безопасность

- **Транспорт медиа:** DTLS-SRTP — обязательная часть WebRTC, шифрование
  end-to-end на участке P2P. При relay через TURN сервер видит лишь
  зашифрованные пакеты (он не является DTLS-эндпоинтом).
- **Авторизация сигналинга:** тот же JWT, что и для чата (socket auth middleware).
  Membership-проверка в `resolveDirectCallTarget` — звонить можно только в чат,
  где ты состоишь.
- **TURN:** временные credentials (TTL по умолчанию 1 ч), `deny` приватных и
  loopback-диапазонов в coturn — TURN нельзя использовать как прокси во
  внутреннюю сеть.
- **Busy/anti-spam:** один активный звонок на пользователя (`call:user:<uid>`),
  один незавершённый звонок на чат (`CALL_ALREADY_ACTIVE`).

---

## 5. Реализованные функции (Phase 1)

- ✅ Личные аудио- и видеозвонки 1:1
- ✅ Экраны: исходящий / входящий / активный / финальный — liquid-glass, фиолет
- ✅ Кнопки 📞 и 📹 в шапке диалога
- ✅ Контролы: микрофон, камера, демонстрация экрана, выбор устройств, завершение
- ✅ Демонстрация экрана (`getDisplayMedia`, replaceTrack без ренеготиации трека)
- ✅ Шумоподавление / эхоподавление / автоусиление (`getUserMedia` constraints)
- ✅ Выбор микрофона / камеры / динамиков (`enumerateDevices`) + горячая смена
- ✅ Индикаторы качества (🟢🟡🔴, RTT, потери пакетов, битрейт через `getStats`)
- ✅ Перетаскиваемое + изменяемое локальное видео (PiP)
- ✅ Уведомления: в активной вкладке (экран), свёрнутой (Notification API),
  офлайн (web-push), синтезированный рингтон (WebAudio, без внешних файлов)
- ✅ История звонков в БД + SYSTEM-сообщение в ленте чата (длительность/пропущен)
- ✅ TURN (coturn) с time-limited credentials
- ✅ Мобильная адаптация (safe-area, flex-раскладка, touch-friendly кнопки)
- ✅ Мультивкладочность (`call:taken-elsewhere`), busy-detection, ring-таймаут 45с,
  cleanup при disconnect

### Что подключается тонким слоем (данные уже есть)

- ⏳ Раздел **«Звонки»** (страница истории) — endpoint `GET /calls/history` и
  `callsApi.getHistory` готовы; нужна страница + пункт навигации в `MessengerLayout`.

---

## 6. План масштабирования до Telegram/Discord-уровня

### Phase 2 — групповые звонки на mesh (до ~4–6 участников)

Full-mesh: каждый участник держит `RTCPeerConnection` с каждым. Уже заложено в
схеме (`CallParticipant` — массив, не два FK). Нужно:

1. Сигналинг: комната звонка `call:<id>` вместо пары user-room; события
   `call:participant-joined/left`; обмен SDP/ICE между всеми парами.
2. Frontend: `CallEngine` → `MeshSession` (Map<peerId, RTCPeerConnection>).
3. UI: сетка плиток (Grid / Focus / Speaker), активный спикер по аудио-уровню
   (Web Audio `AnalyserNode`).

Ограничение mesh: при N участниках каждый шлёт N-1 потоков — после ~6 человек
исходящий трафик и CPU деградируют. Дальше — только SFU.

### Phase 3 — SFU для групп до 100 (Telegram/Discord-уровень)

**SFU (Selective Forwarding Unit)** — каждый клиент шлёт ОДИН восходящий поток на
сервер, сервер раздаёт его остальным. Линейная нагрузка на клиента вместо
квадратичной.

Рекомендация: **mediasoup** (Node.js, нативно ложится на текущий стек) либо
**LiveKit** (готовый продукт, gRPC/SDK, проще эксплуатация). Janus/Kurento/Jitsi
— альтернативы, если нужна запись/трансляция из коробки.

Архитектура:

```
clients ──upstream──▶ SFU node (mediasoup Worker)  ──downstream──▶ clients
                          │
                  Redis (room→node routing)
                          │
              ┌───────────┴───────────┐
          SFU node 2               SFU node 3   ← горизонтальное масштабирование,
          (другая комната)         (pipe для                  pipe-transport между
                                    больших комнат)            нодами для >1 ноды/комната
```

Шаги:

1. Новый `SERVICE_ROLE=sfu` (или отдельный деплой mediasoup): Worker'ы по числу
   CPU-ядер, Router на комнату, WebRtcTransport на участника.
2. Сигналинг расширяется: `call:produce` / `call:consume` / `transport-connect`
   вместо прямого SDP-обмена; реюз существующего Socket.IO-шлюза.
3. Адаптивное качество: **simulcast** (клиент шлёт 2–3 разрешения, SFU выбирает
   по битрейту получателя) + REMB/transport-cc bandwidth estimation.
4. Маршрутизация комната→нода в Redis; pipe-transport между нодами для очень
   больших комнат.
5. Селективная подписка: получаешь видео только видимых плиток (pagination
   участников), активный спикер — всегда.

### Сопутствующее для прод-масштаба

- **TURN-кластер:** несколько coturn за geo-DNS / anycast; мониторинг доли
  relay-звонков (если >20% — проблема с сетью/STUN).
- **Региональные SFU:** выбор ноды по гео клиента (latency).
- **Запись/трансляция:** mediasoup → FFmpeg/GStreamer pipe в Phase 4.
- **Push-звонки на мобилках:** VoIP-push (APNs PushKit / FCM high-priority) для
  нативных клиентов из каталога `mobile/`.
- **Наблюдаемость:** агрегировать `getStats` клиентов + coturn/SFU метрики в
  Prometheus; алерты на рост packet loss / failed-ICE.

---

## 7. Деплой

1. Заполнить в `.env`: `TURN_SECRET` (`openssl rand -hex 32`), `TURN_REALM`,
   `TURN_EXTERNAL_IP` (публичный IP сервера), `TURN_URLS=turn:<домен>:3478`.
2. Открыть в firewall: `3478/udp`, `3478/tcp`, `5349/tcp`, `49152-65535/udp`.
3. Применить миграцию: `docker compose exec -T core npx prisma migrate deploy`.
4. `docker compose up -d coturn realtime core frontend`.
5. Для TLS на TURN (`turns:`) — смонтировать сертификаты Let's Encrypt в coturn
   и добавить `cert=/.../fullchain.pem`, `pkey=/.../privkey.pem` в turnserver.conf.

> Без TURN звонки работают на простых сетях (через STUN), но ~10–15% соединений
> за симметричным NAT/корп-файрволами без TURN не установятся.
