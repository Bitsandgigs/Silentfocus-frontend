package com.SilenceFocus.automation

import com.SilenceFocus.comms.MemoryKeyValue
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class SessionHistoryTest {

    private val t0 = 1_790_820_000_000L
    private val min = 60_000L
    private fun zone(name: String) = ActiveRule(RuleSource.ZONE, "3", name, t0, null)
    private fun sched() = ActiveRule(RuleSource.SCHEDULE, "8", null, t0, t0 + 60 * min)

    @Test fun `a session opens, collects overlapping sources and closes`() {
        var s = SessionTracker.onEvaluate(emptyList(), active = true, since = t0, source = "MANUAL", rules = emptyList(), now = t0)
        s = SessionTracker.onEvaluate(s, true, t0, "MANUAL", listOf(zone("Office"), sched()), t0 + 5 * min)
        s = SessionTracker.onEvaluate(s, false, 0, null, emptyList(), t0 + 30 * min)
        val only = s.single()
        assertEquals(t0, only.start)
        assertEquals(t0 + 30 * min, only.end)
        assertEquals("MANUAL", only.primarySource)
        assertEquals(setOf("MANUAL", "ZONE", "SCHEDULE"), only.sources)
        assertEquals(setOf("Office"), only.zoneNames)
    }

    @Test fun `breakthrough pause stays inside one session and counters add up`() {
        var s = SessionTracker.onEvaluate(emptyList(), true, t0, "ZONE", listOf(zone("Office")), t0)
        s = SessionTracker.increment(s, SessionCounter.EMERGENCY)
        // Engine evaluation during the break-through: still active (owned).
        s = SessionTracker.onEvaluate(s, true, t0, "ZONE", listOf(zone("Office")), t0 + min)
        s = SessionTracker.increment(s, SessionCounter.URGENT)
        s = SessionTracker.increment(s, SessionCounter.AUTO_REPLY)
        s = SessionTracker.increment(s, SessionCounter.MESSAGE)
        s = SessionTracker.increment(s, SessionCounter.CALL_SILENCED)
        assertEquals(1, s.size)
        with(s.single()) {
            assertNull(end)
            assertEquals(1, emergencyBreakthroughs)
            assertEquals(1, urgentBreakthroughs)
            assertEquals(1, autoRepliesSent)
            assertEquals(1, messagesReceived)
            assertEquals(1, callsSilenced)
        }
    }

    @Test fun `counters outside a session are ignored`() {
        val closed = listOf(SilenceSession(t0, t0 + min, "MANUAL"))
        assertEquals(closed, SessionTracker.increment(closed, SessionCounter.AUTO_REPLY))
    }

    @Test fun `a new activation closes a stale open session`() {
        var s = SessionTracker.onEvaluate(emptyList(), true, t0, "MANUAL", emptyList(), t0)
        s = SessionTracker.onEvaluate(s, true, t0 + 60 * min, "SCHEDULE", listOf(sched()), t0 + 61 * min)
        assertEquals(2, s.size)
        assertEquals(t0 + 60 * min, s[0].end)
        assertEquals("SCHEDULE", s[1].primarySource)
    }

    @Test fun `history is bounded by count and age (server-acknowledged sessions)`() {
        var s = emptyList<SilenceSession>()
        repeat(150) { i ->
            val start = t0 + i * 10 * min
            s = SessionTracker.onEvaluate(s, true, start, "MANUAL", emptyList(), start)
            s = SessionTracker.onEvaluate(s, false, 0, null, emptyList(), start + min)
            // Uploaded and read back (serverSync.verifyAcknowledgements).
            s = s.map { it.copy(ackedEnd = it.end) }
        }
        assertEquals(SessionTracker.MAX_SESSIONS, s.size)
        assertTrue(SessionTracker.prune(s, t0 + 200L * 24 * 60 * min).isEmpty())
    }

    @Test fun `unacknowledged sessions are never evicted for count or age`() {
        var s = emptyList<SilenceSession>()
        repeat(150) { i ->
            val start = t0 + i * 10 * min
            s = SessionTracker.onEvaluate(s, true, start, "MANUAL", emptyList(), start)
            s = SessionTracker.onEvaluate(s, false, 0, null, emptyList(), start + min)
        }
        assertEquals(150, s.size)
        assertEquals(150, SessionTracker.prune(s, t0 + 200L * 24 * 60 * min).size)
    }

    @Test fun `store round trip, clear keeps the open session, logout clears all`() {
        val store = SessionStore(MemoryKeyValue())
        store.update { SessionTracker.onEvaluate(it, true, t0, "MANUAL", listOf(zone("Library, 2nd floor")), t0) }
        store.update { SessionTracker.onEvaluate(it, false, 0, null, emptyList(), t0 + min) }
        store.update { SessionTracker.onEvaluate(it, true, t0 + 2 * min, "ZONE", listOf(zone("Office")), t0 + 2 * min) }
        store.update { SessionTracker.increment(it, SessionCounter.AUTO_REPLY) }
        assertEquals(2, store.sessions.size)
        assertEquals(setOf("Library, 2nd floor"), store.sessions[0].zoneNames)
        store.clear(t0 + 3 * min)
        assertEquals(1, store.sessions.size)
        assertNull(store.sessions.single().end)
        assertEquals(0, store.sessions.single().autoRepliesSent)
        assertEquals(t0 + 3 * min, store.recordingSince)
        store.clearUserData()
        assertTrue(store.sessions.isEmpty())
    }
}
