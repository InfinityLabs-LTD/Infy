package com.infy.messenger.feature.auth.data

import com.infy.messenger.core.security.TokenStorage
import com.infy.messenger.feature.auth.domain.User
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import javax.inject.Inject
import javax.inject.Singleton

/** Глобальное состояние авторизации приложения. */
sealed interface AuthState {
    /** Идёт первичная проверка (есть ли сохранённая сессия). */
    data object Unknown : AuthState
    data object Unauthenticated : AuthState
    data class Authenticated(val user: User?) : AuthState
}

/**
 * Единый источник правды по сессии: связывает [TokenStorage] и реактивное [authState].
 * Сетевой слой (Authenticator) и UI наблюдают за этим состоянием; при принудительном
 * разлогине (отозванная/невалидная сессия) состояние переключается в Unauthenticated.
 */
@Singleton
class SessionManager @Inject constructor(
    private val tokenStorage: TokenStorage,
) {
    private val _authState = MutableStateFlow<AuthState>(AuthState.Unknown)
    val authState: StateFlow<AuthState> = _authState.asStateFlow()

    /** Сигнал об обновлении токенов — realtime пересобирает соединение со свежим токеном. */
    private val _tokensRefreshed = MutableSharedFlow<Unit>(
        extraBufferCapacity = 1,
        onBufferOverflow = BufferOverflow.DROP_OLDEST,
    )
    val tokensRefreshed: SharedFlow<Unit> = _tokensRefreshed.asSharedFlow()

    /** Вызывается на старте: определяем начальное состояние по наличию refresh-токена. */
    fun bootstrap() {
        _authState.value =
            if (tokenStorage.hasSession) AuthState.Authenticated(user = null)
            else AuthState.Unauthenticated
    }

    fun onAuthenticated(user: User, accessToken: String, refreshToken: String) {
        tokenStorage.saveTokens(accessToken, refreshToken)
        tokenStorage.userId = user.id
        _authState.value = AuthState.Authenticated(user)
    }

    fun currentAccessToken(): String? = tokenStorage.accessToken

    /** id вошедшего пользователя (для вычисления isOwn и т.п.). */
    fun currentUserId(): String? = tokenStorage.userId

    fun currentRefreshToken(): String? = tokenStorage.refreshToken

    /** Сохранить обновлённую пару после успешного refresh и уведомить подписчиков. */
    fun onTokensRefreshed(accessToken: String, refreshToken: String) {
        tokenStorage.saveTokens(accessToken, refreshToken)
        _tokensRefreshed.tryEmit(Unit)
    }

    /** Полный выход: чистим токены и переводим приложение на экран входа. */
    fun onLoggedOut() {
        tokenStorage.clear()
        _authState.value = AuthState.Unauthenticated
    }
}
