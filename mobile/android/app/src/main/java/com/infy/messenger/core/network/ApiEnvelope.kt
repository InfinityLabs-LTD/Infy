package com.infy.messenger.core.network

import kotlinx.serialization.Serializable

/**
 * Бэкенд оборачивает успешный ответ в { "data": T }.
 * Используется как тип ответа Retrofit для всех эндпоинтов, что-либо возвращающих.
 */
@Serializable
data class ApiEnvelope<T>(
    val data: T,
)

/** Ошибочный ответ бэкенда: { "error": { "code", "message" } }. */
@Serializable
data class ApiErrorEnvelope(
    val error: ApiErrorBody,
)

@Serializable
data class ApiErrorBody(
    val code: String,
    val message: String,
)
