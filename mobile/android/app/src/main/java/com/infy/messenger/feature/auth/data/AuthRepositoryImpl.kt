package com.infy.messenger.feature.auth.data

import com.infy.messenger.core.network.apiCall
import com.infy.messenger.core.network.ensureSuccessOrThrow
import com.infy.messenger.feature.auth.data.dto.ForgotPasswordRequest
import com.infy.messenger.feature.auth.data.dto.LoginRequest
import com.infy.messenger.feature.auth.data.dto.RegisterRequest
import com.infy.messenger.feature.auth.data.dto.toDomain
import com.infy.messenger.feature.auth.domain.AuthRepository
import com.infy.messenger.feature.auth.domain.AuthSession
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class AuthRepositoryImpl @Inject constructor(
    private val api: AuthApi,
    private val sessionManager: SessionManager,
) : AuthRepository {

    override suspend fun register(
        username: String,
        nickname: String,
        password: String,
        email: String?,
    ): AuthSession = apiCall {
        val session = api.register(
            RegisterRequest(
                username = username,
                nickname = nickname,
                password = password,
                email = email?.takeIf { it.isNotBlank() },
            ),
        ).data.toDomain()
        persist(session)
        session
    }

    override suspend fun login(username: String, password: String): AuthSession = apiCall {
        val session = api.login(LoginRequest(username, password)).data.toDomain()
        persist(session)
        session
    }

    override suspend fun requestPasswordReset(email: String) = apiCall {
        // Сервер всегда отвечает 204, не раскрывая существование аккаунта.
        api.forgotPassword(ForgotPasswordRequest(email)).ensureSuccessOrThrow()
    }

    override suspend fun logout() {
        // Лучшая попытка отозвать сессию на сервере; локально разлогиниваемся в любом случае.
        runCatching { apiCall { api.logout().ensureSuccessOrThrow() } }
        sessionManager.onLoggedOut()
    }

    private fun persist(session: AuthSession) {
        sessionManager.onAuthenticated(
            user = session.user,
            accessToken = session.accessToken,
            refreshToken = session.refreshToken,
        )
    }
}
