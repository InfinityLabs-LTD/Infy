package com.infy.messenger.core.notification

import android.content.Context
import android.content.SharedPreferences
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Локальное зеркало настроек уведомлений пользователя (popup/sound/vibrate из
 * профиля). Нужно, чтобы [AppNotifier] — в том числе в FCM-сервисе при убитом
 * процессе — мог синхронно решить, показывать ли баннер и с каким каналом
 * (звук/вибрация). Обновляется при загрузке/изменении профиля.
 *
 * Простые SharedPreferences (не секрет), переживают перезапуск процесса.
 */
@Singleton
class NotificationPrefs @Inject constructor(
    @ApplicationContext context: Context,
) {
    private val prefs: SharedPreferences =
        context.getSharedPreferences(FILE_NAME, Context.MODE_PRIVATE)

    /** Показывать всплывающие уведомления (баннеры). По умолчанию — да. */
    var popup: Boolean
        get() = prefs.getBoolean(KEY_POPUP, true)
        private set(v) = prefs.edit().putBoolean(KEY_POPUP, v).apply()

    /** Звук уведомлений. */
    var sound: Boolean
        get() = prefs.getBoolean(KEY_SOUND, true)
        private set(v) = prefs.edit().putBoolean(KEY_SOUND, v).apply()

    /** Вибрация уведомлений. */
    var vibrate: Boolean
        get() = prefs.getBoolean(KEY_VIBRATE, true)
        private set(v) = prefs.edit().putBoolean(KEY_VIBRATE, v).apply()

    /** Обновить все три флага разом (вызывается при загрузке/патче профиля). */
    fun update(popup: Boolean, sound: Boolean, vibrate: Boolean) {
        prefs.edit()
            .putBoolean(KEY_POPUP, popup)
            .putBoolean(KEY_SOUND, sound)
            .putBoolean(KEY_VIBRATE, vibrate)
            .apply()
    }

    private companion object {
        const val FILE_NAME = "infy_notif_prefs"
        const val KEY_POPUP = "notify_popup"
        const val KEY_SOUND = "notify_sound"
        const val KEY_VIBRATE = "notify_vibrate"
    }
}
