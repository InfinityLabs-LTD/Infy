package com.infy.messenger.feature.auth.ui

import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.TextButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.infy.messenger.R

/**
 * Экран входа.
 *
 * @param onNavigateToRegister переход к экрану регистрации
 * @param onNavigateToForgot переход к восстановлению пароля
 */
@Composable
fun LoginScreen(
    onNavigateToRegister: () -> Unit,
    onNavigateToForgot: () -> Unit,
    viewModel: LoginViewModel = hiltViewModel(),
) {
    // Состояние формы из ViewModel
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()

    // Хост для Snackbar
    val snackbarHostState = remember { SnackbarHostState() }

    // Текст ошибки формы вычисляем в composable-контексте (stringResource нельзя внутри LaunchedEffect)
    val formError = uiState.formError
    val formErrorMessage = if (formError != null) stringResource(formError) else null

    LaunchedEffect(formErrorMessage) {
        if (formErrorMessage != null) {
            snackbarHostState.showSnackbar(formErrorMessage)
            viewModel.consumeFormError()
        }
    }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbarHostState) },
    ) { innerPadding ->
        AuthScaffoldColumn(modifier = Modifier.padding(innerPadding)) {
            // Заголовок и подзаголовок
            AuthHeader(
                title = stringResource(R.string.login_title),
                subtitle = stringResource(R.string.login_subtitle),
            )

            // Поле имени пользователя
            AuthTextField(
                value = uiState.username,
                onValueChange = viewModel::onUsernameChange,
                label = stringResource(R.string.login_username),
                errorRes = uiState.usernameError,
                enabled = !uiState.isSubmitting,
            )

            // Поле пароля
            AuthTextField(
                value = uiState.password,
                onValueChange = viewModel::onPasswordChange,
                label = stringResource(R.string.login_password),
                errorRes = uiState.passwordError,
                enabled = !uiState.isSubmitting,
                isPassword = true,
            )

            // Кнопка входа
            AuthPrimaryButton(
                text = stringResource(R.string.login_submit),
                onClick = viewModel::submit,
                enabled = uiState.canSubmit,
                loading = uiState.isSubmitting,
            )

            // Восстановление пароля
            TextButton(onClick = onNavigateToForgot) {
                Text(stringResource(R.string.login_forgot))
            }

            // Переход к регистрации
            TextButton(onClick = onNavigateToRegister) {
                Text(stringResource(R.string.login_no_account))
            }
        }
    }
}
