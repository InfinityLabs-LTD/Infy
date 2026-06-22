package com.infy.messenger.ui

/** Маршруты навигации: splash, auth-стек и основное приложение (чаты). */
object Destinations {
    const val SPLASH = "splash"
    const val LOGIN = "login"
    const val REGISTER = "register"
    const val FORGOT = "forgot"

    /** Список диалогов — корень авторизованной части. */
    const val CHATS = "chats"

    /** Экран переписки. Аргумент chatId. */
    const val CONVERSATION = "conversation/{chatId}"
    fun conversation(chatId: String): String = "conversation/$chatId"

    /** Запись кружка (CIRCLE_VIDEO). Результат возвращается на экран переписки. */
    const val CIRCLE_RECORDER = "circle_recorder"

    /** Профиль текущего пользователя. */
    const val PROFILE = "profile"

    /** Публичный профиль другого пользователя. Аргумент username. */
    const val USER_PROFILE = "user/{username}"
    fun userProfile(username: String): String = "user/$username"

    /** Глобальный поиск (чаты, сообщения, новые контакты). */
    const val SEARCH = "search"

    /** Настройки и сессии. */
    const val SETTINGS = "settings"
}
