package com.infy.messenger.feature.calendar.data

import kotlinx.serialization.Serializable

/**
 * DTO календаря. Json настроен глобально: ignoreUnknownKeys + explicitNulls=false,
 * поэтому необязательные поля можно опускать, а лишние поля ответа игнорируются.
 */

// ── Событие ─────────────────────────────────────────────────────────────

@Serializable
data class EventDto(
    val id: String,
    val chatId: String,
    val title: String,
    val notes: String? = null,
    val eventAt: String,
    val allDay: Boolean = false,
    val presetKey: String? = null,
    val categoryId: String? = null,
    // Бэкенд возвращает вложенную свою категорию (если событие к ней привязано).
    val category: EventCategoryRefDto? = null,
    val reminders: List<ReminderDto> = emptyList(),
    val createdAt: String? = null,
    val updatedAt: String? = null,
)

/** Сжатая ссылка на свою категорию внутри события. */
@Serializable
data class EventCategoryRefDto(
    val id: String,
    val name: String,
    val color: String,
)

@Serializable
data class ReminderDto(
    val id: String? = null,
    val offsetMin: Int,
    val target: String,
    val notify: Boolean,
    val fireAt: String? = null,
    val sentAt: String? = null,
)

// ── Ввод (создание/обновление) ───────────────────────────────────────────

@Serializable
data class EventInput(
    val title: String,
    val notes: String? = null,
    val eventAt: String,
    val allDay: Boolean = false,
    val presetKey: String? = null,
    val categoryId: String? = null,
    val reminders: List<ReminderInput> = emptyList(),
)

@Serializable
data class ReminderInput(
    val offsetMin: Int,
    val target: String,
    val notify: Boolean,
)

// ── Категории ─────────────────────────────────────────────────────────────

/**
 * Ответ списка категорий: встроенные пресеты + пользовательские.
 * (Бэкенд отдаёт { presets, custom }.)
 */
@Serializable
data class CategoriesDto(
    val presets: List<PresetCategoryDto> = emptyList(),
    val custom: List<CategoryDto> = emptyList(),
)

@Serializable
data class PresetCategoryDto(
    val key: String,
    val name: String,
    val color: String,
    val icon: String? = null,
)

@Serializable
data class CategoryDto(
    val id: String,
    val name: String,
    val color: String,
    val chatId: String? = null,
    val createdById: String? = null,
    val createdAt: String? = null,
)

@Serializable
data class CreateCategoryRequest(
    val name: String,
    val color: String,
)

// ── Настройки ─────────────────────────────────────────────────────────────

@Serializable
data class SettingsDto(
    val remindersEnabled: Boolean = true,
)

@Serializable
data class UpdateSettingsRequest(
    val remindersEnabled: Boolean,
)
