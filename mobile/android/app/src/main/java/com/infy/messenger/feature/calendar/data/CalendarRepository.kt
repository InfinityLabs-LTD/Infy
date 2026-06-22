package com.infy.messenger.feature.calendar.data

import com.infy.messenger.core.network.apiCall
import com.infy.messenger.core.network.ensureSuccessOrThrow
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Репозиторий календаря чата. Тонкая обёртка над [CalendarApi]: все вызовы
 * проходят через [apiCall], который приводит сбои к ApiError.
 * Возвращает DTO напрямую — они простые и сериализуемые, доменный слой не нужен.
 */
@Singleton
class CalendarRepository @Inject constructor(
    private val api: CalendarApi,
) {
    suspend fun listEvents(chatId: String, from: String? = null, to: String? = null): List<EventDto> =
        apiCall { api.listEvents(chatId, from, to).data }

    suspend fun createEvent(chatId: String, input: EventInput): EventDto =
        apiCall { api.createEvent(chatId, input).data }

    suspend fun updateEvent(eventId: String, input: EventInput): EventDto =
        apiCall { api.updateEvent(eventId, input).data }

    suspend fun deleteEvent(eventId: String) =
        apiCall { api.deleteEvent(eventId).ensureSuccessOrThrow() }

    suspend fun listCategories(chatId: String): CategoriesDto =
        apiCall { api.listCategories(chatId).data }

    suspend fun createCategory(chatId: String, name: String, color: String): CategoryDto =
        apiCall { api.createCategory(chatId, CreateCategoryRequest(name, color)).data }

    suspend fun deleteCategory(categoryId: String) =
        apiCall { api.deleteCategory(categoryId).ensureSuccessOrThrow() }

    suspend fun getSettings(chatId: String): SettingsDto =
        apiCall { api.getSettings(chatId).data }

    suspend fun setSettings(chatId: String, remindersEnabled: Boolean): SettingsDto =
        apiCall { api.updateSettings(chatId, UpdateSettingsRequest(remindersEnabled)).data }
}
