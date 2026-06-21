package com.infy.messenger.feature.auth.ui

import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.infy.messenger.R

/**
 * Экран регистрации.
 *
 * @param onNavigateBack возврат к экрану входа
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RegisterScreen(
    onNavigateBack: () -> Unit,
    viewModel: RegisterViewModel = hiltViewModel(),
) {
    // Состояние формы из ViewModel
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()

    // Хост для Snackbar
    val snackbarHostState = remember { SnackbarHostState() }

    // Текст ошибки формы вычисляем в composable-контексте (stringResource нельзя внутри LaunchedEffect)
    val formErrorMessage = uiState.formError?.let { stringResource(it) }
    LaunchedEffect(formErrorMessage) {
        if (formErrorMessage != null) {
            snackbarHostState.showSnackbar(formErrorMessage)
            viewModel.consumeFormError()
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.register_title)) },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = null,
                        )
                    }
                },
            )
        },
        snackbarHost = { SnackbarHost(snackbarHostState) },
    ) { innerPadding ->
        AuthScaffoldColumn(modifier = Modifier.padding(innerPadding)) {
            // Заголовок и подзаголовок
            AuthHeader(
                title = stringResource(R.string.register_title),
                subtitle = stringResource(R.string.register_subtitle),
            )

            // Имя пользователя (с подсказкой)
            AuthTextField(
                value = uiState.username,
                onValueChange = viewModel::onUsernameChange,
                label = stringResource(R.string.register_username),
                errorRes = uiState.usernameError,
                supportingText = stringResource(R.string.register_username_hint),
                enabled = !uiState.isSubmitting,
            )

            // Никнейм (отображаемое имя)
            AuthTextField(
                value = uiState.nickname,
                onValueChange = viewModel::onNicknameChange,
                label = stringResource(R.string.register_nickname),
                errorRes = uiState.nicknameError,
                enabled = !uiState.isSubmitting,
            )

            // Email
            AuthTextField(
                value = uiState.email,
                onValueChange = viewModel::onEmailChange,
                label = stringResource(R.string.register_email),
                errorRes = uiState.emailError,
                keyboardType = KeyboardType.Email,
                enabled = !uiState.isSubmitting,
            )

            // Пароль (с подсказкой)
            AuthTextField(
                value = uiState.password,
                onValueChange = viewModel::onPasswordChange,
                label = stringResource(R.string.register_password),
                errorRes = uiState.passwordError,
                supportingText = stringResource(R.string.register_password_hint),
                enabled = !uiState.isSubmitting,
                isPassword = true,
            )

            // Кнопка регистрации
            AuthPrimaryButton(
                text = stringResource(R.string.register_submit),
                onClick = viewModel::submit,
                enabled = uiState.canSubmit,
                loading = uiState.isSubmitting,
            )

            // Переход к входу
            TextButton(onClick = onNavigateBack) {
                Text(stringResource(R.string.register_have_account))
            }
        }
    }
}
