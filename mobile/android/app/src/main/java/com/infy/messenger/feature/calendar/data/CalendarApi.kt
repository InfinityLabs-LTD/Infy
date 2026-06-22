package com.infy.messenger.feature.calendar.data

import com.infy.messenger.core.network.ApiEnvelope
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Path
import retrofit2.http.Query

/**
 * Retrofit-интерфейс календаря чата. Базовый префикс `.../api/` уже в baseUrl,
 * поэтому пути относительные (без ведущего слэша).
 */
interface CalendarApi {

    // ── События ───────────────────────────────────────────────────────────

    @GET("calendar/{chatId}/events")
    suspend fun listEvents(
        @Path("chatId") chatId: String,
        @Query("from") from: String? = null,
        @Query("to") to: String? = null,
    ): ApiEnvelope<List<EventDto>>

    @POST("calendar/{chatId}/events")
    suspend fun createEvent(
        @Path("chatId") chatId: String,
        @Body body: EventInput,
    ): ApiEnvelope<EventDto>

    @PUT("calendar/events/{eventId}")
    suspend fun updateEvent(
        @Path("eventId") eventId: String,
        @Body body: EventInput,
    ): ApiEnvelope<EventDto>

    @DELETE("calendar/events/{eventId}")
    suspend fun deleteEvent(@Path("eventId") eventId: String): Response<Unit>

    // ── Категории ───────────────────────────────────────────────────────────

    @GET("calendar/{chatId}/categories")
    suspend fun listCategories(@Path("chatId") chatId: String): ApiEnvelope<CategoriesDto>

    @POST("calendar/{chatId}/categories")
    suspend fun createCategory(
        @Path("chatId") chatId: String,
        @Body body: CreateCategoryRequest,
    ): ApiEnvelope<CategoryDto>

    @DELETE("calendar/categories/{categoryId}")
    suspend fun deleteCategory(@Path("categoryId") categoryId: String): Response<Unit>

    // ── Настройки ─────────────────────────────────────────────────────────────

    @GET("calendar/{chatId}/settings")
    suspend fun getSettings(@Path("chatId") chatId: String): ApiEnvelope<SettingsDto>

    @PATCH("calendar/{chatId}/settings")
    suspend fun updateSettings(
        @Path("chatId") chatId: String,
        @Body body: UpdateSettingsRequest,
    ): ApiEnvelope<SettingsDto>
}
