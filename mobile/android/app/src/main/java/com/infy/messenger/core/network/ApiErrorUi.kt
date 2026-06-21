package com.infy.messenger.core.network

import androidx.annotation.StringRes
import com.infy.messenger.R

/** Локализованный ресурс сообщения для любой [ApiError] / [Throwable]. */
@StringRes
fun Throwable.toMessageRes(): Int = when (this) {
    is ApiError -> ErrorCode.messageRes(errorCode)
    else -> R.string.error_generic
}
