package com.infy.messenger.feature.chat.ui.search

import androidx.compose.foundation.background
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
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import coil.compose.AsyncImage
import com.infy.messenger.R
import com.infy.messenger.core.util.formatChatTimestamp
import com.infy.messenger.feature.chat.domain.ChatSummary
import com.infy.messenger.ui.theme.Aurora
import com.infy.messenger.ui.theme.Glass2
import com.infy.messenger.ui.theme.TextHi
import com.infy.messenger.ui.theme.TextLow
import com.infy.messenger.ui.theme.TextMid
import com.infy.messenger.ui.theme.AuroraBackground

@Composable
fun SearchScreen(
    onNavigateBack: () -> Unit,
    onOpenChat: (chatId: String) -> Unit,
    viewModel: SearchViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val query by viewModel.query.collectAsStateWithLifecycle()
    val focusRequester = remember { FocusRequester() }
    val keyboard = LocalSoftwareKeyboardController.current

    // Автофокус поля при открытии экрана.
    LaunchedEffect(Unit) {
        focusRequester.requestFocus()
    }

    AuroraBackground {
        Column(Modifier.fillMaxSize()) {
            // ── Шапка: назад + поле ввода ────────────────────────────
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .statusBarsPadding()
                    .padding(start = 4.dp, end = 12.dp, top = 8.dp, bottom = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                IconButton(onClick = onNavigateBack) {
                    Icon(
                        imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                        contentDescription = stringResource(R.string.chat_back),
                        tint = TextHi,
                    )
                }

                TextField(
                    value = query,
                    onValueChange = viewModel::onQueryChange,
                    modifier = Modifier
                        .weight(1f)
                        .focusRequester(focusRequester),
                    singleLine = true,
                    placeholder = {
                        Text(
                            text = stringResource(R.string.search_hint),
                            color = TextLow,
                        )
                    },
                    trailingIcon = {
                        if (query.isNotEmpty()) {
                            IconButton(onClick = viewModel::clearQuery) {
                                Icon(
                                    imageVector = Icons.Filled.Close,
                                    contentDescription = null,
                                    tint = TextMid,
                                )
                            }
                        }
                    },
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                    keyboardActions = KeyboardActions(onSearch = { keyboard?.hide() }),
                    colors = TextFieldDefaults.colors(
                        focusedContainerColor = Glass2,
                        unfocusedContainerColor = Glass2,
                        focusedIndicatorColor = Color.Transparent,
                        unfocusedIndicatorColor = Color.Transparent,
                        focusedTextColor = TextHi,
                        unfocusedTextColor = TextHi,
                        cursorColor = MaterialTheme.colorScheme.primary,
                    ),
                    shape = RoundedCornerShape(16.dp),
                )
            }

            when {
                uiState.isLoading -> {
                    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator(color = MaterialTheme.colorScheme.primary)
                    }
                }

                uiState.isEmpty -> {
                    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        Text(
                            text = stringResource(R.string.search_empty),
                            color = TextLow,
                        )
                    }
                }

                else -> SearchResults(
                    uiState = uiState,
                    viewModel = viewModel,
                    onOpenChat = onOpenChat,
                )
            }
        }
    }
}

@Composable
private fun SearchResults(
    uiState: SearchUiState,
    viewModel: SearchViewModel,
    onOpenChat: (String) -> Unit,
) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(start = 12.dp, end = 12.dp, top = 4.dp, bottom = 24.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        if (uiState.chats.isNotEmpty()) {
            item(key = "h_chats") { SectionHeader(stringResource(R.string.search_section_chats)) }
            items(uiState.chats, key = { "c_${it.id}" }) { chat ->
                ChatResultRow(
                    chat = chat,
                    avatarUrl = viewModel.mediaUrlBuilder.absoluteOrNull(chat.partner?.avatarUrl),
                    onClick = { onOpenChat(chat.id) },
                )
            }
        }

        if (uiState.messages.isNotEmpty()) {
            item(key = "h_messages") { SectionHeader(stringResource(R.string.search_section_messages)) }
            items(uiState.messages, key = { "m_${it.messageId}" }) { msg ->
                MessageResultRow(
                    result = msg,
                    avatarUrl = viewModel.mediaUrlBuilder.absoluteOrNull(msg.partnerAvatarUrl),
                    onClick = { onOpenChat(msg.chatId) },
                )
            }
        }

        if (uiState.people.isNotEmpty()) {
            item(key = "h_people") { SectionHeader(stringResource(R.string.search_section_people)) }
            items(uiState.people, key = { "p_${it.id}" }) { person ->
                PersonResultRow(
                    result = person,
                    avatarUrl = viewModel.mediaUrlBuilder.absoluteOrNull(person.avatarUrl),
                    onClick = { viewModel.openChatWith(person.id, onOpenChat) },
                )
            }
        }
    }
}

@Composable
private fun SectionHeader(title: String) {
    Text(
        text = title,
        style = MaterialTheme.typography.labelLarge,
        fontWeight = FontWeight.SemiBold,
        color = TextMid,
        modifier = Modifier.padding(start = 12.dp, top = 12.dp, bottom = 4.dp),
    )
}

@Composable
private fun ChatResultRow(
    chat: ChatSummary,
    avatarUrl: String?,
    onClick: () -> Unit,
) {
    val title = chat.partner?.nickname ?: chat.partner?.username.orEmpty()
    ResultRow(avatarUrl = avatarUrl, title = title, onClick = onClick) {
        Text(
            text = title,
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold,
            color = TextHi,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        chat.partner?.username?.let {
            Text(
                text = "@$it",
                style = MaterialTheme.typography.bodySmall,
                color = TextLow,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

@Composable
private fun MessageResultRow(
    result: MessageSearchResult,
    avatarUrl: String?,
    onClick: () -> Unit,
) {
    ResultRow(avatarUrl = avatarUrl, title = result.partnerNickname, onClick = onClick) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                text = result.partnerNickname,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                color = TextHi,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            Text(
                text = formatChatTimestamp(result.createdAt),
                style = MaterialTheme.typography.labelSmall,
                color = TextLow,
            )
        }
        Text(
            text = result.content,
            style = MaterialTheme.typography.bodyMedium,
            color = TextMid,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

@Composable
private fun PersonResultRow(
    result: PeopleSearchResult,
    avatarUrl: String?,
    onClick: () -> Unit,
) {
    ResultRow(avatarUrl = avatarUrl, title = result.nickname, onClick = onClick) {
        Text(
            text = result.nickname,
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold,
            color = TextHi,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        Text(
            text = "@${result.username}",
            style = MaterialTheme.typography.bodySmall,
            color = TextLow,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

/** Общая строка результата: аватар-плейсхолдер + контент. */
@Composable
private fun ResultRow(
    avatarUrl: String?,
    title: String,
    onClick: () -> Unit,
    content: @Composable () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(20.dp))
            .clickable(onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        ResultAvatar(avatarUrl = avatarUrl, title = title)
        Column(modifier = Modifier.weight(1f)) { content() }
    }
}

@Composable
private fun ResultAvatar(avatarUrl: String?, title: String) {
    Box(
        modifier = Modifier
            .size(48.dp)
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
}
