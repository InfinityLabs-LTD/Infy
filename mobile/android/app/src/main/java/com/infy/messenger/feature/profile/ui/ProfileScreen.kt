package com.infy.messenger.feature.profile.ui

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.PhotoCamera
import androidx.compose.material3.AssistChip
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.InputChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Button
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil.compose.AsyncImage
import com.infy.messenger.R
import com.infy.messenger.feature.profile.domain.ProfileStats

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun ProfileScreen(
    onNavigateBack: () -> Unit,
    onOpenSettings: () -> Unit,
    viewModel: ProfileViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val snackbarHostState = remember { SnackbarHostState() }

    // stringResource нельзя вызывать внутри не-composable лямбды let.
    val message = if (uiState.message != null) stringResource(uiState.message!!) else null
    LaunchedEffect(message) {
        if (message != null) {
            snackbarHostState.showSnackbar(message)
            viewModel.consumeMessage()
        }
    }

    val avatarPicker = rememberLauncherForActivityResult(
        ActivityResultContracts.PickVisualMedia(),
    ) { uri -> if (uri != null) viewModel.uploadAvatar(uri) }
    val coverPicker = rememberLauncherForActivityResult(
        ActivityResultContracts.PickVisualMedia(),
    ) { uri -> if (uri != null) viewModel.uploadCover(uri) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.profile_title)) },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, stringResource(R.string.chat_back))
                    }
                },
                actions = {
                    IconButton(onClick = onOpenSettings) {
                        Icon(Icons.Filled.Edit, stringResource(R.string.settings_title))
                    }
                },
            )
        },
        snackbarHost = { SnackbarHost(snackbarHostState) },
    ) { padding ->
        if (uiState.isLoading) {
            Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
            return@Scaffold
        }
        val profile = uiState.profile ?: return@Scaffold

        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            // Аватар + смена.
            Box(contentAlignment = Alignment.BottomEnd) {
                val avatarModel = viewModel.mediaUrlBuilder.absoluteOrNull(profile.avatarUrl)
                Surface(
                    modifier = Modifier.size(104.dp).clip(CircleShape),
                    color = MaterialTheme.colorScheme.primaryContainer,
                ) {
                    if (avatarModel != null) {
                        AsyncImage(avatarModel, null, modifier = Modifier.fillMaxSize())
                    } else {
                        Box(contentAlignment = Alignment.Center) {
                            Text(
                                profile.nickname.take(1).uppercase(),
                                style = MaterialTheme.typography.headlineMedium,
                                color = MaterialTheme.colorScheme.onPrimaryContainer,
                            )
                        }
                    }
                }
                IconButton(
                    onClick = {
                        avatarPicker.launch(
                            PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly),
                        )
                    },
                ) {
                    Icon(Icons.Filled.PhotoCamera, stringResource(R.string.profile_change_avatar))
                }
            }

            Text(profile.nickname, style = MaterialTheme.typography.headlineMedium)
            Text("@${profile.username}", color = MaterialTheme.colorScheme.onSurfaceVariant)
            profile.email?.let { email ->
                val status = if (profile.emailVerified) {
                    stringResource(R.string.profile_email_verified)
                } else {
                    stringResource(R.string.profile_email_unverified)
                }
                Text("$email · $status", style = MaterialTheme.typography.bodySmall)
            }

            // Статистика.
            uiState.stats?.let { StatsRow(it) }

            // Кнопка смены обложки (отдельно — на проф. странице веба обложка сверху).
            Button(
                onClick = {
                    coverPicker.launch(
                        PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly),
                    )
                },
            ) {
                Icon(Icons.Filled.PhotoCamera, null, modifier = Modifier.size(18.dp))
                Text("  " + stringResource(R.string.profile_change_cover))
            }

            // Редактируемые поля.
            if (uiState.isEditing) {
                EditFields(uiState, viewModel)
                Button(onClick = viewModel::save, enabled = !uiState.isSaving, modifier = Modifier.fillMaxWidth()) {
                    Text(stringResource(R.string.profile_save))
                }
            } else {
                profile.bio?.takeIf { it.isNotBlank() }?.let {
                    Text(it, style = MaterialTheme.typography.bodyMedium)
                }
                InterestsRow(uiState.interests, editable = false, onRemove = {})
                Button(onClick = viewModel::startEditing, modifier = Modifier.fillMaxWidth()) {
                    Icon(Icons.Filled.Edit, null, modifier = Modifier.size(18.dp))
                    Text("  " + stringResource(R.string.profile_edit))
                }
            }
        }
    }
}

@Composable
private fun StatsRow(stats: ProfileStats) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceEvenly,
    ) {
        StatCell(stats.contacts, stringResource(R.string.profile_stat_contacts))
        StatCell(stats.chats, stringResource(R.string.profile_stat_chats))
        StatCell(stats.groups, stringResource(R.string.profile_stat_groups))
        StatCell(stats.devices, stringResource(R.string.profile_stat_devices))
    }
}

@Composable
private fun StatCell(value: Int, label: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(value.toString(), style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
        Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun EditFields(uiState: ProfileUiState, viewModel: ProfileViewModel) {
    OutlinedTextField(
        value = uiState.nickname,
        onValueChange = viewModel::onNicknameChange,
        label = { Text(stringResource(R.string.profile_nickname)) },
        modifier = Modifier.fillMaxWidth(),
        singleLine = true,
    )
    OutlinedTextField(
        value = uiState.bio,
        onValueChange = viewModel::onBioChange,
        label = { Text(stringResource(R.string.profile_bio)) },
        modifier = Modifier.fillMaxWidth(),
        maxLines = 4,
    )
    OutlinedTextField(
        value = uiState.birthdate,
        onValueChange = viewModel::onBirthdateChange,
        label = { Text(stringResource(R.string.profile_birthdate)) },
        modifier = Modifier.fillMaxWidth(),
        singleLine = true,
    )
    OutlinedTextField(
        value = uiState.timezone,
        onValueChange = viewModel::onTimezoneChange,
        label = { Text(stringResource(R.string.profile_timezone)) },
        modifier = Modifier.fillMaxWidth(),
        singleLine = true,
    )
    InterestsEditor(uiState.interests, viewModel)
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun InterestsEditor(interests: List<String>, viewModel: ProfileViewModel) {
    var input by remember { mutableStateOf("") }
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        InterestsRow(interests, editable = true, onRemove = viewModel::removeInterest)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            OutlinedTextField(
                value = input,
                onValueChange = { input = it },
                label = { Text(stringResource(R.string.profile_interests_hint)) },
                modifier = Modifier.weight(1f),
                singleLine = true,
            )
            Button(onClick = { viewModel.addInterest(input); input = "" }, enabled = input.isNotBlank()) {
                Text(stringResource(R.string.profile_interest_add))
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun InterestsRow(interests: List<String>, editable: Boolean, onRemove: (String) -> Unit) {
    if (interests.isEmpty()) return
    FlowRow(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        interests.forEach { interest ->
            if (editable) {
                InputChip(
                    selected = false,
                    onClick = { onRemove(interest) },
                    label = { Text("#$interest") },
                )
            } else {
                AssistChip(onClick = {}, label = { Text("#$interest") })
            }
        }
    }
}
