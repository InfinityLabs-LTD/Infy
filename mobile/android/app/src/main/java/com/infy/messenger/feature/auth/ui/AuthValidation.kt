package com.infy.messenger.feature.auth.ui

import androidx.annotation.StringRes
import com.infy.messenger.R

/**
 * Клиентская валидация полей. Зеркалит правила бэкенда (auth.schema.ts):
 * username 3–32 [a-z0-9_], password ≥ 8, nickname ≥ 1, email — формат.
 * Возвращает ресурс ошибки или null, если поле валидно.
 */
object AuthValidation {

    private val USERNAME_REGEX = Regex("^[a-z0-9_]{3,32}$")
    private val EMAIL_REGEX = Regex("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$")

    @StringRes
    fun username(value: String): Int? =
        if (USERNAME_REGEX.matches(value)) null else R.string.validation_username_invalid

    @StringRes
    fun nickname(value: String): Int? =
        if (value.trim().isNotEmpty()) null else R.string.validation_nickname_required

    @StringRes
    fun password(value: String): Int? =
        if (value.length >= 8) null else R.string.validation_password_short

    /** Email обязателен. */
    @StringRes
    fun email(value: String): Int? =
        if (EMAIL_REGEX.matches(value.trim())) null else R.string.validation_email_invalid

    /** Email необязателен: пустой — ок, непустой — должен быть валидным. */
    @StringRes
    fun emailOptional(value: String): Int? =
        if (value.isBlank()) null else email(value)

    @StringRes
    fun required(value: String): Int? =
        if (value.isNotEmpty()) null else R.string.validation_field_required
}
