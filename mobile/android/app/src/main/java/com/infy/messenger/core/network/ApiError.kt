package com.infy.messenger.core.network

/**
 * Доменная ошибка слоя данных. Несёт стабильный [code] от бэкенда (для i18n)
 * и при необходимости HTTP-статус. UI маппит [code] на локализованную строку,
 * не показывая сырой серверный message.
 */
sealed class ApiError(message: String? = null, cause: Throwable? = null) :
    Throwable(message, cause) {

    /** Сервер вернул { error: { code, message } }. */
    data class Server(
        val code: String,
        val serverMessage: String,
        val httpStatus: Int,
    ) : ApiError(serverMessage)

    /** Нет сети / таймаут / DNS — запрос не дошёл или не получил ответ. */
    data class Network(val reason: Throwable) : ApiError(reason.message, reason)

    /** Невалидный ответ: пустое тело, нечитаемый JSON, неожиданный код без тела ошибки. */
    data class Unexpected(val httpStatus: Int? = null, val reason: Throwable? = null) :
        ApiError(reason?.message, reason)

    /**
     * Сессия окончательно недействительна (refresh не удался или сессия отозвана).
     * Триггерит разлогин на уровне приложения.
     */
    data object SessionExpired : ApiError("Session expired")

    /** Стабильный код для маппинга в UI, либо синтетический для не-серверных случаев. */
    val errorCode: String
        get() = when (this) {
            is Server -> code
            is Network -> ErrorCode.NETWORK
            is Unexpected -> ErrorCode.GENERIC
            SessionExpired -> ErrorCode.AUTH_SESSION_REVOKED
        }
}
