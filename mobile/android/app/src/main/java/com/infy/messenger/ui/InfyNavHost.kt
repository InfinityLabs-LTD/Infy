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
import com.infy.messenger.feature.chat.ui.list.ChatListScreen

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
                onLogout = { sessionViewModel.logout() },
            )
        }
        composable(
            route = Destinations.CONVERSATION,
            arguments = listOf(navArgument("chatId") { type = NavType.StringType }),
        ) {
            ConversationScreen(
                onNavigateBack = { navController.popBackStack() },
            )
        }
    }
}

/** Переход с полной очисткой бэкстека (смена auth-стека). */
private fun NavHostController.navigateClearingTo(route: String) {
    if (currentDestination?.route == route) return
    navigate(route) {
        popUpTo(graph.id) { inclusive = true }
        launchSingleTop = true
    }
}
