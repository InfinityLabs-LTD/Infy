package com.infy.messenger.feature.settings.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.infy.messenger.R
import com.infy.messenger.core.util.formatChatTimestamp
import com.infy.messenger.feature.profile.domain.DeviceSession

/** Экран настроек: уведомления, ИИ-подсказки, список устройств и выход. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    onNavigateBack: () -> Unit,
    onLoggedOut: () -> Unit,
    viewModel: SettingsViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val snackbarHostState = remember { SnackbarHostState() }

    // Показ одноразового сообщения (ошибка/успех) и его сброс.
    val message = uiState.message
    if (message != null) {
        val text = stringResource(message)
        LaunchedEffect(message) {
            snackbarHostState.showSnackbar(text)
            viewModel.consumeMessage()
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.settings_title)) },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = stringResource(R.string.chat_back),
                        )
                    }
                },
            )
        },
        snackbarHost = { SnackbarHost(snackbarHostState) },
    ) { innerPadding ->
        if (uiState.isLoading) {
            // Индикатор загрузки по центру.
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(innerPadding),
                verticalArrangement = Arrangement.Center,
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                CircularProgressIndicator()
            }
        } else {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(innerPadding)
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 16.dp, vertical = 8.dp),
            ) {
                // --- Секция «Уведомления» ---
                Text(
                    text = stringResource(R.string.settings_notifications),
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.padding(vertical = 8.dp),
                )
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

                HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp))

                // --- Секция «Устройства» ---
                Text(
                    text = stringResource(R.string.settings_sessions),
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.padding(vertical = 8.dp),
                )
                uiState.sessions.forEach { session ->
                    SessionRow(
                        session = session,
                        onRevoke = { viewModel.revokeSession(session.id) },
                    )
                }

                HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp))

                // --- Кнопки выхода ---
                OutlinedButton(
                    onClick = viewModel::logoutOtherSessions,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 4.dp),
                ) {
                    Text(stringResource(R.string.settings_logout_others))
                }
                Button(
                    onClick = {
                        viewModel.logout()
                        onLoggedOut()
                    },
                    colors = ButtonDefaults.buttonColors(
                        containerColor = MaterialTheme.colorScheme.error,
                    ),
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 4.dp),
                ) {
                    Text(stringResource(R.string.settings_logout))
                }

                Spacer(modifier = Modifier.height(16.dp))
            }
        }
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
            .padding(vertical = 8.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodyLarge,
            modifier = Modifier.weight(1f),
        )
        Switch(checked = checked, onCheckedChange = onChange)
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
            .padding(vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            val title = session.deviceName ?: session.userAgent ?: "—"
            Text(text = title, style = MaterialTheme.typography.bodyLarge)
            Text(
                text = stringResource(
                    R.string.settings_session_last_active,
                    formatChatTimestamp(session.lastActiveAt),
                ),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Spacer(modifier = Modifier.width(8.dp))
        // Текущую сессию помечаем, остальные можно завершить.
        if (session.isCurrent) {
            Text(
                text = stringResource(R.string.settings_sessions_current),
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.primary,
            )
        } else {
            TextButton(onClick = onRevoke) {
                Text(stringResource(R.string.settings_session_revoke))
            }
        }
    }
}
