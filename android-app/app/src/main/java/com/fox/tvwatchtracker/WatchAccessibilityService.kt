package com.fox.tvwatchtracker

import android.accessibilityservice.AccessibilityService
import android.content.Intent
import android.content.IntentFilter
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo

class WatchAccessibilityService : AccessibilityService() {

    companion object {
        private const val TAG = "WatchAccessibilitySvc"
        const val PKG_CRUNCHYROLL = "com.crunchyroll.crunchyroid"

        @Volatile
        var isConnected: Boolean = false
            private set
    }

    private var lastScanTimeMs: Long = 0L
    private var dynamicConfigReceiver: ConfigReceiver? = null

    override fun onServiceConnected() {
        super.onServiceConnected()
        isConnected = true
        registerDynamicConfigReceiver()
        Log.i(TAG, "WatchAccessibilityService connected (Crunchyroll-only mode)")
        scanCrunchyrollRoots(collectCrunchyrollRoots(null))
    }

    override fun onUnbind(intent: Intent?): Boolean {
        isConnected = false
        unregisterDynamicConfigReceiver()
        return super.onUnbind(intent)
    }

    override fun onDestroy() {
        unregisterDynamicConfigReceiver()
        isConnected = false
        super.onDestroy()
    }

    private fun registerDynamicConfigReceiver() {
        if (dynamicConfigReceiver != null) return
        val receiver = ConfigReceiver()
        val filter = IntentFilter().apply {
            addAction(ConfigReceiver.ACTION_CONFIGURE)
            addAction(ConfigReceiver.ACTION_TEST_SCROBBLE)
        }
        registerReceiver(receiver, filter)
        dynamicConfigReceiver = receiver
    }

    private fun unregisterDynamicConfigReceiver() {
        val receiver = dynamicConfigReceiver ?: return
        try {
            unregisterReceiver(receiver)
        } catch (_: Exception) {
        }
        dynamicConfigReceiver = null
    }

    override fun onInterrupt() {
        Log.w(TAG, "WatchAccessibilityService interrupted")
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        val eventType = event?.eventType ?: return
        if (eventType != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED &&
            eventType != AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED
        ) {
            return
        }

        val now = System.currentTimeMillis()
        if (now - lastScanTimeMs < 300L && eventType == AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED) {
            return
        }

        val targetRoots = collectCrunchyrollRoots(event)
        if (targetRoots.isEmpty()) return

        lastScanTimeMs = now
        scanCrunchyrollRoots(targetRoots)
    }

    private fun scanCrunchyrollRoots(roots: List<AccessibilityNodeInfo>) {
        for (root in roots) {
            try {
                handleCrunchyroll(root)
            } catch (e: Exception) {
                Log.e(TAG, "Error handling Crunchyroll accessibility tree", e)
            }
        }
    }

    private fun collectCrunchyrollRoots(event: AccessibilityEvent?): List<AccessibilityNodeInfo> {
        val results = mutableListOf<AccessibilityNodeInfo>()
        val seenRoots = HashSet<Int>()

        val eventPkg = event?.packageName?.toString()
        if (eventPkg == PKG_CRUNCHYROLL) {
            rootInActiveWindow?.let { root ->
                if (root.packageName?.toString() == PKG_CRUNCHYROLL && seenRoots.add(System.identityHashCode(root))) {
                    results.add(root)
                }
            }
        }

        try {
            windows?.forEach { window ->
                val root = window.root ?: return@forEach
                if (root.packageName?.toString() == PKG_CRUNCHYROLL && seenRoots.add(System.identityHashCode(root))) {
                    results.add(root)
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "Unable to enumerate windows", e)
        }

        if (results.isEmpty()) {
            rootInActiveWindow?.let { root ->
                if (root.packageName?.toString() == PKG_CRUNCHYROLL) {
                    results.add(root)
                }
            }
        }

        return results
    }

    private fun handleCrunchyroll(root: AccessibilityNodeInfo) {
        val detailsTitle = findTextByViewId(root, "$PKG_CRUNCHYROLL:id/detailsTitle")
        val detailsEpisode = findTextByViewId(root, "$PKG_CRUNCHYROLL:id/detailsEpisodeTitle")
        val currentTimeStr = findTextByViewId(root, "$PKG_CRUNCHYROLL:id/txtCurrentTime")
        val remainingTimeStr = findTextByViewId(root, "$PKG_CRUNCHYROLL:id/txtRemainingTime")
        val watchingDesc = findWatchingContentDescription(root)

        val descParsed = watchingDesc?.let { PlaybackParser.parseCrunchyrollContentDesc(it) }
        val epParsed = PlaybackParser.parseSeasonAndEpisode(detailsEpisode)

        val title = detailsTitle ?: descParsed?.title
        if (title.isNullOrBlank()) return

        val season = descParsed?.season ?: epParsed.season
        val episode = descParsed?.episode ?: epParsed.episode
        val episodeTitle = detailsEpisode ?: descParsed?.episodeTitle
        val posSec = PlaybackParser.parseTimeToSeconds(currentTimeStr)
        val durSec = PlaybackParser.resolveDurationSeconds(posSec, remainingTimeStr)

        // Cache context so MediaSession listener can enrich metadata when HUD is hidden
        ConfigStore.setLastCrunchyrollContext(
            context = this,
            seriesTitle = title,
            episodeTitle = episodeTitle,
            season = season,
            episode = episode
        )

        // Never scrobble without an active playback signal AND a positively identified episode number
        val hasPlaybackSignal = descParsed != null || currentTimeStr != null
        if (!hasPlaybackSignal || episode == null || episode <= 0) return

        val rawText = buildString {
            if (!watchingDesc.isNullOrBlank()) {
                append(watchingDesc)
            } else {
                append(title)
                if (!episodeTitle.isNullOrBlank()) append(" | $episodeTitle")
            }
        }

        ScrobbleReporter.report(
            this,
            WatchEvent(
                app = "crunchyroll",
                title = title,
                episodeTitle = episodeTitle,
                rawText = rawText,
                season = season,
                episode = episode,
                positionSec = posSec,
                durationSec = durSec,
                state = "playing"
            )
        )
    }

    private fun findTextByViewId(root: AccessibilityNodeInfo, viewId: String): String? {
        val nodes = try {
            root.findAccessibilityNodeInfosByViewId(viewId)
        } catch (_: Exception) {
            emptyList()
        }
        if (nodes.isNullOrEmpty()) return null
        for (node in nodes) {
            val text = node.text?.toString()?.trim()
            if (!text.isNullOrEmpty()) return text
            val desc = node.contentDescription?.toString()?.trim()
            if (!desc.isNullOrEmpty()) return desc
        }
        return null
    }

    private fun findWatchingContentDescription(root: AccessibilityNodeInfo): String? {
        val queue = ArrayDeque<AccessibilityNodeInfo>()
        queue.add(root)
        var visited = 0
        while (queue.isNotEmpty() && visited < 250) {
            val node = queue.removeFirst()
            visited++
            val desc = node.contentDescription?.toString()
            if (!desc.isNullOrBlank() &&
                (desc.contains("Você está assistindo", ignoreCase = true) ||
                    desc.contains("You are watching", ignoreCase = true))
            ) {
                return desc
            }
            for (i in 0 until node.childCount) {
                node.getChild(i)?.let { queue.add(it) }
            }
        }
        return null
    }
}
