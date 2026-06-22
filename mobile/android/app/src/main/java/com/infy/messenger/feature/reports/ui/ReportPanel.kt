package com.infy.messenger.feature.reports.ui

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AddPhotoAlternate
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil.compose.AsyncImage
import com.infy.messenger.R
import com.infy.messenger.ui.theme.Aurora
import com.infy.messenger.ui.theme.DangerRed
import com.infy.messenger.ui.theme.Glass2
import com.infy.messenger.ui.theme.GlassPopBg
import com.infy.messenger.ui.theme.GlassStroke
import com.infy.messenger.ui.theme.InfyAccent
import com.infy.messenger.ui.theme.TextHi
import com.infy.messenger.ui.theme.TextLow
import com.infy.messenger.ui.theme.TextMid
import kotlinx.coroutines.delay

/** Описание одной категории жалобы: код + ресурсы заголовка и подписи. */
private data class CategorySpec(
    val category: ReportCategory,
    val labelRes: Int,
    val descRes: Int,
)

/** Категории в том же порядке, что и в web. */
private val CATEGORY_SPECS = listOf(
    CategorySpec(ReportCategory.SPAM, R.string.report_cat_spam, R.string.report_cat_spam_desc),
    CategorySpec(ReportCategory.HARASSMENT, R.string.report_cat_harassment, R.string.report_cat_harassment_desc),
    CategorySpec(ReportCategory.HATE, R.string.report_cat_hate, R.string.report_cat_hate_desc),
    CategorySpec(ReportCategory.VIOLENCE, R.string.report_cat_violence, R.string.report_cat_violence_desc),
    CategorySpec(ReportCategory.SEXUAL, R.string.report_cat_sexual, R.string.report_cat_sexual_desc),
    CategorySpec(ReportCategory.SCAM, R.string.report_cat_scam, R.string.report_cat_scam_desc),
    CategorySpec(ReportCategory.ILLEGAL, R.string.report_cat_illegal, R.string.report_cat_illegal_desc),
    CategorySpec(ReportCategory.OTHER, R.string.report_cat_other, R.string.report_cat_other_desc),
)

/**
 * Модалка жалобы на пользователя (паритет с web): затемнение + стеклянная
 * карточка по центру. Сетка категорий 2×4, описание (до 1000 со счётчиком),
 * до 5 скриншотов-доказательств, кнопка отправки красного цвета.
 * При успехе — галочка и авто-закрытие через ~1.4с.
 */
@Composable
fun ReportPanel(
    targetId: String,
    targetName: String,
    chatId: String,
    onClose: () -> Unit,
    viewModel: ReportViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()

    // Выбор скриншотов (до maxEvidence).
    val picker = rememberLauncherForActivityResult(
        ActivityResultContracts.PickMultipleVisualMedia(viewModel.maxEvidence),
    ) { uris: List<Uri> ->
        if (uris.isNotEmpty()) viewModel.addEvidence(uris)
    }

    // Авто-закрытие после успешной отправки.
    LaunchedEffect(state.success) {
        if (state.success) {
            delay(1400)
            onClose()
        }
    }

    Dialog(
        onDismissRequest = { if (!state.submitting) onClose() },
        properties = DialogProperties(usePlatformDefaultWidth = false),
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .background(Color.Black.copy(alpha = 0.5f))
                .padding(horizontal = 20.dp, vertical = 32.dp),
            contentAlignment = Alignment.Center,
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(GlassPopBg, RoundedCornerShape(24.dp))
                    .border(BorderStroke(1.dp, GlassStroke), RoundedCornerShape(24.dp))
                    .padding(20.dp),
            ) {
                if (state.success) {
                    SuccessContent()
                } else {
                    ReportForm(
                        targetName = targetName,
                        state = state,
                        viewModel = viewModel,
                        onPickEvidence = {
                            picker.launch(
                                PickVisualMediaRequest(
                                    ActivityResultContracts.PickVisualMedia.ImageOnly,
                                ),
                            )
                        },
                        onClose = { if (!state.submitting) onClose() },
                        onSubmit = { viewModel.submit(targetId, chatId) },
                    )
                }
            }
        }
    }
}

@Composable
private fun SuccessContent() {
    Column(
        modifier = Modifier.fillMaxWidth().padding(vertical = 24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Box(
            modifier = Modifier
                .size(56.dp)
                .background(Aurora.gradOwn, RoundedCornerShape(28.dp)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(Icons.Filled.Check, null, tint = Color.White, modifier = Modifier.size(30.dp))
        }
        Text(
            stringRes(R.string.report_sent),
            color = TextHi,
            fontWeight = FontWeight.SemiBold,
            fontSize = 16.sp,
        )
    }
}

@Composable
private fun ReportForm(
    targetName: String,
    state: ReportUiState,
    viewModel: ReportViewModel,
    onPickEvidence: () -> Unit,
    onClose: () -> Unit,
    onSubmit: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(max = 560.dp)
            .verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        // Шапка: заголовок + крестик.
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f)) {
                Text(
                    stringRes(R.string.report_title),
                    color = TextHi,
                    fontWeight = FontWeight.Bold,
                    fontSize = 18.sp,
                )
                Text(
                    androidx.compose.ui.res.stringResource(R.string.report_on_user, targetName),
                    color = TextMid,
                    fontSize = 13.sp,
                )
            }
            Box(
                modifier = Modifier
                    .size(32.dp)
                    .clip(RoundedCornerShape(16.dp))
                    .clickable(onClick = onClose),
                contentAlignment = Alignment.Center,
            ) {
                Icon(Icons.Filled.Close, null, tint = TextMid, modifier = Modifier.size(20.dp))
            }
        }

        // Категории — сетка 2 колонки.
        Text(
            stringRes(R.string.report_category),
            color = TextMid,
            fontWeight = FontWeight.Medium,
            fontSize = 13.sp,
        )
        CategoryGrid(selected = state.category, onSelect = viewModel::selectCategory)

        // Описание + счётчик.
        OutlinedTextField(
            value = state.description,
            onValueChange = viewModel::onDescriptionChange,
            label = { Text(stringRes(R.string.report_description)) },
            placeholder = { Text(stringRes(R.string.report_description_hint), color = TextLow) },
            modifier = Modifier.fillMaxWidth().heightIn(min = 96.dp),
            minLines = 3,
            maxLines = 6,
            shape = RoundedCornerShape(16.dp),
            colors = reportFieldColors(),
        )
        Text(
            "${state.description.length} / 1000",
            color = TextLow,
            fontSize = 11.sp,
            modifier = Modifier.fillMaxWidth(),
        )

        // Скриншоты-доказательства (опционально, до maxEvidence).
        EvidenceRow(
            evidence = state.evidence,
            max = viewModel.maxEvidence,
            onAdd = onPickEvidence,
            onRemove = viewModel::removeEvidence,
        )

        if (state.error) {
            Text(
                stringRes(R.string.report_error),
                color = DangerRed,
                fontSize = 13.sp,
            )
        }

        // Кнопка отправки — красная, неактивна пока нет категории/описания.
        SubmitButton(
            enabled = state.canSubmit,
            loading = state.submitting,
            onClick = onSubmit,
        )
    }
}

@Composable
private fun CategoryGrid(
    selected: ReportCategory?,
    onSelect: (ReportCategory) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        CATEGORY_SPECS.chunked(2).forEach { row ->
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                row.forEach { spec ->
                    CategoryCard(
                        spec = spec,
                        selected = selected == spec.category,
                        onClick = { onSelect(spec.category) },
                        modifier = Modifier.weight(1f),
                    )
                }
                // Дополняем нечётный ряд (на случай изменения числа категорий).
                if (row.size == 1) Box(Modifier.weight(1f))
            }
        }
    }
}

@Composable
private fun CategoryCard(
    spec: CategorySpec,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val strokeColor = if (selected) InfyAccent else GlassStroke
    Column(
        modifier = modifier
            .clip(RoundedCornerShape(14.dp))
            .then(
                if (selected) Modifier.background(Aurora.gradOwn)
                else Modifier.background(Glass2),
            )
            .border(BorderStroke(if (selected) 1.5.dp else 1.dp, strokeColor), RoundedCornerShape(14.dp))
            .clickable(onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 10.dp),
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        Text(
            stringRes(spec.labelRes),
            color = if (selected) Color.White else TextHi,
            fontWeight = FontWeight.SemiBold,
            fontSize = 13.sp,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        Text(
            stringRes(spec.descRes),
            color = if (selected) Color.White.copy(alpha = 0.85f) else TextLow,
            fontSize = 11.sp,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

@Composable
private fun EvidenceRow(
    evidence: List<Uri>,
    max: Int,
    onAdd: () -> Unit,
    onRemove: (Uri) -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        evidence.forEach { uri ->
            Box(modifier = Modifier.size(56.dp)) {
                AsyncImage(
                    model = uri,
                    contentDescription = null,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier
                        .size(56.dp)
                        .clip(RoundedCornerShape(12.dp)),
                )
                Box(
                    modifier = Modifier
                        .align(Alignment.TopEnd)
                        .size(18.dp)
                        .clip(RoundedCornerShape(9.dp))
                        .background(Color.Black.copy(alpha = 0.6f))
                        .clickable { onRemove(uri) },
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(Icons.Filled.Close, null, tint = Color.White, modifier = Modifier.size(12.dp))
                }
            }
        }
        if (evidence.size < max) {
            Box(
                modifier = Modifier
                    .size(56.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(Glass2)
                    .border(BorderStroke(1.dp, GlassStroke), RoundedCornerShape(12.dp))
                    .clickable(onClick = onAdd),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    Icons.Filled.AddPhotoAlternate,
                    null,
                    tint = TextMid,
                    modifier = Modifier.size(22.dp),
                )
            }
        }
    }
}

@Composable
private fun SubmitButton(
    enabled: Boolean,
    loading: Boolean,
    onClick: () -> Unit,
) {
    val shape = RoundedCornerShape(16.dp)
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(if (enabled || loading) DangerRed else DangerRed.copy(alpha = 0.4f))
            .clickable(enabled = enabled, onClick = onClick)
            .padding(vertical = 14.dp),
        contentAlignment = Alignment.Center,
    ) {
        if (loading) {
            androidx.compose.material3.CircularProgressIndicator(
                color = Color.White,
                strokeWidth = 2.dp,
                modifier = Modifier.size(20.dp),
            )
        } else {
            Text(
                stringRes(R.string.report_submit),
                color = Color.White,
                fontWeight = FontWeight.SemiBold,
            )
        }
    }
}

@Composable
private fun reportFieldColors() = OutlinedTextFieldDefaults.colors(
    focusedContainerColor = Glass2,
    unfocusedContainerColor = Glass2,
    focusedBorderColor = MaterialTheme.colorScheme.primary,
    unfocusedBorderColor = GlassStroke,
    focusedLabelColor = MaterialTheme.colorScheme.primary,
    unfocusedLabelColor = TextLow,
    cursorColor = MaterialTheme.colorScheme.primary,
    focusedTextColor = TextHi,
    unfocusedTextColor = TextHi,
)

/** Короткий алиас для stringResource (читаемость). */
@Composable
private fun stringRes(id: Int): String = androidx.compose.ui.res.stringResource(id)
