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
}
