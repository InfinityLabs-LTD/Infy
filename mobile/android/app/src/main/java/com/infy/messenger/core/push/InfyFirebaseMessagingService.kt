package com.infy.messenger.core.push

import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import com.infy.messenger.core.notification.ActiveChatTracker
import com.infy.messenger.core.notification.AppNotifier
import dagger.hilt.EntryPoint
import dagger.hilt.InstallIn
import dagger.hilt.android.EntryPointAccessors
import dagger.hilt.components.SingletonComponent
import timber.log.Timber

/**
 * Приём фоновых push (FCM). Работает даже при убитом процессе: система поднимает
 * сервис, мы строим уведомление по полезной нагрузке `data`.
 *
 * Зависимости берём через [EntryPointAccessors], а не через @AndroidEntryPoint:
 * сервис может быть создан системой раньше, чем завершится инициализация графа
 * для field-инъекции (особенно onNewToken на чистом старте), а доступ к
 * @Singleton-графу приложения через EntryPoint безопасен в любой момент.
 */
class InfyFirebaseMessagingService : FirebaseMessagingService() {

    @EntryPoint
    @InstallIn(SingletonComponent::class)
    interface PushEntryPoint {
        fun appNotifier(): AppNotifier
        fun activeChatTracker(): ActiveChatTracker
        fun fcmTokenRegistrar(): FcmTokenRegistrar
    }

    private val entryPoint: PushEntryPoint by lazy {
        EntryPointAccessors.fromApplication(applicationContext, PushEntryPoint::class.java)
    }

    /** Ротация токена: отправляем на бэкенд (или помечаем pending, если не вошли). */
    override fun onNewToken(token: String) {
        Timber.d("FCM: новый токен")
        // Registrar сам проверит авторизацию и сходит в сеть в своём scope.
        entryPoint.fcmTokenRegistrar().register()
    }

    override fun onMessageReceived(message: RemoteMessage) {
        val data = message.data
        // Бэкенд дублирует title/body в data — берём их оттуда; если пусто,
        // подстрахуемся полями notification (когда система их не показала сама).
        val title = data["title"] ?: message.notification?.title.orEmpty()
        val body = data["body"] ?: message.notification?.body.orEmpty()
        val chatId = data["chatId"]
        val tag = data["tag"]
        // Бэкенд кладёт явный тип пуша (см. lib/fcm.ts): 'call' | 'reminder' | 'message'.
        val type = data["type"]

        val notifier = entryPoint.appNotifier()
        val tracker = entryPoint.activeChatTracker()

        when (type) {
            // Звонок: title=имя, body=«Входящий звонок/видеозвонок».
            "call" -> notifier.showIncomingCallRaw(callerName = title, text = body)

            // Напоминание календаря.
            "reminder" -> notifier.showReminderRaw(title = title, body = body, tag = tag)

            // Сообщение чата (type == "message"); chatId обязателен.
            "message" -> if (chatId != null && !tracker.isViewing(chatId)) {
                notifier.showMessageRaw(chatId = chatId, title = title, body = body)
            }

            // Подстраховка для пушей без явного type (старый бэкенд).
            else -> when {
                chatId != null && !tracker.isViewing(chatId) ->
                    notifier.showMessageRaw(chatId = chatId, title = title, body = body)
                body.contains("звонок", ignoreCase = true) ->
                    notifier.showIncomingCallRaw(callerName = title, text = body)
                else -> notifier.showReminderRaw(title = title, body = body, tag = tag)
            }
        }
    }
}
