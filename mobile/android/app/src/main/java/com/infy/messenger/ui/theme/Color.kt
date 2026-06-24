package com.infy.messenger.ui.theme

import androidx.compose.ui.graphics.Color

// ════════════════════════════════════════════════════════════════════════
//  Infy Aurora — токены дизайн-системы (зеркалят web/src/index.css :root).
//  Тема только тёмная: deep space + liquid glass + фиолетовый градиент.
// ════════════════════════════════════════════════════════════════════════

// ── Бренд (--primary / --accent / --highlight) ──────────────────────────
val InfyPurple = Color(0xFF7C3AED)       // --primary
val InfyAccent = Color(0xFFA855F7)       // --accent
val InfyHighlight = Color(0xFFC084FC)    // --highlight
val InfyPurpleDark = Color(0xFF5E35D9)
val InfyPurpleLight = Color(0xFFB39DFF)

val InfyTeal = Color(0xFF00BFA5)

// ── Фон (--bg-deep / --bg-base) ─────────────────────────────────────────
val AuroraBgDeep = Color(0xFF080B16)     // --bg-deep
val AuroraBgBase = Color(0xFF0B1020)     // --bg-base

// ── Стеклянные слои (--glass-1/2/3, белый с малой непрозрачностью) ──────
val Glass1 = Color(0x0AFFFFFF)           // rgba(255,255,255,.04)
val Glass2 = Color(0x14FFFFFF)           // rgba(255,255,255,.08)
val Glass3 = Color(0x1FFFFFFF)           // rgba(255,255,255,.12)
val GlassStroke = Color(0x14FFFFFF)      // --glass-stroke rgba(255,255,255,.08)
val Hairline = Color(0x0FFFFFFF)         // --hairline rgba(255,255,255,.06)

// Имитация liquid glass для нижней навигации/панелей (без реального blur):
// плотный тёмный фон с лёгкой синевой, как --dock-bg, но непрозрачнее, чтобы
// текст читался поверх любого контента.
val DockBg = Color(0xF00B1020)           // ~ rgba(11,16,32,.94)
val GlassPopBg = Color(0xF2101426)       // непрозрачная подложка поп-апов/меню

// ── Текст (--text-hi / --text-mid / --text-low) ─────────────────────────
val TextHi = Color(0xFFFFFFFF)           // --text-hi
val TextMid = Color(0xFFCBD5E1)          // --text-mid
val TextLow = Color(0xFF64748B)          // --text-low
val PreviewRead = Color(0xFF8893A8)      // --preview-read

// ── Infy Pulse: пузыри вопроса/ответа ИИ (зеркалят web MessageBubble AI) ──
val AiQueryBg = Color(0x1AA855F7)        // rgba(168,85,247,.10)
val AiQueryBorder = Color(0x59A855F7)    // rgba(168,85,247,.35)

// ── Статусы доставки / онлайн ───────────────────────────────────────────
val StatusRead = Color(0xFFA855F7)       // --status-read
val StatusSent = Color(0xFF64748B)       // --status-sent
val OnlineGreen = Color(0xFF4ADE80)
val DangerRed = Color(0xFFF87171)

// Оставлены для совместимости со старым кодом темы.
val LightBackground = Color(0xFFFFFBFE)
val LightSurface = Color(0xFFF6F2FB)
val DarkBackground = AuroraBgDeep
val DarkSurface = AuroraBgBase

// ── Auth liquid-glass scene (зеркалит web: index.css .auth-*) ───────────
// Глубокий брендовый фон со свечением.
val AuthBgTop = Color(0xFF030712)
val AuthBgMid = Color(0xFF0A1025)
val AuthBgBottom = Color(0xFF070B1D)

// Фирменный фиолетовый градиент кнопки/акцентов.
val AuthBrand = Color(0xFF7C4DFF)
val AuthBrandMid = Color(0xFF9D6BFF)
val AuthBrandLight = Color(0xFFB388FF)
val AuthBrandText = Color(0xFFB388FF) // акцентный текст ссылок

// Стеклянные поверхности.
val AuthGlassFill = Color(0x0FFFFFFF) // rgba(255,255,255,.06)
val AuthGlassFieldFill = Color(0x0DFFFFFF) // rgba(255,255,255,.05)
val AuthGlassFieldFocus = Color(0x17FFFFFF) // rgba(255,255,255,.09)
val AuthGlassStroke = Color(0x24FFFFFF) // rgba(255,255,255,.14)
val AuthGlassFieldStroke = Color(0x1FFFFFFF) // rgba(255,255,255,.12)
val AuthGlassFocusStroke = Color(0x999D6BFF) // rgba(157,107,255,.6)

// Текст на тёмной сцене.
val AuthTextPrimary = Color(0xF2FFFFFF) // white/95
val AuthTextSecondary = Color(0x8CFFFFFF) // white/55
val AuthTextTertiary = Color(0x59FFFFFF) // white/35
val AuthTextIcon = Color(0x66FFFFFF) // white/40

val AuthSuccess = Color(0xFF4ADE80)
