package com.SilenceFocus.automation

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.TimeZone

class PublicPlacesTest {

    private val now = 1_790_000_000_000L
    private val kolkata: TimeZone = TimeZone.getTimeZone("Asia/Kolkata")
    private val area = PublicPlaces.SearchArea(12.97, 77.59, now - 60_000)

    private fun place(id: String, lat: Double = 12.97, lng: Double = 77.59) = PublicPlace(id, "Place $id", lat, lng)

    @Test
    fun `searches first time, after leaving the area and once the cache is too old`() {
        assertTrue(PublicPlaces.shouldSearch(null, now) { 0.0 })
        assertFalse(PublicPlaces.shouldSearch(area, now) { 300.0 })
        assertTrue(PublicPlaces.shouldSearch(area, now) { 900.0 })
        val old = area.copy(at = now - PublicPlaces.MAX_AGE_MS)
        assertTrue(PublicPlaces.shouldSearch(old, now) { 0.0 })
        // Clock moved backwards: don't trust the cache age.
        assertTrue(PublicPlaces.shouldSearch(area.copy(at = now + 60_000), now) { 0.0 })
    }

    @Test
    fun `daily quota counts per local day and resets the next day`() {
        val today = PublicPlaces.dayKey(now, kolkata)
        val tomorrow = PublicPlaces.dayKey(now + 24 * 60 * 60 * 1000, kolkata)
        assertEquals(0, PublicPlaces.usedToday(null, today))
        var quota: String? = null
        repeat(3) { quota = PublicPlaces.quotaAfterSearch(quota, today) }
        assertEquals(3, PublicPlaces.usedToday(quota, today))
        assertEquals(0, PublicPlaces.usedToday(quota, tomorrow))
        assertEquals(0, PublicPlaces.usedToday("garbage", today))
    }

    @Test
    fun `Silent Zones keep their geofences first and one slot stays for the area`() {
        val places = (1..30).map { place("p$it") }
        assertEquals(30, PublicPlaces.placesForFences(places, zoneFences = 0).size)
        assertEquals(9, PublicPlaces.placesForFences(places, zoneFences = 90).size)
        assertTrue(PublicPlaces.placesForFences(places, zoneFences = 99).isEmpty())
        assertTrue(PublicPlaces.placesForFences(places, zoneFences = 100).isEmpty())
        val withJunk = listOf(place("a"), place("a"), place("b", 0.0, 0.0), place("c"))
        assertEquals(listOf("a", "c"), PublicPlaces.placesForFences(withJunk, 0).map { it.id })
    }

    @Test
    fun `requests are spaced out, much longer after the key was refused`() {
        assertTrue(PublicPlaces.attemptAllowed(0L, PublicPlaces.STATUS_OFF, now))
        assertFalse(PublicPlaces.attemptAllowed(now - 60_000, PublicPlaces.STATUS_FAILED, now))
        assertTrue(PublicPlaces.attemptAllowed(now - PublicPlaces.MIN_ATTEMPT_GAP_MS, PublicPlaces.STATUS_READY, now))
        assertFalse(PublicPlaces.attemptAllowed(now - 60 * 60_000, PublicPlaces.STATUS_KEY_REJECTED, now))
        assertTrue(PublicPlaces.attemptAllowed(now - PublicPlaces.REJECTED_GAP_MS, PublicPlaces.STATUS_KEY_REJECTED, now))
        assertTrue(PublicPlaces.attemptAllowed(now + 60_000, PublicPlaces.STATUS_KEY_REJECTED, now))
    }

    @Test
    fun `key problems are reported, not retried`() {
        assertEquals(PublicPlaces.STATUS_KEY_REJECTED, PublicPlaces.statusForHttpError(403, null))
        assertEquals(
            PublicPlaces.STATUS_KEY_REJECTED,
            PublicPlaces.statusForHttpError(400, """{"error":{"details":[{"reason":"API_KEY_INVALID"}]}}"""),
        )
        assertEquals(PublicPlaces.STATUS_FAILED, PublicPlaces.statusForHttpError(503, null))
    }

    @Test
    fun `a place silences only after the wait, while inside, with Location Mode on`() {
        val places = listOf(place("lib"), place("church"))
        val enteredAt = now - 60_000
        val provider = PublicPlaceRuleProvider(places, mapOf("church" to enteredAt), enabled = true)
        // One minute in: not yet, but the engine is woken when the wait ends.
        assertTrue(provider.activeRules(now, kolkata).isEmpty())
        val wake = provider.nextBoundaryAfter(now, kolkata)!!
        assertEquals(enteredAt + PublicPlaces.DWELL_MS, wake.atMillis)
        assertEquals(RuleSource.PLACE, wake.source)
        // Waited out: silences, named after the place.
        val on = provider.activeRules(wake.atMillis, kolkata)
        assertEquals(listOf("church"), on.map { it.ruleId })
        assertEquals(RuleSource.PLACE, on.single().source)
        assertEquals("Place church", on.single().name)
        assertEquals(null, provider.nextBoundaryAfter(wake.atMillis, kolkata))

        assertTrue(PublicPlaceRuleProvider(places, mapOf("church" to now - 600_000), false).activeRules(now, kolkata).isEmpty())
        // An entry for a place no longer in the list never silences.
        assertTrue(PublicPlaceRuleProvider(places, mapOf("gone" to now - 600_000), true).activeRules(now, kolkata).isEmpty())
    }

    @Test
    fun `manual OFF at a public place lasts until the device leaves it`() {
        val places = listOf(place("church"))
        fun evaluator(entered: Map<String, Long>) =
            AutomationEvaluator(listOf(PublicPlaceRuleProvider(places, entered, true)))
        val inside = mapOf("church" to now - 10 * 60_000)
        val first = evaluator(inside).evaluate(now, kolkata, ManualOverride.NONE)
        assertTrue(first.silent)
        assertEquals(RuleSource.PLACE, first.source)

        val off = evaluator(inside).manualOffOverride(now, kolkata)
        assertFalse(evaluator(inside).evaluate(now + 1_000, kolkata, off).silent)
        // Left and came back later: a new visit silences again once waited out.
        val back = mapOf("church" to now + 600_000)
        assertFalse(evaluator(back).evaluate(now + 600_000, kolkata, off).silent)
        assertTrue(evaluator(back).evaluate(now + 600_000 + PublicPlaces.DWELL_MS, kolkata, off).silent)
    }

    @Test
    fun `public place events, notification text and session names`() {
        assertEquals(ActivityEvents.PLACE_ENTER, ActivityEvents.ruleStarted(RuleSource.PLACE))
        assertEquals(ActivityEvents.PLACE_EXIT, ActivityEvents.ruleEnded(RuleSource.PLACE))
        val c = StatusNotification.content(owned = true, paused = false, source = RuleSource.PLACE, ruleName = "City Library")
        assertEquals("Location Mode: City Library", c!!.text)
    }

    // ---- Client feedback: Location Mode hidden and disabled behind a gate

    @Test
    fun `permanent policy ignores every legacy preference`() {
        assertFalse(Features.PUBLIC_PLACES_LOCATION_MODE)
        val on = AutomationSettings(publicPlacesEnabled = true, locationEnabled = true)
        // Input can still deserialize from an old bridge payload, but policy
        // can never turn it into an active source.
        assertTrue(on.publicPlacesEnabled)
        assertFalse(on.publicPlacesActive)
        assertFalse(AutomationSettings(publicPlacesEnabled = false).publicPlacesActive)
    }

    @Test
    fun `reported overlapping public places cannot silence while gated`() {
        // Client screenshots: two places of worship entered together at 14:53,
        // and one more next to the office - all long past the 3-minute wait.
        val now = 1_700_000_000_000L
        val reported = listOf(
            PublicPlace("emk", "FrauenNETZwerk EMK", 47.3769, 8.5417),
            PublicPlace("umc", "United Methodist Church", 47.3770, 8.5418),
            PublicPlace("aivs", "Albanisch Islamischer Verband Schweiz", 47.3771, 8.5420),
        )
        val entered = reported.associate { it.id to now - 30 * 60_000L }
        val settings = AutomationSettings(publicPlacesEnabled = true, locationEnabled = true)
        val engine = AutomationEvaluator(listOf(PublicPlaceRuleProvider(reported, entered, settings.publicPlacesActive)))
        val d = engine.evaluate(now, kolkata, ManualOverride.NONE)
        assertFalse(d.silent)
        assertTrue(d.activeRules.isEmpty())
        assertEquals(null, d.nextBoundary)
    }

    @Test
    fun `gated places never silence over a legitimate zone`() {
        val now = 1_700_000_000_000L
        val zone = ZoneRule("1", "Office", 47.0, 8.0, 150.0, true)
        val place = PublicPlace("p", "Church", 47.0001, 8.0001)
        val settings = AutomationSettings(publicPlacesEnabled = true, locationEnabled = true)
        val engine = AutomationEvaluator(listOf(
            LocationRuleProvider(listOf(zone), mapOf("1" to now - 60_000), settings.locationEnabled),
            PublicPlaceRuleProvider(listOf(place), mapOf("p" to now - 600_000), settings.publicPlacesActive),
        ))
        val d = engine.evaluate(now, kolkata, ManualOverride.NONE)
        assertTrue(d.silent)
        assertEquals(RuleSource.ZONE, d.source)
        assertEquals(listOf("1"), d.activeRules.map { it.ruleId })
    }
}
