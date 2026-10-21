package com.SilenceFocus.automation

import com.SilenceFocus.automation.OnceSchedule.Status
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.Calendar
import java.util.TimeZone

/** Client feedback: true one-time schedules, never repeated. */
class OnceScheduleTest {

    private val zurich: TimeZone = TimeZone.getTimeZone("Europe/Zurich")
    private val min = 60_000L
    private val hour = 60 * min

    private fun at(tz: TimeZone, y: Int, mo: Int, d: Int, h: Int, mi: Int): Long =
        Calendar.getInstance(tz).apply { clear(); set(y, mo - 1, d, h, mi, 0) }.timeInMillis

    private fun once(id: String, start: Long, end: Long, created: Long = start - hour) =
        OnceSchedule(OnceSchedule.ID_PREFIX + id, start, end, created)

    private fun evaluator(vararg providers: SilenceRuleProvider) = AutomationEvaluator(providers.toList())

    // ---- validation (the screen also shows exact dates before saving)

    @Test fun `later today, tomorrow and overnight are valid`() {
        val now = at(zurich, 2026, 10, 16, 14, 0)
        assertNull(OnceSchedule.validate(now + hour, now + 2 * hour, now))
        assertNull(OnceSchedule.validate(now + 24 * hour, now + 25 * hour, now))
        // Today 22:00 -> tomorrow 06:00.
        assertNull(OnceSchedule.validate(at(zurich, 2026, 10, 16, 22, 0), at(zurich, 2026, 10, 17, 6, 0), now))
    }

    @Test fun `past start, zero or negative duration and missing values are rejected`() {
        val now = at(zurich, 2026, 10, 16, 14, 0)
        // Never silently scheduled in the past (no automatic move to tomorrow).
        assertEquals(OnceSchedule.ERROR_START_PASSED, OnceSchedule.validate(now - 10 * min, now + hour, now))
        assertEquals(OnceSchedule.ERROR_END_BEFORE_START, OnceSchedule.validate(now + hour, now + hour, now))
        assertEquals(OnceSchedule.ERROR_END_BEFORE_START, OnceSchedule.validate(now + 2 * hour, now + hour, now))
        assertEquals(OnceSchedule.ERROR_TOO_SHORT, OnceSchedule.validate(now + hour, now + hour + 30_000, now))
        assertEquals(OnceSchedule.ERROR_TOO_LONG, OnceSchedule.validate(now, now + 8 * 24 * hour, now))
        assertEquals(OnceSchedule.ERROR_MISSING, OnceSchedule.validate(0, now, now))
        // "Starting now" (start = the moment the user confirmed) is fine.
        assertNull(OnceSchedule.validate(now - 30_000, now + hour, now))
    }

    // ---- lifecycle

    @Test fun `pending, active, completed`() {
        val s = once("a", 1_000 * hour, 1_002 * hour)
        assertEquals(Status.PENDING, s.status(999 * hour))
        assertEquals(Status.ACTIVE, s.status(1_000 * hour))
        assertEquals(Status.ACTIVE, s.status(1_002 * hour - 1))
        assertEquals(Status.COMPLETED, s.status(1_002 * hour))
        assertEquals(Status.CANCELLED, s.copy(cancelledAt = 999 * hour).status(1_001 * hour))
    }

    @Test fun `silences exactly inside its window and never again`() {
        val start = at(zurich, 2026, 10, 16, 15, 0)
        val end = start + hour
        val e = evaluator(OnceScheduleProvider(listOf(once("a", start, end))))
        val before = e.evaluate(start - min, zurich, ManualOverride.NONE)
        assertFalse(before.silent)
        assertEquals(start, before.nextBoundary!!.atMillis)
        assertEquals(BoundaryKind.START, before.nextBoundary!!.kind)
        assertEquals(start, before.nextStart!!.atMillis)
        val during = e.evaluate(start + 5 * min, zurich, ManualOverride.NONE)
        assertTrue(during.silent)
        assertEquals(RuleSource.SCHEDULE, during.source)
        assertEquals(end, during.nextBoundary!!.atMillis)
        assertEquals(BoundaryKind.END, during.nextBoundary!!.kind)
        // After the end: not silent, and nothing next week (unlike weekly rules).
        listOf(end, end + 7 * 24 * hour, end + 7 * 24 * hour + 30 * min).forEach { t ->
            val d = e.evaluate(t, zurich, ManualOverride.NONE)
            assertFalse(d.silent)
            assertNull(d.nextBoundary)
            assertNull(d.nextStart)
        }
    }

    @Test fun `completion is persisted so a clock moved back can't restart it`() {
        val s = once("a", 10 * hour, 11 * hour)
        val done = OnceSchedule.housekeep(listOf(s), 11 * hour + min)!!
        assertEquals(11 * hour, done.single().completedAt)
        // Clock (or a bad time sync) goes back into the window: still completed.
        assertEquals(Status.COMPLETED, done.single().status(10 * hour + 30 * min))
        val d = evaluator(OnceScheduleProvider(done)).evaluate(10 * hour + 30 * min, zurich, ManualOverride.NONE)
        assertFalse(d.silent)
        assertNull(d.nextBoundary)
        // Nothing left to change while still within the keep period.
        assertNull(OnceSchedule.housekeep(done, 12 * hour))
    }

    @Test fun `finished schedules are forgotten after a week`() {
        val s = once("a", 10 * hour, 11 * hour).copy(completedAt = 11 * hour)
        assertTrue(OnceSchedule.housekeep(listOf(s), 11 * hour + OnceSchedule.KEEP_FINISHED_MS + 1)!!.isEmpty())
        val c = once("b", 10 * hour, 11 * hour).copy(cancelledAt = 9 * hour)
        assertTrue(OnceSchedule.housekeep(listOf(c), 9 * hour + OnceSchedule.KEEP_FINISHED_MS + 1)!!.isEmpty())
    }

    @Test fun `cancel before start - never silences`() {
        val s = once("a", 10 * hour, 11 * hour).copy(cancelledAt = 9 * hour)
        val d = evaluator(OnceScheduleProvider(listOf(s))).evaluate(10 * hour + min, zurich, ManualOverride.NONE)
        assertFalse(d.silent)
        assertNull(d.nextBoundary)
    }

    @Test fun `cancel while active - its reason ends, other reasons stay`() {
        val now = 10 * hour + 10 * min
        val cancelled = once("a", 10 * hour, 11 * hour).copy(cancelledAt = now)
        val zone = ZoneRule("1", "Office", 47.0, 8.0, 150.0, true)
        val alone = evaluator(OnceScheduleProvider(listOf(cancelled))).evaluate(now, zurich, ManualOverride.NONE)
        assertFalse(alone.silent)
        val withZone = evaluator(
            LocationRuleProvider(listOf(zone), mapOf("1" to 9 * hour), true),
            OnceScheduleProvider(listOf(cancelled)),
        ).evaluate(now, zurich, ManualOverride.NONE)
        assertTrue(withZone.silent)
        assertEquals(RuleSource.ZONE, withZone.source)
    }

    // ---- overlaps with other reasons

    @Test fun `overlapping one-time and weekly schedules - silence lasts until the last ends`() {
        val start = at(zurich, 2026, 10, 16, 9, 0) // a Friday
        val weekly = ScheduleRule("w1", 9 * 60, 10 * 60, setOf(5), true)
        val e = evaluator(
            ScheduleRuleProvider(listOf(weekly)),
            OnceScheduleProvider(listOf(once("a", start + 30 * min, start + 2 * hour))),
        )
        assertEquals(2, e.evaluate(start + 45 * min, zurich, ManualOverride.NONE).activeRules.size)
        // Weekly ended at 10:00, one-time continues.
        val at1030 = e.evaluate(start + 90 * min, zurich, ManualOverride.NONE)
        assertTrue(at1030.silent)
        assertEquals(listOf("once-a"), at1030.activeRules.map { it.ruleId })
        assertFalse(e.evaluate(start + 2 * hour, zurich, ManualOverride.NONE).silent)
    }

    @Test fun `one-time ending during a calendar event keeps the phone silent`() {
        val start = 100 * hour
        val e = evaluator(
            OnceScheduleProvider(listOf(once("a", start, start + hour))),
            CalendarRuleProvider(listOf(CalendarEvent("1:2:3", start + 30 * min, start + 2 * hour, false)), AutomationSettings(calendarEnabled = true)),
        )
        val d = e.evaluate(start + hour + min, zurich, ManualOverride.NONE)
        assertTrue(d.silent)
        assertEquals(RuleSource.CALENDAR, d.source)
    }

    @Test fun `manual off suppresses only the running occurrence`() {
        val s = once("a", 10 * hour, 11 * hour)
        val e = evaluator(OnceScheduleProvider(listOf(s)))
        val off = e.manualOffOverride(10 * hour + min, zurich)
        assertEquals(11 * hour, off.untilMillis)
        assertFalse(e.evaluate(10 * hour + 2 * min, zurich, off).silent)
    }

    // ---- time

    @Test fun `timezone change and DST never move a one-time schedule`() {
        // 29 Mar 2026: Europe/Zurich springs forward at 02:00.
        val start = at(zurich, 2026, 3, 29, 1, 30)
        val end = at(zurich, 2026, 3, 29, 3, 30)
        assertEquals(hour, end - start) // the clock skipped 02:00-03:00
        val p = OnceScheduleProvider(listOf(once("dst", start, end)))
        val tokyo = TimeZone.getTimeZone("Asia/Tokyo")
        listOf(zurich, tokyo).forEach { tz ->
            val d = AutomationEvaluator(listOf(p)).evaluate(start + min, tz, ManualOverride.NONE)
            assertTrue(d.silent)
            assertEquals(end, d.nextBoundary!!.atMillis)
        }
    }

    @Test fun `reboot or process death in the middle - active until its own end`() {
        // Nothing but the stored list is needed (no alarm state): evaluating
        // after boot inside the window silences, and the next alarm is the end.
        val s = once("a", 10 * hour, 12 * hour)
        val d = evaluator(OnceScheduleProvider(listOf(s))).evaluate(11 * hour, zurich, ManualOverride.NONE)
        assertTrue(d.silent)
        assertEquals(12 * hour, d.nextBoundary!!.atMillis)
        // Phone off for the whole window: completed on the next evaluation, never run late.
        val missed = OnceSchedule.housekeep(listOf(s), 13 * hour)!!
        assertEquals(Status.COMPLETED, missed.single().status(13 * hour))
    }

    // Storage (org.json) isn't available in plain JVM tests; persistence is
    // verified on the emulator (process death, reboot, app update).

    @Test fun `weekly schedules are untouched by the new type`() {
        // Existing weekly rules keep their meaning (no type field needed).
        val weekly = ScheduleRule("8", 22 * 60, 6 * 60, setOf(5), true)
        assertTrue(weekly.isValid)
        assertTrue(weekly.isOvernight)
        val fri22 = at(zurich, 2026, 10, 16, 22, 0)
        val d = AutomationEvaluator(listOf(ScheduleRuleProvider(listOf(weekly)))).evaluate(fri22 + hour, zurich, ManualOverride.NONE)
        assertTrue(d.silent)
        assertEquals(at(zurich, 2026, 10, 17, 6, 0), d.nextBoundary!!.atMillis)
        // A weekly rule with no days still never activates.
        assertFalse(weekly.copy(days = emptySet()).isValid)
    }
}
