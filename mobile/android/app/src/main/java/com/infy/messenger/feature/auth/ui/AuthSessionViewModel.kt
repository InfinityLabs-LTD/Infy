package com.infy.messenger.feature.auth.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.infy.messenger.feature.auth.data.AuthState
import com.infy.messenger.feature.auth.data.SessionManager
import com.infy.messenger.feature.auth.domain.AuthRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

/** Наблюдает глобальное состояние авторизации и выполняет выход. */
@HiltViewModel
class AuthSessionViewModel @Inject constructor(
    sessionManager: SessionManager,
    private val authRepository: AuthRepository,
) : ViewModel() {

    val authState: StateFlow<AuthState> = sessionManager.authState

    fun logout() {
        viewModelScope.launch {
            authRepository.logout()
        }
    }
}
