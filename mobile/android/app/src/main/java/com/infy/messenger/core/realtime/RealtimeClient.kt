package com.infy.messenger.core.realtime

import com.infy.messenger.BuildConfig
import com.infy.messenger.core.network.TokenAuthenticator
import com.infy.messenger.feature.auth.data.SessionManager
import com.infy.messenger.feature.chat.data.dto.MessageDto
import io.socket.client.IO
import io.socket.client.Socket
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.json.Json
import org.json.JSONObject
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Provider
import javax.inject.Singleton

/**
 * Обёртка над socket.io-client. Управляет одним соединением, авторизуется
 * access-токеном из [SessionManager], нормализует входящие события в [RealtimeEvent].
 *
 * Реконнект socket.io делает сам; токен берётся свежим при каждой попытке через
 * колбэк auth. При `SESSION_REVOKED` инициируем разлогин приложения.
 */
@Singleton
class RealtimeClient @Inject constructor(
    private val sessionManager: SessionManager,
    private val json: Json,
    private val okHttpClient: okhttp3.OkHttpClient,
    // Provider — чтобы разорвать цикл DI (Authenticator входит в граф OkHttp).
    private val tokenAuthenticator: Provider<TokenAuthenticator>,
) {
    private var socket: Socket? = null

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    /** Идёт ли сейчас попытка обновить токен по UNAUTHORIZED — защита от каскада рефрешей. */
    @Volatile
    private var refreshingToken = false

    private val _events = MutableSharedFlow<RealtimeEvent>(
        extraBufferCapacity = 128,
        onBufferOverflow = BufferOverflow.DROP_OLDEST,
    )
    val events: SharedFlow<RealtimeEvent> = _events.asSharedFlow()

    private val _connectionState = MutableStateFlow(ConnectionState.DISCONNECTED)
    val connectionState: StateFlow<ConnectionState> = _connectionState.asStateFlow()

    @Synchronized
    fun connect() {
        val token = sessionManager.currentAccessToken()
        if (token.isNullOrBlank()) {
            Timber.w("Realtime: попытка подключения без токена")
            return
        }

        if (socket != null) {
            if (socket?.connected() == false) socket?.connect()
            return
        }

        val options = IO.Options.builder()
            .setTransports(arrayOf("websocket"))
            .setReconnection(true)
            .setReconnectionDelay(1_000)
            .setReconnectionDelayMax(10_000)
            // Токен подставляем на каждое (ре)подключение — он мог обновиться.
            .setAuth(mapOf("token" to token))
            .build()
        options.callFactory = okHttpClient
        options.webSocketFactory = okHttpClient

        _connectionState.value = ConnectionState.CONNECTING
        val s = IO.socket(BuildConfig.REALTIME_URL, options)
        registerHandlers(s)
        socket = s
        s.connect()
    }

    /**
     * Пересоздать соединение со свежим токеном. Нужно после refresh: socket.io
     * захватывает auth-map при создании сокета и переиспользует её на реконнектах,
     * поэтому обновить токен «на лету» нельзя — пересобираем сокет целиком.
     */
    @Synchronized
    fun reconnectWithFreshToken() {
        if (socket == null) return
        disconnect()
        connect()
    }

    /**
     * Реакция на UNAUTHORIZED от сокета: обновить токен в фоне и переподключиться.
     * При успехе [SessionManager.onTokensRefreshed] эмитит сигнал, на который
     * [RealtimeSyncManager] вызовет [reconnectWithFreshToken]. Если refresh не удался —
     * [TokenAuthenticator.refreshTokens] сам разлогинит (Invalid) либо просто вернёт false
     * (сеть), и сокет продолжит свои обычные попытки реконнекта.
     */
    private fun onUnauthorized() {
        if (refreshingToken) return
        refreshingToken = true
        scope.launch {
            try {
                tokenAuthenticator.get().refreshTokens()
            } finally {
                refreshingToken = false
            }
        }
    }

    @Synchronized
    fun disconnect() {
        socket?.disconnect()
        socket?.off()
        socket = null
        _connectionState.value = ConnectionState.DISCONNECTED
    }

    // ── Исходящие ────────────────────────────────────────────────────

    fun joinChat(chatId: String) {
        socket?.emit("join_chat", chatId)
    }

    fun markRead(chatId: String, messageId: String) {
        socket?.emit("mark_read", JSONObject(mapOf("chatId" to chatId, "messageId" to messageId)))
    }

    fun typingStart(chatId: String) {
        socket?.emit("typing_start", chatId)
    }

    fun typingStop(chatId: String) {
        socket?.emit("typing_stop", chatId)
    }

    // ── Звонки: исходящие события ────────────────────────────────────

    /** Инициировать звонок; ack возвращает callId/ошибку. */
    fun callInvite(chatId: String, media: String, onAck: (ok: Boolean, callId: String?, error: String?) -> Unit) {
        val payload = JSONObject(mapOf("chatId" to chatId, "media" to media))
        socket?.emit("call:invite", arrayOf<Any>(payload), io.socket.client.Ack { args ->
            val res = args.firstOrNull() as? JSONObject
            onAck(
                res?.optBoolean("ok") == true,
                res?.optString("callId")?.takeIf { it.isNotEmpty() },
                res?.optString("error")?.takeIf { it.isNotEmpty() },
            )
        })
    }

    fun callAccept(callId: String) {
        socket?.emit("call:accept", JSONObject(mapOf("callId" to callId)))
    }

    fun callDecline(callId: String) = emitCall("call:decline", callId)
    fun callCancel(callId: String) = emitCall("call:cancel", callId)
    fun callHangup(callId: String) = emitCall("call:hangup", callId)
    fun callFailed(callId: String) = emitCall("call:failed", callId)

    /** Ретранслировать SDP/ICE пиру. [dataJson] — сериализованный объект. */
    fun callSignal(callId: String, dataJson: String) {
        val payload = JSONObject()
        payload.put("callId", callId)
        payload.put("data", org.json.JSONObject(dataJson))
        socket?.emit("call:signal", payload)
    }

    fun callMediaState(callId: String, micOn: Boolean?, camOn: Boolean?, screenOn: Boolean?) {
        val payload = JSONObject()
        payload.put("callId", callId)
        micOn?.let { payload.put("micOn", it) }
        camOn?.let { payload.put("camOn", it) }
        screenOn?.let { payload.put("screenOn", it) }
        socket?.emit("call:media-state", payload)
    }

    private fun emitCall(event: String, callId: String) {
        socket?.emit(event, JSONObject(mapOf("callId" to callId)))
    }

    // ── Регистрация обработчиков ─────────────────────────────────────

    private fun registerHandlers(s: Socket) {
        s.on(Socket.EVENT_CONNECT) {
            _connectionState.value = ConnectionState.CONNECTED
        }
        s.on(Socket.EVENT_DISCONNECT) {
            _connectionState.value = ConnectionState.DISCONNECTED
        }
        s.on(Socket.EVENT_CONNECT_ERROR) { args ->
            val reason = (args.firstOrNull() as? Throwable)?.message
                ?: args.firstOrNull()?.toString()
            Timber.w("Realtime connect_error: %s", reason)
            when {
                // Сессия отозвана администратором/логаутом на другом устройстве — это
                // невосстановимо, выходим из приложения.
                reason?.contains("SESSION_REVOKED") == true -> {
                    disconnect()
                    sessionManager.onLoggedOut()
                }
                // Истёк access-токен (живёт 15 мин): сокет захватил старый токен и реконнект
                // отклонён. НЕ логаутимся — обновляем токен и переподключаемся. Разлогин
                // случится только если refresh-токен сам недействителен (внутри refreshTokens).
                reason?.contains("UNAUTHORIZED") == true -> onUnauthorized()
            }
        }

        s.on("message_new") { emitMessage(it) { msg -> RealtimeEvent.MessageNew(msg) } }
        s.on("message_edited") { emitMessage(it) { msg -> RealtimeEvent.MessageUpdated(msg) } }
        s.on("message_updated") { emitMessage(it) { msg -> RealtimeEvent.MessageUpdated(msg) } }

        s.on("message_deleted") { args ->
            val obj = args.firstOrNull() as? JSONObject ?: return@on
            val chatId = obj.optString("chatId").takeIf { it.isNotEmpty() } ?: return@on
            val messageId = obj.optString("id").takeIf { it.isNotEmpty() }
                ?: obj.optString("messageId")
            tryEmit(RealtimeEvent.MessageDeleted(chatId, messageId))
        }

        s.on("chat_deleted") { args ->
            val obj = args.firstOrNull() as? JSONObject ?: return@on
            val chatId = obj.optString("chatId").takeIf { it.isNotEmpty() } ?: return@on
            tryEmit(RealtimeEvent.ChatDeleted(chatId))
        }

        s.on("messages_read") { args ->
            val obj = args.firstOrNull() as? JSONObject ?: return@on
            tryEmit(
                RealtimeEvent.MessagesRead(
                    chatId = obj.optString("chatId"),
                    userId = obj.optString("userId"),
                    messageId = obj.optString("messageId"),
                ),
            )
        }

        s.on("typing") { args ->
            val obj = args.firstOrNull() as? JSONObject ?: return@on
            tryEmit(
                RealtimeEvent.Typing(
                    chatId = obj.optString("chatId"),
                    userId = obj.optString("userId"),
                    username = obj.optString("username"),
                    typing = obj.optBoolean("typing"),
                ),
            )
        }

        s.on("online_users") { args ->
            val obj = args.firstOrNull() as? JSONObject ?: return@on
            val arr = obj.optJSONArray("userIds")
            val ids = buildSet {
                if (arr != null) for (i in 0 until arr.length()) add(arr.optString(i))
            }
            tryEmit(RealtimeEvent.OnlineSnapshot(ids))
        }

        s.on("user_online") { args ->
            val obj = args.firstOrNull() as? JSONObject ?: return@on
            tryEmit(RealtimeEvent.Presence(obj.optString("userId"), online = true, lastSeenAt = null))
        }
        s.on("user_offline") { args ->
            val obj = args.firstOrNull() as? JSONObject ?: return@on
            tryEmit(
                RealtimeEvent.Presence(
                    userId = obj.optString("userId"),
                    online = false,
                    lastSeenAt = obj.optString("lastSeenAt").takeIf { it.isNotEmpty() },
                ),
            )
        }

        registerCallHandlers(s)
    }

    private fun registerCallHandlers(s: Socket) {
        s.on("call:incoming") { args ->
            val obj = args.firstOrNull() as? JSONObject ?: return@on
            val from = obj.optJSONObject("from")
            tryEmit(
                RealtimeEvent.CallIncoming(
                    callId = obj.optString("callId"),
                    chatId = obj.optString("chatId"),
                    media = obj.optString("media"),
                    fromId = from?.optString("id").orEmpty(),
                    fromUsername = from?.optString("username").orEmpty(),
                    fromNickname = from?.optString("nickname").orEmpty(),
                    fromAvatarUrl = from?.optString("avatarUrl")?.takeIf { it.isNotEmpty() },
                ),
            )
        }
        s.on("call:ringing") { args ->
            val obj = args.firstOrNull() as? JSONObject ?: return@on
            tryEmit(RealtimeEvent.CallRinging(obj.optString("callId"), obj.optString("chatId"), obj.optString("media")))
        }
        s.on("call:accepted") { args ->
            val obj = args.firstOrNull() as? JSONObject ?: return@on
            tryEmit(RealtimeEvent.CallAccepted(obj.optString("callId")))
        }
        s.on("call:signal") { args ->
            val obj = args.firstOrNull() as? JSONObject ?: return@on
            val data = obj.opt("data") ?: return@on
            tryEmit(
                RealtimeEvent.CallSignal(
                    callId = obj.optString("callId"),
                    fromId = obj.optString("from"),
                    dataJson = data.toString(),
                ),
            )
        }
        s.on("call:media-state") { args ->
            val obj = args.firstOrNull() as? JSONObject ?: return@on
            tryEmit(
                RealtimeEvent.CallMediaState(
                    callId = obj.optString("callId"),
                    fromId = obj.optString("from"),
                    micOn = if (obj.has("micOn")) obj.optBoolean("micOn") else null,
                    camOn = if (obj.has("camOn")) obj.optBoolean("camOn") else null,
                    screenOn = if (obj.has("screenOn")) obj.optBoolean("screenOn") else null,
                ),
            )
        }
        s.on("call:ended") { args ->
            val obj = args.firstOrNull() as? JSONObject ?: return@on
            tryEmit(
                RealtimeEvent.CallEnded(
                    callId = obj.optString("callId"),
                    chatId = obj.optString("chatId"),
                    reason = obj.optString("reason"),
                    status = obj.optString("status"),
                    durationSec = obj.optInt("durationSec"),
                    by = obj.optString("by").takeIf { it.isNotEmpty() },
                ),
            )
        }
        s.on("call:taken-elsewhere") { args ->
            val obj = args.firstOrNull() as? JSONObject ?: return@on
            tryEmit(RealtimeEvent.CallTakenElsewhere(obj.optString("callId")))
        }
        s.on("call:peer-busy") { args ->
            val obj = args.firstOrNull() as? JSONObject ?: return@on
            tryEmit(RealtimeEvent.CallPeerBusy(obj.optString("chatId")))
        }
    }

    private inline fun emitMessage(args: Array<Any>, wrap: (MessageDto) -> RealtimeEvent) {
        val obj = args.firstOrNull() as? JSONObject ?: return
        val dto = runCatching { json.decodeFromString<MessageDto>(obj.toString()) }.getOrNull()
            ?: return
        tryEmit(wrap(dto))
    }

    private fun tryEmit(event: RealtimeEvent) {
        _events.tryEmit(event)
    }
}
