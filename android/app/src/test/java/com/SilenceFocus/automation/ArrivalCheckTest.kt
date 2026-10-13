package com.SilenceFocus.automation

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** #5 foreground arrival check: only confident, fresh fixes enter a zone; never exits. */
class ArrivalCheckTest {

    private fun zone(id: String, radius: Double = 100.0, enabled: Boolean = true) =
        ZoneRule(id, "Z$id", 12.9, 77.6, radius, enabled)

    private fun fix(acc: Double = 20.0, age: Long = 5_000) = ArrivalCheck.Fix(12.9, 77.6, acc, age)

    @Test fun `confidently inside - entered`() {
        assertEquals(listOf("1"), ArrivalCheck.enteredZones(listOf(zone("1")), emptySet(), fix()) { 50.0 })
    }

    @Test fun `likely position must fit inside the radius (distance + accuracy over 2)`() {
        // 85 + 20/2 = 95 <= 100 -> in; 95 + 10 = 105 -> out.
        assertEquals(listOf("1"), ArrivalCheck.enteredZones(listOf(zone("1")), emptySet(), fix(20.0)) { 85.0 })
        assertTrue(ArrivalCheck.enteredZones(listOf(zone("1")), emptySet(), fix(20.0)) { 95.0 }.isEmpty())
    }

    @Test fun `radius below 100 m is monitored as 100 m, like the geofence`() {
        assertEquals(listOf("1"), ArrivalCheck.enteredZones(listOf(zone("1", radius = 50.0)), emptySet(), fix(10.0)) { 90.0 })
    }

    @Test fun `poor, missing or stale fixes never enter`() {
        val z = listOf(zone("1", radius = 500.0))
        assertTrue(ArrivalCheck.enteredZones(z, emptySet(), fix(acc = 120.0)) { 0.0 }.isEmpty())
        assertTrue(ArrivalCheck.enteredZones(z, emptySet(), fix(acc = -1.0)) { 0.0 }.isEmpty())
        assertTrue(ArrivalCheck.enteredZones(z, emptySet(), fix(age = ArrivalCheck.MAX_FIX_AGE_MS + 1)) { 0.0 }.isEmpty())
        assertTrue(ArrivalCheck.enteredZones(z, emptySet(), fix(age = -10)) { 0.0 }.isEmpty())
    }

    @Test fun `already present or disabled zones are not entered again`() {
        val zones = listOf(zone("1"), zone("2", enabled = false), zone("3"))
        assertEquals(listOf("3"), ArrivalCheck.enteredZones(zones, setOf("1"), fix()) { 10.0 })
    }

    @Test fun `throttled to one check per interval`() {
        assertTrue(ArrivalCheck.due(0, 1000))
        assertFalse(ArrivalCheck.due(1000, 1000 + ArrivalCheck.MIN_INTERVAL_MS - 1))
        assertTrue(ArrivalCheck.due(1000, 1000 + ArrivalCheck.MIN_INTERVAL_MS))
        // Clock moved back: allowed (no stuck throttle).
        assertTrue(ArrivalCheck.due(5000, 1000))
    }
}
