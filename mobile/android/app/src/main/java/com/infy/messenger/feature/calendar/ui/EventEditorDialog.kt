package com.infy.messenger.feature.calendar.ui

import android.app.DatePickerDialog
import android.app.TimePickerDialog
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.NotificationsOff
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.infy.messenger.R
import com.infy.messenger.feature.calendar.data.CategoryDto
import com.infy.messenger.feature.calendar.data.EventDto
import com.infy.messenger.feature.calendar.data.EventInput
import com.infy.messenger.feature.calendar.data.PresetCategoryDto
import com.infy.messenger.feature.calendar.data.ReminderInput
import com.infy.messenger.ui.theme.Aurora
import com.infy.messenger.ui.theme.DangerRed
import com.infy.messenger.ui.theme.DockBg
import com.infy.messenger.ui.theme.Glass2
import com.infy.messenger.ui.theme.GlassStroke
import com.infy.messenger.ui.theme.InfyAccent
import com.infy.messenger.ui.theme.TextHi
import com.infy.messenger.ui.theme.TextLow
import com.infy.messenger.ui.theme.TextMid
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.OffsetDateTime
import java.time.ZoneId

/** Цели напоминания. */
private val TARGET_OPTIONS = listOf(
    "SELF" to R.string.calendar_target_self,
    "PARTNER" to R.string.calendar_target_partner,
    "BOTH" to R.string.calendar_target_both,
)

/** Пресеты смещения напоминания (минуты → подпись). */
private val OFFSET_OPTIONS = listOf(
    0 to R.string.calendar_offset_at,
    10 to R.string.calendar_offset_10m,
    30 to R.string.calendar_offset_30m,
    60 to R.string.calendar_offset_1h,
    60 * 24 to R.string.calendar_offset_1d,
    60 * 24 * 7 to R.string.calendar_offset_1w,
)

/** Черновик одного напоминания в редакторе. */
private data class DraftReminder(
    val offsetMin: Int,
    val target: String,
    val notify: Boolean,
)

/** Выбранная категория: пресет по ключу или своя по id (взаимоисключающи). */
private data class CategorySelection(
    val presetKey: String? = null,
    val categoryId: String? = null,
)

/**
 * Модалка создания/редактирования события календаря (паритет с web EventModal).
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun EventEditorDialog(
    existing: EventDto?,
    initialDate: LocalDate,
    presets: List<PresetCategoryDto>,
    customCategories: List<CategoryDto>,
    isSaving: Boolean,
    errorRes: Int?,
    onSave: (eventId: String?, input: EventInput) -> Unit,
    onDelete: (eventId: String) -> Unit,
    onClose: () -> Unit,
) {
    val editing = existing != null
    val context = LocalContext.current

    var title by remember { mutableStateOf(existing?.title.orEmpty()) }
    var notes by remember { mutableStateOf(existing?.notes.orEmpty()) }
    var allDay by remember { mutableStateOf(existing?.allDay ?: false) }
    var localError by remember { mutableStateOf<Int?>(null) }

    // Дата/время: для существующего — из eventAt, иначе initialDate + следующий круглый час.
    var dateTime by remember {
        mutableStateOf(
            if (existing != null) {
                runCatching {
                    OffsetDateTime.parse(existing.eventAt)
                        .atZoneSameInstant(ZoneId.systemDefault()).toLocalDateTime()
                }.getOrElse { defaultStart(initialDate) }
            } else {
                defaultStart(initialDate)
            },
        )
    }

    var selection by remember {
        mutableStateOf(
            when {
                existing?.categoryId != null -> CategorySelection(categoryId = existing.categoryId)
                existing?.presetKey != null -> CategorySelection(presetKey = existing.presetKey)
                else -> CategorySelection(presetKey = presets.firstOrNull()?.key)
            },
        )
    }

    val reminders = remember {
        mutableStateListOf<DraftReminder>().apply {
            val initial = existing?.reminders?.map { DraftReminder(it.offsetMin, it.target, it.notify) }
            if (initial.isNullOrEmpty()) add(DraftReminder(30, "BOTH", true))
            else addAll(initial)
        }
    }

    Dialog(
        onDismissRequest = { if (!isSaving) onClose() },
        properties = DialogProperties(usePlatformDefaultWidth = false),
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .background(Color.Black.copy(alpha = 0.6f))
                .padding(horizontal = 16.dp, vertical = 28.dp),
            contentAlignment = Alignment.Center,
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(max = 620.dp)
                    .clip(RoundedCornerShape(24.dp))
                    .background(DockBg)
                    .border(BorderStroke(1.dp, GlassStroke), RoundedCornerShape(24.dp))
                    .verticalScroll(rememberScrollState())
                    .padding(20.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                // Шапка.
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        stringResource(if (editing) R.string.calendar_event_edit else R.string.calendar_event_new),
                        color = TextHi,
                        fontWeight = FontWeight.SemiBold,
                        fontSize = 16.sp,
                        modifier = Modifier.weight(1f),
                    )
                    Box(
                        modifier = Modifier
                            .size(32.dp)
                            .clip(CircleShape)
                            .clickable(enabled = !isSaving, onClick = onClose),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(Icons.Filled.Close, stringResource(R.string.calendar_close), tint = TextMid, modifier = Modifier.size(20.dp))
                    }
                }

                // Название.
                OutlinedTextField(
                    value = title,
                    onValueChange = { if (it.length <= 120) title = it },
                    label = { Text(stringResource(R.string.calendar_event_title)) },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    shape = RoundedCornerShape(14.dp),
                    colors = fieldColors(),
                )

                // Категория.
                Text(stringResource(R.string.calendar_event_category), color = TextMid, fontSize = 13.sp, fontWeight = FontWeight.Medium)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    presets.forEach { p ->
                        CategoryChip(
                            label = p.name,
                            color = parseHex(p.color),
                            selected = selection.presetKey == p.key,
                            onClick = { selection = CategorySelection(presetKey = p.key) },
                        )
                    }
                    customCategories.forEach { c ->
                        CategoryChip(
                            label = c.name,
                            color = parseHex(c.color),
                            selected = selection.categoryId == c.id,
                            onClick = { selection = CategorySelection(categoryId = c.id) },
                        )
                    }
                }

                // Дата/время + «весь день».
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(stringResource(R.string.calendar_event_datetime), color = TextMid, fontSize = 13.sp, fontWeight = FontWeight.Medium, modifier = Modifier.weight(1f))
                    Text(stringResource(R.string.calendar_event_all_day), color = if (allDay) InfyAccent else TextLow, fontSize = 12.sp, modifier = Modifier.padding(end = 8.dp))
                    Switch(
                        checked = allDay,
                        onCheckedChange = { allDay = it },
                        colors = SwitchDefaults.colors(
                            checkedThumbColor = Color.White,
                            checkedTrackColor = com.infy.messenger.ui.theme.InfyPurple,
                            uncheckedThumbColor = Color.White,
                            uncheckedTrackColor = Glass2,
                        ),
                    )
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    PickerButton(
                        text = "%02d.%02d.%04d".format(dateTime.dayOfMonth, dateTime.monthValue, dateTime.year),
                        modifier = Modifier.weight(1f),
                    ) {
                        DatePickerDialog(
                            context,
                            { _, y, m, d -> dateTime = dateTime.withYear(y).withMonth(m + 1).withDayOfMonth(d) },
                            dateTime.year, dateTime.monthValue - 1, dateTime.dayOfMonth,
                        ).show()
                    }
                    if (!allDay) {
                        PickerButton(
                            text = "%02d:%02d".format(dateTime.hour, dateTime.minute),
                            modifier = Modifier.weight(1f),
                        ) {
                            TimePickerDialog(
                                context,
                                { _, h, min -> dateTime = dateTime.withHour(h).withMinute(min) },
                                dateTime.hour, dateTime.minute, true,
                            ).show()
                        }
                    }
                }

                // Заметки.
                OutlinedTextField(
                    value = notes,
                    onValueChange = { if (it.length <= 1000) notes = it },
                    label = { Text(stringResource(R.string.calendar_event_notes)) },
                    modifier = Modifier.fillMaxWidth().heightIn(min = 72.dp),
                    minLines = 2,
                    maxLines = 4,
                    shape = RoundedCornerShape(14.dp),
                    colors = fieldColors(),
                )

                // Напоминания.
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(stringResource(R.string.calendar_event_reminder), color = TextMid, fontSize = 13.sp, fontWeight = FontWeight.Medium, modifier = Modifier.weight(1f))
                    if (reminders.size < 5) {
                        Text(
                            stringResource(R.string.calendar_reminder_add),
                            color = InfyAccent,
                            fontSize = 13.sp,
                            modifier = Modifier.clickable { reminders.add(DraftReminder(60, "BOTH", true)) },
                        )
                    }
                }
                if (reminders.isEmpty()) {
                    Text(stringResource(R.string.calendar_reminder_none), color = TextLow, fontSize = 12.sp)
                }
                reminders.forEachIndexed { index, r ->
                    ReminderEditor(
                        draft = r,
                        onChange = { reminders[index] = it },
                        onRemove = { reminders.removeAt(index) },
                    )
                }

                (localError ?: errorRes)?.let { res ->
                    Text(stringResource(res), color = DangerRed, fontSize = 13.sp)
                }

                // Кнопки.
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    if (editing) {
                        Box(
                            modifier = Modifier
                                .clip(RoundedCornerShape(14.dp))
                                .background(DangerRed.copy(alpha = 0.14f))
                                .clickable(enabled = !isSaving) { existing?.id?.let(onDelete) }
                                .padding(horizontal = 16.dp, vertical = 14.dp),
                            contentAlignment = Alignment.Center,
                        ) {
                            Text(stringResource(R.string.calendar_event_delete), color = DangerRed, fontWeight = FontWeight.Medium, fontSize = 14.sp)
                        }
                    }
                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .clip(RoundedCornerShape(14.dp))
                            .background(Aurora.gradOwn)
                            .clickable(enabled = !isSaving) {
                                if (title.isBlank()) {
                                    localError = R.string.calendar_event_title_required
                                } else {
                                    localError = null
                                    onSave(
                                        existing?.id,
                                        buildInput(title, notes, allDay, dateTime, selection, reminders),
                                    )
                                }
                            }
                            .padding(vertical = 14.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        if (isSaving) {
                            CircularProgressIndicator(color = Color.White, strokeWidth = 2.dp, modifier = Modifier.size(20.dp))
                        } else {
                            Text(
                                stringResource(if (editing) R.string.calendar_event_save else R.string.calendar_event_create),
                                color = Color.White,
                                fontWeight = FontWeight.SemiBold,
                                fontSize = 14.sp,
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun CategoryChip(label: String, color: Color, selected: Boolean, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .clip(CircleShape)
            .background(if (selected) color else Glass2)
            .clickable(onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 7.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(9.dp).clip(CircleShape).background(if (selected) Color.White else color))
        Text(
            label,
            color = if (selected) Color.White else TextMid,
            fontSize = 12.sp,
            fontWeight = FontWeight.Medium,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(start = 6.dp),
        )
    }
}

@Composable
private fun PickerButton(text: String, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(14.dp))
            .background(Glass2)
            .border(BorderStroke(1.dp, GlassStroke), RoundedCornerShape(14.dp))
            .clickable(onClick = onClick)
            .padding(vertical = 12.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(text, color = TextHi, fontSize = 14.sp)
    }
}

@Composable
private fun ReminderEditor(
    draft: DraftReminder,
    onChange: (DraftReminder) -> Unit,
    onRemove: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(Glass2)
            .padding(10.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        // Смещение — горизонтальный набор чипов.
        Row(verticalAlignment = Alignment.CenterVertically) {
            ChipRowSelector(
                options = OFFSET_OPTIONS.map { it.first.toString() to stringResource(it.second) },
                selectedKey = draft.offsetMin.toString(),
                onSelect = { key -> onChange(draft.copy(offsetMin = key.toInt())) },
                modifier = Modifier.weight(1f),
            )
            Box(
                modifier = Modifier
                    .size(28.dp)
                    .clip(CircleShape)
                    .clickable(onClick = onRemove),
                contentAlignment = Alignment.Center,
            ) {
                Icon(Icons.Filled.Close, stringResource(R.string.calendar_reminder_remove), tint = TextLow, modifier = Modifier.size(16.dp))
            }
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            ChipRowSelector(
                options = TARGET_OPTIONS.map { it.first to stringResource(it.second) },
                selectedKey = draft.target,
                onSelect = { key -> onChange(draft.copy(target = key)) },
                modifier = Modifier.weight(1f),
            )
            Spacer(Modifier.width(8.dp))
            // Тумблер push для этого напоминания.
            Row(
                modifier = Modifier
                    .clip(RoundedCornerShape(10.dp))
                    .background(if (draft.notify) InfyAccent.copy(alpha = 0.18f) else Glass2)
                    .clickable { onChange(draft.copy(notify = !draft.notify)) }
                    .padding(horizontal = 10.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(
                    if (draft.notify) Icons.Filled.Notifications else Icons.Filled.NotificationsOff,
                    null,
                    tint = if (draft.notify) InfyAccent else TextLow,
                    modifier = Modifier.size(14.dp),
                )
                Text(
                    stringResource(R.string.calendar_reminder_push),
                    color = if (draft.notify) InfyAccent else TextLow,
                    fontSize = 12.sp,
                    modifier = Modifier.padding(start = 4.dp),
                )
            }
        }
    }
}

/** Простой горизонтальный селектор-чипы по строковому ключу. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ChipRowSelector(
    options: List<Pair<String, String>>,
    selectedKey: String,
    onSelect: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    FlowRow(
        modifier = modifier,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        options.forEach { (key, label) ->
            val selected = key == selectedKey
            Box(
                modifier = Modifier
                    .clip(CircleShape)
                    .background(if (selected) InfyAccent.copy(alpha = 0.22f) else Glass2)
                    .clickable { onSelect(key) }
                    .padding(horizontal = 10.dp, vertical = 6.dp),
            ) {
                Text(
                    label,
                    color = if (selected) TextHi else TextMid,
                    fontSize = 12.sp,
                    fontWeight = if (selected) FontWeight.Medium else FontWeight.Normal,
                )
            }
        }
    }
}

// ── Хелперы ────────────────────────────────────────────────────────────────

@Composable
private fun fieldColors() = OutlinedTextFieldDefaults.colors(
    focusedContainerColor = Glass2,
    unfocusedContainerColor = Glass2,
    focusedBorderColor = MaterialTheme.colorScheme.primary,
    unfocusedBorderColor = GlassStroke,
    focusedLabelColor = MaterialTheme.colorScheme.primary,
    unfocusedLabelColor = TextLow,
    cursorColor = MaterialTheme.colorScheme.primary,
    focusedTextColor = TextHi,
    unfocusedTextColor = TextHi,
)

/** Дата по умолчанию: выбранный день + следующий круглый час. */
private fun defaultStart(date: LocalDate): LocalDateTime {
    val now = LocalTime.now()
    return LocalDateTime.of(date, LocalTime.of((now.hour + 1) % 24, 0))
}

/** Собрать [EventInput] из состояния редактора (eventAt — ISO с offset). */
private fun buildInput(
    title: String,
    notes: String,
    allDay: Boolean,
    dateTime: LocalDateTime,
    selection: CategorySelection,
    reminders: List<DraftReminder>,
): EventInput {
    // Для «весь день» нормализуем время в начало дня.
    val effective = if (allDay) dateTime.toLocalDate().atStartOfDay() else dateTime
    val zoned = effective.atZone(ZoneId.systemDefault())
    val iso = zoned.toOffsetDateTime().toString()
    return EventInput(
        title = title.trim(),
        notes = notes.trim().ifBlank { null },
        eventAt = iso,
        allDay = allDay,
        presetKey = selection.presetKey,
        categoryId = selection.categoryId,
        reminders = reminders.map { ReminderInput(it.offsetMin, it.target, it.notify) },
    )
}

private fun parseHex(hex: String): Color = runCatching {
    val clean = hex.removePrefix("#")
    val value = when (clean.length) {
        6 -> 0xFF000000L or clean.toLong(16)
        8 -> {
            val rgb = clean.substring(0, 6).toLong(16)
            val a = clean.substring(6, 8).toLong(16)
            (a shl 24) or rgb
        }
        else -> 0xFFA855F7L
    }
    Color(value)
}.getOrElse { Color(0xFFA855F7) }
