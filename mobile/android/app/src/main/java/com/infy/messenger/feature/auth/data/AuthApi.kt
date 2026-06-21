package com.infy.messenger.feature.auth.data

import com.infy.messenger.core.network.ApiEnvelope
import com.infy.messenger.feature.auth.data.dto.AuthSessionDto
import com.infy.messenger.feature.auth.data.dto.ForgotPasswordRequest
import com.infy.messenger.feature.auth.data.dto.LoginRequest
import com.infy.messenger.feature.auth.data.dto.RefreshRequest
import com.infy.messenger.feature.auth.data.dto.RegisterRequest
import com.infy.messenger.feature.auth.data.dto.ResetPasswordRequest
import com.infy.messenger.feature.auth.data.dto.TokenPairDto
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.POST

/**
 * Контракт auth-эндпоинтов бэкенда (префикс /auth уже в base URL .../api/).
 * Ни один из этих вызовов не требует Authorization, кроме /auth/logout.
 */
interface AuthApi {

    @POST("auth/register")
    suspend fun register(@Body body: RegisterRequest): ApiEnvelope<AuthSessionDto>

    @POST("auth/login")
    suspend fun login(@Body body: LoginRequest): ApiEnvelope<AuthSessionDto>

    @POST("auth/refresh")
    suspend fun refresh(@Body body: RefreshRequest): ApiEnvelope<TokenPairDto>

    /** Возвращает 204 — тела нет. */
    @POST("auth/forgot-password")
    suspend fun forgotPassword(@Body body: ForgotPasswordRequest): Response<Unit>

    @POST("auth/reset-password")
    suspend fun resetPassword(@Body body: ResetPasswordRequest): Response<Unit>

    /** Bearer добавляет AuthInterceptor. Возвращает 204. */
    @POST("auth/logout")
    suspend fun logout(): Response<Unit>
}
