package com.infy.messenger.core.realtime

import com.infy.messenger.BuildConfig
import com.infy.messenger.feature.auth.data.SessionManager
import com.infy.messenger.feature.chat.data.dto.MessageDto
import io.socket.client.IO
import io.socket.client.Socket
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.json.Json
import org.json.JSONObject
import timber.log.Timber
import javax.inject.Inject
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
) {
    private var socket: Socket? = null

    private val _events = MutableSharedFlow<RealtimeEvent>(
        extraBufferCapacity = 128,
        onBufferOverflow = BufferOverflow.DROP_OLDEST,
    )
    val events: SharedFlow<RealtimeEvent> = _events.asSharedFlow()

    private val _connectionState = MutableStateFlow(ConnectionState.DISCONNECTED)
    val connectionState: StateFlow<ConnectionState> = _connectionState.asStateFlow()

    @Synchronized
    fun connect() {
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
            .setAuth(mapOf("token" to (sessionManager.currentAccessToken() ?: "")))
            .build()

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
            // Сессия отозвана/невалидна — выходим из приложения.
            if (reason?.contains("SESSION_REVOKED") == true ||
                reason?.contains("UNAUTHORIZED") == true
            ) {
                disconnect()
                sessionManager.onLoggedOut()
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
