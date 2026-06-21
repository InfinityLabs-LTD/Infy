package com.infy.messenger.feature.auth.ui

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.infy.messenger.R

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ForgotPasswordScreen(
    onNavigateBack: () -> Unit,
    viewModel: ForgotPasswordViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val snackbarHostState = remember { SnackbarHostState() }

    // Сообщение об ошибке вычисляем в composable-контексте (stringResource),
    // показываем в LaunchedEffect.
    val errorMessage = uiState.formError?.let { stringResource(it) }
    LaunchedEffect(errorMessage) {
        if (errorMessage != null) {
            snackbarHostState.showSnackbar(errorMessage)
            viewModel.consumeFormError()
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.forgot_title)) },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = stringResource(R.string.action_back),
                        )
                    }
                },
            )
        },
        snackbarHost = { SnackbarHost(snackbarHostState) },
    ) { padding ->
        AuthScaffoldColumn(modifier = Modifier.padding(padding)) {
            AuthHeader(
                title = stringResource(R.string.forgot_title),
                subtitle = stringResource(R.string.forgot_subtitle),
            )

            if (uiState.isSent) {
                // Нейтральное подтверждение: не раскрываем, существует ли аккаунт.
                Text(
                    text = stringResource(R.string.forgot_sent),
                    style = MaterialTheme.typography.bodyMedium,
                    modifier = Modifier.fillMaxWidth(),
                )
                TextButton(onClick = onNavigateBack, modifier = Modifier.fillMaxWidth()) {
                    Text(stringResource(R.string.forgot_back_to_login))
                }
            } else {
                AuthTextField(
                    value = uiState.email,
                    onValueChange = viewModel::onEmailChange,
                    label = stringResource(R.string.forgot_email),
                    errorRes = uiState.emailError,
                    keyboardType = KeyboardType.Email,
                    enabled = !uiState.isSubmitting,
                )
                AuthPrimaryButton(
                    text = stringResource(R.string.forgot_submit),
                    onClick = viewModel::submit,
                    enabled = uiState.canSubmit,
                    loading = uiState.isSubmitting,
                )
            }
        }
    }
}
