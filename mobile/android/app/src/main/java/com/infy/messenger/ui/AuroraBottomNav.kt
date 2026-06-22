package com.infy.messenger.ui

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Chat
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.outlined.AccountCircle
import androidx.compose.material.icons.outlined.ChatBubbleOutline
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.infy.messenger.ui.theme.Aurora
import com.infy.messenger.ui.theme.DockBg
import com.infy.messenger.ui.theme.GlassStroke
import com.infy.messenger.ui.theme.TextLow

/** Пункт нижней навигации Aurora. */
enum class AuroraTab(val route: String) {
    CHATS(Destinations.CHATS),
    PROFILE(Destinations.PROFILE),
}

/**
 * Плавающая стеклянная капсула нижней навигации (зеркалит .glass-dock из веба):
 * отступы от краёв, скруглённая пилюля, активный пункт подсвечен брендовым
 * градиентным «таблетом». Настоящий blur заменён плотной тёмной подложкой.
 */
@Composable
fun AuroraBottomNav(
    current: AuroraTab,
    onSelect: (AuroraTab) -> Unit,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier
            .fillMaxWidth()
            .navigationBarsPadding()
            .padding(horizontal = 24.dp, vertical = 10.dp),
        contentAlignment = Alignment.Center,
    ) {
        Row(
            modifier = Modifier
                .clip(RoundedCornerShape(28.dp))
                .background(DockBg)
                .border(BorderStroke(1.dp, GlassStroke), RoundedCornerShape(28.dp))
                .padding(6.dp),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            NavPill(
                selected = current == AuroraTab.CHATS,
                activeIcon = Icons.Filled.Chat,
                idleIcon = Icons.Outlined.ChatBubbleOutline,
                label = "Чаты",
                onClick = { onSelect(AuroraTab.CHATS) },
            )
            NavPill(
                selected = current == AuroraTab.PROFILE,
                activeIcon = Icons.Filled.Person,
                idleIcon = Icons.Outlined.AccountCircle,
                label = "Профиль",
                onClick = { onSelect(AuroraTab.PROFILE) },
            )
        }
    }
}

@Composable
private fun NavPill(
    selected: Boolean,
    activeIcon: ImageVector,
    idleIcon: ImageVector,
    label: String,
    onClick: () -> Unit,
) {
    val tint by animateColorAsState(
        if (selected) Color.White else TextLow,
        label = "navTint",
    )
    val scale by animateFloatAsState(if (selected) 1f else 0.98f, label = "navScale")

    Row(
        modifier = Modifier
            .clip(RoundedCornerShape(22.dp))
            .then(
                if (selected) Modifier.background(Aurora.gradOwn, RoundedCornerShape(22.dp))
                else Modifier,
            )
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                onClick = onClick,
            )
            .padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Icon(
            imageVector = if (selected) activeIcon else idleIcon,
            contentDescription = label,
            tint = tint,
            modifier = Modifier.size(22.dp),
        )
        if (selected) {
            Text(
                text = label,
                color = Color.White,
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold,
            )
        }
    }
}
