package com.fox.tvwatchtracker

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Test

class PlaybackParserTest {

    @Test
    fun parsesCrunchyrollWatchingContentDescription() {
        val raw = "Você está assistindo Dragon Ball Super: Beerus. \nTemporada 1Episódio 5. O Deus da Destruição e Son Goku"
        val event = PlaybackParser.parseCrunchyrollContentDesc(raw)
        assertNotNull(event)
        assertEquals("Dragon Ball Super: Beerus", event?.title)
        assertEquals(1, event?.season)
        assertEquals(5, event?.episode)
        assertEquals("O Deus da Destruição e Son Goku", event?.episodeTitle)
    }

    @Test
    fun parsesCrunchyrollDetailsEpisodeTitle() {
        val parsed = PlaybackParser.parseSeasonAndEpisode("E5 - O Deus da Destruição e Son Goku")
        assertEquals(null, parsed.season)
        assertEquals(5, parsed.episode)
    }

    @Test
    fun parsesYouCineFormats() {
        val s01e05 = PlaybackParser.parseSeasonAndEpisode("S01E05")
        assertEquals(1, s01e05.season)
        assertEquals(5, s01e05.episode)

        val ptEp = PlaybackParser.parseSeasonAndEpisode("Episódio 12 - A Batalha")
        assertEquals(null, ptEp.season)
        assertEquals(12, ptEp.episode)

        val xFormat = PlaybackParser.parseSeasonAndEpisode("2x08")
        assertEquals(2, xFormat.season)
        assertEquals(8, xFormat.episode)
    }

    @Test
    fun parsesTimesAndDuration() {
        assertEquals(497, PlaybackParser.parseTimeToSeconds("08:17"))
        assertEquals(1397, PlaybackParser.resolveDurationSeconds(497, "23:17"))
        assertEquals(1397, PlaybackParser.resolveDurationSeconds(497, "-15:00"))
    }
}
