package com.infy.messenger.core.network

import com.infy.messenger.feature.auth.data.SessionManager
import com.infy.messenger.feature.auth.data.dto.RefreshRequest
import kotlinx.coroutines.runBlocking
import okhttp3.Authenticator
import okhttp3.Request
import okhttp3.Response
import okhttp3.Route
import retrofit2.HttpException
import java.io.IOException
import javax.inject.Inject
import javax.inject.Provider
import javax.inject.Singleton

/**
 * Перехватывает 401: обновляет токены через /auth/refresh и повторяет запрос ОДИН раз.
 *
 * Защита от гонок: один lock на весь процесс рефреша. Если несколько запросов получили
 * 401 одновременно, рефреш выполнит только первый; остальные внутри lock увидят уже
 * обновлённый access-токен и просто переотправятся с ним без второго рефреша.
 *
 * Refresh использует отдельный «голый» клиент ([TokenRefreshApi]) без этого Authenticator,
 * чтобы не зациклиться. При отозванной/невалидной сессии — принудительный разлогин.
 */
@Singleton
class TokenAuthenticator @Inject constructor(
    private val sessionManager: SessionManager,
    // Provider, чтобы разорвать цикл инициализации графа (refresh-API зависит от своего клиента).
    private val refreshApi: Provider<TokenRefreshApi>,
) : Authenticator {

    private val lock = Any()

    override fun authenticate(route: Route?, response: Response): Request? {
        // Запросы без Authorization (login/register/refresh) не рефрешим.
        val failedRequest = response.request
        if (failedRequest.header("Authorization") == null) return null

        // Бережём от бесконечных циклов: не более одного повтора на цепочку.
        if (responseCount(response) >= 2) return null

        val accessAtFailure = bearerOf(failedRequest)

        synchronized(lock) {
            val currentAccess = sessionManager.currentAccessToken()

            // Если пока мы ждали lock другой поток уже обновил токен — повторяем с новым.
            if (!currentAccess.isNullOrBlank() && currentAccess != accessAtFailure) {
                return failedRequest.newBuilder()
                    .header("Authorization", "Bearer $currentAccess")
                    .build()
            }

            return when (val outcome = doRefresh()) {
                is RefreshOutcome.Success -> {
                    sessionManager.onTokensRefreshed(outcome.accessToken, outcome.refreshToken)
                    failedRequest.newBuilder()
                        .header("Authorization", "Bearer ${outcome.accessToken}")
                        .build()
                }
                RefreshOutcome.Invalid -> {
                    sessionManager.onLoggedOut()
                    null
                }
                RefreshOutcome.Transient -> null
            }
        }
    }

    private fun doRefresh(): RefreshOutcome {
        val refreshToken = sessionManager.currentRefreshToken()
            ?: return RefreshOutcome.Invalid

        return try {
            val pair = runBlocking {
                refreshApi.get().refresh(RefreshRequest(refreshToken)).data
            }
            RefreshOutcome.Success(pair.accessToken, pair.refreshToken)
        } catch (e: HttpException) {
            // 401/403/4xx от refresh → сессия недействительна. 5xx считаем временной.
            if (e.code() in 400..499) RefreshOutcome.Invalid else RefreshOutcome.Transient
        } catch (e: IOException) {
            RefreshOutcome.Transient
        }
    }

    private fun bearerOf(request: Request): String? =
        request.header("Authorization")?.removePrefix("Bearer ")?.trim()

    private fun responseCount(response: Response): Int {
        var count = 1
        var prior = response.priorResponse
        while (prior != null) {
            count++
            prior = prior.priorResponse
        }
        return count
    }
}
