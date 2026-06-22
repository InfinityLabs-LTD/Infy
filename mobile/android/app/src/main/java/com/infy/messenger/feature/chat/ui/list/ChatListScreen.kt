package com.infy.messenger.feature.chat.ui.list

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil.compose.AsyncImage
import com.infy.messenger.R
import com.infy.messenger.core.realtime.ConnectionState
import com.infy.messenger.core.util.formatChatTimestamp
import com.infy.messenger.feature.chat.domain.MessageType
import com.infy.messenger.ui.AuroraBottomNav
import com.infy.messenger.ui.AuroraTab
import com.infy.messenger.ui.theme.Aurora
import com.infy.messenger.ui.theme.OnlineGreen
import com.infy.messenger.ui.theme.PreviewRead
import com.infy.messenger.ui.theme.TextHi
import com.infy.messenger.ui.theme.TextLow
import com.infy.messenger.ui.theme.TextMid
import com.infy.messenger.ui.theme.AuroraBackground

@Composable
fun ChatListScreen(
    onOpenChat: (chatId: String) -> Unit,
    currentTab: AuroraTab,
    onSelectTab: (AuroraTab) -> Unit,
    viewModel: ChatListViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()

    AuroraBackground {
        Box(Modifier.fillMaxSize()) {
            Column(Modifier.fillMaxSize()) {
                // Шапка: крупный заголовок в духе веба + статус подключения.
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .statusBarsPadding()
                        .padding(start = 20.dp, end = 20.dp, top = 16.dp, bottom = 8.dp),
                ) {
                    Text(
                        text = stringResource(R.string.chats_title),
                        style = MaterialTheme.typography.headlineMedium,
                        color = TextHi,
                    )
                    if (uiState.connectionState != ConnectionState.CONNECTED) {
                        Text(
                            text = stringResource(R.string.chats_connecting),
                            style = MaterialTheme.typography.bodySmall,
                            color = TextLow,
                        )
                    }
                }

                if (uiState.items.isEmpty()) {
                    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        Text(
                            text = stringResource(R.string.chats_empty),
                            color = TextLow,
                        )
                    }
                } else {
                    LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(
                            start = 12.dp, end = 12.dp, top = 4.dp, bottom = 110.dp,
                        ),
                        verticalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        items(uiState.items, key = { it.chat.id }) { item ->
                            ChatRow(item = item, onClick = { onOpenChat(item.chat.id) })
                        }
                    }
                }
            }

            // Плавающая стеклянная навигация поверх списка.
            AuroraBottomNav(
                current = currentTab,
                onSelect = onSelectTab,
                modifier = Modifier.align(Alignment.BottomCenter),
            )
        }
    }
}

@Composable
private fun ChatRow(
    item: ChatListItemUi,
    onClick: () -> Unit,
) {
    val chat = item.chat
    val title = chat.partner?.nickname ?: chat.partner?.username.orEmpty()
    val hasUnread = chat.unreadCount > 0

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(20.dp))
            .clickable(onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        ChatAvatar(
            avatarUrl = chat.partner?.avatarUrl,
            title = title,
            online = item.isPartnerOnline,
        )

        Column(modifier = Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = title,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = TextHi,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f),
                )
                chat.lastMessageAt?.let {
                    Text(
                        text = formatChatTimestamp(it),
                        style = MaterialTheme.typography.labelSmall,
                        color = if (hasUnread) MaterialTheme.colorScheme.primary else TextLow,
                    )
                }
            }

            Row(
                modifier = Modifier.padding(top = 2.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Text(
                    text = previewText(chat.lastMessageType, chat.lastMessagePreview, chat.lastMessageIsOwn),
                    style = MaterialTheme.typography.bodyMedium,
                    color = if (hasUnread) TextMid else PreviewRead,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f),
                )
                if (hasUnread) {
                    UnreadBadge(chat.unreadCount)
                }
            }
        }
    }
}

/** Брендовый бейдж непрочитанных — градиентная пилюля. */
@Composable
private fun UnreadBadge(count: Int) {
    Box(
        modifier = Modifier
            .size(if (count > 9) 24.dp else 22.dp)
            .clip(CircleShape)
            .background(Aurora.gradOwn),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = if (count > 99) "99+" else count.toString(),
            color = Color.White,
            fontSize = 11.sp,
            fontWeight = FontWeight.Bold,
        )
    }
}

@Composable
private fun ChatAvatar(
    avatarUrl: String?,
    title: String,
    online: Boolean,
) {
    Box {
        Box(
            modifier = Modifier
                .size(54.dp)
                .clip(CircleShape)
                .background(Aurora.brandVertical),
            contentAlignment = Alignment.Center,
        ) {
            if (avatarUrl != null) {
                AsyncImage(
                    model = avatarUrl,
                    contentDescription = null,
                    modifier = Modifier.fillMaxSize(),
                )
            } else {
                Text(
                    text = title.take(1).uppercase(),
                    style = MaterialTheme.typography.titleLarge,
                    color = Color.White,
                )
            }
        }
        if (online) {
            Box(
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .size(14.dp)
                    .clip(CircleShape)
                    .background(OnlineGreen)
                    .border(BorderStroke(2.dp, com.infy.messenger.ui.theme.AuroraBgDeep), CircleShape),
            )
        }
    }
}

@Composable
private fun previewText(type: MessageType, content: String?, isOwn: Boolean): String {
    val base = when (type) {
        MessageType.TEXT, MessageType.SYSTEM, MessageType.AI, MessageType.AI_QUERY ->
            content.orEmpty()
        else -> stringResource(R.string.chats_attachment)
    }
    return if (isOwn && base.isNotEmpty()) stringResource(R.string.chats_you_prefix, base) else base
}
