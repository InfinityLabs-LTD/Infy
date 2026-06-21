package com.infy.messenger.core.media

import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import androidx.media3.common.MediaItem
import androidx.media3.exoplayer.ExoPlayer

/**
 * Создаёт ExoPlayer, привязанный к жизненному циклу композиции: при выходе из
 * композиции плеер освобождается. [mediaUrl] — авторизованный URL стриминга
 * (см. [MediaUrlBuilder]); токен в query, поэтому доп. заголовки не нужны.
 */
@Composable
fun rememberExoPlayer(
    mediaUrl: String,
    playWhenReady: Boolean = false,
    repeat: Boolean = false,
): ExoPlayer {
    val context = LocalContext.current
    val player = remember(mediaUrl) {
        ExoPlayer.Builder(context).build().apply {
            setMediaItem(MediaItem.fromUri(mediaUrl))
            this.playWhenReady = playWhenReady
            repeatMode = if (repeat) ExoPlayer.REPEAT_MODE_ONE else ExoPlayer.REPEAT_MODE_OFF
            prepare()
        }
    }
    DisposableEffect(player) {
        onDispose { player.release() }
    }
    return player
}
