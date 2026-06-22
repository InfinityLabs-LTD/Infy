package com.infy.messenger.feature.profile.data

import com.infy.messenger.core.network.apiCall
import com.infy.messenger.feature.chat.data.dto.MessageDto
import com.infy.messenger.feature.chat.data.remote.ChatApi
import javax.inject.Inject
import javax.inject.Singleton

/** Страница медиа-сообщений чата (для вкладок «Медиа»/«Аудио»). */
data class ChatMediaPage(
    val messages: List<MessageDto>,
    val nextCursor: String?,
)

/**
 * Доступ к публичному профилю другого пользователя и его медиа в общем чате.
 * Все вызовы обёрнуты в [apiCall] — сбои приходят как ApiError, ViewModel их ловит.
 */
@Singleton
class UserProfileRepository @Inject constructor(
    private val profileApi: ProfileApi,
    private val chatApi: ChatApi,
) {

    /** Публичный профиль по username. */
    suspend fun getPublicProfile(username: String): PublicProfileDto = apiCall {
        profileApi.getPublicProfile(username).data
    }

    /** Получить/создать direct-чат с пользователем; возвращает chatId. */
    suspend fun getOrCreateDirectChatId(partnerId: String): String = apiCall {
        chatApi.getOrCreateDirectChat(partnerId).data.id
    }

    /** Медиа-сообщения чата (IMAGE/VIDEO/AUDIO/CIRCLE_VIDEO) с курсором. */
    suspend fun getChatMedia(chatId: String, cursor: String? = null, limit: Int = 30): ChatMediaPage = apiCall {
        val page = chatApi.getChatMedia(chatId, cursor, limit).data
        ChatMediaPage(messages = page.messages, nextCursor = page.nextCursor)
    }
}
