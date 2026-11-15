package com.fox.tvwatchtracker

import android.content.ComponentName
import android.content.Context
import android.content.SharedPreferences
import android.provider.Settings

object ConfigStore {
    private const val PREFS_NAME = "tv_watch_tracker_prefs"
    private const val KEY_ENDPOINT_URL = "endpoint_url"
    private const val KEY_API_KEY = "api_key"
    private const val KEY_LAST_YOUCINE_TITLE = "last_youcine_series_title"
    private const val KEY_LAST_YOUCINE_UPDATED = "last_youcine_updated_ms"
    private const val KEY_LAST_CRUNCHYROLL_TITLE = "last_crunchyroll_series_title"
    private const val KEY_LAST_CRUNCHYROLL_EP_TITLE = "last_crunchyroll_ep_title"
    private const val KEY_LAST_CRUNCHYROLL_SEASON = "last_crunchyroll_season"
    private const val KEY_LAST_CRUNCHYROLL_EPISODE = "last_crunchyroll_episode"
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

    fun setLastYouCineSeriesTitle(context: Context, title: String) {
        val clean = title.trim()
        if (clean.isEmpty()) return
        prefs(context).edit()
            .putString(KEY_LAST_YOUCINE_TITLE, clean)
            .putLong(KEY_LAST_YOUCINE_UPDATED, System.currentTimeMillis())
            .apply()
    }

    fun getLastYouCineSeriesTitle(context: Context): String? {
        val title = prefs(context).getString(KEY_LAST_YOUCINE_TITLE, null)?.trim()
        if (title.isNullOrEmpty()) return null
        val updated = prefs(context).getLong(KEY_LAST_YOUCINE_UPDATED, 0L)
        // Expire stale cache after 12 hours
        if (System.currentTimeMillis() - updated > 12L * 60L * 60L * 1000L) {
            return null
        }
        return title
    }

    fun setLastCrunchyrollContext(
        context: Context,
        seriesTitle: String?,
        episodeTitle: String?,
        season: Int?,
        episode: Int?
    ) {
        prefs(context).edit().apply {
            if (!seriesTitle.isNullOrBlank()) putString(KEY_LAST_CRUNCHYROLL_TITLE, seriesTitle.trim())
            if (!episodeTitle.isNullOrBlank()) putString(KEY_LAST_CRUNCHYROLL_EP_TITLE, episodeTitle.trim())
            if (season != null) putInt(KEY_LAST_CRUNCHYROLL_SEASON, season)
            if (episode != null) putInt(KEY_LAST_CRUNCHYROLL_EPISODE, episode)
            apply()
        }
    }

    fun getLastCrunchyrollSeriesTitle(context: Context): String? =
        prefs(context).getString(KEY_LAST_CRUNCHYROLL_TITLE, null)?.trim()?.takeIf { it.isNotEmpty() }

    fun getLastCrunchyrollSeason(context: Context): Int? {
        val value = prefs(context).getInt(KEY_LAST_CRUNCHYROLL_SEASON, -1)
        return if (value > 0) value else null
    }

    fun getLastCrunchyrollEpisode(context: Context): Int? {
        val value = prefs(context).getInt(KEY_LAST_CRUNCHYROLL_EPISODE, -1)
        return if (value > 0) value else null
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
