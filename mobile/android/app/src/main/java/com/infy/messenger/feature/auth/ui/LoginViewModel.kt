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

data class LoginUiState(
    val username: String = "",
    val password: String = "",
    @StringRes val usernameError: Int? = null,
    @StringRes val passwordError: Int? = null,
    val isSubmitting: Boolean = false,
    /** Ошибка верхнего уровня (от сервера/сети) для показа в баннере/снекбаре. */
    @StringRes val formError: Int? = null,
) {
    val canSubmit: Boolean
        get() = username.isNotBlank() && password.isNotBlank() && !isSubmitting
}

@HiltViewModel
class LoginViewModel @Inject constructor(
    private val authRepository: AuthRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(LoginUiState())
    val uiState: StateFlow<LoginUiState> = _uiState.asStateFlow()

    fun onUsernameChange(value: String) {
        _uiState.update { it.copy(username = value, usernameError = null, formError = null) }
    }

    fun onPasswordChange(value: String) {
        _uiState.update { it.copy(password = value, passwordError = null, formError = null) }
    }

    fun submit() {
        val state = _uiState.value
        val usernameError = AuthValidation.required(state.username.trim())
        val passwordError = AuthValidation.required(state.password)
        if (usernameError != null || passwordError != null) {
            _uiState.update {
                it.copy(usernameError = usernameError, passwordError = passwordError)
            }
            return
        }

        _uiState.update { it.copy(isSubmitting = true, formError = null) }
        viewModelScope.launch {
            runCatching {
                authRepository.login(state.username.trim(), state.password)
            }.onFailure { error ->
                // Успех приводит к смене AuthState → навигация уедет на home,
                // отдельно состояние «успех» хранить не нужно.
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
