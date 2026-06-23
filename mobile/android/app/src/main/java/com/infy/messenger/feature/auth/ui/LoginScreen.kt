package com.infy.messenger.feature.auth.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.outlined.AlternateEmail
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.Visibility
import androidx.compose.material.icons.outlined.VisibilityOff
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.infy.messenger.R
import com.infy.messenger.ui.theme.AuthBrandText
import com.infy.messenger.ui.theme.AuthTextIcon
import com.infy.messenger.ui.theme.AuthTextSecondary

/**
 * Экран входа в новом дизайне (зеркалит web LoginPage): aurora-сцена с
 * орбами, стеклянная карточка, поля с иконками, градиентная кнопка.
 */
@Composable
fun LoginScreen(
    onNavigateToRegister: () -> Unit,
    onNavigateToForgot: () -> Unit,
    viewModel: LoginViewModel = hiltViewModel(),
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
                title = stringResource(R.string.login_title),
                subtitle = stringResource(R.string.login_subtitle),
            ) {
                AuthField(
                    value = uiState.username,
                    onValueChange = viewModel::onUsernameChange,
                    label = stringResource(R.string.login_username),
                    leadingIcon = Icons.Outlined.AlternateEmail,
                    errorRes = uiState.usernameError,
                    enabled = !uiState.isSubmitting,
                )

                AuthField(
                    value = uiState.password,
                    onValueChange = viewModel::onPasswordChange,
                    label = stringResource(R.string.login_password),
                    leadingIcon = Icons.Outlined.Lock,
                    errorRes = uiState.passwordError,
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

                Column(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalAlignment = Alignment.End,
                ) {
                    TextButton(onClick = onNavigateToForgot) {
                        Text(
                            stringResource(R.string.login_forgot),
                            color = AuthTextSecondary,
                            style = MaterialTheme.typography.bodyMedium,
                        )
                    }
                }

                AuthPrimaryButton(
                    text = stringResource(R.string.login_submit),
                    onClick = viewModel::submit,
                    enabled = uiState.canSubmit,
                    loading = uiState.isSubmitting,
                    trailingIcon = Icons.AutoMirrored.Filled.ArrowForward,
                )

                AuthFooterLink(
                    prompt = stringResource(R.string.login_no_account),
                    onClick = onNavigateToRegister,
                )
            }
        }
    }
}

/** Нижняя ссылка-переход (на регистрацию/вход) акцентным цветом. */
@Composable
fun AuthFooterLink(prompt: String, onClick: () -> Unit) {
    Column(
        modifier = Modifier.fillMaxWidth(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        TextButton(onClick = onClick) {
            Text(
                text = prompt,
                color = AuthBrandText,
                style = MaterialTheme.typography.bodyMedium,
            )
        }
    }
}
