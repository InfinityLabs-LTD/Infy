package com.infy.messenger.core.push

import android.content.Context
import android.content.SharedPreferences
import com.google.firebase.FirebaseApp
import com.google.firebase.messaging.FirebaseMessaging
import com.infy.messenger.feature.auth.data.AuthState
import com.infy.messenger.feature.auth.data.SessionManager
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Регистрация/снятие FCM device-токена на бэкенде в зависимости от авторизации.
 *
 * - [start] подписывается на [SessionManager.authState]: при входе регистрирует
 *   токен (`POST /device-token`), при выходе — снимает (`DELETE /device-token`)
 *   и удаляет токен в Firebase.
 * - [InfyFirebaseMessagingService.onNewToken] вызывает [register] при ротации
 *   токена; если в этот момент пользователь не авторизован, токен помечается
 *   «грязным» ([markPending]) и отправится сразу после следующего входа.
 *
 * FCM-токен не является секретом — храним его в обычных SharedPreferences,
 * чтобы пережить перезапуск процесса.
 */
@Singleton
class FcmTokenRegistrar @Inject constructor(
    @ApplicationContext private val context: Context,
    private val sessionManager: SessionManager,
    private val pushApi: PushApi,
) {
    private val prefs: SharedPreferences =
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    private val isFirebaseAvailable: Boolean
        get() = FirebaseApp.getApps(context).isNotEmpty()

    /** Реакция на смену состояния авторизации. Запускается один раз из InfyApp. */
    fun start() {
        scope.launch {
            // authState — StateFlow, дубликаты он уже не эмитит сам.
            sessionManager.authState
                .collect { state ->
                    when (state) {
                        is AuthState.Authenticated -> register()
                        AuthState.Unauthenticated -> unregister()
                        AuthState.Unknown -> Unit
                    }
                }
        }
    }

    /**
     * Получить текущий FCM-токен и отправить его на бэкенд. Вызывается при входе
     * и из onNewToken (если авторизованы). Идемпотентно: повторная отправка того
     * же токена безвредна.
     */
    fun register() {
        if (!isFirebaseAvailable) {
            Timber.i("FCM: Firebase не инициализирован, пропуск регистрации")
            return
        }
        scope.launch {
            if (sessionManager.authState.value !is AuthState.Authenticated) {
                // Ещё не вошли — отметим, что есть что регистрировать после входа.
                markPending()
                return@launch
            }
            val token = runCatching { FirebaseMessaging.getInstance().token.await() }
                .getOrElse {
                    Timber.w(it, "FCM: не удалось получить токен")
                    return@launch
                }
            runCatching { pushApi.register(RegisterTokenRequest(token = token)) }
                .onSuccess { resp ->
                    // Response<Unit> не бросает на 4xx/5xx — проверяем код явно,
                    // иначе 404 (неверный путь) выглядел бы как успех.
                    if (resp.isSuccessful) {
                        setLastRegistered(token)
                        clearPending()
                        Timber.d("FCM: токен зарегистрирован на бэкенде")
                    } else {
                        markPending()
                        Timber.w("FCM: регистрация токена отклонена сервером: HTTP %d", resp.code())
                    }
                }
                .onFailure {
                    // Сеть/сервер недоступны — оставим pending, повторим при следующем входе.
                    markPending()
                    Timber.w(it, "FCM: регистрация токена не удалась")
                }
        }
    }

    /** При логауте: снять токен на бэкенде и удалить его в Firebase. */
    fun unregister() {
        if (!isFirebaseAvailable) {
            clearLastRegistered()
            clearPending()
            return
        }
        scope.launch {
            val token = runCatching { FirebaseMessaging.getInstance().token.await() }
                .getOrNull()
            if (token != null) {
                runCatching { pushApi.unregister(UnregisterTokenRequest(token = token)) }
                    .onFailure { Timber.w(it, "FCM: снятие токена не удалось") }
            }
            runCatching { FirebaseMessaging.getInstance().deleteToken().await() }
                .onFailure { Timber.w(it, "FCM: deleteToken не удался") }
            clearLastRegistered()
            clearPending()
        }
    }

    private fun markPending() = prefs.edit().putBoolean(KEY_PENDING, true).apply()
    private fun clearPending() = prefs.edit().putBoolean(KEY_PENDING, false).apply()
    private fun setLastRegistered(token: String) =
        prefs.edit().putString(KEY_LAST_TOKEN, token).apply()
    private fun clearLastRegistered() = prefs.edit().remove(KEY_LAST_TOKEN).apply()

    private companion object {
        const val PREFS_NAME = "infy_fcm"
        const val KEY_PENDING = "pending"
        const val KEY_LAST_TOKEN = "last_token"
    }
}
