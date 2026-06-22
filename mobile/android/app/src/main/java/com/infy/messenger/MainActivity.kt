package com.infy.messenger

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import com.infy.messenger.feature.call.ui.CallOverlay
import com.infy.messenger.ui.InfyNavHost
import com.infy.messenger.ui.theme.InfyTheme
import dagger.hilt.android.AndroidEntryPoint

@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        // Чтобы full-screen-intent входящего звонка показывался поверх экрана блокировки.
        showWhenLockedAndTurnScreenOn()
        setContent {
            InfyTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background,
                ) {
                    InfyNavHost()
                    // Оверлей звонка поверх всего приложения (рисуется при активном звонке).
                    CallOverlay()
                }
            }
        }
    }

    /** Разрешает показ Activity на экране блокировки и пробуждение экрана. */
    private fun showWhenLockedAndTurnScreenOn() {
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        } else {
            @Suppress("DEPRECATION")
            window.addFlags(
                android.view.WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                    android.view.WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON,
            )
        }
    }
}
