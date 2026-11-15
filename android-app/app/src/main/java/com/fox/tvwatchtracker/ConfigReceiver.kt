package com.fox.tvwatchtracker

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

class ConfigReceiver : BroadcastReceiver() {
    companion object {
        private const val TAG = "ConfigReceiver"
        const val ACTION_CONFIGURE = "com.fox.tvwatchtracker.CONFIGURE"
        const val ACTION_TEST_SCROBBLE = "com.fox.tvwatchtracker.TEST_SCROBBLE"
    }

    override fun onReceive(context: Context, intent: Intent?) {
        when (intent?.action) {
            ACTION_CONFIGURE -> {
                val url = intent.getStringExtra("url")
                val key = intent.getStringExtra("key")
                ConfigStore.updateConfig(context, url, key)
                Log.i(
                    TAG,
                    "Updated config via broadcast -> url=${ConfigStore.getEndpointUrl(context)} keyLen=${ConfigStore.getApiKey(context).length}"
                )
                ScrobbleReporter.onStatusUpdated?.invoke()
            }
            ACTION_TEST_SCROBBLE -> {
                Log.i(TAG, "Triggering test scrobble via broadcast")
                val pendingResult = goAsync()
                ScrobbleReporter.sendTestScrobble(context) { ok, status ->
                    Log.i(TAG, "Broadcast test scrobble result: ok=$ok status=$status")
                    pendingResult.finish()
                }
            }
        }
    }
}
