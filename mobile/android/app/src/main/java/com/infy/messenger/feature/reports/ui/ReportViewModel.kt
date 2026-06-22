package com.infy.messenger.feature.reports.ui

import android.net.Uri
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.infy.messenger.feature.reports.data.ReportsRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

/** Категории жалобы (порядок и коды как в web). */
enum class ReportCategory(val code: String) {
    SPAM("SPAM"),
    HARASSMENT("HARASSMENT"),
    HATE("HATE"),
    VIOLENCE("VIOLENCE"),
    SEXUAL("SEXUAL"),
    SCAM("SCAM"),
    ILLEGAL("ILLEGAL"),
    OTHER("OTHER"),
}

data class ReportUiState(
    val category: ReportCategory? = null,
    val description: String = "",
    val evidence: List<Uri> = emptyList(),
    val submitting: Boolean = false,
    val success: Boolean = false,
    val error: Boolean = false,
) {
    /** Кнопка активна только при выбранной категории и непустом описании. */
    val canSubmit: Boolean
        get() = category != null && description.isNotBlank() && !submitting
}

@HiltViewModel
class ReportViewModel @Inject constructor(
    private val repository: ReportsRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(ReportUiState())
    val uiState: StateFlow<ReportUiState> = _uiState.asStateFlow()

    /** Максимум скриншотов-доказательств. */
    val maxEvidence: Int = repository.maxEvidence

    fun selectCategory(category: ReportCategory) {
        _uiState.update { it.copy(category = category, error = false) }
    }

    fun onDescriptionChange(value: String) {
        // Жёсткое ограничение длины (1..1000 на бэкенде).
        val trimmed = if (value.length > MAX_DESCRIPTION) value.take(MAX_DESCRIPTION) else value
        _uiState.update { it.copy(description = trimmed, error = false) }
    }

    fun addEvidence(uris: List<Uri>) {
        _uiState.update {
            val merged = (it.evidence + uris).distinct().take(maxEvidence)
            it.copy(evidence = merged, error = false)
        }
    }

    fun removeEvidence(uri: Uri) {
        _uiState.update { it.copy(evidence = it.evidence - uri) }
    }

    fun submit(targetId: String, chatId: String?) {
        val state = _uiState.value
        if (!state.canSubmit || state.category == null) return
        _uiState.update { it.copy(submitting = true, error = false) }
        viewModelScope.launch {
            val result = repository.submit(
                targetId = targetId,
                category = state.category.code,
                description = state.description.trim(),
                chatId = chatId,
                evidenceUris = state.evidence,
            )
            _uiState.update {
                if (result.isSuccess) {
                    it.copy(submitting = false, success = true)
                } else {
                    it.copy(submitting = false, error = true)
                }
            }
        }
    }

    private companion object {
        const val MAX_DESCRIPTION = 1000
    }
}
