package com.SilenceFocus.automation

import com.SilenceFocus.automation.ActivityEvents.JournalEntry
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Retention never drops data the server hasn't acknowledged; verified and
 * never-uploaded history stays bounded (journal 30 days / 200, sessions
 * 90 days / 100).
 */
class RetentionTest {

    private val day = 24 * 60 * 60 * 1000L
    private val now = 1_791_620_000_000L
    private val maxAge = 30 * day

    private fun call(at: Long, acked: Boolean) = JournalEntry(ActivityEvents.INCOMING_CALL, at, acked)
    private fun zone(at: Long) = JournalEntry(ActivityEvents.ZONE_ENTER, at, false)

    // ---- journal: 30-day boundary

    @Test fun `30 days - acknowledged and automation entries older than 30 days go, younger stay`() {
        val entries = listOf(
            call(now - maxAge - 1, acked = true),
            zone(now - maxAge - 1),
            call(now - maxAge, acked = true), // exactly at the boundary: kept
            zone(now - maxAge + 1),
        )
        assertEquals(listOf(2, 3), ActivityEvents.retained(entries, now, maxAge, 200))
    }

    @Test fun `30 days - an unacknowledged call or message is kept however old`() {
        val entries = listOf(call(now - 90 * day, acked = false), call(now - 31 * day, acked = true))
        assertEquals(listOf(0), ActivityEvents.retained(entries, now, maxAge, 200))
    }

    // ---- journal: 200-entry boundary

    @Test fun `200 entries - the oldest verified entry is evicted at 201`() {
        val entries = (0 until 201).map { call(now - (201 - it) * 1000L, acked = true) }
        val kept = ActivityEvents.retained(entries, now, maxAge, 200)
        assertEquals(200, kept.size)
        assertEquals(1, kept.first())
        assertEquals(200, kept.last())
    }

    @Test fun `200 entries - pending entries are never counted out`() {
        // 50 pending (oldest) + 200 verified: all pending stay, the newest 200 verified stay.
        val pending = (0 until 50).map { call(now - (500 - it) * 1000L, acked = false) }
        val verified = (0 until 200).map { call(now - (200 - it) * 1000L, acked = true) }
        val kept = ActivityEvents.retained(pending + verified, now, maxAge, 200)
        assertEquals(250, kept.size)
        assertEquals((0 until 250).toList(), kept)
    }

    @Test fun `200 entries - with 201 verified and pending mixed in, only one verified entry goes`() {
        val entries = listOf(call(now - 999_000, acked = false)) +
            (0 until 201).map { call(now - (201 - it) * 1000L, acked = true) }
        val kept = ActivityEvents.retained(entries, now, maxAge, 200)
        assertEquals(201, kept.size)
        assertTrue(0 in kept) // the pending one
        assertFalse(1 in kept) // the oldest verified one
    }

    @Test fun `uploaded types match LOG_TYPES in serverSync js`() {
        assertEquals(
            setOf("INCOMING_CALL", "EMERGENCY_BREAKTHROUGH", "URGENT_REPEAT_CALLER", "MESSAGE_RECEIVED", "AUTO_REPLY_SENT"),
            ActivityEvents.UPLOADED_TYPES,
        )
        assertFalse(JournalEntry(ActivityEvents.AUTO_REPLY_FAILED, now, false).pending)
    }

    // ---- sessions: 90 days / 100

    private fun session(start: Long, end: Long?, ackedEnd: Long? = end) = SilenceSession(start, end, "MANUAL", ackedEnd = ackedEnd)

    @Test fun `sessions - acknowledged older than 90 days go, pending stay`() {
        val old = now - 91 * day
        val ackedOld = session(old, old + 1000)
        val pendingOld = session(old + 2000, old + 3000, ackedEnd = null)
        val recent = session(now - day, now - day + 1000)
        assertEquals(listOf(pendingOld, recent), SessionTracker.prune(listOf(ackedOld, pendingOld, recent), now))
    }

    @Test fun `sessions - a session acknowledged while open is pending once it ends`() {
        val s = session(now - 2000, now - 1000, ackedEnd = null)
        assertTrue(s.pending)
        assertFalse(session(now - 2000, null, ackedEnd = null).pending)
        assertFalse(session(now - 2000, now - 1000).pending)
    }

    @Test fun `sessions - 100 boundary counts only acknowledged ones`() {
        val pending = (0 until 5).map { session(now - (1000 - it) * 1000L, now - (999 - it) * 1000L, ackedEnd = null) }
        val acked = (0 until 101).map { session(now - (200 - it) * 1000L, now - (199 - it) * 1000L) }
        val kept = SessionTracker.prune(pending + acked, now)
        assertEquals(105, kept.size)
        assertTrue(kept.containsAll(pending))
        assertFalse(acked.first() in kept)
    }

    @Test fun `ackedEnd survives encode and old records without it still decode`() {
        val store = SessionStore(com.SilenceFocus.comms.MemoryKeyValue())
        val s = session(now - 2000, now - 1000, ackedEnd = null)
        store.sessions = listOf(s)
        store.markAcknowledged(mapOf(s.start to s.end!!))
        assertEquals(s.end, store.sessions.single().ackedEnd)
        // A different end (session re-closed later) is not acknowledged.
        store.markAcknowledged(mapOf(s.start to s.end + 5))
        assertEquals(s.end, store.sessions.single().ackedEnd)
    }
}
