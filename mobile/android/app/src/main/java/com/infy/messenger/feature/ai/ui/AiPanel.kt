package com.infy.messenger.feature.ai.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.DeleteOutline
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.infy.messenger.R
import com.infy.messenger.ui.theme.Aurora
import com.infy.messenger.ui.theme.DangerRed
import com.infy.messenger.ui.theme.DockBg
import com.infy.messenger.ui.theme.Glass2
import com.infy.messenger.ui.theme.GlassStroke
import com.infy.messenger.ui.theme.InfyAccent
import com.infy.messenger.ui.theme.InfyPurple
import com.infy.messenger.ui.theme.TextHi
import com.infy.messenger.ui.theme.TextLow
import com.infy.messenger.ui.theme.TextMid
import com.infy.messenger.ui.theme.brandGradient

/**
 * Панель Infy AI (паритет с web): затемнение + стеклянная панель почти на весь
 * экран. Шапка с градиентным аватаром-звездой, две вкладки — Ассистент и Сводка.
 * chatId грузится из LaunchedEffect; при недоступности AI показываем заглушку.
 */
@Composable
fun AiPanel(
    chatId: String,
    onClose: () -> Unit,
    viewModel: AiViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()

    LaunchedEffect(chatId) { viewModel.load(chatId) }

    Dialog(
        onDismissRequest = onClose,
        properties = DialogProperties(usePlatformDefaultWidth = false),
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(Color.Black.copy(alpha = 0.5f))
                .clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                    onClick = onClose,
                ),
            contentAlignment = Alignment.CenterEnd,
        ) {
            Box(
                modifier = Modifier
                    .fillMaxHeight()
                    .fillMaxWidth(0.94f)
                    .background(DockBg)
                    .border(BorderStroke(1.dp, GlassStroke), RoundedCornerShape(0.dp))
                    // Перехватываем клики, чтобы тап по контенту не закрывал панель.
                    .clickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null,
                        onClick = {},
                    ),
            ) {
                Column(modifier = Modifier.fillMaxSize()) {
                    PanelHeader(onClose = onClose)
                    TabSelector(tab = state.tab, onSelect = viewModel::selectTab)

                    when {
                        state.isLoading -> LoadingBox()
                        state.enabled == false -> DisabledBox()
                        else -> when (state.tab) {
                            AiTab.ASSISTANT -> AssistantTab(state = state, viewModel = viewModel)
                            AiTab.SUMMARY -> SummaryTab(state = state, viewModel = viewModel)
                        }
                    }
                }
            }
        }
    }
}

// ── Шапка ───────────────────────────────────────────────────────────────

@Composable
private fun PanelHeader(onClose: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 12.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        // Градиентный кружок со звездой — фирменный аватар Infy AI.
        Box(
            modifier = Modifier
                .size(40.dp)
                .clip(CircleShape)
                .background(Aurora.brandVertical),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                Icons.Filled.AutoAwesome,
                contentDescription = null,
                tint = Color.White,
                modifier = Modifier.size(22.dp),
            )
        }
        Column(
            modifier = Modifier
                .weight(1f)
                .padding(start = 12.dp),
        ) {
            Text(
                stringResource(R.string.ai_title),
                color = TextHi,
                fontWeight = FontWeight.SemiBold,
                fontSize = 16.sp,
            )
            Text(
                stringResource(R.string.ai_assistant_subtitle),
                color = TextLow,
                fontSize = 12.sp,
            )
        }
        Box(
            modifier = Modifier
                .size(32.dp)
                .clip(CircleShape)
                .clickable(onClick = onClose),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                Icons.Filled.Close,
                contentDescription = stringResource(R.string.ai_title),
                tint = TextMid,
                modifier = Modifier.size(20.dp),
            )
        }
    }
}

@Composable
private fun TabSelector(tab: AiTab, onSelect: (AiTab) -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 12.dp, vertical = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        TabChip(
            label = stringResource(R.string.ai_tab_assistant),
            selected = tab == AiTab.ASSISTANT,
            onClick = { onSelect(AiTab.ASSISTANT) },
            modifier = Modifier.weight(1f),
        )
        TabChip(
            label = stringResource(R.string.ai_tab_summary),
            selected = tab == AiTab.SUMMARY,
            onClick = { onSelect(AiTab.SUMMARY) },
            modifier = Modifier.weight(1f),
        )
    }
}

@Composable
private fun TabChip(
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(12.dp))
            .then(
                if (selected) Modifier.brandGradient(RoundedCornerShape(12.dp))
                else Modifier.background(Glass2, RoundedCornerShape(12.dp)),
            )
            .clickable(onClick = onClick)
            .padding(vertical = 10.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            label,
            color = if (selected) Color.White else TextMid,
            fontSize = 14.sp,
            fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal,
        )
    }
}

// ── Состояния-заглушки ──────────────────────────────────────────────────

@Composable
private fun LoadingBox() {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        CircularProgressIndicator(color = InfyAccent, strokeWidth = 2.dp)
    }
}

@Composable
private fun DisabledBox() {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Text(
            stringResource(R.string.ai_disabled),
            color = TextLow,
            fontSize = 14.sp,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(32.dp),
        )
    }
}

// ── Вкладка «Ассистент» ─────────────────────────────────────────────────

@Composable
private fun AssistantTab(state: AiUiState, viewModel: AiViewModel) {
    val listState = rememberLazyListState()

    // Автопрокрутка к последнему сообщению / индикатору печати.
    LaunchedEffect(state.messages.size, state.isSending) {
        val count = state.messages.size + if (state.isSending) 1 else 0
        if (count > 0) listState.animateScrollToItem(count - 1)
    }

    Column(modifier = Modifier.fillMaxSize()) {
        if (state.messages.isEmpty() && !state.isSending) {
            Box(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth(),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    stringResource(R.string.ai_assistant_hint),
                    color = TextLow,
                    fontSize = 14.sp,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.padding(32.dp),
                )
            }
        } else {
            LazyColumn(
                state = listState,
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth(),
                contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                items(state.messages, key = { it.id }) { msg -> AiMessageBubble(msg) }
                if (state.isSending) {
                    item(key = "typing") { TypingBubble() }
                }
            }
        }

        state.errorMessage?.let { res ->
            Text(
                stringResource(res),
                color = DangerRed,
                fontSize = 13.sp,
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
            )
        }

        AssistantComposer(
            input = state.input,
            isSending = state.isSending,
            onInputChange = viewModel::onInputChange,
            onSend = viewModel::send,
            onClear = viewModel::clearConversation,
        )
    }
}

@Composable
private fun AiMessageBubble(msg: AiChatMessage) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = if (msg.isUser) Arrangement.End else Arrangement.Start,
    ) {
        Box(
            modifier = Modifier
                .widthIn(max = 280.dp)
                .clip(RoundedCornerShape(16.dp))
                .then(
                    if (msg.isUser) Modifier.background(Aurora.gradOwn)
                    else Modifier.background(Glass2)
                        .border(BorderStroke(1.dp, GlassStroke), RoundedCornerShape(16.dp)),
                )
                .padding(horizontal = 12.dp, vertical = 8.dp),
        ) {
            Text(
                msg.content,
                color = if (msg.isUser) Color.White else TextHi,
                fontSize = 14.sp,
            )
        }
    }
}

@Composable
private fun TypingBubble() {
    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Start) {
        Box(
            modifier = Modifier
                .clip(RoundedCornerShape(16.dp))
                .background(Glass2)
                .border(BorderStroke(1.dp, GlassStroke), RoundedCornerShape(16.dp))
                .padding(horizontal = 14.dp, vertical = 12.dp),
        ) {
            TypingDots()
        }
    }
}

@Composable
private fun TypingDots() {
    val transition = rememberInfiniteTransition(label = "typing")
    Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        repeat(3) { index ->
            val alpha by transition.animateFloat(
                initialValue = 0.3f,
                targetValue = 1f,
                animationSpec = infiniteRepeatable(
                    animation = tween(durationMillis = 600, delayMillis = index * 150),
                    repeatMode = RepeatMode.Reverse,
                ),
                label = "dot$index",
            )
            Box(
                Modifier
                    .size(6.dp)
                    .alpha(alpha)
                    .clip(CircleShape)
                    .background(TextMid),
            )
        }
    }
}

@Composable
private fun AssistantComposer(
    input: String,
    isSending: Boolean,
    onInputChange: (String) -> Unit,
    onSend: () -> Unit,
    onClear: () -> Unit,
) {
    Column(modifier = Modifier.fillMaxWidth().padding(12.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            // Кнопка «Очистить» историю.
            Box(
                modifier = Modifier
                    .size(40.dp)
                    .clip(CircleShape)
                    .clickable(onClick = onClear),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    Icons.Filled.DeleteOutline,
                    contentDescription = stringResource(R.string.ai_assistant_clear),
                    tint = TextMid,
                    modifier = Modifier.size(20.dp),
                )
            }
            TextField(
                value = input,
                onValueChange = onInputChange,
                modifier = Modifier
                    .weight(1f)
                    .clip(RoundedCornerShape(20.dp)),
                placeholder = {
                    Text(
                        stringResource(R.string.ai_assistant_hint),
                        color = TextLow,
                        fontSize = 14.sp,
                    )
                },
                textStyle = LocalTextStyle.current.copy(color = TextHi, fontSize = 14.sp),
                maxLines = 4,
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send),
                keyboardActions = KeyboardActions(onSend = { onSend() }),
                colors = TextFieldDefaults.colors(
                    focusedContainerColor = Glass2,
                    unfocusedContainerColor = Glass2,
                    disabledContainerColor = Glass2,
                    focusedIndicatorColor = Color.Transparent,
                    unfocusedIndicatorColor = Color.Transparent,
                    cursorColor = InfyAccent,
                ),
            )
            Spacer(Modifier.size(8.dp))
            val canSend = input.isNotBlank() && !isSending
            Box(
                modifier = Modifier
                    .size(44.dp)
                    .clip(CircleShape)
                    .then(
                        if (canSend) Modifier.background(Aurora.gradOwn)
                        else Modifier.background(Glass2),
                    )
                    .clickable(enabled = canSend, onClick = onSend),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    Icons.AutoMirrored.Filled.Send,
                    contentDescription = stringResource(R.string.ai_assistant_hint),
                    tint = if (canSend) Color.White else TextLow,
                    modifier = Modifier.size(20.dp),
                )
            }
        }
    }
}

// ── Вкладка «Сводка» ────────────────────────────────────────────────────

@Composable
private fun SummaryTab(state: AiUiState, viewModel: AiViewModel) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
    ) {
        // Чипы выбора периода.
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            SummaryPeriod.entries.forEach { period ->
                TabChip(
                    label = stringResource(period.labelRes),
                    selected = state.summaryPeriod == period,
                    onClick = { viewModel.selectPeriod(period) },
                    modifier = Modifier.weight(1f),
                )
            }
        }

        Spacer(Modifier.height(12.dp))

        // Кнопка «Анализировать».
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(14.dp))
                .brandGradient(RoundedCornerShape(14.dp))
                .clickable(enabled = !state.isAnalyzing, onClick = viewModel::analyze)
                .padding(vertical = 14.dp),
            contentAlignment = Alignment.Center,
        ) {
            if (state.isAnalyzing) {
                CircularProgressIndicator(
                    color = Color.White,
                    strokeWidth = 2.dp,
                    modifier = Modifier.size(20.dp),
                )
            } else {
                Text(
                    stringResource(R.string.ai_summary_analyze),
                    color = Color.White,
                    fontSize = 15.sp,
                    fontWeight = FontWeight.SemiBold,
                )
            }
        }

        Spacer(Modifier.height(16.dp))

        AnimatedVisibility(visible = state.summaryText != null) {
            Column {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(16.dp))
                        .background(Glass2)
                        .border(BorderStroke(1.dp, GlassStroke), RoundedCornerShape(16.dp))
                        .padding(14.dp),
                ) {
                    Text(
                        state.summaryText.orEmpty(),
                        color = TextHi,
                        fontSize = 14.sp,
                    )
                }
                Spacer(Modifier.height(8.dp))
                Text(
                    stringResource(R.string.ai_summary_messages, state.summaryMessageCount),
                    color = TextLow,
                    fontSize = 12.sp,
                )
            }
        }

        state.errorMessage?.let { res ->
            Text(
                stringResource(res),
                color = DangerRed,
                fontSize = 13.sp,
                modifier = Modifier.padding(top = 8.dp),
            )
        }
    }
}
