package com.infy.messenger.feature.reports.data

import kotlinx.serialization.Serializable

/**
 * Тело запроса POST /reports.
 * [category] — один из строковых кодов:
 *   SPAM | HARASSMENT | HATE | VIOLENCE | SEXUAL | SCAM | ILLEGAL | OTHER.
 * [description] — 1..1000 символов (обязательно).
 * [evidenceKeys] — storageKey загруженных скриншотов (до 5), опционально.
 */
@Serializable
data class ReportInput(
    val targetId: String,
    val category: String,
    val description: String,
    val chatId: String? = null,
    val messageId: String? = null,
    val evidenceKeys: List<String>? = null,
)

/** Минимальный ответ POST /reports ({ data: Report }). Поля не используются в UI. */
@Serializable
data class ReportDto(
    val id: String,
    val category: String? = null,
    val status: String? = null,
)
