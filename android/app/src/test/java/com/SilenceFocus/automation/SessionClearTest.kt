package com.SilenceFocus.automation

import com.SilenceFocus.comms.MemoryKeyValue
import org.junit.Assert.assertEquals
import org.junit.Test

/** "Clear phone activity" keeps sessions the server hasn't acknowledged. */
class SessionClearTest {

    private val now = 1_791_620_000_000L
    private val acked = SilenceSession(now - 3_600_000, now - 3_000_000, "MANUAL")
    private val unacked = SilenceSession(now - 2_000_000, now - 1_500_000, "ZONE", messagesReceived = 2)
    private val open = SilenceSession(now - 600_000, null, "MANUAL", callsSilenced = 4)

    private fun store() = SessionStore(MemoryKeyValue()).apply { sessions = listOf(acked, unacked, open) }

    @Test fun `only acknowledged finished sessions are dropped`() {
        val s = store()
        s.clear(now, clearableStarts = setOf(acked.start))
        assertEquals(listOf(unacked, open.copy(callsSilenced = 0)), s.sessions)
        // Kept history stays visible from its own start.
        assertEquals(unacked.start, s.recordingSince)
    }

    @Test fun `a session that ended after the check is kept`() {
        val s = store()
        // Verified while still open; it ended before the native clear ran.
        val endedMeanwhile = open.copy(end = now - 1_000)
        s.sessions = listOf(acked, endedMeanwhile)
        s.clear(now, clearableStarts = setOf(acked.start))
        assertEquals(listOf(endedMeanwhile), s.sessions)
    }

    @Test fun `everything acknowledged - only the open session remains`() {
        val s = store()
        s.clear(now, clearableStarts = setOf(acked.start, unacked.start))
        assertEquals(listOf(open.copy(callsSilenced = 0)), s.sessions)
        assertEquals(now, s.recordingSince)
    }

    @Test fun `null keeps the previous behaviour (no server copy expected)`() {
        val s = store()
        s.clear(now, clearableStarts = null)
        assertEquals(listOf(open.copy(callsSilenced = 0)), s.sessions)
        assertEquals(now, s.recordingSince)
    }

    @Test fun `empty set clears nothing finished`() {
        val s = store()
        s.clear(now, clearableStarts = emptySet())
        assertEquals(listOf(acked, unacked, open.copy(callsSilenced = 0)), s.sessions)
    }
}
