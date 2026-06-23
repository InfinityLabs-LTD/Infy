package com.infy.messenger.feature.auth.ui

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.outlined.Email
import androidx.compose.material.icons.outlined.MarkEmailRead
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.infy.messenger.R
import com.infy.messenger.ui.theme.AuthSuccess
import com.infy.messenger.ui.theme.AuthTextSecondary

@Composable
fun ForgotPasswordScreen(
    onNavigateBack: () -> Unit,
    viewModel: ForgotPasswordViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val snackbarHostState = remember { SnackbarHostState() }

    val errorMessage = if (uiState.formError != null) stringResource(uiState.formError!!) else null
    LaunchedEffect(errorMessage) {
        if (errorMessage != null) {
            snackbarHostState.showSnackbar(errorMessage)
            viewModel.consumeFormError()
        }
    }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbarHostState) },
        containerColor = Color.Transparent,
    ) { _ ->
        AuthScene {
            AuthCard(
                title = stringResource(R.string.forgot_title),
                subtitle = stringResource(R.string.forgot_subtitle),
            ) {
                if (uiState.isSent) {
                    Icon(
                        imageVector = Icons.Outlined.MarkEmailRead,
                        contentDescription = null,
                        tint = AuthSuccess,
                        modifier = Modifier.size(40.dp),
                    )
                    Text(
                        text = stringResource(R.string.forgot_sent),
                        style = MaterialTheme.typography.bodyMedium,
                        color = AuthTextSecondary,
                        modifier = Modifier.fillMaxWidth(),
                    )
                } else {
                    AuthField(
                        value = uiState.email,
                        onValueChange = viewModel::onEmailChange,
                        label = stringResource(R.string.forgot_email),
                        leadingIcon = Icons.Outlined.Email,
                        errorRes = uiState.emailError,
                        keyboardType = KeyboardType.Email,
                        enabled = !uiState.isSubmitting,
                    )
                    AuthPrimaryButton(
                        text = stringResource(R.string.forgot_submit),
                        onClick = viewModel::submit,
                        enabled = uiState.canSubmit,
                        loading = uiState.isSubmitting,
                        trailingIcon = Icons.AutoMirrored.Filled.ArrowForward,
                    )
                }

                AuthFooterLink(
                    prompt = stringResource(R.string.forgot_back_to_login),
                    onClick = onNavigateBack,
                )
            }
        }
    }
}
