package com.SilenceFocus.automation

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ActivityEventsTest {

    @Test fun `rule transitions per occurrence`() {
        val zone = ActiveRule(RuleSource.ZONE, "3", "Library", 100, null)
        val sched = ActiveRule(RuleSource.SCHEDULE, "5", null, 200, 300)
        val (started, ended) = ActivityEvents.ruleTransitions(mapOf(zone.windowKey to "Library"), listOf(zone, sched))
        assertEquals(listOf(sched), started)
        assertTrue(ended.isEmpty())

        val (s2, e2) = ActivityEvents.ruleTransitions(mapOf(zone.windowKey to "Library", sched.windowKey to ""), emptyList())
        assertTrue(s2.isEmpty())
        assertEquals(setOf(zone.windowKey, sched.windowKey), e2.toSet())
    }

    @Test fun `window keys parse, including calendar ids with colons`() {
        assertEquals(RuleSource.ZONE to "3", ActivityEvents.parseWindowKey("ZONE:3:100"))
        assertEquals(RuleSource.CALENDAR to "1:2:1790778540000", ActivityEvents.parseWindowKey("CALENDAR:1:2:1790778540000:1790778540000"))
        assertNull(ActivityEvents.parseWindowKey("garbage"))
    }

    @Test fun `event types map to categories and rule events`() {
        assertEquals("CALL", ActivityEvents.categoryOf(ActivityEvents.URGENT_REPEAT_CALLER))
        assertEquals("MESSAGE", ActivityEvents.categoryOf(ActivityEvents.AUTO_REPLY_FAILED))
        assertEquals("AUTOMATION", ActivityEvents.categoryOf(ActivityEvents.ZONE_ENTER))
        assertEquals(ActivityEvents.ZONE_ENTER, ActivityEvents.ruleStarted(RuleSource.ZONE))
        assertEquals(ActivityEvents.CALENDAR_ENDED, ActivityEvents.ruleEnded(RuleSource.CALENDAR))
        assertEquals(ActivityEvents.SCHEDULE_STARTED, ActivityEvents.ruleStarted(RuleSource.SCHEDULE))
    }

    @Test fun `a breakthrough never changes the rules' decision`() {
        // The evaluator has no notion of breakthroughs: same inputs, same decision.
        val provider = object : SilenceRuleProvider {
            override fun activeRules(nowMillis: Long, tz: java.util.TimeZone) =
                listOf(ActiveRule(RuleSource.ZONE, "3", "Office", 0, null))
            override fun nextBoundaryAfter(nowMillis: Long, tz: java.util.TimeZone): Boundary? = null
        }
        val d = AutomationEvaluator(listOf(provider)).evaluate(1_000, java.util.TimeZone.getTimeZone("UTC"), ManualOverride.NONE)
        assertTrue(d.silent)
        assertEquals(RuleSource.ZONE, d.source)
        val bt = Breakthrough("EMERGENCY_CONTACT", 1_000, 1_000 + Breakthrough.MAX_MS)
        assertEquals(DeviceMode.BREAKTHROUGH, deviceMode(d.silent, bt, 2_000))
        assertEquals(DeviceMode.SILENT, deviceMode(d.silent, null, 2_000))
    }

    // ---- One action -> one Activity entry

    private val sched = ActiveRule(RuleSource.SCHEDULE, "5", "Night", 1_000, 2_000)
    private val zone = ActiveRule(RuleSource.ZONE, "3", "Office", 1_000, null)

    @Test fun `schedule start that silences is recorded once (rule event only)`() {
        assertFalse(ActivityEvents.silenceChangeNeedsEvent(true, RuleSource.SCHEDULE, null, listOf(sched), emptyList()))
        assertFalse(ActivityEvents.silenceChangeNeedsEvent(true, RuleSource.ZONE, null, listOf(zone, sched), emptyList()))
    }

    @Test fun `schedule end that unsilences is recorded once`() {
        assertFalse(ActivityEvents.silenceChangeNeedsEvent(false, null, RuleSource.SCHEDULE, emptyList(), listOf(RuleSource.SCHEDULE)))
    }

    @Test fun `generic event kept when no rule event explains the change`() {
        // Manual on/off.
        assertTrue(ActivityEvents.silenceChangeNeedsEvent(true, RuleSource.MANUAL, null, emptyList(), emptyList()))
        assertTrue(ActivityEvents.silenceChangeNeedsEvent(false, null, RuleSource.MANUAL, emptyList(), emptyList()))
        // Schedule already running when DND access came back (no start this evaluation).
        assertTrue(ActivityEvents.silenceChangeNeedsEvent(true, RuleSource.SCHEDULE, null, emptyList(), emptyList()))
        // A different rule started than the one silencing.
        assertTrue(ActivityEvents.silenceChangeNeedsEvent(true, RuleSource.SCHEDULE, null, listOf(zone), emptyList()))
        // Manual OFF while the schedule keeps running.
        assertTrue(ActivityEvents.silenceChangeNeedsEvent(false, null, RuleSource.SCHEDULE, emptyList(), emptyList()))
        // Zone ended but the silence came from the schedule (e.g. logout cleared both).
        assertTrue(ActivityEvents.silenceChangeNeedsEvent(false, null, RuleSource.SCHEDULE, emptyList(), listOf(RuleSource.ZONE)))
        // Unknown previous source (state written before this version).
        assertTrue(ActivityEvents.silenceChangeNeedsEvent(false, null, null, emptyList(), listOf(RuleSource.SCHEDULE)))
    }

    @Test fun `repeated evaluations and reboot produce no new rule events`() {
        // The persisted window map (EngineStore.lastRuleWindows) survives reboot,
        // so re-evaluating the same occurrence starts/ends nothing.
        val persisted = mapOf(sched.windowKey to "Night")
        repeat(3) {
            val (started, ended) = ActivityEvents.ruleTransitions(persisted, listOf(sched))
            assertTrue(started.isEmpty())
            assertTrue(ended.isEmpty())
        }
        // Next day's occurrence is a new start.
        val tomorrow = sched.copy(windowStart = sched.windowStart + 86_400_000, windowEnd = sched.windowEnd!! + 86_400_000)
        assertEquals(listOf(tomorrow), ActivityEvents.ruleTransitions(persisted, listOf(tomorrow)).first)
    }

    // ---- "Clear phone activity" keeps everything not verified

    @Test fun `clear keeps unverified and newer journal entries`() {
        val ids = listOf("1-1-INCOMING_CALL", "2-2-MESSAGE_RECEIVED", "3-3-ZONE_ENTER", "4-4-MESSAGE_RECEIVED")
        // 2 was rejected by the server; 4 was recorded after the check.
        val verified = setOf("1-1-INCOMING_CALL", "3-3-ZONE_ENTER")
        assertEquals(listOf(1, 3), ActivityEvents.keptAfterClear(ids, verified))
    }

    @Test fun `clear without a list removes everything, an empty list removes nothing`() {
        val ids = listOf("1-1-A", "2-2-B")
        assertEquals(emptyList<Int>(), ActivityEvents.keptAfterClear(ids, null))
        assertEquals(listOf(0, 1), ActivityEvents.keptAfterClear(ids, emptySet()))
    }

    @Test fun `entries without an id are never cleared by a verified list`() {
        assertEquals(listOf(0), ActivityEvents.keptAfterClear(listOf(null, "2-2-B"), setOf("2-2-B")))
    }
}
