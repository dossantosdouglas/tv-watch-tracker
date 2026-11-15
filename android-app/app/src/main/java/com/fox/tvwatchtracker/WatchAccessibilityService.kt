package com.fox.tvwatchtracker

import android.accessibilityservice.AccessibilityService
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo

class WatchAccessibilityService : AccessibilityService() {

    companion object {
        private const val TAG = "WatchAccessibilitySvc"
        const val PKG_CRUNCHYROLL = "com.crunchyroll.crunchyroid"
        const val PKG_YOUCINE = "com.world.youcinetv"

        @Volatile
        var isConnected: Boolean = false
            private set
    }

    private var lastScanTimeMs: Long = 0L
    @Volatile
    private var lastYouCineTitleMem: String? = null

    override fun onServiceConnected() {
        super.onServiceConnected()
        isConnected = true
        lastYouCineTitleMem = ConfigStore.getLastYouCineSeriesTitle(this)
        Log.i(TAG, "WatchAccessibilityService connected")
        scanRoots(collectTargetRoots(null))
    }

    override fun onUnbind(intent: android.content.Intent?): Boolean {
        isConnected = false
        return super.onUnbind(intent)
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

        val targetRoots = collectTargetRoots(event)
        if (targetRoots.isEmpty()) return

        lastScanTimeMs = now
        scanRoots(targetRoots)
    }

    private fun scanRoots(targetRoots: List<Pair<String, AccessibilityNodeInfo>>) {
        for ((pkg, root) in targetRoots) {
            try {
                when (pkg) {
                    PKG_CRUNCHYROLL -> handleCrunchyroll(root)
                    PKG_YOUCINE -> handleYouCine(root)
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error handling $pkg accessibility tree", e)
            }
        }
    }

    private fun collectTargetRoots(event: AccessibilityEvent?): List<Pair<String, AccessibilityNodeInfo>> {
        val results = mutableListOf<Pair<String, AccessibilityNodeInfo>>()
        val seenRoots = HashSet<Int>()

        val eventPkg = event?.packageName?.toString()
        if (eventPkg == PKG_CRUNCHYROLL || eventPkg == PKG_YOUCINE) {
            rootInActiveWindow?.let { root ->
                if (root.packageName?.toString() == eventPkg && seenRoots.add(System.identityHashCode(root))) {
                    results.add(eventPkg to root)
                }
            }
        }

        // Also inspect all interactive windows so overlay player windows are never missed
        try {
            windows?.forEach { window ->
                val root = window.root ?: return@forEach
                val pkg = root.packageName?.toString()
                if ((pkg == PKG_CRUNCHYROLL || pkg == PKG_YOUCINE) && seenRoots.add(System.identityHashCode(root))) {
                    results.add(pkg to root)
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "Unable to enumerate windows", e)
        }

        if (results.isEmpty()) {
            rootInActiveWindow?.let { root ->
                val pkg = root.packageName?.toString()
                if (pkg == PKG_CRUNCHYROLL || pkg == PKG_YOUCINE) {
                    results.add(pkg to root)
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

        val hasPlaybackSignal = descParsed != null || currentTimeStr != null || detailsEpisode != null
        if (!hasPlaybackSignal) return

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

    private fun handleYouCine(root: AccessibilityNodeInfo) {
        val mTextTitle = findTextByViewId(root, "$PKG_YOUCINE:id/mTextTitle")
        if (!mTextTitle.isNullOrBlank()) {
            lastYouCineTitleMem = mTextTitle
            ConfigStore.setLastYouCineSeriesTitle(this, mTextTitle)
        }

        var mTvName = findTextByViewId(root, "$PKG_YOUCINE:id/mTvName")
        var currentTimeStr = findTextByViewId(root, "$PKG_YOUCINE:id/mTvCurrentTime")
        var maxTimeStr = findTextByViewId(root, "$PKG_YOUCINE:id/mTvMaxTime")

        // Fallback recursive TextView scan in case IDs change or overlay hides view IDs
        if (mTvName.isNullOrBlank() || (currentTimeStr.isNullOrBlank() && mTextTitle.isNullOrBlank())) {
            val fallbackTexts = collectVisibleTextViews(root)
            if (currentTimeStr.isNullOrBlank() || maxTimeStr.isNullOrBlank()) {
                val timeCandidates = fallbackTexts.filter { isTimeString(it) }
                if (currentTimeStr.isNullOrBlank() && timeCandidates.isNotEmpty()) {
                    currentTimeStr = timeCandidates[0]
                }
                if (maxTimeStr.isNullOrBlank() && timeCandidates.size >= 2) {
                    maxTimeStr = timeCandidates[1]
                }
            }
            if (mTvName.isNullOrBlank()) {
                mTvName = fallbackTexts.firstOrNull { text ->
                    !isTimeString(text) &&
                        text.length >= 2 &&
                        !text.equals(mTextTitle, ignoreCase = true) &&
                        !isUiNoiseText(text)
                }
            }
        }

        val cachedSeriesTitle = lastYouCineTitleMem ?: ConfigStore.getLastYouCineSeriesTitle(this)
        val hasPlayerSignal = !mTvName.isNullOrBlank() || !currentTimeStr.isNullOrBlank() || !maxTimeStr.isNullOrBlank()
        if (!hasPlayerSignal) return

        val resolvedTitle: String
        val resolvedEpTitle: String?
        if (!cachedSeriesTitle.isNullOrBlank()) {
            resolvedTitle = cachedSeriesTitle
            resolvedEpTitle = if (!mTvName.isNullOrBlank() && !mTvName.equals(cachedSeriesTitle, ignoreCase = true)) {
                mTvName
            } else {
                null
            }
        } else {
            val rawName = mTvName ?: return
            resolvedTitle = rawName
            resolvedEpTitle = rawName
        }

        val parsedEp = PlaybackParser.parseSeasonAndEpisode(mTvName ?: resolvedEpTitle)
        val posSec = PlaybackParser.parseTimeToSeconds(currentTimeStr)
        val durSec = PlaybackParser.parseTimeToSeconds(maxTimeStr)

        val rawText = buildString {
            append(resolvedTitle)
            if (!mTvName.isNullOrBlank() && !mTvName.equals(resolvedTitle, ignoreCase = true)) {
                append(" | $mTvName")
            }
            if (!currentTimeStr.isNullOrBlank()) {
                append(" [$currentTimeStr/${maxTimeStr ?: "?"}]")
            }
        }

        ScrobbleReporter.report(
            this,
            WatchEvent(
                app = "youcine",
                title = resolvedTitle,
                episodeTitle = resolvedEpTitle,
                rawText = rawText,
                season = parsedEp.season,
                episode = parsedEp.episode,
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

    private fun collectVisibleTextViews(root: AccessibilityNodeInfo): List<String> {
        val results = mutableListOf<String>()
        val queue = ArrayDeque<AccessibilityNodeInfo>()
        queue.add(root)
        var visited = 0
        while (queue.isNotEmpty() && visited < 300) {
            val node = queue.removeFirst()
            visited++
            val txt = node.text?.toString()?.trim()
            if (!txt.isNullOrEmpty() && node.isVisibleToUser) {
                results.add(txt)
            }
            for (i in 0 until node.childCount) {
                node.getChild(i)?.let { queue.add(it) }
            }
        }
        return results
    }

    private fun isTimeString(text: String): Boolean =
        Regex("""^\d{1,2}:\d{2}(:\d{2})?$""").matches(text.trim())

    private fun isUiNoiseText(text: String): Boolean {
        val lower = text.trim().lowercase()
        return lower in setOf(
            "play", "pause", "pausar", "reproduzir", "assistir", "áudio", "audio",
            "legenda", "legendas", "qualidade", "hd", "4k", "fhd", "sd", "episódios",
            "episodios", "detalhes", "favoritos", "voltar", "próximo", "proximo"
        )
    }
}
