package com.infy.messenger.feature.call

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.infy.messenger.feature.call.data.CallManager
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject

/**
 * Принимает действия «Принять»/«Отклонить» из системного уведомления входящего
 * звонка и проксирует их в [CallManager]. При «Принять» дополнительно открывает
 * приложение, чтобы пользователь сразу попал в экран звонка.
 */
@AndroidEntryPoint
class CallActionReceiver : BroadcastReceiver() {

    @Inject lateinit var callManager: CallManager

    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            ACTION_ACCEPT -> {
                callManager.accept()
                // Открываем приложение поверх экрана блокировки.
                context.startActivity(
                    Intent(context, com.infy.messenger.MainActivity::class.java)
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                )
            }
            ACTION_DECLINE -> callManager.decline()
        }
    }

    companion object {
        const val ACTION_ACCEPT = "com.infy.messenger.action.CALL_ACCEPT"
        const val ACTION_DECLINE = "com.infy.messenger.action.CALL_DECLINE"
    }
}
