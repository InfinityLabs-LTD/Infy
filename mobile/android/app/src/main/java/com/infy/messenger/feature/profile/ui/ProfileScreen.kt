package com.infy.messenger.feature.profile.ui

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.PhotoCamera
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil.compose.AsyncImage
import com.infy.messenger.R
import com.infy.messenger.feature.profile.domain.ProfileStats
import com.infy.messenger.ui.AuroraBottomNav
import com.infy.messenger.ui.AuroraTab
import com.infy.messenger.ui.theme.Aurora
import com.infy.messenger.ui.theme.AuroraBackground
import com.infy.messenger.ui.theme.Glass2
import com.infy.messenger.ui.theme.GlassStroke
import com.infy.messenger.ui.theme.TextHi
import com.infy.messenger.ui.theme.TextLow
import com.infy.messenger.ui.theme.TextMid

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ProfileScreen(
    onOpenSettings: () -> Unit,
    currentTab: AuroraTab,
    onSelectTab: (AuroraTab) -> Unit,
    viewModel: ProfileViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val snackbarHostState = remember { SnackbarHostState() }

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

    AuroraBackground {
        Box(Modifier.fillMaxSize()) {
            // Шапка экрана: заголовок + шестерёнка настроек.
            Column(Modifier.fillMaxSize()) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .statusBarsPadding()
                        .padding(start = 20.dp, end = 8.dp, top = 12.dp, bottom = 4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = stringResource(R.string.profile_title),
                        style = MaterialTheme.typography.headlineMedium,
                        color = TextHi,
                        modifier = Modifier.weight(1f),
                    )
                    IconButton(onClick = onOpenSettings) {
                        Icon(Icons.Filled.Settings, stringResource(R.string.settings_title), tint = TextMid)
                    }
                }

                if (uiState.isLoading) {
                    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator(color = MaterialTheme.colorScheme.primary)
                    }
                    return@Column
                }
                val profile = uiState.profile ?: return@Column

                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .verticalScroll(rememberScrollState())
                        .padding(start = 16.dp, end = 16.dp, top = 8.dp, bottom = 120.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(14.dp),
                ) {
                    // Аватар + смена.
                    Box(contentAlignment = Alignment.BottomEnd) {
                        val avatarModel = viewModel.mediaUrlBuilder.absoluteOrNull(profile.avatarUrl)
                        Box(
                            modifier = Modifier
                                .size(108.dp)
                                .clip(CircleShape)
                                .background(Aurora.brandVertical)
                                .border(BorderStroke(2.dp, GlassStroke), CircleShape),
                            contentAlignment = Alignment.Center,
                        ) {
                            if (avatarModel != null) {
                                AsyncImage(avatarModel, null, modifier = Modifier.fillMaxSize())
                            } else {
                                Text(
                                    profile.nickname.take(1).uppercase(),
                                    style = MaterialTheme.typography.headlineMedium,
                                    color = Color.White,
                                )
                            }
                        }
                        Box(
                            modifier = Modifier
                                .size(34.dp)
                                .clip(CircleShape)
                                .background(Aurora.gradOwn)
                                .clickable {
                                    avatarPicker.launch(
                                        PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly),
                                    )
                                },
                            contentAlignment = Alignment.Center,
                        ) {
                            Icon(
                                Icons.Filled.PhotoCamera,
                                stringResource(R.string.profile_change_avatar),
                                tint = Color.White,
                                modifier = Modifier.size(18.dp),
                            )
                        }
                    }

                    Text(profile.nickname, style = MaterialTheme.typography.headlineMedium, color = TextHi)
                    Text("@${profile.username}", color = TextLow)
                    profile.email?.let { email ->
                        val status = if (profile.emailVerified) {
                            stringResource(R.string.profile_email_verified)
                        } else {
                            stringResource(R.string.profile_email_unverified)
                        }
                        Text(
                            "$email · $status",
                            style = MaterialTheme.typography.bodySmall,
                            color = TextMid,
                        )
                    }

                    // Статистика в стеклянной карточке.
                    uiState.stats?.let { StatsCard(it) }

                    GlassButton(
                        text = stringResource(R.string.profile_change_cover),
                        icon = Icons.Filled.PhotoCamera,
                        onClick = {
                            coverPicker.launch(
                                PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly),
                            )
                        },
                    )

                    if (uiState.isEditing) {
                        EditFields(uiState, viewModel)
                        PrimaryButton(
                            text = stringResource(R.string.profile_save),
                            enabled = !uiState.isSaving,
                            onClick = viewModel::save,
                        )
                    } else {
                        profile.bio?.takeIf { it.isNotBlank() }?.let {
                            Text(it, style = MaterialTheme.typography.bodyMedium, color = TextMid)
                        }
                        InterestsRow(uiState.interests, editable = false, onRemove = {})
                        PrimaryButton(
                            text = stringResource(R.string.profile_edit),
                            icon = Icons.Filled.Edit,
                            onClick = viewModel::startEditing,
                        )
                    }
                }
            }

            SnackbarHost(snackbarHostState, modifier = Modifier.align(Alignment.BottomCenter))
            AuroraBottomNav(
                current = currentTab,
                onSelect = onSelectTab,
                modifier = Modifier.align(Alignment.BottomCenter),
            )
        }
    }
}

@Composable
private fun StatsCard(stats: ProfileStats) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(20.dp))
            .background(Glass2)
            .border(BorderStroke(1.dp, GlassStroke), RoundedCornerShape(20.dp))
            .padding(vertical = 16.dp),
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
        Text(value.toString(), style = MaterialTheme.typography.titleLarge, color = TextHi, fontWeight = FontWeight.Bold)
        Text(label, style = MaterialTheme.typography.labelSmall, color = TextLow)
    }
}

/** Первичная кнопка с брендовым градиентом. */
@Composable
private fun PrimaryButton(
    text: String,
    onClick: () -> Unit,
    icon: androidx.compose.ui.graphics.vector.ImageVector? = null,
    enabled: Boolean = true,
) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(if (enabled) Aurora.gradOwn else Aurora.brandVertical)
            .clickable(enabled = enabled, onClick = onClick)
            .padding(vertical = 14.dp),
        contentAlignment = Alignment.Center,
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            if (icon != null) Icon(icon, null, tint = Color.White, modifier = Modifier.size(18.dp))
            Text(text, color = Color.White, fontWeight = FontWeight.SemiBold)
        }
    }
}

/** Вторичная стеклянная кнопка. */
@Composable
private fun GlassButton(
    text: String,
    onClick: () -> Unit,
    icon: androidx.compose.ui.graphics.vector.ImageVector? = null,
) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(Glass2)
            .border(BorderStroke(1.dp, GlassStroke), RoundedCornerShape(16.dp))
            .clickable(onClick = onClick)
            .padding(vertical = 13.dp),
        contentAlignment = Alignment.Center,
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            if (icon != null) Icon(icon, null, tint = TextMid, modifier = Modifier.size(18.dp))
            Text(text, color = TextHi, fontWeight = FontWeight.Medium)
        }
    }
}

@Composable
private fun auroraFieldColors() = OutlinedTextFieldDefaults.colors(
    focusedContainerColor = Glass2,
    unfocusedContainerColor = Glass2,
    focusedBorderColor = MaterialTheme.colorScheme.primary,
    unfocusedBorderColor = GlassStroke,
    focusedLabelColor = MaterialTheme.colorScheme.primary,
    unfocusedLabelColor = TextLow,
    cursorColor = MaterialTheme.colorScheme.primary,
    focusedTextColor = TextHi,
    unfocusedTextColor = TextHi,
)

@Composable
private fun EditFields(uiState: ProfileUiState, viewModel: ProfileViewModel) {
    OutlinedTextField(
        value = uiState.nickname,
        onValueChange = viewModel::onNicknameChange,
        label = { Text(stringResource(R.string.profile_nickname)) },
        modifier = Modifier.fillMaxWidth(),
        singleLine = true,
        shape = RoundedCornerShape(16.dp),
        colors = auroraFieldColors(),
    )
    OutlinedTextField(
        value = uiState.bio,
        onValueChange = viewModel::onBioChange,
        label = { Text(stringResource(R.string.profile_bio)) },
        modifier = Modifier.fillMaxWidth(),
        maxLines = 4,
        shape = RoundedCornerShape(16.dp),
        colors = auroraFieldColors(),
    )
    OutlinedTextField(
        value = uiState.birthdate,
        onValueChange = viewModel::onBirthdateChange,
        label = { Text(stringResource(R.string.profile_birthdate)) },
        modifier = Modifier.fillMaxWidth(),
        singleLine = true,
        shape = RoundedCornerShape(16.dp),
        colors = auroraFieldColors(),
    )
    OutlinedTextField(
        value = uiState.timezone,
        onValueChange = viewModel::onTimezoneChange,
        label = { Text(stringResource(R.string.profile_timezone)) },
        modifier = Modifier.fillMaxWidth(),
        singleLine = true,
        shape = RoundedCornerShape(16.dp),
        colors = auroraFieldColors(),
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
                shape = RoundedCornerShape(16.dp),
                colors = auroraFieldColors(),
            )
            PrimaryButtonSmall(
                text = stringResource(R.string.profile_interest_add),
                enabled = input.isNotBlank(),
                onClick = { viewModel.addInterest(input); input = "" },
            )
        }
    }
}

@Composable
private fun PrimaryButtonSmall(text: String, enabled: Boolean, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(14.dp))
            .background(if (enabled) Aurora.gradOwn else Glass2)
            .clickable(enabled = enabled, onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 14.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(text, color = if (enabled) Color.White else TextLow, fontWeight = FontWeight.SemiBold)
    }
}

/** Хэштег-интересы: брендовые стеклянные чипы. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun InterestsRow(interests: List<String>, editable: Boolean, onRemove: (String) -> Unit) {
    if (interests.isEmpty()) return
    FlowRow(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        interests.forEach { interest ->
            Row(
                modifier = Modifier
                    .clip(RoundedCornerShape(12.dp))
                    .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.18f))
                    .border(BorderStroke(1.dp, MaterialTheme.colorScheme.primary.copy(alpha = 0.35f)), RoundedCornerShape(12.dp))
                    .then(if (editable) Modifier.clickable { onRemove(interest) } else Modifier)
                    .padding(horizontal = 10.dp, vertical = 6.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                Text("#$interest", color = TextHi, style = MaterialTheme.typography.labelLarge)
                if (editable) {
                    Icon(Icons.Filled.Close, null, tint = TextMid, modifier = Modifier.size(14.dp))
                }
            }
        }
    }
}
