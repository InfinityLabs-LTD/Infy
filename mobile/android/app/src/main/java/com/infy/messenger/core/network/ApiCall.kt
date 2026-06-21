package com.infy.messenger.core.network

import kotlinx.serialization.json.Json
import retrofit2.HttpException
import retrofit2.Response
import java.io.IOException

/**
 * Оборачивает suspend-вызов Retrofit и приводит любые сбои к [ApiError]:
 * парсит { error: { code, message } } из тела ответа при HTTP-ошибке,
 * сетевые сбои → [ApiError.Network], всё прочее → [ApiError.Unexpected].
 */
suspend fun <T> apiCall(block: suspend () -> T): T {
    try {
        return block()
    } catch (e: HttpException) {
        throw e.toApiError()
    } catch (e: IOException) {
        throw ApiError.Network(e)
    } catch (e: ApiError) {
        throw e
    } catch (e: Throwable) {
        throw ApiError.Unexpected(reason = e)
    }
}

/** Для эндпоинтов, отдающих 204 (Response<Unit>): проверяет успех или поднимает ApiError. */
fun Response<Unit>.ensureSuccessOrThrow() {
    if (isSuccessful) return
    throw toApiError()
}

private val errorJson = Json { ignoreUnknownKeys = true }

private fun HttpException.toApiError(): ApiError {
    val raw = response()?.errorBody()?.string()
    return parseError(raw, code())
}

private fun Response<*>.toApiError(): ApiError {
    val raw = errorBody()?.string()
    return parseError(raw, code())
}

private fun parseError(raw: String?, httpStatus: Int): ApiError {
    if (!raw.isNullOrBlank()) {
        runCatching {
            val envelope = errorJson.decodeFromString<ApiErrorEnvelope>(raw)
            return ApiError.Server(
                code = envelope.error.code,
                serverMessage = envelope.error.message,
                httpStatus = httpStatus,
            )
        }
    }
    return ApiError.Unexpected(httpStatus = httpStatus)
}
