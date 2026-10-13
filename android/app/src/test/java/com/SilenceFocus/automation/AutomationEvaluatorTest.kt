package com.SilenceFocus.automation

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.Calendar
import java.util.TimeZone

class AutomationEvaluatorTest {

    private val kolkata: TimeZone = TimeZone.getTimeZone("Asia/Kolkata")
    private val newYork: TimeZone = TimeZone.getTimeZone("America/New_York")

    private val weekdays = setOf(1, 2, 3, 4, 5)
    private val everyDay = (1..7).toSet()

    /** 2026-09-28 is a Monday. */
    private fun at(day: Int, hour: Int, minute: Int = 0, tz: TimeZone = kolkata, month: Int = Calendar.SEPTEMBER): Long =
        Calendar.getInstance(tz).apply {
            clear()
            set(2026, month, day, hour, minute, 0)
        }.timeInMillis

    private fun rule(id: String, from: String, to: String, days: Set<Int>, enabled: Boolean = true): ScheduleRule {
        fun min(s: String) = s.split(":").let { it[0].toInt() * 60 + it[1].toInt() }
        return ScheduleRule(id, min(from), min(to), days, enabled)
    }

    private fun evaluator(vararg rules: ScheduleRule) =
        AutomationEvaluator(listOf(ScheduleRuleProvider(rules.toList())))

    private fun decide(now: Long, vararg rules: ScheduleRule, override: ManualOverride = ManualOverride.NONE, tz: TimeZone = kolkata) =
        evaluator(*rules).evaluate(now, tz, override)

    // 1
    @Test
    fun noRulesIsNormal() {
        val d = decide(at(28, 10))
        assertFalse(d.silent)
        assertNull(d.source)
        assertNull(d.nextBoundary)
    }

    // 2
    @Test
    fun activeScheduleIsSilent() {
        val d = decide(at(28, 10), rule("a", "09:00", "17:00", weekdays))
        assertTrue(d.silent)
        assertEquals(RuleSource.SCHEDULE, d.source)
        assertEquals(listOf("a"), d.activeRules.map { it.ruleId })
        assertEquals(Boundary(at(28, 17), BoundaryKind.END), d.nextBoundary)
    }

    // 3 - enabling a schedule before its start must not silence
    @Test
    fun scheduleNotStartedIsNormalAndStartIsNextBoundary() {
        val d = decide(at(28, 8), rule("a", "09:00", "17:00", weekdays))
        assertFalse(d.silent)
        assertEquals(Boundary(at(28, 9), BoundaryKind.START), d.nextBoundary)
    }

    @Test
    fun startInstantIsInclusiveEndInstantIsExclusive() {
        val r = rule("a", "09:00", "17:00", weekdays)
        assertTrue(decide(at(28, 9, 0), r).silent)
        assertFalse(decide(at(28, 17, 0), r).silent)
    }

    // 4
    @Test
    fun scheduleEndedIsNormal() {
        val d = decide(at(28, 18), rule("a", "09:00", "17:00", weekdays))
        assertFalse(d.silent)
        assertEquals(Boundary(at(29, 9), BoundaryKind.START), d.nextBoundary)
    }

    @Test
    fun disabledOrInvalidSchedulesAreIgnored() {
        assertFalse(decide(at(28, 10), rule("a", "09:00", "17:00", weekdays, enabled = false)).silent)
        assertFalse(decide(at(28, 10), rule("b", "09:00", "09:00", weekdays)).silent)
        assertFalse(decide(at(28, 10), rule("c", "09:00", "17:00", emptySet())).silent)
    }

    // 5
    @Test
    fun overlappingSchedulesStaySilentUntilTheLastEnds() {
        val a = rule("a", "09:00", "12:00", everyDay)
        val b = rule("b", "11:00", "14:00", everyDay)
        assertTrue(decide(at(28, 10), a, b).silent)
        // At 12:00 A ends; B still runs, so the re-evaluation stays silent.
        val atNoon = decide(at(28, 12), a, b)
        assertTrue(atNoon.silent)
        assertEquals(listOf("b"), atNoon.activeRules.map { it.ruleId })
        assertEquals(Boundary(at(28, 14), BoundaryKind.END), atNoon.nextBoundary)
        assertFalse(decide(at(28, 14), a, b).silent)
    }

    @Test
    fun overlapBoundariesAreVisitedInOrder() {
        val a = rule("a", "09:00", "12:00", everyDay)
        val b = rule("b", "11:00", "14:00", everyDay)
        assertEquals(at(28, 11), decide(at(28, 10), a, b).nextBoundary?.atMillis)
        assertEquals(at(28, 12), decide(at(28, 11), a, b).nextBoundary?.atMillis)
    }

    // 6
    @Test
    fun weekdayMatching() {
        val r = rule("a", "09:00", "17:00", weekdays)
        val saturday = at(26, 10) // 2026-09-26
        val sunday = at(27, 10)
        assertFalse(decide(saturday, r).silent)
        assertFalse(decide(sunday, r).silent)
        assertTrue(decide(at(2, 10, month = Calendar.OCTOBER), r).silent) // Friday
        // From Friday evening the next start is Monday 09:00.
        assertEquals(
            Boundary(at(5, 9, month = Calendar.OCTOBER), BoundaryKind.START),
            decide(at(2, 18, month = Calendar.OCTOBER), r).nextBoundary,
        )
    }

    // 7
    @Test
    fun overnightScheduleRunsIntoTheNextDay() {
        val friday = 5
        val r = rule("n", "22:00", "07:00", setOf(friday))
        val fri = 2 // 2026-10-02 is a Friday
        assertFalse(decide(at(fri, 21, 59, month = Calendar.OCTOBER), r).silent)
        assertTrue(decide(at(fri, 22, 0, month = Calendar.OCTOBER), r).silent)
        assertTrue(decide(at(fri + 1, 6, 59, month = Calendar.OCTOBER), r).silent) // Saturday morning
        assertFalse(decide(at(fri + 1, 7, 0, month = Calendar.OCTOBER), r).silent)
        // Saturday night is not a start day.
        assertFalse(decide(at(fri + 1, 23, 0, month = Calendar.OCTOBER), r).silent)
        val active = decide(at(fri + 1, 1, 0, month = Calendar.OCTOBER), r)
        assertEquals(Boundary(at(fri + 1, 7, month = Calendar.OCTOBER), BoundaryKind.END), active.nextBoundary)
    }

    // 8
    @Test
    fun manualOnSilencesWithoutRulesAndHasNoExpiry() {
        val d = decide(at(28, 8), override = ManualOverride.FORCE_ON)
        assertTrue(d.silent)
        assertEquals(RuleSource.MANUAL, d.source)
        assertNull(d.nextBoundary)
    }

    @Test
    fun manualOnOutranksSchedule() {
        val d = decide(at(28, 10), rule("a", "09:00", "17:00", weekdays), override = ManualOverride.FORCE_ON)
        assertEquals(RuleSource.MANUAL, d.source)
    }

    // 9
    @Test
    fun manualOffDuringScheduleSuppressesItUntilTheWindowEnds() {
        val r = rule("a", "09:00", "17:00", weekdays)
        val ev = evaluator(r)
        val off = ev.manualOffOverride(at(28, 11), kolkata)
        assertEquals(OverrideMode.FORCE_OFF, off.mode)
        assertEquals(at(28, 17), off.untilMillis)

        // The schedule must not switch it straight back on.
        val later = ev.evaluate(at(28, 15), kolkata, off)
        assertFalse(later.silent)
        assertEquals(listOf("a"), later.suppressedRules.map { it.ruleId })
        assertEquals(Boundary(at(28, 17), BoundaryKind.END), later.nextBoundary)

        // Next day the schedule applies again.
        val tomorrow = ev.evaluate(at(29, 10), kolkata, off)
        assertTrue(tomorrow.silent)
        assertEquals(OverrideMode.NONE, tomorrow.override.mode)
    }

    @Test
    fun manualOffWithNothingActiveClearsTheOverride() {
        assertEquals(ManualOverride.NONE, evaluator(rule("a", "09:00", "17:00", weekdays)).manualOffOverride(at(28, 8), kolkata))
    }

    @Test
    fun manualOffOnlySuppressesWindowsActiveAtThatMoment() {
        val a = rule("a", "09:00", "12:00", everyDay)
        val b = rule("b", "11:00", "14:00", everyDay)
        val ev = evaluator(a, b)
        val off = ev.manualOffOverride(at(28, 10), kolkata) // only A is running
        assertFalse(ev.evaluate(at(28, 10, 30), kolkata, off).silent)
        // B starts after the tap, so it still applies.
        val atEleven = ev.evaluate(at(28, 11), kolkata, off)
        assertTrue(atEleven.silent)
        assertEquals(listOf("b"), atEleven.activeRules.map { it.ruleId })
    }

    @Test
    fun overrideExpiryIsTheNextBoundaryWhenEarliest() {
        // Suppressing A (09:00-13:00) while B starts later at 15:00: the
        // override's end (13:00) is the next thing to wake up for.
        val a = rule("a", "09:00", "13:00", everyDay)
        val b = rule("b", "15:00", "16:00", everyDay)
        val off = evaluator(a, b).manualOffOverride(at(28, 10), kolkata)
        val d = decide(at(28, 10), a, b, override = off)
        assertEquals(at(28, 13), d.nextBoundary?.atMillis)
    }

    @Test
    fun forceOffWhoseActivationsEndedIsCleared() {
        val off = ManualOverride(OverrideMode.FORCE_OFF, null, setOf("SCHEDULE:gone:1"))
        assertEquals(OverrideMode.NONE, decide(at(28, 10), override = off).override.mode)
    }

    // 10
    @Test
    fun schedulesUseLocalWallClockOfTheGivenTimezone() {
        val r = rule("a", "09:00", "17:00", weekdays)
        // 10:00 in Kolkata is 00:30 in New York the same day: silent in one
        // zone, normal in the other, for the same instant.
        val instant = at(28, 10, tz = kolkata)
        assertTrue(decide(instant, r, tz = kolkata).silent)
        assertFalse(decide(instant, r, tz = newYork).silent)
        assertEquals(at(28, 9, tz = newYork), decide(instant, r, tz = newYork).nextBoundary?.atMillis)
    }

    @Test
    fun dstSpringForwardKeepsLocalTimes() {
        // US DST starts Sunday 2026-03-08; 09:00 local must still be 09:00.
        val r = rule("a", "09:00", "10:00", everyDay)
        val sat = at(7, 12, tz = newYork, month = Calendar.MARCH)
        val next = decide(sat, r, tz = newYork).nextBoundary
        assertEquals(at(8, 9, tz = newYork, month = Calendar.MARCH), next?.atMillis)
        assertTrue(decide(at(8, 9, 30, tz = newYork, month = Calendar.MARCH), r, tz = newYork).silent)
    }
}
