package com.infy.messenger.ui.theme

import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalContext

private val LightColors = lightColorScheme(
    primary = InfyPurple,
    onPrimary = androidx.compose.ui.graphics.Color.White,
    primaryContainer = InfyPurpleLight,
    secondary = InfyTeal,
    background = LightBackground,
    surface = LightSurface,
)

private val DarkColors = darkColorScheme(
    primary = InfyPurpleLight,
    onPrimary = androidx.compose.ui.graphics.Color.Black,
    primaryContainer = InfyPurpleDark,
    secondary = InfyTeal,
    background = DarkBackground,
    surface = DarkSurface,
)

@Composable
fun InfyTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    // Material You доступен с Android 12 (API 31). На 26–30 — брендовая палитра.
    dynamicColor: Boolean = true,
    content: @Composable () -> Unit,
) {
    val colorScheme = when {
        dynamicColor && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S -> {
            val context = LocalContext.current
            if (darkTheme) dynamicDarkColorScheme(context) else dynamicLightColorScheme(context)
        }
        darkTheme -> DarkColors
        else -> LightColors
    }

    MaterialTheme(
        colorScheme = colorScheme,
        typography = InfyTypography,
        content = content,
    )
}
