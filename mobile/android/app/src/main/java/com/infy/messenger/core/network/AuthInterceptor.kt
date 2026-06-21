package com.infy.messenger.core.network

import com.infy.messenger.feature.auth.data.SessionManager
import okhttp3.Interceptor
import okhttp3.Response
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Подставляет Authorization: Bearer <access> ко всем запросам, кроме помеченных
 * заголовком [NO_AUTH_HEADER] (login/register/refresh/forgot/reset).
 */
@Singleton
class AuthInterceptor @Inject constructor(
    private val sessionManager: SessionManager,
) : Interceptor {

    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()

        if (request.header(NO_AUTH_HEADER) != null) {
            // Снимаем служебный заголовок, чтобы он не ушёл на сервер.
            return chain.proceed(request.newBuilder().removeHeader(NO_AUTH_HEADER).build())
        }

        val token = sessionManager.currentAccessToken()
        val authed = if (token.isNullOrBlank()) {
            request
        } else {
            request.newBuilder()
                .header("Authorization", "Bearer $token")
                .build()
        }
        return chain.proceed(authed)
    }

    companion object {
        /** Маркер «не добавлять Authorization» для публичных эндпоинтов. */
        const val NO_AUTH_HEADER = "X-Infy-No-Auth"
    }
}
