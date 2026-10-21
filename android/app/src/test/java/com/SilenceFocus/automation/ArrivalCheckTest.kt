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

    // ---- Client Issue #6: turning zones on checks right away

    private fun z(id: String, enabled: Boolean = true, lat: Double = 47.0, radius: Double = 150.0) =
        ZoneRule(id, "Zone $id", lat, 8.0, radius, enabled)

    @Test fun `zone enabled, added or moved is newly eligible`() {
        val before = listOf(z("1", enabled = false), z("2"), z("3"))
        val after = listOf(z("1"), z("2"), z("3", lat = 47.001), z("4"))
        assertEquals(listOf("1", "3", "4"), ArrivalCheck.newlyEligible(before, after))
    }

    @Test fun `unchanged or disabled zones never trigger a check`() {
        val zones = listOf(z("1"), z("2", enabled = false))
        assertTrue(ArrivalCheck.newlyEligible(zones, zones).isEmpty())
        // Turning a zone off is not a reason to look for arrivals.
        assertTrue(ArrivalCheck.newlyEligible(listOf(z("1")), listOf(z("1", enabled = false))).isEmpty())
        // Invalid coordinates never qualify.
        assertTrue(ArrivalCheck.newlyEligible(emptyList(), listOf(ZoneRule("9", null, 0.0, 0.0, 100.0, true))).isEmpty())
    }

    @Test fun `custom mode re-enabled - every enabled zone is eligible again`() {
        // Custom OFF cleared presence; the zone list itself is unchanged, so
        // setSettings (not setZones) starts the check. newlyEligible covers
        // the first push after sign-in, when the engine had no zones.
        assertEquals(listOf("1", "2"), ArrivalCheck.newlyEligible(emptyList(), listOf(z("1"), z("2"))))
    }

    @Test fun `zones are only entered while geofence exits will be reported`() {
        assertTrue(ArrivalCheck.exitsReported(GeofenceRegistrar.STATUS_REGISTERED))
        assertTrue(ArrivalCheck.exitsReported(GeofenceRegistrar.STATUS_PENDING))
        listOf(
            GeofenceRegistrar.STATUS_NO_BACKGROUND, GeofenceRegistrar.STATUS_LOCATION_OFF,
            GeofenceRegistrar.STATUS_FAILED, GeofenceRegistrar.STATUS_DISABLED, "NOT_CONFIGURED",
        ).forEach { assertFalse(it, ArrivalCheck.exitsReported(it)) }
    }

    @Test fun `poor or stale fix after toggling on never enters a zone`() {
        val zone = z("1")
        val poor = ArrivalCheck.Fix(47.0, 8.0, accuracyM = 120.0, ageMs = 1_000)
        assertTrue(ArrivalCheck.enteredZones(listOf(zone), emptySet(), poor) { 5.0 }.isEmpty())
        val stale = ArrivalCheck.Fix(47.0, 8.0, accuracyM = 10.0, ageMs = ArrivalCheck.MAX_FIX_AGE_MS + 1)
        assertTrue(ArrivalCheck.enteredZones(listOf(zone), emptySet(), stale) { 5.0 }.isEmpty())
        val good = ArrivalCheck.Fix(47.0, 8.0, accuracyM = 15.0, ageMs = 1_000)
        assertEquals(listOf("1"), ArrivalCheck.enteredZones(listOf(zone), emptySet(), good) { 20.0 })
        // Already inside (geofence ENTER came first): no second entry, so no duplicate session.
        assertTrue(ArrivalCheck.enteredZones(listOf(zone), setOf("1"), good) { 20.0 }.isEmpty())
    }
}
