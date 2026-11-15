package com.fox.tvwatchtracker

import android.content.ComponentName
import android.content.Context
import android.media.MediaMetadata
import android.media.session.MediaController
import android.media.session.MediaSessionManager
import android.media.session.PlaybackState
import android.service.notification.NotificationListenerService
import android.util.Log

class WatchMediaListenerService : NotificationListenerService() {

    companion object {
        private const val TAG = "WatchMediaListenerSvc"
        private val SUPPORTED_PACKAGES = setOf(
            WatchAccessibilityService.PKG_CRUNCHYROLL,
            WatchAccessibilityService.PKG_YOUCINE
        )

        @Volatile
        var isConnected: Boolean = false
            private set
    }

    private var sessionManager: MediaSessionManager? = null
    private val activeCallbacks = mutableMapOf<String, Pair<MediaController, MediaController.Callback>>()

    private val sessionsChangedListener =
        MediaSessionManager.OnActiveSessionsChangedListener { controllers ->
            updateControllers(controllers.orEmpty())
        }

    override fun onListenerConnected() {
        super.onListenerConnected()
        isConnected = true
        Log.i(TAG, "WatchMediaListenerService connected")
        registerSessionListener()
    }

    override fun onListenerDisconnected() {
        isConnected = false
        unregisterSessionListener()
        super.onListenerDisconnected()
    }

    override fun onCreate() {
        super.onCreate()
        registerSessionListener()
    }

    override fun onDestroy() {
        unregisterSessionListener()
        isConnected = false
        super.onDestroy()
    }

    private fun registerSessionListener() {
        try {
            val mgr = getSystemService(Context.MEDIA_SESSION_SERVICE) as? MediaSessionManager ?: return
            sessionManager = mgr
            val component = ComponentName(this, WatchMediaListenerService::class.java)
            mgr.removeOnActiveSessionsChangedListener(sessionsChangedListener)
            mgr.addOnActiveSessionsChangedListener(sessionsChangedListener, component)
            val current = mgr.getActiveSessions(component)
            updateControllers(current)
        } catch (se: SecurityException) {
            Log.w(TAG, "Notification listener permission not yet granted", se)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to register MediaSession listener", e)
        }
    }

    private fun unregisterSessionListener() {
        try {
            sessionManager?.removeOnActiveSessionsChangedListener(sessionsChangedListener)
        } catch (_: Exception) {
        }
        synchronized(activeCallbacks) {
            activeCallbacks.values.forEach { (controller, cb) ->
                try {
                    controller.unregisterCallback(cb)
                } catch (_: Exception) {
                }
            }
            activeCallbacks.clear()
        }
    }

    private fun updateControllers(controllers: List<MediaController>) {
        synchronized(activeCallbacks) {
            // Unregister old callbacks
            activeCallbacks.values.forEach { (controller, cb) ->
                try {
                    controller.unregisterCallback(cb)
                } catch (_: Exception) {
                }
            }
            activeCallbacks.clear()

            for (controller in controllers) {
                val pkg = controller.packageName ?: continue
                if (pkg !in SUPPORTED_PACKAGES) continue

                val callback = object : MediaController.Callback() {
                    override fun onMetadataChanged(metadata: MediaMetadata?) {
                        processMediaState(pkg, metadata, controller.playbackState)
                    }

                    override fun onPlaybackStateChanged(state: PlaybackState?) {
                        processMediaState(pkg, controller.metadata, state)
                    }

                    override fun onSessionDestroyed() {
                        Log.i(TAG, "MediaSession destroyed for $pkg")
                    }
                }
                controller.registerCallback(callback)
                activeCallbacks[pkg] = controller to callback
                processMediaState(pkg, controller.metadata, controller.playbackState)
            }
        }
    }

    private fun processMediaState(
        pkg: String,
        metadata: MediaMetadata?,
        playbackState: PlaybackState?
    ) {
        val stateCode = playbackState?.state ?: PlaybackState.STATE_NONE
        if (stateCode != PlaybackState.STATE_PLAYING) return

        val appName = when (pkg) {
            WatchAccessibilityService.PKG_CRUNCHYROLL -> "crunchyroll"
            WatchAccessibilityService.PKG_YOUCINE -> "youcine"
            else -> return
        }

        val metaTitle = metadata?.getString(MediaMetadata.METADATA_KEY_TITLE)?.trim()
        val displayTitle = metadata?.getString(MediaMetadata.METADATA_KEY_DISPLAY_TITLE)?.trim()
        val subtitle = metadata?.getString(MediaMetadata.METADATA_KEY_DISPLAY_SUBTITLE)?.trim()
        val description = metadata?.getString(MediaMetadata.METADATA_KEY_DISPLAY_DESCRIPTION)?.trim()
        val albumOrArtist = metadata?.getString(MediaMetadata.METADATA_KEY_ARTIST)?.trim()
            ?: metadata?.getString(MediaMetadata.METADATA_KEY_ALBUM)?.trim()

        val durationMs = metadata?.getLong(MediaMetadata.METADATA_KEY_DURATION) ?: -1L
        val positionMs = playbackState?.position ?: -1L
        val durationSec = if (durationMs > 0) (durationMs / 1000L).toInt() else null
        val positionSec = if (positionMs >= 0) (positionMs / 1000L).toInt() else null

        val cachedSeries = if (appName == "crunchyroll") {
            ConfigStore.getLastCrunchyrollSeriesTitle(this)
        } else {
            ConfigStore.getLastYouCineSeriesTitle(this)
        }

        // Crunchyroll MediaSession often puts only the episode title in description/title
        val candidateSeries = listOfNotNull(
            cachedSeries,
            albumOrArtist,
            displayTitle,
            metaTitle
        ).firstOrNull { it.isNotBlank() } ?: return

        val candidateEpisode = listOfNotNull(
            description,
            subtitle,
            metaTitle.takeIf { it != candidateSeries },
            displayTitle.takeIf { it != candidateSeries }
        ).firstOrNull { it.isNotBlank() }

        val parsed = PlaybackParser.parseSeasonAndEpisode(candidateEpisode ?: candidateSeries)
        val season = parsed.season ?: if (appName == "crunchyroll") ConfigStore.getLastCrunchyrollSeason(this) else null
        val episode = parsed.episode ?: if (appName == "crunchyroll") ConfigStore.getLastCrunchyrollEpisode(this) else null

        val rawText = listOfNotNull(candidateSeries, candidateEpisode)
            .distinct()
            .joinToString(" | ")

        ScrobbleReporter.report(
            this,
            WatchEvent(
                app = appName,
                title = candidateSeries,
                episodeTitle = candidateEpisode,
                rawText = rawText,
                season = season,
                episode = episode,
                positionSec = positionSec,
                durationSec = durationSec,
                state = "playing"
            )
        )
    }
}
