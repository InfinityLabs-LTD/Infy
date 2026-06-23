package com.infy.messenger.feature.auth.ui

import androidx.annotation.StringRes
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.infy.messenger.ui.theme.AuthBrand
import com.infy.messenger.ui.theme.AuthBrandLight
import com.infy.messenger.ui.theme.AuthBrandMid
import com.infy.messenger.ui.theme.AuthBrandText
import com.infy.messenger.ui.theme.AuthGlassFieldFill
import com.infy.messenger.ui.theme.AuthGlassFieldStroke
import com.infy.messenger.ui.theme.AuthGlassFill
import com.infy.messenger.ui.theme.AuthGlassFocusStroke
import com.infy.messenger.ui.theme.AuthGlassStroke
import com.infy.messenger.ui.theme.AuthTextIcon
import com.infy.messenger.ui.theme.AuthTextPrimary
import com.infy.messenger.ui.theme.AuthTextSecondary
import com.infy.messenger.ui.theme.AuroraBackground
import com.infy.messenger.ui.theme.DangerRed

// ════════════════════════════════════════════════════════════════════════
//  Auth UI — зеркалит web (LoginPage/RegisterPage + .auth-* из index.css):
//  deep-space фон, плавающие светящиеся «орбы», стеклянная карточка с
//  появлением, поля с иконкой слева и фокус-обводкой, градиентная кнопка.
// ════════════════════════════════════════════════════════════════════════

/**
 * Сцена авторизации: aurora-фон + медленно «дышащие» светящиеся орбы +
 * центрированная прокручиваемая колонка под стеклянную карточку.
 * Контент (карточка) передаётся в [content].
 */
@Composable
fun AuthScene(content: @Composable () -> Unit) {
    AuroraBackground {
        AuthFloatingOrbs()
        Column(
            modifier = Modifier
                .fillMaxSize()
                .windowInsetsPadding(WindowInsets.safeDrawing)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp, vertical = 24.dp),
            verticalArrangement = Arrangement.spacedBy(0.dp, Alignment.CenterVertically),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            content()
        }
    }
}

/** Два медленно пульсирующих фиолетовых свечения — глубина сцены (как auth-orb в web). */
@Composable
private fun AuthFloatingOrbs() {
    val transition = rememberInfiniteTransition(label = "orbs")
    val t by transition.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 9000, easing = androidx.compose.animation.core.LinearEasing),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "orb-t",
    )
    Box(
        Modifier.fillMaxSize().background(
            Brush.radialGradient(
                0.0f to AuthBrandLight.copy(alpha = 0.20f + 0.06f * t),
                0.6f to Color.Transparent,
                center = Offset(220f + 120f * t, 260f + 80f * t),
                radius = 560f + 80f * t,
            ),
        ),
    )
    Box(
        Modifier.fillMaxSize().background(
            Brush.radialGradient(
                0.0f to AuthBrand.copy(alpha = 0.16f + 0.05f * (1f - t)),
                0.6f to Color.Transparent,
                center = Offset(980f - 140f * t, 1700f - 120f * t),
                radius = 640f + 100f * (1f - t),
            ),
        ),
    )
}

/**
 * Стеклянная карточка авторизации: brand-логотип + заголовки + контент формы.
 * Эквивалент `.auth-glass` карточки в web.
 */
@Composable
fun AuthCard(
    title: String,
    subtitle: String,
    content: @Composable () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .widthIn(max = 440.dp)
            .clip(RoundedCornerShape(28.dp))
            .background(AuthGlassFill, RoundedCornerShape(28.dp))
            .border(BorderStroke(1.dp, AuthGlassStroke), RoundedCornerShape(28.dp))
            .padding(horizontal = 24.dp, vertical = 28.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        AuthBrandHeader()
        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(
                text = title,
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.Bold,
                color = AuthTextPrimary,
            )
            Text(
                text = subtitle,
                style = MaterialTheme.typography.bodyMedium,
                color = AuthTextSecondary,
            )
        }
        content()
    }
}

/** Логотип-плашка с фирменным градиентом и буквой «I» + название. */
@Composable
private fun AuthBrandHeader() {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .size(48.dp)
                .clip(RoundedCornerShape(16.dp))
                .background(
                    Brush.linearGradient(listOf(AuthBrandLight, AuthBrand)),
                ),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = "I",
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Black,
                color = Color.White,
            )
        }
        Text(
            text = "Infy Messenger",
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold,
            color = AuthTextPrimary,
        )
    }
}

/**
 * Поле ввода в стиле web `.auth-input`: иконка слева, закруглённый glass-фон,
 * фиолетовая фокус-обводка. [trailingIcon] — слот под кнопку показа значения
 * (используется экранами для секретных полей).
 */
@Composable
fun AuthField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    leadingIcon: ImageVector,
    modifier: Modifier = Modifier,
    @StringRes errorRes: Int? = null,
    supportingText: String? = null,
    keyboardType: KeyboardType = KeyboardType.Text,
    enabled: Boolean = true,
    visualTransformation: androidx.compose.ui.text.input.VisualTransformation =
        androidx.compose.ui.text.input.VisualTransformation.None,
    trailingIcon: (@Composable () -> Unit)? = null,
) {
    val errorText = errorRes?.let { androidx.compose.ui.res.stringResource(it) }
    val shape = RoundedCornerShape(16.dp)

    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        label = { Text(label) },
        modifier = modifier.fillMaxWidth(),
        singleLine = true,
        enabled = enabled,
        isError = errorRes != null,
        shape = shape,
        visualTransformation = visualTransformation,
        keyboardOptions = KeyboardOptions(keyboardType = keyboardType),
        leadingIcon = {
            Icon(
                imageVector = leadingIcon,
                contentDescription = null,
                tint = AuthTextIcon,
            )
        },
        trailingIcon = trailingIcon,
        supportingText = when {
            errorText != null -> ({ Text(errorText, color = DangerRed) })
            supportingText != null -> ({ Text(supportingText, color = AuthTextSecondary) })
            else -> null
        },
        colors = OutlinedTextFieldDefaults.colors(
            focusedContainerColor = AuthGlassFieldFill,
            unfocusedContainerColor = AuthGlassFieldFill,
            disabledContainerColor = AuthGlassFieldFill,
            errorContainerColor = AuthGlassFieldFill,
            focusedBorderColor = AuthGlassFocusStroke,
            unfocusedBorderColor = AuthGlassFieldStroke,
            disabledBorderColor = AuthGlassFieldStroke,
            errorBorderColor = DangerRed,
            focusedTextColor = AuthTextPrimary,
            unfocusedTextColor = AuthTextPrimary,
            cursorColor = AuthBrandLight,
            focusedLabelColor = AuthBrandText,
            unfocusedLabelColor = AuthTextSecondary,
        ),
    )
}

/**
 * Главная кнопка действия: фирменный фиолетовый градиент, закругление,
 * стрелка справа и индикатор загрузки. Эквивалент `.auth-btn`.
 */
@Composable
fun AuthPrimaryButton(
    text: String,
    onClick: () -> Unit,
    enabled: Boolean,
    loading: Boolean,
    trailingIcon: ImageVector,
    modifier: Modifier = Modifier,
) {
    val active = enabled && !loading
    val shape = RoundedCornerShape(16.dp)
    val gradient = Brush.linearGradient(listOf(AuthBrandLight, AuthBrandMid, AuthBrand))

    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(54.dp)
            .clip(shape)
            .background(if (active) gradient else Brush.linearGradient(listOf(AuthGlassFill, AuthGlassFill)))
            .then(if (active) Modifier else Modifier.border(BorderStroke(1.dp, AuthGlassStroke), shape))
            .clickable(enabled = active, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        if (loading) {
            androidx.compose.material3.CircularProgressIndicator(
                modifier = Modifier.size(22.dp),
                strokeWidth = 2.dp,
                color = Color.White,
            )
        } else {
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = text,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = if (active) Color.White else AuthTextSecondary,
                )
                Icon(
                    imageVector = trailingIcon,
                    contentDescription = null,
                    tint = if (active) Color.White else AuthTextSecondary,
                    modifier = Modifier.size(18.dp),
                )
            }
        }
    }
}
