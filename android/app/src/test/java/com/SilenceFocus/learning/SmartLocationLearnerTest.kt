package com.SilenceFocus.learning

import com.SilenceFocus.automation.ZoneRule
import com.SilenceFocus.comms.MemoryKeyValue
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.TimeZone

class SmartLocationLearnerTest {

    private val tz: TimeZone = TimeZone.getTimeZone("Asia/Kolkata")
    private val day = LearningConfig.DAY_MS
    private val hour = 60 * 60 * 1000L
    // 2026-09-29 10:00 IST
    private val t0 = 1_790_820_000_000L
    private val office = 12.9352 to 77.6245
    private val learner = SmartLocationLearner()
    private var seq = 0
    private val ids = { "p${++seq}" }

    private fun fix(at: Long, lat: Double = office.first, lng: Double = office.second, acc: Float = 20f) =
        LocationFix(lat, lng, acc, at)

    /** ~[m] metres north of [lat]. */
    private fun north(lat: Double, m: Double) = lat + m / 111_320.0

    private fun feed(vararg fixes: LocationFix, zones: List<ZoneRule> = emptyList(), start: List<LearnedPlace> = emptyList()):
        Pair<List<LearnedPlace>, List<SampleResult>> {
        var places = start
        val results = fixes.map { f ->
            val r = learner.record(places, f, zones, enabled = true, newId = ids)
            places = r.places
            r.result
        }
        return places to results
    }

    @Test fun `1 first manual activation - no suggestion`() {
        val (p, _) = feed(fix(t0))
        assertEquals(1, p.size)
        assertFalse(learner.canSuggest(p[0], emptyList(), t0, tz))
    }

    @Test fun `2 second activation - no suggestion`() {
        val (p, _) = feed(fix(t0), fix(t0 + day))
        assertEquals(1, p.size)
        assertFalse(learner.canSuggest(p[0], emptyList(), t0 + day, tz))
    }

    @Test fun `3 third activation on a second day - eligible`() {
        val (p, _) = feed(fix(t0), fix(t0 + 2 * hour), fix(t0 + day, lat = north(office.first, 30.0)))
        assertEquals(1, p.size)
        assertEquals(3, p[0].visits.size)
        assertTrue(learner.canSuggest(p[0], emptyList(), t0 + day, tz))
    }

    @Test fun `4 three activations on the same day - not eligible`() {
        val (p, _) = feed(fix(t0), fix(t0 + hour), fix(t0 + 3 * hour))
        assertFalse(learner.isEligible(p[0], t0 + 3 * hour, tz))
    }

    @Test fun `5 samples beyond the threshold distance form separate places`() {
        val (p, r) = feed(fix(t0), fix(t0 + day, lat = north(office.first, 250.0)))
        assertEquals(2, p.size)
        assertEquals(listOf(SampleResult.NEW_PLACE, SampleResult.NEW_PLACE), r)
        // Within ~100 m joins the same place, and a noisy fix only nudges the centre.
        val (p2, r2) = feed(fix(t0), fix(t0 + day, lat = north(office.first, 80.0), acc = 90f))
        assertEquals(1, p2.size)
        assertEquals(SampleResult.RECORDED, r2[1])
        assertTrue(SmartLocationLearner.distanceMeters(p2[0].latitude, p2[0].longitude, office.first, office.second) < 40)
    }

    @Test fun `6 poor accuracy is ignored, fair accuracy alone is not enough`() {
        val (p, r) = feed(fix(t0, acc = 150f), fix(t0 + day, acc = Float.NaN))
        assertTrue(p.isEmpty())
        assertEquals(listOf(SampleResult.INACCURATE, SampleResult.INACCURATE), r)
        val (p2, _) = feed(fix(t0, acc = 80f), fix(t0 + day, acc = 80f), fix(t0 + 2 * day, acc = 80f))
        assertFalse(learner.isEligible(p2[0], t0 + 2 * day, tz)) // no accurate (<= 50 m) sample
    }

    @Test fun `7 activation inside an existing enabled zone is ignored`() {
        val zone = ZoneRule("7", "Office", office.first, office.second, 150.0, true)
        val (p, r) = feed(fix(t0), fix(t0 + day), fix(t0 + 2 * day), zones = listOf(zone))
        assertTrue(p.isEmpty())
        assertTrue(r.all { it == SampleResult.INSIDE_ZONE })
        // A disabled zone doesn't count.
        val (p2, _) = feed(fix(t0), zones = listOf(zone.copy(enabled = false)))
        assertEquals(1, p2.size)
        // A place learned before the zone existed is no longer suggested.
        val (p3, _) = feed(fix(t0), fix(t0 + 2 * hour), fix(t0 + day))
        assertFalse(learner.canSuggest(p3[0], listOf(zone), t0 + day, tz))
    }

    @Test fun `8 and 9 schedule and calendar activations never reach the learner`() {
        // Only AutomationEngine.setManual(on = true) calls LearningCapture;
        // the learner itself has no notion of sources. Turning learning off
        // (the only other input) yields no samples - see test 13. This test
        // pins the capture entry point's contract.
        val src = java.io.File("src/main/java/com/SilenceFocus/automation/AutomationEngine.kt").readText()
        val calls = Regex("LearningCapture\\.onManualSilentOn").findAll(src).count()
        assertEquals(1, calls)
        val setManual = src.substringAfter("fun setManual(").substringBefore("\n    @Synchronized")
        assertTrue(setManual.contains("LearningCapture.onManualSilentOn"))
        assertTrue(setManual.contains("if (on && state.optBoolean(\"silentActive\"))"))
        listOf("fun evaluate(", "fun setSchedules(", "fun setZones(", "fun syncCalendar(", "fun rebuild(", "fun startBreakthrough(")
            .forEach { fn ->
                val body = src.substringAfter(fn).substringBefore("\n    @Synchronized")
                assertFalse("$fn must not capture", body.contains("LearningCapture"))
            }
    }

    @Test fun `10 dismissal suppresses the place for 30 days`() {
        val (p, _) = feed(fix(t0), fix(t0 + 2 * hour), fix(t0 + day))
        val id = p[0].id
        val dismissed = learner.dismiss(p, id, t0 + day)
        assertFalse(learner.canSuggest(dismissed[0], emptyList(), t0 + day + 10 * day, tz))
        // After 30 days it may come back once there are recent activations again.
        val back = feed(fix(t0 + 31 * day), fix(t0 + 31 * day + 2 * hour), fix(t0 + 32 * day), start = dismissed).first
        assertTrue(learner.canSuggest(back.single(), emptyList(), t0 + 32 * day, tz))
    }

    @Test fun `11 second dismissal stops suggestions for that place`() {
        val (p, _) = feed(fix(t0), fix(t0 + 2 * hour), fix(t0 + day))
        val id = p[0].id
        val twice = learner.dismiss(learner.dismiss(p, id, t0 + day), id, t0 + 40 * day)
        assertTrue(twice[0].stopped)
        val later = feed(fix(t0 + 100 * day), fix(t0 + 100 * day + 2 * hour), fix(t0 + 101 * day), start = twice).first
        assertTrue(later.none { learner.canSuggest(it, emptyList(), t0 + 101 * day, tz) })
        // The stopped place is kept (without visits) so it stays silenced.
        assertTrue(learner.prune(twice, t0 + 200 * day).any { it.stopped })
    }

    @Test fun `12 accepted suggestion resolves the place`() {
        val (p, _) = feed(fix(t0), fix(t0 + 2 * hour), fix(t0 + day))
        assertTrue(learner.resolve(p, p[0].id).isEmpty())
    }

    @Test fun `13 learning disabled collects nothing`() {
        val r = learner.record(emptyList(), fix(t0), emptyList(), enabled = false, newId = ids)
        assertEquals(SampleResult.DISABLED, r.result)
        assertTrue(r.places.isEmpty())
    }

    @Test fun `14 stale places are pruned`() {
        val (p, _) = feed(fix(t0), fix(t0 + day))
        assertTrue(learner.prune(p, t0 + 40 * day).isEmpty())
        val (p2, _) = feed(fix(t0), fix(t0 + 25 * day))
        assertEquals(1, learner.prune(p2, t0 + 40 * day).single().visits.size)
    }

    @Test fun `15 maximum number of places is enforced`() {
        var places = emptyList<LearnedPlace>()
        repeat(40) { i ->
            places = learner.record(places, fix(t0 + i * hour, lat = north(office.first, i * 500.0)), emptyList(), true, ids).places
        }
        assertEquals(LearningConfig().maxPlaces, places.size)
        // The most recent places are the ones kept.
        assertTrue(places.any { it.visits.single().at == t0 + 39 * hour })
        val visits = (0 until 50).fold(emptyList<LearnedPlace>()) { acc, i ->
            learner.record(acc, fix(t0 + i * hour), emptyList(), true, ids).places
        }
        assertEquals(LearningConfig().maxVisitsPerPlace, visits.single().visits.size)
    }

    @Test fun `16 logout clears user-specific learned state, clear keeps the setting`() {
        val kv = MemoryKeyValue()
        val store = LearningStore(kv)
        store.enabled = true
        store.optInAnswered = true
        store.places = feed(fix(t0), fix(t0 + day)).first
        store.pendingSuggestionId = store.places[0].id
        // Round trip (process restart).
        assertEquals(store.places, LearningStore(kv).places)
        LearningStore(kv).clearLearned()
        assertTrue(LearningStore(kv).places.isEmpty())
        assertNull(LearningStore(kv).pendingSuggestionId)
        assertTrue(LearningStore(kv).enabled)
        LearningStore(kv).clearUserData()
        assertFalse(LearningStore(kv).enabled)
        assertFalse(LearningStore(kv).optInAnswered)
    }

    @Test fun `centres are stored approximately`() {
        val (p, _) = feed(fix(t0, lat = 12.935212345, lng = 77.624567891))
        assertEquals(12.9352, p[0].latitude, 0.0)
        assertEquals(77.6246, p[0].longitude, 0.0)
    }

    @Test fun `a suggested place waits before being suggested again`() {
        val (p, _) = feed(fix(t0), fix(t0 + 2 * hour), fix(t0 + day))
        val marked = learner.markSuggested(p, p[0].id, t0 + day)
        assertFalse(learner.canSuggest(marked[0], emptyList(), t0 + day + 3 * day, tz))
        val again = feed(fix(t0 + 8 * day), start = marked).first
        assertTrue(learner.canSuggest(again[0], emptyList(), t0 + 8 * day, tz))
    }
}
