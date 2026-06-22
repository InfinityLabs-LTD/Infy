package com.infy.messenger

import android.app.Application
import com.infy.messenger.core.push.FcmTokenRegistrar
import com.infy.messenger.core.realtime.RealtimeSyncManager
import com.infy.messenger.feature.auth.data.SessionManager
import com.infy.messenger.feature.call.data.CallManager
import com.infy.messenger.feature.call.data.CallSystemController
import dagger.hilt.android.HiltAndroidApp
import timber.log.Timber
import javax.inject.Inject

@HiltAndroidApp
class InfyApp : Application() {

    @Inject lateinit var sessionManager: SessionManager
    @Inject lateinit var realtimeSyncManager: RealtimeSyncManager
    @Inject lateinit var callManager: CallManager
    @Inject lateinit var callSystemController: CallSystemController
    @Inject lateinit var fcmTokenRegistrar: FcmTokenRegistrar

    override fun onCreate() {
        super.onCreate()
        if (BuildConfig.DEBUG) {
            Timber.plant(Timber.DebugTree())
        }
        // Определяем начальное состояние авторизации до первого кадра.
        sessionManager.bootstrap()
        // Запускаем мост realtime ↔ кэш (сам подключится при авторизации).
        realtimeSyncManager.start()
        // Слушаем сигналинг звонков (входящие/исходящие).
        callManager.start()
        // Foreground-сервис + аудио-маршрутизация на время звонка.
        callSystemController.start()
        // Регистрация/снятие FCM-токена по состоянию авторизации (фоновые push).
        fcmTokenRegistrar.start()
    }
}
