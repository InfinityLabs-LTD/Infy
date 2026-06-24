package com.infy.messenger.core.push

import kotlinx.serialization.Serializable
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.HTTP
import retrofit2.http.POST

/** Регистрация/снятие FCM device-токена на бэкенде (для фоновых push). */
interface PushApi {

    /** Привязать токен текущего устройства к пользователю. Возвращает 201. */
    @POST("push/device-token")
    suspend fun register(@Body body: RegisterTokenRequest): Response<Unit>

    /**
     * Отвязать токен (при логауте). Бэкенд ждёт тело в DELETE, поэтому используем
     * @HTTP с hasBody=true — обычный @DELETE тело не отправляет. Возвращает 204.
     */
    @HTTP(method = "DELETE", path = "push/device-token", hasBody = true)
    suspend fun unregister(@Body body: UnregisterTokenRequest): Response<Unit>
}

@Serializable
data class RegisterTokenRequest(
    val token: String,
    val platform: String = "android",
)

@Serializable
data class UnregisterTokenRequest(
    val token: String,
)
