package com.infy.messenger.feature.profile.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.GraphicEq
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil.compose.AsyncImage
import com.infy.messenger.R
import com.infy.messenger.feature.chat.data.dto.MessageDto
import com.infy.messenger.ui.theme.Aurora
import com.infy.messenger.ui.theme.AuroraBackground
import com.infy.messenger.ui.theme.Glass2
import com.infy.messenger.ui.theme.GlassStroke
import com.infy.messenger.ui.theme.InfyAccent
import com.infy.messenger.ui.theme.InfyHighlight
import com.infy.messenger.ui.theme.TextHi
import com.infy.messenger.ui.theme.TextLow
import com.infy.messenger.ui.theme.TextMid
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

/**
 * Публичный профиль другого пользователя: шапка-обложка, аватар, ник/username,
 * был(а) в сети, био, интересы, бейджи, кнопка «Написать» и вкладки Медиа/Аудио.
 * Паритет с web PartnerInfoPanel + страницей /u/:username.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun UserProfileScreen(
    onNavigateBack: () -> Unit,
    onOpenFullProfile: (username: String) -> Unit,
    /** Тап по голосовому/кружку в карточке — перенести скролл чата на это сообщение. */
    onJumpToMessage: (messageId: String) -> Unit = {},
    viewModel: UserProfileViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()

    AuroraBackground {
        Box(Modifier.fillMaxSize()) {
            when {
                state.isLoading -> {
                    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator(color = MaterialTheme.colorScheme.primary)
                    }
                }

                state.loadError || state.profile == null -> {
                    Column(
                        Modifier.fillMaxSize().padding(24.dp),
                        verticalArrangement = Arrangement.Center,
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        Text(
                            stringResource(R.string.partner_profile_load_error),
                            color = TextMid,
                            style = MaterialTheme.typography.bodyLarge,
                        )
                    }
                }

                else -> {
                    Content(
                        state = state,
                        viewModel = viewModel,
                        onOpenFullProfile = onOpenFullProfile,
                        onJumpToMessage = onJumpToMessage,
                    )
                }
            }

            // Кнопка «Назад» поверх обложки.
            IconButton(
                onClick = onNavigateBack,
                modifier = Modifier
                    .statusBarsPadding()
                    .padding(start = 4.dp, top = 4.dp),
            ) {
                Box(
                    Modifier
                        .size(40.dp)
                        .clip(CircleShape)
                        .background(Color.Black.copy(alpha = 0.35f)),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        Icons.AutoMirrored.Filled.ArrowBack,
                        stringResource(R.string.chat_back),
                        tint = Color.White,
                    )
                }
            }
        }
    }
}

/**
 * Полный профиль пользователя: обложка, аватар, имя, presence, «о себе»,
 * бейджи, интересы и кнопка «Написать». Без вкладок Медиа/Аудио — те живут
 * в [UserProfileScreen] (карточка из чата). Паритет с web /u/:username.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun PublicProfileScreen(
    onNavigateBack: () -> Unit,
    onOpenChat: (chatId: String) -> Unit,
    viewModel: UserProfileViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()

    AuroraBackground {
        Box(Modifier.fillMaxSize()) {
            when {
                state.isLoading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = MaterialTheme.colorScheme.primary)
                }
                state.loadError || state.profile == null -> Column(
                    Modifier.fillMaxSize().padding(24.dp),
                    verticalArrangement = Arrangement.Center,
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Text(
                        stringResource(R.string.partner_profile_load_error),
                        color = TextMid,
                        style = MaterialTheme.typography.bodyLarge,
                    )
                }
                else -> ProfileDetailsContent(state = state, viewModel = viewModel, onOpenChat = onOpenChat)
            }

            IconButton(
                onClick = onNavigateBack,
                modifier = Modifier.statusBarsPadding().padding(start = 4.dp, top = 4.dp),
            ) {
                Box(
                    Modifier.size(40.dp).clip(CircleShape).background(Color.Black.copy(alpha = 0.35f)),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, stringResource(R.string.chat_back), tint = Color.White)
                }
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ProfileDetailsContent(
    state: UserProfileUiState,
    viewModel: UserProfileViewModel,
    onOpenChat: (String) -> Unit,
) {
    val profile = state.profile ?: return
    val builder = viewModel.mediaUrlBuilder

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()),
    ) {
        // Обложка.
        Box(Modifier.fillMaxWidth().height(180.dp).background(Aurora.brandVertical)) {
            builder.absoluteOrNull(profile.coverUrl)?.let {
                AsyncImage(it, null, modifier = Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
            }
        }

        Column(
            Modifier.fillMaxWidth().padding(horizontal = 20.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            val avatar = builder.absoluteOrNull(profile.avatarUrl)
            Box(
                Modifier
                    .offset(y = (-44).dp)
                    .size(96.dp)
                    .clip(CircleShape)
                    .background(Aurora.brandVertical)
                    .border(BorderStroke(3.dp, GlassStroke), CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                if (avatar != null) {
                    AsyncImage(avatar, null, modifier = Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
                } else {
                    Text(profile.nickname.take(1).uppercase(), style = MaterialTheme.typography.headlineMedium, color = Color.White)
                }
            }

            Text(
                profile.nickname,
                style = MaterialTheme.typography.headlineSmall,
                color = TextHi,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(top = 8.dp),
            )
            Text("@${profile.username}", color = TextLow, style = MaterialTheme.typography.bodyMedium)

            PresenceLine(profile.lastSeenAt, profile.createdAt)

            // «О себе».
            profile.bio?.takeIf { it.isNotBlank() }?.let {
                Text(
                    it,
                    style = MaterialTheme.typography.bodyMedium,
                    color = TextMid,
                    modifier = Modifier.padding(top = 12.dp),
                )
            }

            // Бейджи.
            if (profile.badges.isNotEmpty()) {
                FlowRow(
                    Modifier.fillMaxWidth().padding(top = 12.dp),
                    horizontalArrangement = Arrangement.spacedBy(6.dp, Alignment.CenterHorizontally),
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    profile.badges.forEach { badge ->
                        val color = parseRgbColor(badge.color)
                        Row(
                            Modifier
                                .clip(RoundedCornerShape(12.dp))
                                .background(color.copy(alpha = 0.18f))
                                .border(BorderStroke(1.dp, color.copy(alpha = 0.4f)), RoundedCornerShape(12.dp))
                                .padding(horizontal = 10.dp, vertical = 6.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(4.dp),
                        ) {
                            badge.icon?.takeIf { it.isNotBlank() }?.let { Text(it, fontSize = 14.sp) }
                            Text(badge.label, color = TextHi, style = MaterialTheme.typography.labelLarge)
                        }
                    }
                }
            }

            // Интересы.
            if (profile.interests.isNotEmpty()) {
                Text(
                    stringResource(R.string.profile_interests),
                    style = MaterialTheme.typography.labelMedium,
                    color = TextLow,
                    modifier = Modifier.fillMaxWidth().padding(top = 16.dp, bottom = 6.dp),
                )
                FlowRow(
                    Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    profile.interests.forEach { interest ->
                        Text(
                            "#$interest",
                            color = TextHi,
                            style = MaterialTheme.typography.labelLarge,
                            modifier = Modifier
                                .clip(RoundedCornerShape(12.dp))
                                .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.18f))
                                .border(
                                    BorderStroke(1.dp, MaterialTheme.colorScheme.primary.copy(alpha = 0.35f)),
                                    RoundedCornerShape(12.dp),
                                )
                                .padding(horizontal = 10.dp, vertical = 6.dp),
                        )
                    }
                }
            }

            // Кнопка «Написать».
            Box(
                Modifier
                    .fillMaxWidth()
                    .padding(top = 16.dp, bottom = 24.dp)
                    .clip(RoundedCornerShape(16.dp))
                    .background(Aurora.gradOwn)
                    .clickable { viewModel.startChat(onOpenChat) }
                    .padding(vertical = 14.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    stringResource(R.string.partner_write_message),
                    color = Color.White,
                    fontWeight = FontWeight.SemiBold,
                )
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun Content(
    state: UserProfileUiState,
    viewModel: UserProfileViewModel,
    onOpenFullProfile: (String) -> Unit,
    onJumpToMessage: (messageId: String) -> Unit,
) {
    val profile = state.profile ?: return
    val builder = viewModel.mediaUrlBuilder

    // Лайтбокс для медиа-вкладки: список фото/видео + индекс открытого, либо null.
    var lightboxIndex by androidx.compose.runtime.remember(state.media) {
        androidx.compose.runtime.mutableStateOf<Int?>(null)
    }

    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState()),
    ) {
        Column(
            Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            // Аватар. Клик → полный профиль пользователя. Обложка и бейджи
            // живут только в полном профиле (PublicProfileScreen).
            val avatar = builder.absoluteOrNull(profile.avatarUrl)
            Box(
                Modifier
                    .statusBarsPadding()
                    .padding(top = 48.dp)
                    .size(96.dp)
                    .clip(CircleShape)
                    .clickable { onOpenFullProfile(profile.username) }
                    .background(Aurora.brandVertical)
                    .border(BorderStroke(3.dp, GlassStroke), CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                if (avatar != null) {
                    AsyncImage(avatar, null, modifier = Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
                } else {
                    Text(
                        profile.nickname.take(1).uppercase(),
                        style = MaterialTheme.typography.headlineMedium,
                        color = Color.White,
                    )
                }
            }

            Text(
                profile.nickname,
                style = MaterialTheme.typography.headlineSmall,
                color = TextHi,
                fontWeight = FontWeight.Bold,
                modifier = Modifier
                    .clip(RoundedCornerShape(8.dp))
                    .clickable { onOpenFullProfile(profile.username) }
                    .padding(top = 3.dp, start = 4.dp, end = 4.dp),
            )
            Text("@${profile.username}", color = TextLow, style = MaterialTheme.typography.bodyMedium)

            // Был(а) в сети / дата регистрации.
            PresenceLine(profile.lastSeenAt, profile.createdAt)
        }

        // ── Вкладки ───────────────────────────────────────────────────
        Row(Modifier.fillMaxWidth().padding(top = 16.dp)) {
            TabButton(
                title = stringResource(R.string.partner_tab_media),
                selected = state.tab == UserProfileTab.MEDIA,
                onClick = { viewModel.selectTab(UserProfileTab.MEDIA) },
                modifier = Modifier.weight(1f),
            )
            TabButton(
                title = stringResource(R.string.partner_tab_audio),
                selected = state.tab == UserProfileTab.AUDIO,
                onClick = { viewModel.selectTab(UserProfileTab.AUDIO) },
                modifier = Modifier.weight(1f),
            )
        }

        Box(Modifier.fillMaxWidth().padding(top = 8.dp, bottom = 32.dp)) {
            when {
                state.mediaLoading -> {
                    Box(
                        Modifier.fillMaxWidth().padding(vertical = 32.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        CircularProgressIndicator(color = MaterialTheme.colorScheme.primary)
                    }
                }

                state.tab == UserProfileTab.MEDIA ->
                    MediaGrid(state.media, builder, onOpenAt = { lightboxIndex = it })
                else -> AudioList(state.audio, onJumpToMessage = onJumpToMessage)
            }
        }

        // Подгрузка следующей страницы.
        if (state.nextCursor != null && !state.mediaLoading) {
            Box(
                Modifier.fillMaxWidth().padding(bottom = 32.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    stringResource(R.string.partner_load_more),
                    color = InfyHighlight,
                    style = MaterialTheme.typography.labelLarge,
                    modifier = Modifier
                        .clip(RoundedCornerShape(20.dp))
                        .background(InfyAccent.copy(alpha = 0.12f))
                        .clickable(enabled = !state.loadingMore) { viewModel.loadMore() }
                        .padding(horizontal = 16.dp, vertical = 8.dp),
                )
            }
        }
    }

    // Полноэкранный просмотрщик медиа из вкладки «Медиа» (тот же лайтбокс, что в чате).
    // Индексы [items] совпадают с [state.media] (тайлы без вложения некликабельны).
    lightboxIndex?.let { idx ->
        val items = androidx.compose.runtime.remember(state.media) {
            state.media.map { msg ->
                val att = msg.attachments.firstOrNull()
                com.infy.messenger.feature.media.ui.LightboxItem(
                    url = att?.let { builder.url(it.storageKey) }.orEmpty(),
                    isVideo = msg.type == "VIDEO" || att?.mimeType?.startsWith("video/") == true,
                )
            }
        }
        if (idx in items.indices && items[idx].url.isNotEmpty()) {
            com.infy.messenger.feature.media.ui.MediaLightbox(
                items = items,
                index = idx,
                onIndex = { lightboxIndex = it },
                onClose = { lightboxIndex = null },
            )
        }
    }
}

/** «В сети» / «был(а) в сети …» / «на Infy с …» — мягкий фолбэк. */
@Composable
private fun PresenceLine(lastSeenAt: String?, createdAt: String?) {
    val lastSeen = lastSeenAt?.let { formatIsoDate(it) }
    val created = createdAt?.let { formatIsoDate(it) }
    when {
        lastSeen != null -> Text(
            stringResource(R.string.partner_last_seen_at, lastSeen),
            color = TextLow,
            style = MaterialTheme.typography.bodySmall,
            modifier = Modifier.padding(top = 4.dp),
        )
        created != null -> Text(
            stringResource(R.string.partner_member_since, created),
            color = TextLow,
            style = MaterialTheme.typography.bodySmall,
            modifier = Modifier.padding(top = 4.dp),
        )
    }
}

@Composable
private fun TabButton(title: String, selected: Boolean, onClick: () -> Unit, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier.clickable(onClick = onClick).padding(vertical = 12.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            title.uppercase(),
            color = if (selected) InfyHighlight else TextLow,
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.SemiBold,
        )
        Box(
            Modifier
                .padding(top = 8.dp)
                .height(2.dp)
                .fillMaxWidth(0.7f)
                .background(if (selected) InfyAccent else Color.Transparent),
        )
    }
}

@Composable
private fun MediaGrid(
    media: List<MessageDto>,
    builder: com.infy.messenger.core.media.MediaUrlBuilder,
    onOpenAt: (index: Int) -> Unit,
) {
    if (media.isEmpty()) {
        EmptyState(stringResource(R.string.partner_media_empty))
        return
    }
    // Внутри verticalScroll нельзя дать LazyVerticalGrid неограниченную высоту —
    // считаем фиксированную высоту по числу строк (3 колонки).
    val rows = (media.size + 2) / 3
    val cellSize = 124.dp
    LazyVerticalGrid(
        columns = GridCells.Fixed(3),
        modifier = Modifier
            .fillMaxWidth()
            .height(cellSize * rows),
        userScrollEnabled = false,
    ) {
        itemsIndexed(media, key = { _, m -> m.id }) { index, msg ->
            val att = msg.attachments.firstOrNull()
            Box(
                Modifier
                    .padding(1.dp)
                    .aspectRatio(1f)
                    .clip(RoundedCornerShape(4.dp))
                    .background(Glass2)
                    .clickable(enabled = att != null) { onOpenAt(index) },
                contentAlignment = Alignment.Center,
            ) {
                if (att != null) {
                    AsyncImage(
                        builder.thumbnailUrl(att.thumbnailKey, att.storageKey),
                        null,
                        modifier = Modifier.fillMaxSize(),
                        contentScale = ContentScale.Crop,
                    )
                }
                if (msg.type == "VIDEO") {
                    Box(
                        Modifier
                            .size(28.dp)
                            .clip(CircleShape)
                            .background(Color.Black.copy(alpha = 0.55f)),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(Icons.Filled.PlayArrow, null, tint = Color.White, modifier = Modifier.size(16.dp))
                    }
                }
            }
        }
    }
}

@Composable
private fun AudioList(audio: List<MessageDto>, onJumpToMessage: (messageId: String) -> Unit) {
    if (audio.isEmpty()) {
        EmptyState(stringResource(R.string.partner_audio_empty))
        return
    }
    Column(Modifier.fillMaxWidth()) {
        audio.forEach { msg ->
            val isCircle = msg.type == "CIRCLE_VIDEO"
            Row(
                Modifier
                    .fillMaxWidth()
                    .clickable { onJumpToMessage(msg.id) }
                    .padding(horizontal = 16.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Box(
                    Modifier
                        .size(40.dp)
                        .clip(CircleShape)
                        .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.18f)),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        if (isCircle) Icons.Filled.PlayArrow else Icons.Filled.Mic,
                        null,
                        tint = InfyAccent,
                        modifier = Modifier.size(20.dp),
                    )
                }
                Column(Modifier.weight(1f)) {
                    Text(
                        if (isCircle) {
                            stringResource(R.string.partner_circle)
                        } else {
                            stringResource(R.string.partner_voice)
                        },
                        color = TextHi,
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.Medium,
                    )
                    val date = formatIsoDate(msg.createdAt)
                    Text(
                        listOfNotNull(formatDuration(msg.attachments.firstOrNull()?.durationMs), msg.sender.nickname, date)
                            .joinToString(" · "),
                        color = TextLow,
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
            }
        }
    }
}

@Composable
private fun EmptyState(label: String) {
    Column(
        Modifier.fillMaxWidth().padding(vertical = 40.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(
            Modifier
                .size(48.dp)
                .clip(CircleShape)
                .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.15f)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(Icons.Filled.GraphicEq, null, tint = InfyAccent, modifier = Modifier.size(22.dp))
        }
        Text(label, color = TextLow, style = MaterialTheme.typography.bodyMedium)
    }
}

// ── Утилиты ──────────────────────────────────────────────────────────

/** Парсит цвет бейджа из строки "R,G,B"; при сбое — брендовый акцент. */
private fun parseRgbColor(rgb: String?): Color {
    if (rgb.isNullOrBlank()) return InfyAccent
    return runCatching {
        val parts = rgb.split(",").map { it.trim().toInt().coerceIn(0, 255) }
        if (parts.size == 3) Color(parts[0], parts[1], parts[2]) else InfyAccent
    }.getOrDefault(InfyAccent)
}

/** ISO-инстант → «d MMM yyyy» по локали ru; при сбое — пусто. */
private fun formatIsoDate(iso: String): String? = runCatching {
    Instant.parse(iso)
        .atZone(ZoneId.systemDefault())
        .format(DateTimeFormatter.ofPattern("d MMM yyyy", Locale("ru")))
}.getOrNull()

/** Длительность мс → «m:ss»; null → null (не показываем). */
private fun formatDuration(ms: Int?): String? {
    if (ms == null || ms <= 0) return null
    val totalSec = ms / 1000
    val m = totalSec / 60
    val s = totalSec % 60
    return "%d:%02d".format(m, s)
}
