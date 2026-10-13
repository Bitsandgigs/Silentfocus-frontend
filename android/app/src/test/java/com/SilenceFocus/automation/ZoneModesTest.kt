package com.SilenceFocus.automation

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.TimeZone

/**
 * Silent Zones vs Control Center modes. JS maps the modes to the single
 * native flag `locationEnabled` (= the user's Silent Zones automate):
 * Custom Mode for confirmed accounts, Location AND Custom for unconfirmed
 * ones (zonesEnabledFor in automationSync.js; all four combinations are
 * tested there). These cover what the engine does with that flag.
 */
class ZoneModesTest {

    private val tz: TimeZone = TimeZone.getTimeZone("Asia/Kolkata")
    private val now = 1_791_600_000_000L

    // Home and Office overlapping (same block, 150 m and 200 m).
    private val home = ZoneRule("1", "Home", 12.9352, 77.6245, 150.0, true)
    private val office = ZoneRule("2", "Office", 12.9353, 77.6246, 200.0, true)

    private fun decide(
        zones: List<ZoneRule>,
        presence: Map<String, Long>,
        locationEnabled: Boolean,
        override: ManualOverride = ManualOverride.NONE,
        schedules: List<ScheduleRule> = emptyList(),
    ) = AutomationEvaluator(
        listOf(
            LocationRuleProvider(zones, presence, locationEnabled),
            ScheduleRuleProvider(schedules),
            CalendarRuleProvider(emptyList(), AutomationSettings(locationEnabled = locationEnabled)),
        ),
    ).evaluate(now, tz, override)

    @Test fun `zones off (Custom OFF) - inside a zone does not silence`() {
        val d = decide(listOf(home, office), mapOf("1" to now - 60_000), locationEnabled = false)
        assertFalse(d.silent)
        assertNull(d.source)
        assertTrue(d.activeRules.isEmpty())
    }

    @Test fun `zones on (Custom ON) - inside a zone silences`() {
        val d = decide(listOf(home), mapOf("1" to now - 60_000), locationEnabled = true)
        assertTrue(d.silent)
        assertEquals(RuleSource.ZONE, d.source)
    }

    @Test fun `overlapping zones - leaving one keeps silence, leaving both ends it`() {
        val both = decide(listOf(home, office), mapOf("1" to now - 1, "2" to now - 1), true)
        assertTrue(both.silent)
        assertEquals(2, both.activeRules.size)

        val leftHome = decide(listOf(home, office), mapOf("2" to now - 1), true)
        assertTrue(leftHome.silent)
        assertEquals(listOf("2"), leftHome.activeRules.map { it.ruleId })

        val leftBoth = decide(listOf(home, office), emptyMap(), true)
        assertFalse(leftBoth.silent)
    }

    @Test fun `stale presence for a disabled or deleted zone never silences`() {
        val disabledHome = home.copy(enabled = false)
        assertFalse(decide(listOf(disabledHome), mapOf("1" to now - 1), true).silent)
        assertFalse(decide(listOf(office), mapOf("99" to now - 1), true).silent)
    }

    @Test fun `no active rule and no override is normal`() {
        val d = decide(listOf(home, office), emptyMap(), true)
        assertFalse(d.silent)
        assertNull(d.nextBoundary)
    }

    @Test fun `manual on still works with zones disabled`() {
        val d = decide(listOf(home), emptyMap(), locationEnabled = false, override = ManualOverride.FORCE_ON)
        assertTrue(d.silent)
        assertEquals(RuleSource.MANUAL, d.source)
    }

    @Test fun `zones turned off while a schedule runs - silence stays, now by the schedule`() {
        val allDay = ScheduleRule("s", 0, 23 * 60 + 59, (1..7).toSet(), true)
        val before = decide(listOf(home), mapOf("1" to now - 1), true, schedules = listOf(allDay))
        assertEquals(RuleSource.ZONE, before.source)
        val after = decide(listOf(home), mapOf("1" to now - 1), false, schedules = listOf(allDay))
        assertTrue(after.silent)
        assertEquals(RuleSource.SCHEDULE, after.source)
    }
}
