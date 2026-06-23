package com.infy.messenger.feature.auth.ui

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.outlined.AlternateEmail
import androidx.compose.material.icons.outlined.Badge
import androidx.compose.material.icons.outlined.Email
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.Visibility
import androidx.compose.material.icons.outlined.VisibilityOff
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.infy.messenger.R
import com.infy.messenger.ui.theme.AuthTextIcon

/**
 * Экран регистрации в новом дизайне (зеркалит web RegisterPage): aurora-сцена,
 * стеклянная карточка, поля с иконками, градиентная кнопка действия.
 */
@Composable
fun RegisterScreen(
    onNavigateBack: () -> Unit,
    viewModel: RegisterViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val snackbarHostState = remember { SnackbarHostState() }
    var revealSecret by remember { mutableStateOf(false) }

    val formErrorMessage = if (uiState.formError != null) stringResource(uiState.formError!!) else null
    LaunchedEffect(formErrorMessage) {
        if (formErrorMessage != null) {
            snackbarHostState.showSnackbar(formErrorMessage)
            viewModel.consumeFormError()
        }
    }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbarHostState) },
        containerColor = Color.Transparent,
    ) { _ ->
        AuthScene {
            AuthCard(
                title = stringResource(R.string.register_title),
                subtitle = stringResource(R.string.register_subtitle),
            ) {
                AuthField(
                    value = uiState.username,
                    onValueChange = viewModel::onUsernameChange,
                    label = stringResource(R.string.register_username),
                    leadingIcon = Icons.Outlined.AlternateEmail,
                    errorRes = uiState.usernameError,
                    supportingText = stringResource(R.string.register_username_hint),
                    enabled = !uiState.isSubmitting,
                )

                AuthField(
                    value = uiState.nickname,
                    onValueChange = viewModel::onNicknameChange,
                    label = stringResource(R.string.register_nickname),
                    leadingIcon = Icons.Outlined.Badge,
                    errorRes = uiState.nicknameError,
                    enabled = !uiState.isSubmitting,
                )

                AuthField(
                    value = uiState.email,
                    onValueChange = viewModel::onEmailChange,
                    label = stringResource(R.string.register_email),
                    leadingIcon = Icons.Outlined.Email,
                    errorRes = uiState.emailError,
                    keyboardType = KeyboardType.Email,
                    enabled = !uiState.isSubmitting,
                )

                AuthField(
                    value = uiState.password,
                    onValueChange = viewModel::onPasswordChange,
                    label = stringResource(R.string.register_password),
                    leadingIcon = Icons.Outlined.Lock,
                    errorRes = uiState.passwordError,
                    supportingText = stringResource(R.string.register_password_hint),
                    enabled = !uiState.isSubmitting,
                    keyboardType = KeyboardType.Password,
                    visualTransformation = if (revealSecret) {
                        VisualTransformation.None
                    } else {
                        PasswordVisualTransformation()
                    },
                    trailingIcon = {
                        IconButton(onClick = { revealSecret = !revealSecret }) {
                            Icon(
                                imageVector = if (revealSecret) {
                                    Icons.Outlined.VisibilityOff
                                } else {
                                    Icons.Outlined.Visibility
                                },
                                contentDescription = null,
                                tint = AuthTextIcon,
                            )
                        }
                    },
                )

                AuthPrimaryButton(
                    text = stringResource(R.string.register_submit),
                    onClick = viewModel::submit,
                    enabled = uiState.canSubmit,
                    loading = uiState.isSubmitting,
                    trailingIcon = Icons.AutoMirrored.Filled.ArrowForward,
                )

                AuthFooterLink(
                    prompt = stringResource(R.string.register_have_account),
                    onClick = onNavigateBack,
                )
            }
        }
    }
}
