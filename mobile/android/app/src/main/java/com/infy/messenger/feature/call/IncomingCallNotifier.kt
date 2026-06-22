package com.infy.messenger.feature.call

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.infy.messenger.MainActivity
import com.infy.messenger.R
import com.infy.messenger.feature.call.domain.CallMedia
import com.infy.messenger.feature.call.domain.CallPeer
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Системное уведомление входящего звонка в стиле Telegram: высокоприоритетный
 * канал с рингтоном, full-screen-intent (всплывает поверх экрана блокировки) и
 * действиями «Принять»/«Отклонить». Показывается, пока фаза = INCOMING.
 */
@Singleton
class IncomingCallNotifier @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    private val manager = NotificationManagerCompat.from(context)

    fun show(peer: CallPeer?, media: CallMedia) {
        ensureChannel()

        val title = peer?.nickname?.takeIf { it.isNotBlank() }
            ?: peer?.username
            ?: context.getString(R.string.call_incoming_audio)
        val text = context.getString(
            if (media == CallMedia.VIDEO) R.string.call_incoming_video
            else R.string.call_incoming_audio,
        )

        // Full-screen-intent открывает приложение (там CallOverlay покажет звонок).
        val fullScreenIntent = PendingIntent.getActivity(
            context,
            REQ_FULLSCREEN,
            Intent(context, MainActivity::class.java)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP),
            pendingFlags(),
        )

        val acceptIntent = PendingIntent.getBroadcast(
            context,
            REQ_ACCEPT,
            Intent(context, CallActionReceiver::class.java).setAction(CallActionReceiver.ACTION_ACCEPT),
            pendingFlags(),
        )
        val declineIntent = PendingIntent.getBroadcast(
            context,
            REQ_DECLINE,
            Intent(context, CallActionReceiver::class.java).setAction(CallActionReceiver.ACTION_DECLINE),
            pendingFlags(),
        )

        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(text)
            .setSmallIcon(R.drawable.ic_launcher_foreground)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setOngoing(true)
            .setAutoCancel(false)
            .setFullScreenIntent(fullScreenIntent, true)
            .addAction(0, context.getString(R.string.call_decline), declineIntent)
            .addAction(0, context.getString(R.string.call_accept), acceptIntent)
            .build()

        runCatching { manager.notify(NOTIFICATION_ID, notification) }
    }

    fun cancel() {
        manager.cancel(NOTIFICATION_ID)
    }

    private fun pendingFlags(): Int =
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE

    private fun ensureChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (nm.getNotificationChannel(CHANNEL_ID) != null) return
        val channel = NotificationChannel(
            CHANNEL_ID,
            context.getString(R.string.call_incoming_channel_name),
            NotificationManager.IMPORTANCE_HIGH,
        ).apply {
            description = context.getString(R.string.call_incoming_channel_name)
            setSound(
                android.media.RingtoneManager.getDefaultUri(android.media.RingtoneManager.TYPE_RINGTONE),
                android.media.AudioAttributes.Builder()
                    .setUsage(android.media.AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                    .setContentType(android.media.AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build(),
            )
            enableVibration(true)
            vibrationPattern = longArrayOf(0, 1000, 1000, 1000, 1000)
        }
        nm.createNotificationChannel(channel)
    }

    private companion object {
        const val CHANNEL_ID = "infy_incoming_call"
        const val NOTIFICATION_ID = 43
        const val REQ_FULLSCREEN = 100
        const val REQ_ACCEPT = 101
        const val REQ_DECLINE = 102
    }
}
