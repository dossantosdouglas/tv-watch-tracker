package com.fox.tvwatchtracker

import org.json.JSONObject
import java.time.Instant
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.util.Locale

data class WatchEvent(
    val app: String,
    val title: String,
    val episodeTitle: String? = null,
    val rawText: String? = null,
    val season: Int? = null,
    val episode: Int? = null,
    val positionSec: Int? = null,
    val durationSec: Int? = null,
    val state: String = "playing",
    val timestamp: String = nowIsoUtc()
) {
    fun toJson(): JSONObject = JSONObject().apply {
        put("app", app)
        put("title", title)
        if (!episodeTitle.isNullOrBlank()) put("episodeTitle", episodeTitle)
        if (!rawText.isNullOrBlank()) put("rawText", rawText)
        if (season != null && season > 0) put("season", season)
        if (episode != null && episode > 0) put("episode", episode)
        if (positionSec != null && positionSec >= 0) put("positionSec", positionSec)
        if (durationSec != null && durationSec > 0) put("durationSec", durationSec)
        put("state", state)
        put("timestamp", timestamp)
    }

    companion object {
        fun nowIsoUtc(): String =
            DateTimeFormatter.ISO_INSTANT.format(Instant.now().atOffset(ZoneOffset.UTC))
    }
}

data class ParsedSeasonEpisode(
    val season: Int? = null,
    val episode: Int? = null,
    val cleanEpisodeTitle: String? = null
)

object PlaybackParser {

    private val NOISE_TAGS_REGEX = Regex(
        """(?i)\s*(\[(?:dublado|legendado|dub|leg|hd|4k|fhd)\]|(?:\b(?:4k|1080p|720p|dublado|legendado)\b))"""
    )

    private val CRUNCHYROLL_WATCHING_REGEX = Regex(
        """(?is)(?:voc[eê]\s+est[aá]\s+assistindo|you\s+are\s+watching|watching)\s+(.+?)(?:\.\s*[\r\n]+|[\r\n]+|$)(.*)"""
    )
    private val SEASON_PT_EN_REGEX = Regex("""(?i)(?:temporada|season)\s*(\d+)""")
    private val EPISODE_PT_EN_REGEX = Regex("""(?i)(?:epis[oó]dio|episode)\s*(\d+)(?:\s*[.\-:]\s*(.+))?""")
    private val SXXEXX_REGEX = Regex("""(?i)\b(?:s|t)?(\d{1,2})\s*[xXeE]\s*(\d{1,4})\b""")
    private val EX_REGEX = Regex("""(?i)(?:^|\b)[eE](?:p\.?\s*)?(\d{1,4})(?:\s*[-–:]\s*(.+))?""")
    private val ONLY_NUMBER_REGEX = Regex("""^\s*0*(\d{1,4})\s*$""")

    fun normalizeTitleForKey(raw: String): String {
        return raw
            .replace(NOISE_TAGS_REGEX, " ")
            .replace(Regex("""\s+"""), " ")
            .trim()
            .lowercase(Locale.ROOT)
    }

    fun parseTimeToSeconds(timeStr: String?): Int? {
        if (timeStr.isNullOrBlank()) return null
        val cleaned = timeStr.trim().removePrefix("-").trim()
        val parts = cleaned.split(':').mapNotNull { it.trim().toIntOrNull() }
        return when (parts.size) {
            2 -> parts[0] * 60 + parts[1]
            3 -> parts[0] * 3600 + parts[1] * 60 + parts[2]
            else -> null
        }
    }

    fun resolveDurationSeconds(currentSec: Int?, remainingOrTotalText: String?): Int? {
        if (remainingOrTotalText.isNullOrBlank()) return null
        val trimmed = remainingOrTotalText.trim()
        val parsed = parseTimeToSeconds(trimmed) ?: return null
        if (trimmed.startsWith("-") && currentSec != null) {
            return currentSec + parsed
        }
        return if (currentSec != null && parsed < currentSec) {
            currentSec + parsed
        } else {
            parsed
        }
    }

    fun parseSeasonAndEpisode(text: String?): ParsedSeasonEpisode {
        if (text.isNullOrBlank()) return ParsedSeasonEpisode()
        val trimmed = text.trim()

        SEASON_PT_EN_REGEX.find(trimmed)?.let { sMatch ->
            val season = sMatch.groupValues[1].toIntOrNull()
            val epMatch = EPISODE_PT_EN_REGEX.find(trimmed)
            val episode = epMatch?.groupValues?.getOrNull(1)?.toIntOrNull()
            val epTitle = epMatch?.groupValues?.getOrNull(2)?.trim()?.takeIf { it.isNotEmpty() }
            if (season != null || episode != null) {
                return ParsedSeasonEpisode(season, episode, epTitle ?: trimmed)
            }
        }

        SXXEXX_REGEX.find(trimmed)?.let { match ->
            val season = match.groupValues[1].toIntOrNull()
            val episode = match.groupValues[2].toIntOrNull()
            return ParsedSeasonEpisode(season, episode, trimmed)
        }

        EPISODE_PT_EN_REGEX.find(trimmed)?.let { match ->
            val episode = match.groupValues[1].toIntOrNull()
            val epTitle = match.groupValues.getOrNull(2)?.trim()?.takeIf { it.isNotEmpty() }
            return ParsedSeasonEpisode(null, episode, epTitle ?: trimmed)
        }

        EX_REGEX.find(trimmed)?.let { match ->
            val episode = match.groupValues[1].toIntOrNull()
            return ParsedSeasonEpisode(null, episode, trimmed)
        }

        ONLY_NUMBER_REGEX.find(trimmed)?.let { match ->
            val episode = match.groupValues[1].toIntOrNull()
            return ParsedSeasonEpisode(null, episode, trimmed)
        }

        return ParsedSeasonEpisode(null, null, trimmed)
    }

    fun parseCrunchyrollContentDesc(desc: String): WatchEvent? {
        val match = CRUNCHYROLL_WATCHING_REGEX.find(desc.trim()) ?: return null
        val series = match.groupValues[1].trim().removeSuffix(".")
        val rest = match.groupValues.getOrNull(2)?.trim().orEmpty()
        if (series.isEmpty()) return null

        val parsed = parseSeasonAndEpisode(rest)
        return WatchEvent(
            app = "crunchyroll",
            title = series,
            episodeTitle = parsed.cleanEpisodeTitle ?: rest.takeIf { it.isNotEmpty() },
            rawText = desc.trim(),
            season = parsed.season,
            episode = parsed.episode,
            state = "playing"
        )
    }
}
