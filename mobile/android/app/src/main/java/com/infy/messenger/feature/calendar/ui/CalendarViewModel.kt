package com.infy.messenger.feature.calendar.ui

import androidx.annotation.StringRes
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.infy.messenger.R
import com.infy.messenger.feature.calendar.data.CalendarRepository
import com.infy.messenger.feature.calendar.data.CategoryDto
import com.infy.messenger.feature.calendar.data.EventDto
import com.infy.messenger.feature.calendar.data.EventInput
import com.infy.messenger.feature.calendar.data.PresetCategoryDto
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.YearMonth
import javax.inject.Inject

/** Состояние панели календаря. */
data class CalendarUiState(
    val isLoading: Boolean = true,
    val isSaving: Boolean = false,
    val events: List<EventDto> = emptyList(),
    val presets: List<PresetCategoryDto> = emptyList(),
    val customCategories: List<CategoryDto> = emptyList(),
    val remindersEnabled: Boolean = true,
    val viewMonth: YearMonth = YearMonth.now(),
    val selectedDay: LocalDate = LocalDate.now(),
    @StringRes val errorMessage: Int? = null,
) {
    /** События выбранного дня (по локальной дате eventAt), отсортированы по времени. */
    val selectedDayEvents: List<EventDto>
        get() = events
            .filter { it.localDate() == selectedDay }
            .sortedBy { it.localDateTime() }

    /** Множество локальных дат, на которые есть события (для точек в сетке). */
    fun eventsOn(date: LocalDate): List<EventDto> = events.filter { it.localDate() == date }
}

/** Локальная дата события (по зоне устройства). */
fun EventDto.localDateTime(): OffsetDateTime =
    runCatching { OffsetDateTime.parse(eventAt) }.getOrElse { OffsetDateTime.now() }

fun EventDto.localDate(): LocalDate =
    localDateTime().atZoneSameInstant(ZoneId.systemDefault()).toLocalDate()

@HiltViewModel
class CalendarViewModel @Inject constructor(
    private val repository: CalendarRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(CalendarUiState())
    val uiState: StateFlow<CalendarUiState> = _uiState.asStateFlow()

    private var chatId: String? = null

    /** Загрузить данные для чата. Идемпотентно: повторный вызов с тем же chatId переинициализирует. */
    fun load(chatId: String) {
        this.chatId = chatId
        refresh()
    }

    private fun refresh() {
        val id = chatId ?: return
        _uiState.update { it.copy(isLoading = true, errorMessage = null) }
        viewModelScope.launch {
            runCatching {
                val events = repository.listEvents(id)
                val categories = repository.listCategories(id)
                val settings = repository.getSettings(id)
                Triple(events, categories, settings)
            }.onSuccess { (events, categories, settings) ->
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        events = events,
                        presets = categories.presets,
                        customCategories = categories.custom,
                        remindersEnabled = settings.remindersEnabled,
                    )
                }
            }.onFailure {
                _uiState.update {
                    it.copy(isLoading = false, errorMessage = R.string.calendar_load_error)
                }
            }
        }
    }

    fun prevMonth() = _uiState.update { it.copy(viewMonth = it.viewMonth.minusMonths(1)) }
    fun nextMonth() = _uiState.update { it.copy(viewMonth = it.viewMonth.plusMonths(1)) }

    fun selectDay(date: LocalDate) = _uiState.update {
        // При выборе дня держим месяц синхронным (если кликнули по «хвосту» соседнего месяца).
        it.copy(selectedDay = date, viewMonth = YearMonth.from(date))
    }

    fun toggleReminders() {
        val id = chatId ?: return
        val next = !_uiState.value.remindersEnabled
        _uiState.update { it.copy(remindersEnabled = next) }
        viewModelScope.launch {
            runCatching { repository.setSettings(id, next) }
                .onFailure {
                    // Откат при ошибке.
                    _uiState.update { it.copy(remindersEnabled = !next) }
                }
        }
    }

    /**
     * Сохранить событие (создание или обновление). При успехе — перезагрузка
     * и [onDone]. Ошибки кладутся в errorMessage.
     */
    fun saveEvent(eventId: String?, input: EventInput, onDone: () -> Unit) {
        val id = chatId ?: return
        _uiState.update { it.copy(isSaving = true, errorMessage = null) }
        viewModelScope.launch {
            runCatching {
                if (eventId != null) repository.updateEvent(eventId, input)
                else repository.createEvent(id, input)
            }.onSuccess {
                _uiState.update { it.copy(isSaving = false) }
                refresh()
                onDone()
            }.onFailure {
                _uiState.update {
                    it.copy(isSaving = false, errorMessage = R.string.calendar_save_error)
                }
            }
        }
    }

    fun deleteEvent(eventId: String, onDone: () -> Unit) {
        _uiState.update { it.copy(isSaving = true, errorMessage = null) }
        viewModelScope.launch {
            runCatching { repository.deleteEvent(eventId) }
                .onSuccess {
                    _uiState.update { it.copy(isSaving = false) }
                    refresh()
                    onDone()
                }
                .onFailure {
                    _uiState.update {
                        it.copy(isSaving = false, errorMessage = R.string.calendar_save_error)
                    }
                }
        }
    }

    fun createCategory(name: String, color: String) {
        val id = chatId ?: return
        viewModelScope.launch {
            runCatching { repository.createCategory(id, name, color) }
                .onSuccess { cat -> _uiState.update { it.copy(customCategories = it.customCategories + cat) } }
                .onFailure { /* тихо игнорируем — не критично для основного потока */ }
        }
    }

    fun deleteCategory(categoryId: String) {
        viewModelScope.launch {
            runCatching { repository.deleteCategory(categoryId) }
                .onSuccess {
                    _uiState.update { it.copy(customCategories = it.customCategories.filterNot { c -> c.id == categoryId }) }
                }
                .onFailure { /* тихо игнорируем */ }
        }
    }

    fun consumeError() = _uiState.update { it.copy(errorMessage = null) }
}
