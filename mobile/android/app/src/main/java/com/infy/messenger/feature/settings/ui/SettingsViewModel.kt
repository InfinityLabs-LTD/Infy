package com.infy.messenger.feature.settings.ui

import androidx.annotation.StringRes
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.infy.messenger.core.network.toMessageRes
import com.infy.messenger.feature.auth.domain.AuthRepository
import com.infy.messenger.feature.profile.data.ProfileRepository
import com.infy.messenger.feature.profile.data.UpdateProfileRequest
import com.infy.messenger.feature.profile.domain.DeviceSession
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class SettingsUiState(
    val notifyPopup: Boolean = true,
    val notifySound: Boolean = true,
    val notifyVibrate: Boolean = true,
    val aiSuggestReplies: Boolean = true,
    val sessions: List<DeviceSession> = emptyList(),
    val isLoading: Boolean = true,
    @StringRes val message: Int? = null,
)

@HiltViewModel
class SettingsViewModel @Inject constructor(
    private val profileRepository: ProfileRepository,
    private val authRepository: AuthRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(SettingsUiState())
    val uiState: StateFlow<SettingsUiState> = _uiState.asStateFlow()

    init {
        load()
    }

    fun load() {
        _uiState.update { it.copy(isLoading = true) }
        viewModelScope.launch {
            runCatching { profileRepository.getProfile() }.onSuccess { p ->
                _uiState.update {
                    it.copy(
                        notifyPopup = p.notifyPopup,
                        notifySound = p.notifySound,
                        notifyVibrate = p.notifyVibrate,
                        aiSuggestReplies = p.aiSuggestReplies,
                        isLoading = false,
                    )
                }
            }.onFailure { e -> _uiState.update { it.copy(isLoading = false, message = e.toMessageRes()) } }
            refreshSessions()
        }
    }

    private suspend fun refreshSessions() {
        runCatching { profileRepository.listSessions() }
            .onSuccess { list -> _uiState.update { it.copy(sessions = list) } }
    }

    fun setNotifyPopup(value: Boolean) = patch { it.copy(notifyPopup = value) to UpdateProfileRequest(notifyPopup = value) }
    fun setNotifySound(value: Boolean) = patch { it.copy(notifySound = value) to UpdateProfileRequest(notifySound = value) }
    fun setNotifyVibrate(value: Boolean) = patch { it.copy(notifyVibrate = value) to UpdateProfileRequest(notifyVibrate = value) }
    fun setAiSuggest(value: Boolean) = patch { it.copy(aiSuggestReplies = value) to UpdateProfileRequest(aiSuggestReplies = value) }

    /** Оптимистично применяем переключатель и шлём PATCH; при ошибке откатываем загрузкой. */
    private inline fun patch(crossinline transform: (SettingsUiState) -> Pair<SettingsUiState, UpdateProfileRequest>) {
        val (newState, request) = transform(_uiState.value)
        _uiState.value = newState
        viewModelScope.launch {
            runCatching { profileRepository.updateProfile(request) }
                .onFailure { e -> _uiState.update { it.copy(message = e.toMessageRes()) }; load() }
        }
    }

    fun revokeSession(id: String) {
        viewModelScope.launch {
            runCatching { profileRepository.revokeSession(id) }
                .onSuccess { refreshSessions() }
                .onFailure { e -> _uiState.update { it.copy(message = e.toMessageRes()) } }
        }
    }

    fun logoutOtherSessions() {
        viewModelScope.launch {
            runCatching { profileRepository.logoutOtherSessions() }
                .onSuccess { count ->
                    _uiState.update { it.copy(message = com.infy.messenger.R.string.profile_saved) }
                    refreshSessions()
                }
                .onFailure { e -> _uiState.update { it.copy(message = e.toMessageRes()) } }
        }
    }

    /** Полный выход — переводит приложение на экран входа (через AuthState). */
    fun logout() {
        viewModelScope.launch { authRepository.logout() }
    }

    fun consumeMessage() = _uiState.update { it.copy(message = null) }
}
