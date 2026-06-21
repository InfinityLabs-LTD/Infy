package com.infy.messenger.core.network

import com.infy.messenger.feature.auth.data.dto.RefreshRequest
import com.infy.messenger.feature.auth.data.dto.TokenPairDto
import retrofit2.http.Body
import retrofit2.http.POST

/**
 * Изолированный контракт для refresh, исполняемый отдельным «голым» Retrofit-клиентом
 * (без AuthInterceptor и без Authenticator) — чтобы рефреш не зациклился на самом себе.
 */
interface TokenRefreshApi {
    @POST("auth/refresh")
    suspend fun refresh(@Body body: RefreshRequest): ApiEnvelope<TokenPairDto>
}

/** Результат попытки обновить токены внутри Authenticator. */
sealed interface RefreshOutcome {
    data class Success(val accessToken: String, val refreshToken: String) : RefreshOutcome
    /** Refresh отклонён сервером (отозван/невалиден) — нужен разлогин. */
    data object Invalid : RefreshOutcome
    /** Временная ошибка (сеть) — не разлогиниваем, просто не повторяем. */
    data object Transient : RefreshOutcome
}
