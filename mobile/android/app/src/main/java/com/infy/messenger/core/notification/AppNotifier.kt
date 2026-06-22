package com.infy.messenger.core.notification

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.infy.messenger.MainActivity
import com.infy.messenger.R
import com.infy.messenger.feature.chat.data.dto.MessageDto
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Локальные уведомления: новые сообщения и входящие звонки. Триггерится из
 * realtime-событий, пока процесс жив (сокет держится RealtimeSyncManager) —
 * это зеркалит поведение веб-клиента, который шлёт уведомления при открытой
 * вкладке. Полноценный фон/доставку при убитом процессе даст FCM (отдельно).
 */
@Singleton
class AppNotifier @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    private val manager = NotificationManagerCompat.from(context)

    init {
        createChannels()
    }

    private fun createChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val sys = context.getSystemService(NotificationManager::class.java)
        val messages = NotificationChannel(
            CHANNEL_MESSAGES,
            context.getString(R.string.notif_channel_messages),
            NotificationManager.IMPORTANCE_HIGH,
        ).apply { description = context.getString(R.string.notif_channel_messages_desc) }
        val calls = NotificationChannel(
            CHANNEL_CALLS,
            context.getString(R.string.notif_channel_calls),
            NotificationManager.IMPORTANCE_HIGH,
        ).apply {
            description = context.getString(R.string.notif_channel_calls_desc)
            setBypassDnd(true)
        }
        sys.createNotificationChannel(messages)
        sys.createNotificationChannel(calls)
    }

    /** Уведомление о новом сообщении (если не свой чат сейчас открыт — решает вызывающий). */
    fun showMessage(message: MessageDto) {
        if (!hasPermission()) return
        val sender = message.sender.nickname.ifBlank { message.sender.username }
        val preview = previewOf(message)
        val notification = NotificationCompat.Builder(context, CHANNEL_MESSAGES)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(sender)
            .setContentText(preview)
            .setAutoCancel(true)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setContentIntent(openChatIntent(message.chatId))
            .build()
        // Группируем по чату: новое сообщение заменяет предыдущее уведомление чата.
        runCatching { manager.notify(message.chatId.hashCode(), notification) }
    }

    /** Высокоприоритетное уведомление о входящем звонке. */
    fun showIncomingCall(callerName: String, isVideo: Boolean) {
        if (!hasPermission()) return
        val text = context.getString(
            if (isVideo) R.string.notif_incoming_video else R.string.notif_incoming_audio,
        )
        val notification = NotificationCompat.Builder(context, CHANNEL_CALLS)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(callerName)
            .setContentText(text)
            .setAutoCancel(true)
            .setOngoing(true)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setContentIntent(openAppIntent())
            .setFullScreenIntent(openAppIntent(), true)
            .build()
        runCatching { manager.notify(CALL_NOTIFICATION_ID, notification) }
    }

    /** Снять уведомление о звонке (приняли/отклонили/завершили). */
    fun cancelCall() {
        manager.cancel(CALL_NOTIFICATION_ID)
    }

    /** Снять уведомления конкретного чата (пользователь открыл его). */
    fun cancelChat(chatId: String) {
        manager.cancel(chatId.hashCode())
    }

    private fun previewOf(message: MessageDto): String = when (message.type.uppercase()) {
        "TEXT", "SYSTEM", "AI", "AI_QUERY" -> message.content.orEmpty()
            .ifBlank { context.getString(R.string.chats_attachment) }
        else -> context.getString(R.string.chats_attachment)
    }

    private fun openChatIntent(chatId: String): PendingIntent {
        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra(EXTRA_CHAT_ID, chatId)
        }
        return PendingIntent.getActivity(
            context, chatId.hashCode(), intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    private fun openAppIntent(): PendingIntent {
        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        return PendingIntent.getActivity(
            context, 0, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    private fun hasPermission(): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return true
        return ContextCompat.checkSelfPermission(
            context, android.Manifest.permission.POST_NOTIFICATIONS,
        ) == android.content.pm.PackageManager.PERMISSION_GRANTED
    }

    companion object {
        const val CHANNEL_MESSAGES = "messages"
        const val CHANNEL_CALLS = "calls"
        const val CALL_NOTIFICATION_ID = 1001
        const val EXTRA_CHAT_ID = "extra_chat_id"
    }
}
