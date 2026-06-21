package com.infy.messenger.core.util

import java.time.Instant
import java.time.format.DateTimeParseException

/** Парсинг ISO-8601 (UTC-инстант с бэкенда) в epoch-миллисекунды. */
fun parseIsoToMillis(iso: String?): Long? {
    if (iso.isNullOrBlank()) return null
    return try {
        Instant.parse(iso).toEpochMilli()
    } catch (_: DateTimeParseException) {
        null
    }
}

/** Парсинг с дефолтом (для обязательных дат). */
fun parseIsoToMillisOrNow(iso: String?): Long =
    parseIsoToMillis(iso) ?: System.currentTimeMillis()
