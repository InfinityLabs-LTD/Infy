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

data class RegisterUiState(
    val username: String = "",
    val nickname: String = "",
    val password: String = "",
    val email: String = "",
    @StringRes val usernameError: Int? = null,
    @StringRes val nicknameError: Int? = null,
    @StringRes val passwordError: Int? = null,
    @StringRes val emailError: Int? = null,
    val isSubmitting: Boolean = false,
    @StringRes val formError: Int? = null,
) {
    val canSubmit: Boolean
        get() = username.isNotBlank() && nickname.isNotBlank() &&
            password.isNotBlank() && !isSubmitting
}

@HiltViewModel
class RegisterViewModel @Inject constructor(
    private val authRepository: AuthRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(RegisterUiState())
    val uiState: StateFlow<RegisterUiState> = _uiState.asStateFlow()

    fun onUsernameChange(value: String) {
        // username — только нижний регистр и допустимые символы; чистим на лету.
        val sanitized = value.lowercase().filter { it.isLetterOrDigit() || it == '_' }
        _uiState.update { it.copy(username = sanitized, usernameError = null, formError = null) }
    }

    fun onNicknameChange(value: String) {
        _uiState.update { it.copy(nickname = value, nicknameError = null, formError = null) }
    }

    fun onPasswordChange(value: String) {
        _uiState.update { it.copy(password = value, passwordError = null, formError = null) }
    }

    fun onEmailChange(value: String) {
        _uiState.update { it.copy(email = value, emailError = null, formError = null) }
    }

    fun submit() {
        val state = _uiState.value
        val usernameError = AuthValidation.username(state.username)
        val nicknameError = AuthValidation.nickname(state.nickname)
        val passwordError = AuthValidation.password(state.password)
        val emailError = AuthValidation.emailOptional(state.email)

        if (usernameError != null || nicknameError != null ||
            passwordError != null || emailError != null
        ) {
            _uiState.update {
                it.copy(
                    usernameError = usernameError,
                    nicknameError = nicknameError,
                    passwordError = passwordError,
                    emailError = emailError,
                )
            }
            return
        }

        _uiState.update { it.copy(isSubmitting = true, formError = null) }
        viewModelScope.launch {
            runCatching {
                authRepository.register(
                    username = state.username,
                    nickname = state.nickname.trim(),
                    password = state.password,
                    email = state.email.trim().takeIf { it.isNotEmpty() },
                )
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
