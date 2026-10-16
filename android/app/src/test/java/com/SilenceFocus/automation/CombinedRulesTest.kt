package com.SilenceFocus.automation

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.Calendar
import java.util.TimeZone

/** Phase 3: location + calendar + schedule + manual together. */
class CombinedRulesTest {

    private val kolkata: TimeZone = TimeZone.getTimeZone("Asia/Kolkata")
    private val newYork: TimeZone = TimeZone.getTimeZone("America/New_York")
    private val utc: TimeZone = TimeZone.getTimeZone("UTC")
    private val everyDay = (1..7).toSet()
    private val minute = 60_000L

    /** 2026-09-28 is a Monday. */
    private fun at(day: Int, hour: Int, min: Int = 0, tz: TimeZone = kolkata, month: Int = Calendar.SEPTEMBER): Long =
        Calendar.getInstance(tz).apply { clear(); set(2026, month, day, hour, min, 0) }.timeInMillis

    private fun schedule(id: String, from: String, to: String, days: Set<Int> = everyDay): ScheduleRule {
        fun m(s: String) = s.split(":").let { it[0].toInt() * 60 + it[1].toInt() }
        return ScheduleRule(id, m(from), m(to), days, true)
    }

    private fun zone(id: String, enabled: Boolean = true) =
        ZoneRule(id, "Zone $id", 12.97, 77.59, 200.0, enabled)

    private fun event(key: String, begin: Long, end: Long, allDay: Boolean = false) =
        CalendarEvent(key, begin, end, allDay)

    private fun utcMidnight(day: Int, month: Int = Calendar.SEPTEMBER) = at(day, 0, tz = utc, month = month)

    private data class World(
        val schedules: List<ScheduleRule> = emptyList(),
        val zones: List<ZoneRule> = emptyList(),
        val presence: Map<String, Long> = emptyMap(),
        val events: List<CalendarEvent> = emptyList(),
        val settings: AutomationSettings = AutomationSettings(locationEnabled = true, calendarEnabled = true),
    ) {
        // Same provider order as AutomationEngine.
        fun evaluator() = AutomationEvaluator(
            listOf(
                LocationRuleProvider(zones, presence, settings.locationEnabled),
                ScheduleRuleProvider(schedules),
                CalendarRuleProvider(events, settings),
            ),
        )
    }

    private fun decide(w: World, now: Long, override: ManualOverride = ManualOverride.NONE, tz: TimeZone = kolkata) =
        w.evaluator().evaluate(now, tz, override)

    // 1
    @Test
    fun noRuleIsNormal() {
        val d = decide(World(zones = listOf(zone("1")), events = emptyList()), at(28, 10))
        assertFalse(d.silent)
        assertNull(d.source)
    }

    // 2
    @Test
    fun scheduleOnly() {
        val d = decide(World(schedules = listOf(schedule("s", "09:00", "17:00"))), at(28, 10))
        assertTrue(d.silent)
        assertEquals(RuleSource.SCHEDULE, d.source)
    }

    // 3
    @Test
    fun calendarOnly() {
        val w = World(events = listOf(event("c:1:1", at(28, 10), at(28, 11))))
        assertFalse(decide(w, at(28, 9, 59)).silent)
        val d = decide(w, at(28, 10, 30))
        assertTrue(d.silent)
        assertEquals(RuleSource.CALENDAR, d.source)
        assertFalse(decide(w, at(28, 11)).silent)
        // Dated, not weekly: the same weekday next week is normal.
        assertFalse(decide(w, at(28, 10, 30) + 7 * 24 * 60 * minute).silent)
    }

    // 4
    @Test
    fun zoneOnly() {
        val d = decide(World(zones = listOf(zone("5")), presence = mapOf("5" to at(28, 9))), at(28, 10))
        assertTrue(d.silent)
        assertEquals(RuleSource.ZONE, d.source)
        assertEquals("Zone 5", d.activeRules.first().name)
        assertNull(d.activeRules.first().windowEnd)
    }

    // 5
    @Test
    fun scheduleAndZoneLocationWinsAsSource() {
        val d = decide(
            World(schedules = listOf(schedule("s", "09:00", "17:00")), zones = listOf(zone("5")), presence = mapOf("5" to at(28, 9))),
            at(28, 10),
        )
        assertEquals(RuleSource.ZONE, d.source)
        assertEquals(listOf(RuleSource.ZONE, RuleSource.SCHEDULE), d.activeRules.map { it.source })
    }

    // 6
    @Test
    fun calendarAndZoneLocationWins() {
        val d = decide(
            World(events = listOf(event("c", at(28, 10), at(28, 11))), zones = listOf(zone("5")), presence = mapOf("5" to at(28, 9))),
            at(28, 10, 15),
        )
        assertEquals(RuleSource.ZONE, d.source)
    }

    // 7
    @Test
    fun scheduleEndsWhileZoneActiveStaysSilent() {
        val w = World(schedules = listOf(schedule("s", "09:00", "10:00")), zones = listOf(zone("5")), presence = mapOf("5" to at(28, 9, 30)))
        val d = decide(w, at(28, 10))
        assertTrue(d.silent)
        assertEquals(RuleSource.ZONE, d.source)
    }

    // 8
    @Test
    fun zoneExitsWhileScheduleActiveStaysSilent() {
        val inside = World(schedules = listOf(schedule("s", "09:00", "17:00")), zones = listOf(zone("5")), presence = mapOf("5" to at(28, 9)))
        val exited = inside.copy(presence = emptyMap())
        val d = decide(exited, at(28, 11))
        assertTrue(d.silent)
        assertEquals(RuleSource.SCHEDULE, d.source)
    }

    // 9
    @Test
    fun zoneExitsWithNoOtherRuleIsNormal() {
        val d = decide(World(zones = listOf(zone("5")), presence = emptyMap()), at(28, 11))
        assertFalse(d.silent)
    }

    // 10
    @Test
    fun overlappingCalendarEventsStaySilentUntilTheLastEnds() {
        val w = World(events = listOf(event("a", at(28, 10), at(28, 11)), event("b", at(28, 10, 30), at(28, 12))))
        assertTrue(decide(w, at(28, 11)).silent)
        assertEquals(at(28, 12), decide(w, at(28, 11)).nextBoundary?.atMillis)
        assertFalse(decide(w, at(28, 12)).silent)
    }

    // 11
    @Test
    fun calendarAndScheduleOverlap() {
        val w = World(schedules = listOf(schedule("s", "09:00", "10:30")), events = listOf(event("c", at(28, 10), at(28, 11))))
        assertTrue(decide(w, at(28, 10, 45)).silent)
        assertEquals(RuleSource.CALENDAR, decide(w, at(28, 10, 45)).source)
        assertEquals(2, decide(w, at(28, 10, 15)).activeRules.size)
        assertFalse(decide(w, at(28, 11)).silent)
    }

    // 12
    @Test
    fun allDayEventsIgnoredWhenConfigured() {
        val allDay = event("d", utcMidnight(28), utcMidnight(29), allDay = true)
        val ignoring = World(events = listOf(allDay), settings = AutomationSettings(calendarEnabled = true, ignoreAllDayEvents = true))
        assertFalse(decide(ignoring, at(28, 12)).silent)
        val using = ignoring.copy(settings = AutomationSettings(calendarEnabled = true, ignoreAllDayEvents = false))
        // All-day = the local day in the evaluation timezone.
        assertTrue(decide(using, at(28, 0, 0)).silent)
        assertTrue(decide(using, at(28, 23, 59)).silent)
        assertFalse(decide(using, at(29, 0, 0)).silent)
        assertFalse(decide(using, at(27, 23, 59)).silent)
    }

    // 13
    @Test
    fun beforeAndAfterOffsets() {
        val w = World(
            events = listOf(event("m", at(28, 10), at(28, 11))),
            settings = AutomationSettings(calendarEnabled = true, calendarBeforeMinutes = 10, calendarAfterMinutes = 5),
        )
        assertFalse(decide(w, at(28, 9, 49)).silent)
        assertTrue(decide(w, at(28, 9, 50)).silent)
        assertTrue(decide(w, at(28, 11, 4)).silent)
        assertFalse(decide(w, at(28, 11, 5)).silent)
        assertEquals(Boundary(at(28, 9, 50), BoundaryKind.START), decide(w, at(28, 9)).nextBoundary)
    }

    // 14
    @Test
    fun eventCrossingMidnight() {
        val w = World(events = listOf(event("n", at(28, 23), at(29, 1))))
        assertTrue(decide(w, at(28, 23, 30)).silent)
        assertTrue(decide(w, at(29, 0, 30)).silent)
        assertFalse(decide(w, at(29, 1)).silent)
    }

    // 15
    @Test
    fun timezoneChange() {
        // A timed event is an absolute instant: same result in any zone.
        val timed = World(events = listOf(event("t", at(28, 10), at(28, 11))))
        val instant = at(28, 10, 30)
        assertTrue(decide(timed, instant, tz = kolkata).silent)
        assertTrue(decide(timed, instant, tz = newYork).silent)
        // An all-day event follows the local day of wherever the phone is.
        val allDay = World(
            events = listOf(event("d", utcMidnight(28), utcMidnight(29), allDay = true)),
            settings = AutomationSettings(calendarEnabled = true, ignoreAllDayEvents = false),
        )
        val kolkataMorning = at(29, 6, tz = kolkata) // still 28 Sep evening in New York
        assertFalse(decide(allDay, kolkataMorning, tz = kolkata).silent)
        assertTrue(decide(allDay, kolkataMorning, tz = newYork).silent)
    }

    // 16
    @Test
    fun manualOnOverZone() {
        val d = decide(World(zones = listOf(zone("5")), presence = mapOf("5" to at(28, 9))), at(28, 10), ManualOverride.FORCE_ON)
        assertEquals(RuleSource.MANUAL, d.source)
    }

    // 17
    @Test
    fun manualOffInsideZoneLastsForThisVisit() {
        val entered = at(28, 9)
        val w = World(zones = listOf(zone("5")), presence = mapOf("5" to entered))
        val off = w.evaluator().manualOffOverride(at(28, 10), kolkata)
        assertEquals(OverrideMode.FORCE_OFF, off.mode)
        assertNull(off.untilMillis) // ends with the visit, not at a time

        // A repeated ENTER for the same visit (entry time kept) doesn't undo it.
        val later = decide(w, at(28, 12), off)
        assertFalse(later.silent)
        assertEquals(listOf("5"), later.suppressedRules.map { it.ruleId })

        // Leave: the override ends with the visit.
        val left = decide(w.copy(presence = emptyMap()), at(28, 13), off)
        assertFalse(left.silent)
        assertEquals(OverrideMode.NONE, left.override.mode)

        // Re-enter later: a new visit silences again.
        val back = decide(w.copy(presence = mapOf("5" to at(28, 14))), at(28, 14, 1), off)
        assertTrue(back.silent)
        assertEquals(RuleSource.ZONE, back.source)
    }

    @Test
    fun manualOffInsideZoneDoesNotSuppressAScheduleStartingLater() {
        val w = World(schedules = listOf(schedule("s", "11:00", "12:00")), zones = listOf(zone("5")), presence = mapOf("5" to at(28, 9)))
        val off = w.evaluator().manualOffOverride(at(28, 10), kolkata)
        val d = decide(w, at(28, 11), off)
        assertTrue(d.silent)
        assertEquals(RuleSource.SCHEDULE, d.source)
    }

    // 18
    @Test
    fun manualOffDuringCalendarEvent() {
        val w = World(events = listOf(event("c", at(28, 10), at(28, 11)), event("next", at(28, 15), at(28, 16))))
        val off = w.evaluator().manualOffOverride(at(28, 10, 15), kolkata)
        assertEquals(at(28, 11), off.untilMillis)
        assertFalse(decide(w, at(28, 10, 45), off).silent)
        assertTrue(decide(w, at(28, 15, 30), off).silent)
    }

    // 19
    @Test
    fun disabledZoneIgnored() {
        val d = decide(World(zones = listOf(zone("5", enabled = false)), presence = mapOf("5" to at(28, 9))), at(28, 10))
        assertFalse(d.silent)
    }

    @Test
    fun locationModeOffIgnoresZones() {
        val d = decide(
            World(zones = listOf(zone("5")), presence = mapOf("5" to at(28, 9)), settings = AutomationSettings(locationEnabled = false)),
            at(28, 10),
        )
        assertFalse(d.silent)
    }

    // 20
    @Test
    fun disabledCalendarAutomationIgnored() {
        val d = decide(
            World(events = listOf(event("c", at(28, 10), at(28, 11))), settings = AutomationSettings(calendarEnabled = false)),
            at(28, 10, 30),
        )
        assertFalse(d.silent)
        assertNull(d.nextBoundary)
    }

    @Test
    fun invalidZonesAndEventsAreIgnored() {
        val w = World(
            zones = listOf(ZoneRule("9", null, 0.0, 0.0, 200.0, true)),
            presence = mapOf("9" to at(28, 9)),
            events = listOf(event("bad", at(28, 11), at(28, 10))),
        )
        assertFalse(decide(w, at(28, 10, 30)).silent)
    }

    @Test
    fun calendarBoundariesCombineWithSchedules() {
        val w = World(schedules = listOf(schedule("s", "12:00", "13:00")), events = listOf(event("c", at(28, 11), at(28, 11, 30))))
        assertEquals(Boundary(at(28, 11), BoundaryKind.START), decide(w, at(28, 10)).nextBoundary)
        assertEquals(Boundary(at(28, 11, 30), BoundaryKind.END), decide(w, at(28, 11, 10)).nextBoundary)
    }

    @Test
    fun nextStartAcrossCalendarAndSchedule() {
        val w = World(
            schedules = listOf(schedule("s", "18:00", "19:00")),
            events = listOf(event("c:1:1", at(28, 9), at(28, 11)), event("c:1:2", at(28, 14), at(28, 15))),
        )
        // Inside the 9-11 event: the next boundary is its END, the next start is 14:00.
        val d = decide(w, at(28, 10))
        assertEquals(BoundaryKind.END, d.nextBoundary?.kind)
        assertEquals(at(28, 14), d.nextStart?.atMillis)
        assertEquals(RuleSource.CALENDAR, d.nextStart?.source)
        // Calendar off: only the schedule counts.
        val off = decide(w.copy(settings = AutomationSettings(locationEnabled = true, calendarEnabled = false)), at(28, 10))
        assertEquals(at(28, 18), off.nextStart?.atMillis)
        assertEquals(RuleSource.SCHEDULE, off.nextStart?.source)
    }

    @Test
    fun zonesHaveNoNextStart() {
        val d = decide(World(zones = listOf(zone("1")), presence = mapOf("1" to at(28, 9))), at(28, 10))
        assertTrue(d.silent)
        assertNull(d.nextStart)
    }
}
