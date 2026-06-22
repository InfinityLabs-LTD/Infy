package com.infy.messenger.ui.theme

import android.app.Activity
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat

/**
 * Infy Aurora — единая тёмная тема (зеркалит web-дизайн). Material You /
 * динамические цвета и светлая тема намеренно отключены: бренд диктует
 * фиолетовую палитру на deep-space фоне, одинаковую на всех устройствах.
 */
private val AuroraColors = darkColorScheme(
    primary = InfyAccent,
    onPrimary = Color.White,
    primaryContainer = InfyPurple,
    onPrimaryContainer = Color.White,
    secondary = InfyHighlight,
    onSecondary = Color.White,
    tertiary = OnlineGreen,
    onTertiary = AuroraBgDeep,
    background = AuroraBgDeep,
    onBackground = TextHi,
    surface = AuroraBgBase,
    onSurface = TextHi,
    surfaceVariant = Glass2,
    onSurfaceVariant = TextMid,
    surfaceContainer = AuroraBgBase,
    surfaceContainerHigh = GlassPopBg,
    outline = GlassStroke,
    outlineVariant = Hairline,
    error = DangerRed,
    onError = Color.White,
)

@Composable
fun InfyTheme(
    // Параметры сохранены для совместимости вызова, но Aurora всегда тёмная.
    darkTheme: Boolean = true,
    dynamicColor: Boolean = false,
    content: @Composable () -> Unit,
) {
    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as? Activity)?.window ?: return@SideEffect
            window.statusBarColor = AuroraBgDeep.toArgb()
            window.navigationBarColor = AuroraBgDeep.toArgb()
            WindowCompat.getInsetsController(window, view).apply {
                isAppearanceLightStatusBars = false
                isAppearanceLightNavigationBars = false
            }
        }
    }

    MaterialTheme(
        colorScheme = AuroraColors,
        typography = InfyTypography,
        content = content,
    )
}
