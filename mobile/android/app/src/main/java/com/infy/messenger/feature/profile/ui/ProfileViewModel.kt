package com.infy.messenger.feature.profile.ui

import android.net.Uri
import androidx.annotation.StringRes
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.infy.messenger.core.media.MediaUrlBuilder
import com.infy.messenger.core.network.toMessageRes
import com.infy.messenger.feature.profile.data.ProfileRepository
import com.infy.messenger.feature.profile.data.UpdateProfileRequest
import com.infy.messenger.feature.profile.domain.Profile
import com.infy.messenger.feature.profile.domain.ProfileStats
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class ProfileUiState(
    val profile: Profile? = null,
    val stats: ProfileStats? = null,
    val isLoading: Boolean = true,
    val isSaving: Boolean = false,
    val isEditing: Boolean = false,
    // Редактируемые поля.
    val nickname: String = "",
    val bio: String = "",
    val birthdate: String = "",
    val timezone: String = "",
    val interests: List<String> = emptyList(),
    @StringRes val message: Int? = null,
)

@HiltViewModel
class ProfileViewModel @Inject constructor(
    private val repository: ProfileRepository,
    val mediaUrlBuilder: MediaUrlBuilder,
) : ViewModel() {

    private val _uiState = MutableStateFlow(ProfileUiState())
    val uiState: StateFlow<ProfileUiState> = _uiState.asStateFlow()

    init {
        load()
    }

    fun load() {
        _uiState.update { it.copy(isLoading = true) }
        viewModelScope.launch {
            runCatching { repository.getProfile() }
                .onSuccess { profile ->
                    _uiState.update {
                        it.copy(
                            profile = profile,
                            isLoading = false,
                            nickname = profile.nickname,
                            bio = profile.bio.orEmpty(),
                            birthdate = profile.birthdate.orEmpty(),
                            timezone = profile.timezone.orEmpty(),
                            interests = profile.interests,
                        )
                    }
                }
                .onFailure { e -> _uiState.update { it.copy(isLoading = false, message = e.toMessageRes()) } }
            runCatching { repository.getStats() }
                .onSuccess { stats -> _uiState.update { it.copy(stats = stats) } }
        }
    }

    fun startEditing() = _uiState.update { it.copy(isEditing = true) }

    fun onNicknameChange(v: String) = _uiState.update { it.copy(nickname = v) }
    fun onBioChange(v: String) = _uiState.update { it.copy(bio = v) }
    fun onBirthdateChange(v: String) = _uiState.update { it.copy(birthdate = v) }
    fun onTimezoneChange(v: String) = _uiState.update { it.copy(timezone = v) }

    fun addInterest(raw: String) {
        val value = raw.trim().removePrefix("#")
        if (value.isEmpty()) return
        _uiState.update { s ->
            if (s.interests.size >= 10 || s.interests.any { it.equals(value, true) }) s
            else s.copy(interests = s.interests + value)
        }
    }

    fun removeInterest(value: String) = _uiState.update { s ->
        s.copy(interests = s.interests.filterNot { it == value })
    }

    fun save() {
        val s = _uiState.value
        _uiState.update { it.copy(isSaving = true, message = null) }
        viewModelScope.launch {
            runCatching {
                repository.updateProfile(
                    UpdateProfileRequest(
                        nickname = s.nickname.trim().takeIf { it.isNotEmpty() },
                        bio = s.bio.trim(),
                        birthdate = s.birthdate.trim().takeIf { it.isNotEmpty() },
                        interests = s.interests,
                        timezone = s.timezone.trim().takeIf { it.isNotEmpty() },
                    ),
                )
            }.onSuccess { profile ->
                _uiState.update {
                    it.copy(
                        profile = profile,
                        isSaving = false,
                        isEditing = false,
                        message = com.infy.messenger.R.string.profile_saved,
                    )
                }
            }.onFailure { e ->
                _uiState.update { it.copy(isSaving = false, message = e.toMessageRes()) }
            }
        }
    }

    fun uploadAvatar(uri: Uri) {
        viewModelScope.launch {
            runCatching { repository.uploadAvatar(uri) }
                .onSuccess { p -> _uiState.update { it.copy(profile = p) } }
                .onFailure { e -> _uiState.update { it.copy(message = e.toMessageRes()) } }
        }
    }

    fun uploadCover(uri: Uri) {
        viewModelScope.launch {
            runCatching { repository.uploadCover(uri) }
                .onSuccess { p -> _uiState.update { it.copy(profile = p) } }
                .onFailure { e -> _uiState.update { it.copy(message = e.toMessageRes()) } }
        }
    }

    fun consumeMessage() = _uiState.update { it.copy(message = null) }
}
