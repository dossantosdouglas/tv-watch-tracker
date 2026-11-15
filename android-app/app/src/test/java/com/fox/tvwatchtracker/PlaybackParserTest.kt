package com.fox.tvwatchtracker

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
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

        val overgeared = "Você está assistindo Overgeared. \nTemporada 1Episódio 7. O Ferreiro"
        val ogEvent = PlaybackParser.parseCrunchyrollContentDesc(overgeared)
        assertNotNull(ogEvent)
        assertEquals("Overgeared", ogEvent?.title)
        assertEquals(1, ogEvent?.season)
        assertEquals(7, ogEvent?.episode)
    }

    @Test
    fun parsesCrunchyrollDetailsEpisodeTitle() {
        val parsed = PlaybackParser.parseSeasonAndEpisode("E5 - O Deus da Destruição e Son Goku")
        assertEquals(null, parsed.season)
        assertEquals(5, parsed.episode)
    }

    @Test
    fun rejectsNonEpisodeStrings() {
        val nonEp = PlaybackParser.parseSeasonAndEpisode("INICIO")
        assertNull(nonEp.episode)

        val rating = PlaybackParser.parseSeasonAndEpisode("8.4")
        assertNull(rating.episode)
    }

    @Test
    fun parsesTimesAndDuration() {
        assertEquals(497, PlaybackParser.parseTimeToSeconds("08:17"))
        assertEquals(1397, PlaybackParser.resolveDurationSeconds(497, "23:17"))
        assertEquals(1397, PlaybackParser.resolveDurationSeconds(497, "-15:00"))
    }
}
