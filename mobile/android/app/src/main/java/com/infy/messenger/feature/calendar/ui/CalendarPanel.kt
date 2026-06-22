package com.infy.messenger.feature.calendar.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ChevronLeft
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.infy.messenger.R
import com.infy.messenger.feature.calendar.data.EventDto
import com.infy.messenger.ui.theme.DockBg
import com.infy.messenger.ui.theme.Glass2
import com.infy.messenger.ui.theme.GlassStroke
import com.infy.messenger.ui.theme.InfyAccent
import com.infy.messenger.ui.theme.TextHi
import com.infy.messenger.ui.theme.TextLow
import com.infy.messenger.ui.theme.TextMid
import java.time.LocalDate
import java.time.format.TextStyle
import java.util.Locale

/** Дефолтный цвет события, если категория не задана (брендовый фиолетовый). */
private const val DEFAULT_EVENT_COLOR = "#A855F7"

/**
 * Панель календаря чата (паритет с web): затемнение + стеклянная панель почти
 * на весь экран. Шапка, общий тумблер напоминаний, месячная сетка (Пн–Вс),
 * список событий выбранного дня, кнопка «+» и модалка создания/редактирования.
 */
@Composable
fun CalendarPanel(
    chatId: String,
    onClose: () -> Unit,
    viewModel: CalendarViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()

    LaunchedEffect(chatId) { viewModel.load(chatId) }

    // Открытый редактор события: editorEvent null = создание, иначе редактирование.
    var editorEvent by remember { mutableStateOf<EventDto?>(null) }
    var editorOpen by remember { mutableStateOf(false) }

    Dialog(
        onDismissRequest = onClose,
        properties = DialogProperties(usePlatformDefaultWidth = false),
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(Color.Black.copy(alpha = 0.5f))
                .clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                    onClick = onClose,
                ),
            contentAlignment = Alignment.CenterEnd,
        ) {
            // Стеклянная панель справа — почти на всю ширину.
            Box(
                modifier = Modifier
                    .fillMaxHeight()
                    .fillMaxWidth(0.92f)
                    .background(DockBg)
                    .border(BorderStroke(1.dp, GlassStroke), RoundedCornerShape(0.dp))
                    // Перехватываем клики, чтобы не закрывать панель тапом по контенту.
                    .clickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null,
                        onClick = {},
                    ),
            ) {
                Column(modifier = Modifier.fillMaxSize()) {
                    PanelHeader(
                        onClose = onClose,
                        onAdd = {
                            editorEvent = null
                            editorOpen = true
                        },
                    )

                    if (state.isLoading) {
                        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                            CircularProgressIndicator(color = InfyAccent, strokeWidth = 2.dp)
                        }
                    } else {
                        Column(
                            modifier = Modifier
                                .fillMaxSize()
                                .verticalScroll(rememberScrollState()),
                        ) {
                            RemindersToggle(
                                enabled = state.remindersEnabled,
                                onToggle = viewModel::toggleReminders,
                            )
                            MonthNavigator(
                                month = state.viewMonth,
                                onPrev = viewModel::prevMonth,
                                onNext = viewModel::nextMonth,
                            )
                            WeekdayHeader()
                            MonthGrid(state = state, onSelectDay = viewModel::selectDay)
                            DayEvents(
                                state = state,
                                onEventClick = { ev ->
                                    editorEvent = ev
                                    editorOpen = true
                                },
                            )
                            state.errorMessage?.let { res ->
                                Text(
                                    stringResource(res),
                                    color = com.infy.messenger.ui.theme.DangerRed,
                                    fontSize = 13.sp,
                                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                                )
                            }
                            Spacer(Modifier.height(24.dp))
                        }
                    }
                }
            }
        }
    }

    if (editorOpen) {
        EventEditorDialog(
            existing = editorEvent,
            initialDate = state.selectedDay,
            presets = state.presets,
            customCategories = state.customCategories,
            isSaving = state.isSaving,
            errorRes = state.errorMessage,
            onSave = { id, input -> viewModel.saveEvent(id, input) { editorOpen = false; viewModel.consumeError() } },
            onDelete = { id -> viewModel.deleteEvent(id) { editorOpen = false; viewModel.consumeError() } },
            onClose = { editorOpen = false; viewModel.consumeError() },
        )
    }
}

// ── Шапка ───────────────────────────────────────────────────────────────

@Composable
private fun PanelHeader(onClose: () -> Unit, onAdd: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 12.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        IconCircle(
            icon = Icons.Filled.Close,
            contentDescription = stringResource(R.string.calendar_close),
            tint = TextMid,
            onClick = onClose,
        )
        Text(
            stringResource(R.string.calendar_title),
            color = TextHi,
            fontWeight = FontWeight.SemiBold,
            fontSize = 16.sp,
            modifier = Modifier
                .weight(1f)
                .padding(start = 8.dp),
        )
        Box(
            modifier = Modifier
                .size(34.dp)
                .clip(CircleShape)
                .background(InfyAccent.copy(alpha = 0.18f))
                .clickable(onClick = onAdd),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                Icons.Filled.Add,
                contentDescription = stringResource(R.string.calendar_add_event),
                tint = InfyAccent,
                modifier = Modifier.size(20.dp),
            )
        }
    }
}

@Composable
private fun RemindersToggle(enabled: Boolean, onToggle: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onToggle)
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .size(34.dp)
                .clip(CircleShape)
                .background(InfyAccent.copy(alpha = 0.18f)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(Icons.Filled.Notifications, null, tint = InfyAccent, modifier = Modifier.size(18.dp))
        }
        Column(modifier = Modifier.weight(1f).padding(start = 12.dp)) {
            Text(
                stringResource(R.string.calendar_reminders_subtitle),
                color = TextHi,
                fontSize = 14.sp,
            )
            Text(
                stringResource(
                    if (enabled) R.string.calendar_reminders_on else R.string.calendar_reminders_off,
                ),
                color = TextLow,
                fontSize = 12.sp,
            )
        }
        Switch(
            checked = enabled,
            onCheckedChange = { onToggle() },
            colors = SwitchDefaults.colors(
                checkedThumbColor = Color.White,
                checkedTrackColor = com.infy.messenger.ui.theme.InfyPurple,
                uncheckedThumbColor = Color.White,
                uncheckedTrackColor = Glass2,
            ),
        )
    }
}

// ── Сетка месяца ───────────────────────────────────────────────────────────

@Composable
private fun MonthNavigator(
    month: java.time.YearMonth,
    onPrev: () -> Unit,
    onNext: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        IconCircle(
            icon = Icons.Filled.ChevronLeft,
            contentDescription = stringResource(R.string.calendar_prev_month),
            tint = TextMid,
            onClick = onPrev,
        )
        Text(
            "${stringResource(monthNameRes(month.monthValue))} ${month.year}",
            color = TextHi,
            fontWeight = FontWeight.SemiBold,
            fontSize = 15.sp,
        )
        IconCircle(
            icon = Icons.Filled.ChevronRight,
            contentDescription = stringResource(R.string.calendar_next_month),
            tint = TextMid,
            onClick = onNext,
        )
    }
}

@Composable
private fun WeekdayHeader() {
    val labels = listOf(
        R.string.calendar_weekday_mon, R.string.calendar_weekday_tue, R.string.calendar_weekday_wed,
        R.string.calendar_weekday_thu, R.string.calendar_weekday_fri, R.string.calendar_weekday_sat,
        R.string.calendar_weekday_sun,
    )
    Row(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
        labels.forEach { res ->
            Text(
                stringResource(res),
                color = TextLow,
                fontSize = 11.sp,
                textAlign = TextAlign.Center,
                modifier = Modifier.weight(1f).padding(vertical = 4.dp),
            )
        }
    }
}

@Composable
private fun MonthGrid(state: CalendarUiState, onSelectDay: (LocalDate) -> Unit) {
    val cells = monthCells(state.viewMonth)
    val today = LocalDate.now()
    Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
        cells.chunked(7).forEach { week ->
            Row(modifier = Modifier.fillMaxWidth()) {
                week.forEach { date ->
                    Box(modifier = Modifier.weight(1f).aspectRatio(1f), contentAlignment = Alignment.Center) {
                        if (date != null) {
                            DayCell(
                                date = date,
                                isToday = date == today,
                                isSelected = date == state.selectedDay,
                                dots = state.eventsOn(date).take(3).map { eventColor(it, state) },
                                onClick = { onSelectDay(date) },
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun DayCell(
    date: LocalDate,
    isToday: Boolean,
    isSelected: Boolean,
    dots: List<Color>,
    onClick: () -> Unit,
) {
    Box(
        modifier = Modifier
            .size(38.dp)
            .clip(RoundedCornerShape(10.dp))
            .then(
                if (isSelected) Modifier.background(InfyAccent.copy(alpha = 0.28f))
                else Modifier,
            )
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                date.dayOfMonth.toString(),
                color = when {
                    isSelected -> Color.White
                    isToday -> com.infy.messenger.ui.theme.InfyHighlight
                    else -> TextMid
                },
                fontSize = 13.sp,
                fontWeight = if (isToday || isSelected) FontWeight.SemiBold else FontWeight.Normal,
            )
            if (dots.isNotEmpty()) {
                Row(horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                    dots.forEach { c ->
                        Box(Modifier.size(4.dp).clip(CircleShape).background(c))
                    }
                }
            }
        }
    }
}

// ── События выбранного дня ──────────────────────────────────────────────

@Composable
private fun DayEvents(state: CalendarUiState, onEventClick: (EventDto) -> Unit) {
    val events = state.selectedDayEvents
    Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp)) {
        Text(
            dayTitle(state.selectedDay),
            color = TextLow,
            fontSize = 12.sp,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.padding(bottom = 8.dp),
        )
        if (events.isEmpty()) {
            Text(
                stringResource(R.string.calendar_empty_day),
                color = TextLow,
                fontSize = 13.sp,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth().padding(vertical = 12.dp),
            )
        } else {
            events.forEach { ev ->
                EventRow(ev = ev, state = state, onClick = { onEventClick(ev) })
                Spacer(Modifier.height(6.dp))
            }
        }
    }
}

@Composable
private fun EventRow(ev: EventDto, state: CalendarUiState, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(Glass2)
            .clickable(onClick = onClick)
            .padding(10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .width(4.dp)
                .height(36.dp)
                .clip(RoundedCornerShape(2.dp))
                .background(eventColor(ev, state)),
        )
        Column(modifier = Modifier.weight(1f).padding(start = 10.dp)) {
            Text(
                ev.title,
                color = TextHi,
                fontSize = 14.sp,
                fontWeight = FontWeight.Medium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            val time = if (ev.allDay) stringResource(R.string.calendar_event_all_day) else eventTime(ev)
            val label = eventCategoryLabel(ev, state)
            Text(
                if (label.isNotEmpty()) "$time · $label" else time,
                color = TextMid,
                fontSize = 12.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            if (!ev.notes.isNullOrBlank()) {
                Text(
                    ev.notes,
                    color = TextLow,
                    fontSize = 12.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        if (ev.reminders.isNotEmpty()) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Filled.Notifications, null, tint = TextLow, modifier = Modifier.size(13.dp))
                Text(ev.reminders.size.toString(), color = TextLow, fontSize = 11.sp, modifier = Modifier.padding(start = 2.dp))
            }
        }
    }
}

// ── Маленький круглый icon-button ──────────────────────────────────────────

@Composable
private fun IconCircle(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    contentDescription: String?,
    tint: Color,
    onClick: () -> Unit,
) {
    Box(
        modifier = Modifier
            .size(32.dp)
            .clip(CircleShape)
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Icon(icon, contentDescription, tint = tint, modifier = Modifier.size(20.dp))
    }
}

// ── Цвет/подпись категории события ──────────────────────────────────────────

private fun parseColor(hex: String): Color = runCatching {
    val clean = hex.removePrefix("#")
    val value = when (clean.length) {
        6 -> 0xFF000000L or clean.toLong(16)
        8 -> {
            // #RRGGBBAA → ARGB
            val rgb = clean.substring(0, 6).toLong(16)
            val a = clean.substring(6, 8).toLong(16)
            (a shl 24) or rgb
        }
        else -> 0xFFA855F7L
    }
    Color(value)
}.getOrElse { Color(0xFFA855F7) }

private fun eventColor(ev: EventDto, state: CalendarUiState): Color {
    ev.category?.let { return parseColor(it.color) }
    ev.presetKey?.let { key ->
        state.presets.find { it.key == key }?.let { return parseColor(it.color) }
    }
    return parseColor(DEFAULT_EVENT_COLOR)
}

private fun eventCategoryLabel(ev: EventDto, state: CalendarUiState): String {
    ev.category?.let { return it.name }
    ev.presetKey?.let { key -> state.presets.find { it.key == key }?.let { return it.name } }
    return ""
}

// ── Форматирование дат ──────────────────────────────────────────────────────

private fun eventTime(ev: EventDto): String {
    val dt = ev.localDateTime().atZoneSameInstant(java.time.ZoneId.systemDefault())
    return "%02d:%02d".format(dt.hour, dt.minute)
}

private fun dayTitle(date: LocalDate): String {
    val weekday = date.dayOfWeek.getDisplayName(TextStyle.FULL, Locale("ru"))
    val month = date.month.getDisplayName(TextStyle.FULL, Locale("ru"))
    return "$weekday, ${date.dayOfMonth} $month".replaceFirstChar { it.uppercase() }
}

private fun monthNameRes(month: Int): Int = when (month) {
    1 -> R.string.calendar_month_jan; 2 -> R.string.calendar_month_feb
    3 -> R.string.calendar_month_mar; 4 -> R.string.calendar_month_apr
    5 -> R.string.calendar_month_may; 6 -> R.string.calendar_month_jun
    7 -> R.string.calendar_month_jul; 8 -> R.string.calendar_month_aug
    9 -> R.string.calendar_month_sep; 10 -> R.string.calendar_month_oct
    11 -> R.string.calendar_month_nov; else -> R.string.calendar_month_dec
}

/** Ячейки месяца, выровненные на Пн–Вс; null = пустые «хвосты». */
private fun monthCells(month: java.time.YearMonth): List<LocalDate?> {
    val first = month.atDay(1)
    // Пн = 0 … Вс = 6
    val startOffset = (first.dayOfWeek.value + 6) % 7
    val daysInMonth = month.lengthOfMonth()
    val cells = ArrayList<LocalDate?>()
    repeat(startOffset) { cells.add(null) }
    for (d in 1..daysInMonth) cells.add(month.atDay(d))
    while (cells.size % 7 != 0) cells.add(null)
    return cells
}
