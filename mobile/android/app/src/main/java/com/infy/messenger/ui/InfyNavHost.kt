package com.infy.messenger.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.infy.messenger.feature.auth.data.AuthState
import com.infy.messenger.feature.auth.ui.AuthSessionViewModel
import com.infy.messenger.feature.auth.ui.ForgotPasswordScreen
import com.infy.messenger.feature.auth.ui.LoginScreen
import com.infy.messenger.feature.auth.ui.RegisterScreen
import com.infy.messenger.feature.auth.ui.SplashScreen
import com.infy.messenger.feature.chat.ui.conversation.ConversationScreen
import com.infy.messenger.feature.chat.ui.conversation.ConversationViewModel
import com.infy.messenger.feature.chat.ui.list.ChatListScreen
import com.infy.messenger.feature.media.ui.CircleRecorderScreen
import com.infy.messenger.feature.profile.ui.ProfileScreen
import com.infy.messenger.feature.settings.ui.SettingsScreen

/**
 * Корневой граф. Глобальное состояние сессии ([AuthState]) управляет переходами
 * между auth-стеком и основным приложением; внутри стека — обычная навигация.
 */
@Composable
fun InfyNavHost(
    navController: NavHostController = rememberNavController(),
    sessionViewModel: AuthSessionViewModel = hiltViewModel(),
) {
    val authState by sessionViewModel.authState.collectAsStateWithLifecycle()

    // Реакция на смену состояния авторизации: перебрасываем на нужный стек.
    LaunchedEffect(authState) {
        when (authState) {
            is AuthState.Authenticated -> navController.navigateClearingTo(Destinations.CHATS)
            AuthState.Unauthenticated -> navController.navigateClearingTo(Destinations.LOGIN)
            AuthState.Unknown -> Unit // остаёмся на splash
        }
    }

    NavHost(navController = navController, startDestination = Destinations.SPLASH) {
        composable(Destinations.SPLASH) { SplashScreen() }

        composable(Destinations.LOGIN) {
            LoginScreen(
                onNavigateToRegister = { navController.navigate(Destinations.REGISTER) },
                onNavigateToForgot = { navController.navigate(Destinations.FORGOT) },
            )
        }
        composable(Destinations.REGISTER) {
            RegisterScreen(
                onNavigateBack = { navController.popBackStack() },
            )
        }
        composable(Destinations.FORGOT) {
            ForgotPasswordScreen(
                onNavigateBack = { navController.popBackStack() },
            )
        }

        composable(Destinations.CHATS) {
            ChatListScreen(
                onOpenChat = { chatId -> navController.navigate(Destinations.conversation(chatId)) },
                currentTab = AuroraTab.CHATS,
                onSelectTab = { tab -> navController.switchTab(tab) },
            )
        }

        composable(Destinations.PROFILE) {
            ProfileScreen(
                onOpenSettings = { navController.navigate(Destinations.SETTINGS) },
                currentTab = AuroraTab.PROFILE,
                onSelectTab = { tab -> navController.switchTab(tab) },
            )
        }
        composable(Destinations.SETTINGS) {
            SettingsScreen(
                onNavigateBack = { navController.popBackStack() },
                onLoggedOut = { /* AuthState переключит на login автоматически */ },
            )
        }
        composable(
            route = Destinations.CONVERSATION,
            arguments = listOf(navArgument("chatId") { type = NavType.StringType }),
        ) { entry ->
            // Результат записи кружка возвращается через SavedStateHandle этой записи.
            val circleUri = entry.savedStateHandle
                .getStateFlow<String?>(KEY_CIRCLE_URI, null)
                .collectAsStateWithLifecycle()
            val circleDuration = entry.savedStateHandle
                .getStateFlow<Long>(KEY_CIRCLE_DURATION, 0L)
                .collectAsStateWithLifecycle()

            val convVm: ConversationViewModel = hiltViewModel()
            LaunchedEffect(circleUri.value) {
                val uriStr = circleUri.value ?: return@LaunchedEffect
                convVm.sendCircle(android.net.Uri.parse(uriStr), circleDuration.value)
                entry.savedStateHandle[KEY_CIRCLE_URI] = null
            }

            ConversationScreen(
                onNavigateBack = { navController.popBackStack() },
                onOpenCircleRecorder = { navController.navigate(Destinations.CIRCLE_RECORDER) },
                viewModel = convVm,
            )
        }

        composable(Destinations.CIRCLE_RECORDER) {
            CircleRecorderScreen(
                onRecorded = { uri, durationMs ->
                    // Кладём результат в запись переписки и возвращаемся назад.
                    navController.previousBackStackEntry?.savedStateHandle?.apply {
                        set(KEY_CIRCLE_DURATION, durationMs)
                        set(KEY_CIRCLE_URI, uri.toString())
                    }
                    navController.popBackStack()
                },
                onCancel = { navController.popBackStack() },
            )
        }
    }
}

private const val KEY_CIRCLE_URI = "circle_uri"
private const val KEY_CIRCLE_DURATION = "circle_duration"

/** Переход с полной очисткой бэкстека (смена auth-стека). */
private fun NavHostController.navigateClearingTo(route: String) {
    if (currentDestination?.route == route) return
    navigate(route) {
        popUpTo(graph.id) { inclusive = true }
        launchSingleTop = true
    }
}

/**
 * Переключение нижних вкладок (Чаты ↔ Профиль): single-top, с очисткой стека
 * до корневой вкладки, чтобы между ними не копилась история и кнопка «назад»
 * не возвращала на предыдущую вкладку.
 */
private fun NavHostController.switchTab(tab: AuroraTab) {
    if (currentDestination?.route == tab.route) return
    navigate(tab.route) {
        popUpTo(Destinations.CHATS) { saveState = true }
        launchSingleTop = true
        restoreState = true
    }
}
