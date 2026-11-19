package com.SilenceFocus.automation

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class EntitlementsTest {
    private val pro = PlanLimits(calendars = 1, zones = 3, replies = 4, apps = 1, suggestions = 3)

    @Test fun nothingStoredMeansUnrestricted() = assertEquals(Entitlements.UNLIMITED, Entitlements.effective(null, 0, 10))
    @Test fun storedLimitsApplyUntilTheyLapse() = assertEquals(pro, Entitlements.effective(pro, 1_000, 999))
    @Test fun afterTheLapseTheFreePlanApplies() = assertEquals(Entitlements.FREE, Entitlements.effective(pro, 1_000, 1_001))
    @Test fun noLapseTimeNeverExpires() = assertEquals(pro, Entitlements.effective(pro, 0, Long.MAX_VALUE))

    @Test fun jsonRoundTripKeepsUnlimitedAsNull() {
        val back = Entitlements.parse(Entitlements.toJson(PlanLimits(null, 3, 0, null, 1)))!!
        assertNull(back.calendars); assertEquals(3, back.zones); assertEquals(0, back.replies); assertNull(back.apps); assertEquals(1, back.suggestions)
    }
    @Test fun garbageParsesToNull() = assertNull(Entitlements.parse("nope"))

    @Test fun freePlanLocksEverything() {
        assertFalse(Entitlements.calendarsAllowed(Entitlements.FREE)); assertFalse(Entitlements.zonesAllowed(Entitlements.FREE))
        assertFalse(Entitlements.autoReplyAllowed(Entitlements.FREE))
        assertFalse(Entitlements.appAllowed(Entitlements.FREE, "com.whatsapp", listOf("com.whatsapp")))
    }
    @Test fun unlimitedAllowsAnyApp() = assertTrue(Entitlements.appAllowed(Entitlements.UNLIMITED, "org.telegram.messenger", emptyList()))
    @Test fun proAllowsOnlyItsOnePickedApp() {
        assertTrue(Entitlements.appAllowed(pro, "com.whatsapp", listOf("com.whatsapp")))
        assertFalse(Entitlements.appAllowed(pro, "com.instagram.android", listOf("com.whatsapp")))
        assertFalse(Entitlements.appAllowed(pro, "com.whatsapp", emptyList()))
        assertFalse(Entitlements.appAllowed(pro, "com.instagram.android", listOf("com.whatsapp", "com.instagram.android")))
    }

    @Test fun suggestionsAreCappedByThePlan() {
        assertTrue(Entitlements.suggestionAllowed(pro, 2)); assertFalse(Entitlements.suggestionAllowed(pro, 3))
        assertFalse(Entitlements.suggestionAllowed(Entitlements.FREE, 0)); assertTrue(Entitlements.suggestionAllowed(Entitlements.UNLIMITED, 999))
    }
    @Test fun proKeepsTheFirstThreeZonesByIdAndFreeNone() {
        fun z(id: String) = ZoneRule(id, id, 1.0, 1.0, 100.0, true)
        val zones = listOf(z("12"), z("3"), z("7"), z("5"))
        assertEquals(listOf("3", "5", "7"), Entitlements.capZones(zones, pro).map { it.id })
        assertEquals(4, Entitlements.capZones(zones, Entitlements.UNLIMITED).size)
        assertEquals(0, Entitlements.capZones(zones, Entitlements.FREE).size)
    }
}
