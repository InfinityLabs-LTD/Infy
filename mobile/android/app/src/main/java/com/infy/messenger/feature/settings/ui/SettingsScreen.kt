package com.infy.messenger.feature.settings.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.infy.messenger.R
import com.infy.messenger.core.util.formatChatTimestamp
import com.infy.messenger.feature.profile.domain.DeviceSession
import com.infy.messenger.ui.theme.AuroraBackground
import com.infy.messenger.ui.theme.DangerRed
import com.infy.messenger.ui.theme.Glass2
import com.infy.messenger.ui.theme.GlassStroke
import com.infy.messenger.ui.theme.TextHi
import com.infy.messenger.ui.theme.TextLow
import com.infy.messenger.ui.theme.TextMid

/** Экран настроек: уведомления, ИИ-подсказки, список устройств и выход. */
@Composable
fun SettingsScreen(
    onNavigateBack: () -> Unit,
    onLoggedOut: () -> Unit,
    viewModel: SettingsViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val snackbarHostState = remember { SnackbarHostState() }

    val message = uiState.message
    if (message != null) {
        val text = stringResource(message)
        LaunchedEffect(message) {
            snackbarHostState.showSnackbar(text)
            viewModel.consumeMessage()
        }
    }

    AuroraBackground {
        Box(Modifier.fillMaxSize()) {
            Column(Modifier.fillMaxSize()) {
                // Шапка: назад + заголовок.
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .statusBarsPadding()
                        .padding(start = 4.dp, end = 16.dp, top = 8.dp, bottom = 4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    IconButton(onClick = onNavigateBack) {
                        Icon(
                            Icons.AutoMirrored.Filled.ArrowBack,
                            stringResource(R.string.chat_back),
                            tint = TextHi,
                        )
                    }
                    Text(
                        text = stringResource(R.string.settings_title),
                        style = MaterialTheme.typography.titleLarge,
                        color = TextHi,
                    )
                }

                if (uiState.isLoading) {
                    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator(color = MaterialTheme.colorScheme.primary)
                    }
                } else {
                    Column(
                        modifier = Modifier
                            .fillMaxSize()
                            .verticalScroll(rememberScrollState())
                            .padding(horizontal = 16.dp, vertical = 8.dp),
                        verticalArrangement = Arrangement.spacedBy(16.dp),
                    ) {
                        // --- Секция «Уведомления» ---
                        SectionLabel(stringResource(R.string.settings_notifications))
                        GlassCard {
                            SettingToggle(
                                label = stringResource(R.string.settings_notify_popup),
                                checked = uiState.notifyPopup,
                                onChange = viewModel::setNotifyPopup,
                            )
                            SettingToggle(
                                label = stringResource(R.string.settings_notify_sound),
                                checked = uiState.notifySound,
                                onChange = viewModel::setNotifySound,
                            )
                            SettingToggle(
                                label = stringResource(R.string.settings_notify_vibrate),
                                checked = uiState.notifyVibrate,
                                onChange = viewModel::setNotifyVibrate,
                            )
                            SettingToggle(
                                label = stringResource(R.string.settings_ai_suggest),
                                checked = uiState.aiSuggestReplies,
                                onChange = viewModel::setAiSuggest,
                            )
                        }

                        // --- Секция «Устройства» ---
                        SectionLabel(stringResource(R.string.settings_sessions))
                        GlassCard {
                            uiState.sessions.forEach { session ->
                                SessionRow(
                                    session = session,
                                    onRevoke = { viewModel.revokeSession(session.id) },
                                )
                            }
                        }

                        // --- Кнопки выхода ---
                        GlassActionButton(
                            text = stringResource(R.string.settings_logout_others),
                            onClick = viewModel::logoutOtherSessions,
                        )
                        DangerButton(
                            text = stringResource(R.string.settings_logout),
                            onClick = {
                                viewModel.logout()
                                onLoggedOut()
                            },
                        )

                        Spacer(modifier = Modifier.height(16.dp))
                    }
                }
            }
            SnackbarHost(snackbarHostState, modifier = Modifier.align(Alignment.BottomCenter))
        }
    }
}

@Composable
private fun SectionLabel(text: String) {
    Text(
        text = text,
        style = MaterialTheme.typography.labelLarge,
        color = TextLow,
        fontWeight = FontWeight.SemiBold,
        modifier = Modifier.padding(start = 4.dp),
    )
}

/** Стеклянная карточка-контейнер для группы настроек. */
@Composable
private fun GlassCard(content: @Composable () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(20.dp))
            .background(Glass2)
            .border(BorderStroke(1.dp, GlassStroke), RoundedCornerShape(20.dp))
            .padding(horizontal = 16.dp, vertical = 4.dp),
    ) {
        content()
    }
}

/** Строка-переключатель: подпись слева, Switch справа. */
@Composable
private fun SettingToggle(
    label: String,
    checked: Boolean,
    onChange: (Boolean) -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 10.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodyLarge,
            color = TextHi,
            modifier = Modifier.weight(1f),
        )
        Switch(
            checked = checked,
            onCheckedChange = onChange,
            colors = SwitchDefaults.colors(
                checkedThumbColor = Color.White,
                checkedTrackColor = MaterialTheme.colorScheme.primary,
                uncheckedThumbColor = TextMid,
                uncheckedTrackColor = Glass2,
                uncheckedBorderColor = GlassStroke,
            ),
        )
    }
}

/** Строка устройства: название, время последней активности и кнопка отзыва. */
@Composable
private fun SessionRow(
    session: DeviceSession,
    onRevoke: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            val title = session.deviceName ?: session.userAgent ?: "—"
            Text(text = title, style = MaterialTheme.typography.bodyLarge, color = TextHi)
            Text(
                text = stringResource(
                    R.string.settings_session_last_active,
                    formatChatTimestamp(session.lastActiveAt),
                ),
                style = MaterialTheme.typography.bodySmall,
                color = TextLow,
            )
        }
        Spacer(modifier = Modifier.width(8.dp))
        if (session.isCurrent) {
            Text(
                text = stringResource(R.string.settings_sessions_current),
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.primary,
            )
        } else {
            TextButton(onClick = onRevoke) {
                Text(stringResource(R.string.settings_session_revoke), color = TextMid)
            }
        }
    }
}

@Composable
private fun GlassActionButton(text: String, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(Glass2)
            .border(BorderStroke(1.dp, GlassStroke), RoundedCornerShape(16.dp))
            .clickable(onClick = onClick)
            .padding(vertical = 14.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(text, color = TextHi, fontWeight = FontWeight.Medium)
    }
}

@Composable
private fun DangerButton(text: String, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(DangerRed.copy(alpha = 0.16f))
            .border(BorderStroke(1.dp, DangerRed.copy(alpha = 0.4f)), RoundedCornerShape(16.dp))
            .clickable(onClick = onClick)
            .padding(vertical = 14.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(text, color = DangerRed, fontWeight = FontWeight.SemiBold)
    }
}
