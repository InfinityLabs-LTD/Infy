package com.infy.messenger.core.notification

import java.util.concurrent.atomic.AtomicReference
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Какой чат сейчас открыт на экране и активно ли приложение на переднем плане.
 * Нужно, чтобы не слать уведомление о сообщении в чат, который пользователь
 * прямо сейчас читает (как в вебе).
 */
@Singleton
class ActiveChatTracker @Inject constructor() {
    private val activeChatId = AtomicReference<String?>(null)
    @Volatile var appInForeground: Boolean = false

    fun setActiveChat(chatId: String?) { activeChatId.set(chatId) }

    /** true, если уведомление о сообщении нужно подавить (этот чат открыт). */
    fun isViewing(chatId: String): Boolean =
        appInForeground && activeChatId.get() == chatId
}
