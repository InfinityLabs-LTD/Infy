package com.infy.messenger

import android.app.Application
import com.infy.messenger.feature.auth.data.SessionManager
import dagger.hilt.android.HiltAndroidApp
import timber.log.Timber
import javax.inject.Inject

@HiltAndroidApp
class InfyApp : Application() {

    @Inject lateinit var sessionManager: SessionManager

    override fun onCreate() {
        super.onCreate()
        if (BuildConfig.DEBUG) {
            Timber.plant(Timber.DebugTree())
        }
        // Определяем начальное состояние авторизации до первого кадра.
        sessionManager.bootstrap()
    }
}
