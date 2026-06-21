package com.infy.messenger.feature.auth.ui

import androidx.annotation.StringRes
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.infy.messenger.core.network.toMessageRes
import com.infy.messenger.feature.auth.domain.AuthRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class ForgotPasswordUiState(
    val email: String = "",
    @StringRes val emailError: Int? = null,
    val isSubmitting: Boolean = false,
    /** true после успешной отправки — показываем нейтральное подтверждение. */
    val isSent: Boolean = false,
    @StringRes val formError: Int? = null,
) {
    val canSubmit: Boolean
        get() = email.isNotBlank() && !isSubmitting && !isSent
}

@HiltViewModel
class ForgotPasswordViewModel @Inject constructor(
    private val authRepository: AuthRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(ForgotPasswordUiState())
    val uiState: StateFlow<ForgotPasswordUiState> = _uiState.asStateFlow()

    fun onEmailChange(value: String) {
        _uiState.update { it.copy(email = value, emailError = null, formError = null) }
    }

    fun submit() {
        val state = _uiState.value
        val emailError = AuthValidation.email(state.email)
        if (emailError != null) {
            _uiState.update { it.copy(emailError = emailError) }
            return
        }

        _uiState.update { it.copy(isSubmitting = true, formError = null) }
        viewModelScope.launch {
            runCatching {
                authRepository.requestPasswordReset(state.email.trim())
            }.onSuccess {
                // Сервер всегда отвечает 204 — показываем нейтральное подтверждение.
                _uiState.update { it.copy(isSubmitting = false, isSent = true) }
            }.onFailure { error ->
                _uiState.update {
                    it.copy(isSubmitting = false, formError = error.toMessageRes())
                }
            }
        }
    }

    fun consumeFormError() {
        _uiState.update { it.copy(formError = null) }
    }
}
