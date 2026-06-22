package com.infy.messenger.ui.theme

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.unit.dp

/**
 * Aurora — общие кисти и модификаторы дизайн-системы (зеркалят web index.css).
 * Тема только тёмная; настоящий backdrop-blur заменён имитацией стекла
 * (полупрозрачные слои поверх deep-space фона).
 */
object Aurora {

    /** Брендовый градиент `--grad-own`: свои пузыри, primary-кнопки, акценты. */
    val gradOwn: Brush = Brush.linearGradient(
        0.0f to Color(0xFF7C3AED),
        0.6f to Color(0xFFA855F7),
        1.0f to Color(0xFFC084FC),
        start = Offset(0f, 0f),
        end = Offset(Float.POSITIVE_INFINITY, Float.POSITIVE_INFINITY),
    )

    /** Вертикальный фон сцены (для кнопок-аватаров и т.п.). */
    val brandVertical: Brush = Brush.verticalGradient(
        listOf(Color(0xFFA855F7), Color(0xFF7C3AED)),
    )

    /**
     * Фон всего приложения: deep space + два aurora-свечения по углам
     * (зеркалит .chat-bg / .auth-bg из веба).
     */
    val sceneBackground: Brush = Brush.linearGradient(
        listOf(AuroraBgDeep, AuroraBgBase, AuroraBgDeep),
    )
}

/** Радиальные «aurora»-свечения поверх фона. Кладётся отдельным слоем. */
@Composable
fun auroraGlowBrush(): Brush = Brush.radialGradient(
    0.0f to InfyPurple.copy(alpha = 0.14f),
    0.6f to Color.Transparent,
    1.0f to Color.Transparent,
    radius = 1200f,
)

/**
 * Корневой фон экрана: deep-space градиент + два мягких aurora-свечения
 * по углам (верх-право фиолетовое, низ-лево пурпурное). Контент рисуется
 * поверх. Заменяет .chat-bg / страничные фоны из веба.
 */
@Composable
fun AuroraBackground(
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    Box(modifier = modifier.fillMaxSize().background(Aurora.sceneBackground)) {
        // Верхнее фиолетовое свечение (привязано к правому-верхнему углу
        // конечным центром, чтобы избежать NaN от бесконечных координат).
        Box(
            Modifier.fillMaxSize().background(
                Brush.radialGradient(
                    0.0f to InfyPurple.copy(alpha = 0.16f),
                    0.55f to Color.Transparent,
                    center = Offset(900f, 0f),
                    radius = 1400f,
                ),
            ),
        )
        // Нижнее пурпурное свечение, привязанное к левому-нижнему углу.
        Box(
            Modifier.fillMaxSize().background(
                Brush.radialGradient(
                    0.0f to InfyAccent.copy(alpha = 0.10f),
                    0.5f to Color.Transparent,
                    center = Offset(0f, 1800f),
                    radius = 1100f,
                ),
            ),
        )
        content()
    }
}

/** Стеклянная поверхность (glass-2 + тонкая обводка). Для строк, панелей, карточек. */
fun Modifier.glass(
    shape: Shape = RoundedCornerShape(20.dp),
    fill: Color = Glass2,
    stroke: Color = GlassStroke,
): Modifier = this
    .background(fill, shape)
    .border(BorderStroke(1.dp, stroke), shape)

/** Более «всплывающее» стекло (меню, поп-апы) — непрозрачная подложка. */
fun Modifier.glassPop(shape: Shape = RoundedCornerShape(20.dp)): Modifier = this
    .background(GlassPopBg, shape)
    .border(BorderStroke(1.dp, GlassStroke), shape)

/** Заливка брендовым градиентом (кнопки, активные элементы, свои пузыри). */
fun Modifier.brandGradient(shape: Shape = RoundedCornerShape(16.dp)): Modifier =
    this.background(Aurora.gradOwn, shape)
