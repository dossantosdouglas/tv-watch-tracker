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
            activeCallbacks.values.forEach { (controller, cb) ->
                try {
                    controller.unregisterCallback(cb)
                } catch (_: Exception) {
                }
            }
            activeCallbacks.clear()

            for (controller in controllers) {
                val pkg = controller.packageName ?: continue
                if (pkg != WatchAccessibilityService.PKG_CRUNCHYROLL) continue

                val callback = object : MediaController.Callback() {
                    override fun onMetadataChanged(metadata: MediaMetadata?) {
                        triggerBurstScan(metadata, controller.playbackState, "onMetadataChanged")
                    }

                    override fun onPlaybackStateChanged(state: PlaybackState?) {
                        triggerBurstScan(controller.metadata, state, "onPlaybackStateChanged")
                    }

                    override fun onSessionDestroyed() {
                        Log.i(TAG, "MediaSession destroyed for $pkg")
                    }
                }
                controller.registerCallback(callback)
                activeCallbacks[pkg] = controller to callback
                triggerBurstScan(controller.metadata, controller.playbackState, "sessionAttached")
            }
        }
    }

    private fun triggerBurstScan(
        metadata: MediaMetadata?,
        playbackState: PlaybackState?,
        source: String
    ) {
        val stateCode = playbackState?.state ?: PlaybackState.STATE_NONE
        val titleHint = metadata?.getString(MediaMetadata.METADATA_KEY_DISPLAY_DESCRIPTION)
            ?: metadata?.getString(MediaMetadata.METADATA_KEY_TITLE)
        if (stateCode == PlaybackState.STATE_PLAYING || !titleHint.isNullOrBlank()) {
            Log.d(TAG, "Crunchyroll MediaSession ($source, state=$stateCode, hint=$titleHint) -> requesting burst scan")
            WatchAccessibilityService.requestImmediateBurstScan()
        }
    }
}
