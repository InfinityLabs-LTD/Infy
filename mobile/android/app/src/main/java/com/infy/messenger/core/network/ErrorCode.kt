package com.infy.messenger.core.network

import androidx.annotation.StringRes
import com.infy.messenger.R

/**
 * Стабильные коды ошибок бэкенда (из CLAUDE.md) и их маппинг на локализованные строки.
 * Синтетические коды (NETWORK, GENERIC) — для не-серверных ситуаций.
 */
object ErrorCode {
    const val NETWORK = "NETWORK"
    const val GENERIC = "GENERIC"

    const val AUTH_INVALID_PASSWORD = "AUTH_INVALID_PASSWORD"
    const val AUTH_USERNAME_TAKEN = "AUTH_USERNAME_TAKEN"
    const val AUTH_EMAIL_TAKEN = "AUTH_EMAIL_TAKEN"
    const val AUTH_USERNAME_RESERVED = "AUTH_USERNAME_RESERVED"
    const val AUTH_TOKEN_EXPIRED = "AUTH_TOKEN_EXPIRED"
    const val AUTH_TOKEN_INVALID = "AUTH_TOKEN_INVALID"
    const val AUTH_SESSION_REVOKED = "AUTH_SESSION_REVOKED"
    const val AUTH_RESET_TOKEN_INVALID = "AUTH_RESET_TOKEN_INVALID"
    const val RATE_LIMIT_EXCEEDED = "RATE_LIMIT_EXCEEDED"
    const val MOD_ACCOUNT_BANNED = "MOD_ACCOUNT_BANNED"
    const val MOD_ACCOUNT_MUTED = "MOD_ACCOUNT_MUTED"

    /** Коды, означающие что текущая сессия больше не валидна → разлогин. */
    val SESSION_INVALIDATING = setOf(
        AUTH_TOKEN_INVALID,
        AUTH_SESSION_REVOKED,
    )

    /** Локализованная строка для кода ошибки. Неизвестные коды → общая ошибка. */
    @StringRes
    fun messageRes(code: String): Int = when (code) {
        NETWORK -> R.string.error_network
        AUTH_INVALID_PASSWORD -> R.string.error_auth_invalid_password
        AUTH_USERNAME_TAKEN -> R.string.error_auth_username_taken
        AUTH_EMAIL_TAKEN -> R.string.error_auth_email_taken
        AUTH_USERNAME_RESERVED -> R.string.error_auth_username_reserved
        AUTH_TOKEN_EXPIRED -> R.string.error_auth_token_expired
        AUTH_TOKEN_INVALID -> R.string.error_auth_token_invalid
        AUTH_SESSION_REVOKED -> R.string.error_auth_session_revoked
        AUTH_RESET_TOKEN_INVALID -> R.string.error_auth_reset_token_invalid
        RATE_LIMIT_EXCEEDED -> R.string.error_rate_limit
        MOD_ACCOUNT_BANNED -> R.string.error_account_banned
        MOD_ACCOUNT_MUTED -> R.string.error_account_muted
        else -> R.string.error_generic
    }
}
