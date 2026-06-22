package com.infy.messenger

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.ContextCompat
import com.infy.messenger.core.notification.ActiveChatTracker
import com.infy.messenger.core.notification.AppNotifier
import com.infy.messenger.feature.call.ui.CallOverlay
import com.infy.messenger.ui.InfyNavHost
import com.infy.messenger.ui.theme.InfyTheme
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject

@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    @Inject lateinit var activeChatTracker: ActiveChatTracker

    // chatId, переданный из уведомления (тап по сообщению) — открыть этот чат.
    private var pendingChatId by mutableStateOf<String?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        pendingChatId = intent?.getStringExtra(AppNotifier.EXTRA_CHAT_ID)

        setContent {
            InfyTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background,
                ) {
                    RequestNotificationPermission()
                    InfyNavHost(openChatId = pendingChatId, onChatOpened = { pendingChatId = null })
                    // Оверлей звонка поверх всего приложения (рисуется при активном звонке).
                    CallOverlay()
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        // Приложение уже было запущено — берём chatId из нового интента уведомления.
        intent.getStringExtra(AppNotifier.EXTRA_CHAT_ID)?.let { pendingChatId = it }
    }

    override fun onResume() {
        super.onResume()
        activeChatTracker.appInForeground = true
    }

    override fun onPause() {
        super.onPause()
        activeChatTracker.appInForeground = false
    }
}

/** Однократно запрашивает разрешение на уведомления (Android 13+). */
@androidx.compose.runtime.Composable
private fun RequestNotificationPermission() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return
    val context = LocalContext.current
    val launcher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { /* результат не критичен — без разрешения просто не будет уведомлений */ }

    LaunchedEffect(Unit) {
        val granted = ContextCompat.checkSelfPermission(
            context, Manifest.permission.POST_NOTIFICATIONS,
        ) == PackageManager.PERMISSION_GRANTED
        if (!granted) launcher.launch(Manifest.permission.POST_NOTIFICATIONS)
    }
}
