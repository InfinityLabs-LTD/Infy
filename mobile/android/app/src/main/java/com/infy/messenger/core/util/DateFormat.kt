package com.infy.messenger.core.util

import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.util.Locale

private val timeFormatter = DateTimeFormatter.ofLocalizedTime(FormatStyle.SHORT)
private val dateFormatter = DateTimeFormatter.ofPattern("d MMM", Locale.getDefault())

/** Время сообщения: «14:05» — для пузырей. */
fun formatMessageTime(millis: Long, zone: ZoneId = ZoneId.systemDefault()): String =
    Instant.ofEpochMilli(millis).atZone(zone).toLocalTime().format(timeFormatter)

/**
 * Метка для списка чатов: время, если сегодня, иначе короткая дата.
 */
fun formatChatTimestamp(millis: Long, zone: ZoneId = ZoneId.systemDefault()): String {
    val instant = Instant.ofEpochMilli(millis).atZone(zone)
    val today = Instant.now().atZone(zone).toLocalDate()
    return if (instant.toLocalDate() == today) {
        instant.toLocalTime().format(timeFormatter)
    } else {
        instant.toLocalDate().format(dateFormatter)
    }
}
