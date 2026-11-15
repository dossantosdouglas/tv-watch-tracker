package com.fox.tvwatchtracker

import android.content.Context
import android.util.Log
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.util.concurrent.ConcurrentLinkedQueue
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

object ScrobbleReporter {
    private const val TAG = "ScrobbleReporter"
    private const val HEARTBEAT_INTERVAL_MS = 120_000L
    private const val HEARTBEAT_MIN_ADVANCE_SEC = 60
    private const val MAX_RETRIES = 3

    private val JSON_MEDIA_TYPE = "application/json; charset=utf-8".toMediaType()

    private val client: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(15, TimeUnit.SECONDS)
        .writeTimeout(15, TimeUnit.SECONDS)
        .build()

    private val executor = Executors.newSingleThreadExecutor()

    private data class QueuedEvent(
        val event: WatchEvent,
        val attempt: Int = 1
    )

    private data class DebounceState(
        val key: String,
        val lastSentAtMs: Long,
        val lastPositionSec: Int?
    )

    private val queue = ConcurrentLinkedQueue<QueuedEvent>()
    private val isDraining = AtomicBoolean(false)

    @Volatile
    private var lastDebounce: DebounceState? = null

    @Volatile
    var onStatusUpdated: (() -> Unit)? = null

    private fun buildDebounceKey(event: WatchEvent): String {
        val normTitle = PlaybackParser.normalizeTitleForKey(event.title)
        return "${event.app}|$normTitle|${event.season ?: -1}|${event.episode ?: -1}"
    }

    @Synchronized
    fun report(context: Context, event: WatchEvent) {
        val cleanTitle = event.title.trim()
        if (cleanTitle.isEmpty()) return

        val now = System.currentTimeMillis()
        val key = buildDebounceKey(event)
        val prev = lastDebounce

        val shouldSend = when {
            prev == null -> true
            prev.key != key -> true
            else -> {
                val elapsed = now - prev.lastSentAtMs
                val pos = event.positionSec
                val prevPos = prev.lastPositionSec
                val advancedEnough = when {
                    pos != null && prevPos != null -> (pos - prevPos) >= HEARTBEAT_MIN_ADVANCE_SEC
                    pos != null && prevPos == null -> true
                    else -> false
                }
                elapsed >= HEARTBEAT_INTERVAL_MS && advancedEnough
            }
        }

        if (!shouldSend) return

        lastDebounce = DebounceState(
            key = key,
            lastSentAtMs = now,
            lastPositionSec = event.positionSec
        )

        enqueue(context.applicationContext, QueuedEvent(event.copy(title = cleanTitle)))
    }

    fun sendTestScrobble(
        context: Context,
        onComplete: ((success: Boolean, statusLine: String) -> Unit)? = null
    ) {
        val appContext = context.applicationContext
        val testEvent = WatchEvent(
            app = "crunchyroll",
            title = "Dragon Ball Super: Beerus",
            episodeTitle = "E5 - O Deus da Destruição e Son Goku",
            rawText = "Teste manual da TV (SmartTV 4K FFM)",
            season = 1,
            episode = 5,
            positionSec = 497,
            durationSec = 1397,
            state = "playing"
        )
        executor.execute {
            val (ok, statusLine) = postSync(appContext, testEvent)
            onStatusUpdated?.invoke()
            onComplete?.invoke(ok, statusLine)
        }
    }

    private fun enqueue(context: Context, item: QueuedEvent) {
        queue.add(item)
        if (isDraining.compareAndSet(false, true)) {
            executor.execute { drainQueue(context) }
        }
    }

    private fun drainQueue(context: Context) {
        try {
            while (true) {
                val item = queue.poll() ?: break
                val (ok, _) = postSync(context, item.event)
                onStatusUpdated?.invoke()
                if (!ok && item.attempt < MAX_RETRIES) {
                    Thread.sleep(2000L * item.attempt)
                    queue.add(item.copy(attempt = item.attempt + 1))
                }
            }
        } catch (t: Throwable) {
            Log.e(TAG, "Queue drain error", t)
        } finally {
            isDraining.set(false)
            if (queue.isNotEmpty() && isDraining.compareAndSet(false, true)) {
                executor.execute { drainQueue(context) }
            }
        }
    }

    private fun postSync(context: Context, event: WatchEvent): Pair<Boolean, String> {
        val url = ConfigStore.getEndpointUrl(context)
        val apiKey = ConfigStore.getApiKey(context)
        val payload = event.toJson().toString()
        val summary = buildString {
            append("[${event.app}] ${event.title}")
            if (event.season != null || event.episode != null) {
                append(" (")
                if (event.season != null) append("T${event.season}")
                if (event.episode != null) append("E${event.episode}")
                append(")")
            } else if (!event.episodeTitle.isNullOrBlank()) {
                append(" - ${event.episodeTitle}")
            }
        }

        return try {
            val request = Request.Builder()
                .url(url)
                .addHeader("Content-Type", "application/json")
                .addHeader("x-api-key", apiKey)
                .post(payload.toRequestBody(JSON_MEDIA_TYPE))
                .build()

            client.newCall(request).execute().use { response ->
                val bodyPreview = response.body?.string()?.take(200).orEmpty()
                val statusLine = "${response.code} ${response.message}".trim()
                Log.i(TAG, "POST $url -> HTTP $statusLine | $summary | body=$bodyPreview")
                ConfigStore.saveLastScrobble(context, summary, statusLine, event.timestamp)
                Pair(response.isSuccessful, statusLine)
            }
        } catch (e: Exception) {
            val err = "Erro: ${e.javaClass.simpleName}: ${e.message}"
            Log.e(TAG, "POST $url failed | $summary | $err", e)
            ConfigStore.saveLastScrobble(context, summary, err, event.timestamp)
            Pair(false, err)
        }
    }
}
