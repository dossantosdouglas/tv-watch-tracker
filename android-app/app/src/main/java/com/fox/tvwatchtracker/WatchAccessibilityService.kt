package com.fox.tvwatchtracker

import android.accessibilityservice.AccessibilityService
import android.content.Intent
import android.content.IntentFilter
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo

class WatchAccessibilityService : AccessibilityService() {

    companion object {
        private const val TAG = "WatchAccessibilitySvc"
        const val PKG_CRUNCHYROLL = "com.crunchyroll.crunchyroid"
        private const val TRAILING_DEBOUNCE_MS = 150L
        private const val MAX_BFS_NODES = 2500
        private val BURST_DELAYS_MS = longArrayOf(300L, 800L, 1500L, 2500L, 4000L, 6000L)

        @Volatile
        var isConnected: Boolean = false
            private set

        @Volatile
        private var instance: WatchAccessibilityService? = null

        fun requestImmediateBurstScan() {
            val service = instance ?: return
            service.mainHandler.post {
                service.performScanNow()
                service.scheduleBurstScan()
            }
        }
    }

    private val mainHandler = Handler(Looper.getMainLooper())
    private var dynamicConfigReceiver: ConfigReceiver? = null
    private val burstRunnables = mutableListOf<Runnable>()

    private val trailingScanRunnable = Runnable {
        performScanNow()
    }

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
        isConnected = true
        registerDynamicConfigReceiver()
        Log.i(TAG, "WatchAccessibilityService connected (Crunchyroll-only atomic + burst mode)")
        performScanNow()
    }

    override fun onUnbind(intent: Intent?): Boolean {
        isConnected = false
        if (instance === this) instance = null
        cancelScheduledScans()
        unregisterDynamicConfigReceiver()
        return super.onUnbind(intent)
    }

    override fun onDestroy() {
        cancelScheduledScans()
        unregisterDynamicConfigReceiver()
        isConnected = false
        if (instance === this) instance = null
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
            eventType != AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED &&
            eventType != AccessibilityEvent.TYPE_VIEW_CLICKED &&
            eventType != AccessibilityEvent.TYPE_VIEW_FOCUSED
        ) {
            return
        }

        val eventPkg = event.packageName?.toString()
        if (eventPkg != null && eventPkg != PKG_CRUNCHYROLL) {
            return
        }

        // Trailing debounce (150ms) so rapid content bursts aren't dropped
        mainHandler.removeCallbacks(trailingScanRunnable)
        mainHandler.postDelayed(trailingScanRunnable, TRAILING_DEBOUNCE_MS)

        // Schedule active burst re-scans on state transitions or clicks while player buffers
        if (eventType == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED ||
            eventType == AccessibilityEvent.TYPE_VIEW_CLICKED ||
            eventType == AccessibilityEvent.TYPE_VIEW_FOCUSED
        ) {
            scheduleBurstScan()
        }
    }

    private fun cancelScheduledScans() {
        mainHandler.removeCallbacks(trailingScanRunnable)
        burstRunnables.forEach { mainHandler.removeCallbacks(it) }
        burstRunnables.clear()
    }

    private fun scheduleBurstScan() {
        burstRunnables.forEach { mainHandler.removeCallbacks(it) }
        burstRunnables.clear()

        for (delayMs in BURST_DELAYS_MS) {
            val runnable = Runnable { performScanNow() }
            burstRunnables.add(runnable)
            mainHandler.postDelayed(runnable, delayMs)
        }
    }

    private fun performScanNow() {
        val roots = collectCrunchyrollRoots()
        if (roots.isEmpty()) return
        for (root in roots) {
            try {
                handleCrunchyroll(root)
            } catch (e: Exception) {
                Log.e(TAG, "Error handling Crunchyroll accessibility tree", e)
            }
        }
    }

    private fun collectCrunchyrollRoots(): List<AccessibilityNodeInfo> {
        val results = mutableListOf<AccessibilityNodeInfo>()
        val seenRoots = HashSet<Int>()

        rootInActiveWindow?.let { root ->
            if (root.packageName?.toString() == PKG_CRUNCHYROLL && seenRoots.add(System.identityHashCode(root))) {
                results.add(root)
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

        return results
    }

    private fun handleCrunchyroll(root: AccessibilityNodeInfo) {
        val currentTimeStr = findTextByViewId(root, "$PKG_CRUNCHYROLL:id/txtCurrentTime")
        val remainingTimeStr = findTextByViewId(root, "$PKG_CRUNCHYROLL:id/txtRemainingTime")
        val posSec = PlaybackParser.parseTimeToSeconds(currentTimeStr)
        val durSec = PlaybackParser.resolveDurationSeconds(posSec, remainingTimeStr)

        // 1. Atomic extraction from "Você está assistindo <Title>. \nTemporada XEpisódio Y. <EpTitle>"
        val watchingDesc = findWatchingTextOrDescription(root)
        val descParsed = watchingDesc?.let { PlaybackParser.parseCrunchyrollContentDesc(it) }
        if (descParsed != null && descParsed.episode != null && descParsed.episode > 0) {
            ScrobbleReporter.report(
                this,
                WatchEvent(
                    app = "crunchyroll",
                    title = descParsed.title,
                    episodeTitle = descParsed.episodeTitle,
                    rawText = watchingDesc,
                    season = descParsed.season,
                    episode = descParsed.episode,
                    positionSec = posSec,
                    durationSec = durSec,
                    state = "playing"
                )
            )
            return
        }

        // 2. Otherwise require BOTH detailsTitle AND detailsEpisode (with valid episode > 0)
        // in the exact same window root at the same time (never mix across cached state).
        val detailsTitle = findTextByViewId(root, "$PKG_CRUNCHYROLL:id/detailsTitle")
        val detailsEpisode = findTextByViewId(root, "$PKG_CRUNCHYROLL:id/detailsEpisodeTitle")
            ?: findPlayerEpisodeTextFallback(root, currentTimeStr != null || remainingTimeStr != null)

        if (detailsTitle.isNullOrBlank() || detailsEpisode.isNullOrBlank()) return

        val epParsed = PlaybackParser.parseSeasonAndEpisode(detailsEpisode)
        val episode = epParsed.episode
        if (episode == null || episode <= 0) return

        val rawText = "$detailsTitle | $detailsEpisode"
        ScrobbleReporter.report(
            this,
            WatchEvent(
                app = "crunchyroll",
                title = detailsTitle,
                episodeTitle = detailsEpisode,
                rawText = rawText,
                season = epParsed.season,
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

    private fun findWatchingTextOrDescription(root: AccessibilityNodeInfo): String? {
        val queue = ArrayDeque<AccessibilityNodeInfo>()
        queue.add(root)
        var visited = 0
        while (queue.isNotEmpty() && visited < MAX_BFS_NODES) {
            val node = queue.removeFirst()
            visited++

            val desc = node.contentDescription?.toString()
            if (!desc.isNullOrBlank() && isWatchingString(desc)) {
                return desc
            }
            val text = node.text?.toString()
            if (!text.isNullOrBlank() && isWatchingString(text)) {
                return text
            }

            for (i in 0 until node.childCount) {
                node.getChild(i)?.let { queue.add(it) }
            }
        }
        return null
    }

    private fun findPlayerEpisodeTextFallback(root: AccessibilityNodeInfo, hasPlayerTimer: Boolean): String? {
        if (!hasPlayerTimer) return null
        val queue = ArrayDeque<AccessibilityNodeInfo>()
        queue.add(root)
        var visited = 0
        val epPrefixRegex = Regex("""^(?:[TS]\d+\s*)?E\d+\s*[-–:]\s*.+$""", RegexOption.IGNORE_CASE)
        while (queue.isNotEmpty() && visited < MAX_BFS_NODES) {
            val node = queue.removeFirst()
            visited++
            val text = node.text?.toString()?.trim()
            if (!text.isNullOrBlank() && epPrefixRegex.matches(text)) {
                return text
            }
            for (i in 0 until node.childCount) {
                node.getChild(i)?.let { queue.add(it) }
            }
        }
        return null
    }

    private fun isWatchingString(value: String): Boolean =
        value.contains("Você está assistindo", ignoreCase = true) ||
            value.contains("You are watching", ignoreCase = true)
}
