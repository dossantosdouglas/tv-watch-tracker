package com.fox.tvwatchtracker

import android.content.ComponentName
import android.content.Context
import android.content.SharedPreferences
import android.provider.Settings

object ConfigStore {
    private const val PREFS_NAME = "tv_watch_tracker_prefs"
    private const val KEY_ENDPOINT_URL = "endpoint_url"
    private const val KEY_API_KEY = "api_key"
    private const val KEY_LAST_SCROBBLE_SUMMARY = "last_scrobble_summary"
    private const val KEY_LAST_SCROBBLE_STATUS = "last_scrobble_status"
    private const val KEY_LAST_SCROBBLE_TIME = "last_scrobble_time"

    private fun prefs(context: Context): SharedPreferences =
        context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    fun getEndpointUrl(context: Context): String {
        val saved = prefs(context).getString(KEY_ENDPOINT_URL, null)?.trim()
        return if (saved.isNullOrEmpty()) BuildConfig.DEFAULT_ENDPOINT_URL else saved
    }

    fun getApiKey(context: Context): String {
        val saved = prefs(context).getString(KEY_API_KEY, null)?.trim()
        return if (saved.isNullOrEmpty()) BuildConfig.DEFAULT_API_KEY else saved
    }

    fun updateConfig(context: Context, endpointUrl: String?, apiKey: String?) {
        prefs(context).edit().apply {
            if (!endpointUrl.isNullOrBlank()) {
                putString(KEY_ENDPOINT_URL, endpointUrl.trim())
            }
            if (!apiKey.isNullOrBlank()) {
                putString(KEY_API_KEY, apiKey.trim())
            }
            apply()
        }
    }

    fun saveLastScrobble(context: Context, summary: String, status: String, timestamp: String) {
        prefs(context).edit()
            .putString(KEY_LAST_SCROBBLE_SUMMARY, summary)
            .putString(KEY_LAST_SCROBBLE_STATUS, status)
            .putString(KEY_LAST_SCROBBLE_TIME, timestamp)
            .apply()
    }

    fun getLastScrobbleSummary(context: Context): String =
        prefs(context).getString(KEY_LAST_SCROBBLE_SUMMARY, null) ?: "Nenhum evento enviado ainda."

    fun getLastScrobbleStatus(context: Context): String =
        prefs(context).getString(KEY_LAST_SCROBBLE_STATUS, null) ?: "—"

    fun getLastScrobbleTime(context: Context): String =
        prefs(context).getString(KEY_LAST_SCROBBLE_TIME, null) ?: ""

    fun isAccessibilityServiceEnabled(context: Context): Boolean {
        val enabled = Settings.Secure.getInt(
            context.contentResolver,
            Settings.Secure.ACCESSIBILITY_ENABLED,
            0
        ) == 1
        if (!enabled) return false

        val services = Settings.Secure.getString(
            context.contentResolver,
            Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
        ) ?: return false

        val expectedFull = ComponentName(context, WatchAccessibilityService::class.java).flattenToString()
        val expectedShort = ComponentName(context, WatchAccessibilityService::class.java).flattenToShortString()
        return services.split(':').any {
            it.equals(expectedFull, ignoreCase = true) || it.equals(expectedShort, ignoreCase = true)
        }
    }

    fun isNotificationListenerEnabled(context: Context): Boolean {
        val listeners = Settings.Secure.getString(
            context.contentResolver,
            "enabled_notification_listeners"
        ) ?: return false

        val expectedFull = ComponentName(context, WatchMediaListenerService::class.java).flattenToString()
        val expectedShort = ComponentName(context, WatchMediaListenerService::class.java).flattenToShortString()
        return listeners.split(':').any {
            it.equals(expectedFull, ignoreCase = true) || it.equals(expectedShort, ignoreCase = true)
        }
    }
}
