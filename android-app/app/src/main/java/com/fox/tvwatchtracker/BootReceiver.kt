package com.fox.tvwatchtracker

import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.service.notification.NotificationListenerService
import android.util.Log

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        val action = intent?.action ?: return
        if (action == Intent.ACTION_BOOT_COMPLETED ||
            action == Intent.ACTION_MY_PACKAGE_REPLACED ||
            action == "android.intent.action.QUICKBOOT_POWERON"
        ) {
            Log.i("BootReceiver", "Received $action; ensuring WatchMediaListenerService is bound")
            try {
                NotificationListenerService.requestRebind(
                    ComponentName(context, WatchMediaListenerService::class.java)
                )
            } catch (e: Exception) {
                Log.w("BootReceiver", "requestRebind failed", e)
            }
        }
    }
}
