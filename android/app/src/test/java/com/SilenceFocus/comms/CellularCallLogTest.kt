package com.SilenceFocus.comms

import com.SilenceFocus.comms.CellularCallLog.Ringing
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Client Issue #5: calls screening didn't see still reach the Activity Center. */
class CellularCallLogTest {

    private val now = 1_700_000_000_000L

    @Test fun `ringing without a screened row records a fallback row while silenced`() {
        assertTrue(CellularCallLog.needsFallbackRow(silentActive = true, lastScreened = null, now = now))
        // Silent Focus off: calls ring normally and are not logged (as before).
        assertFalse(CellularCallLog.needsFallbackRow(silentActive = false, lastScreened = null, now = now))
    }

    @Test fun `a call screening just reported is never recorded twice`() {
        val screened = Ringing("e1", now - 2_000)
        assertFalse(CellularCallLog.needsFallbackRow(true, screened, now))
        // A second RINGING broadcast for the same call is matched to the fallback row too.
        val fallback = Ringing("e2", now)
        assertFalse(CellularCallLog.needsFallbackRow(true, fallback, now + 1_500))
    }

    @Test fun `an older screened call is a different call`() {
        val old = Ringing("e1", now - CellularCallLog.SCREENED_MATCH_MS - 1)
        assertTrue(CellularCallLog.needsFallbackRow(true, old, now))
        assertNull(CellularCallLog.screenedRow(old, now))
        // Clock moved backwards: never matched.
        assertNull(CellularCallLog.screenedRow(Ringing("e1", now + 5_000), now))
    }

    @Test fun `answered vs missed`() {
        assertEquals(CellularCallLog.STATE_MISSED, CellularCallLog.finalState(Ringing("e", now)))
        assertEquals(CellularCallLog.STATE_ANSWERED, CellularCallLog.finalState(Ringing("e", now, answered = true)))
    }

    @Test fun `stale tracked calls are dropped`() {
        assertFalse(CellularCallLog.isStale(Ringing("e", now), now + 60_000))
        assertTrue(CellularCallLog.isStale(Ringing("e", now), now + CellularCallLog.MAX_RING_MS + 1))
        assertTrue(CellularCallLog.isStale(Ringing("e", now), now - 1))
    }

    @Test fun `tracked call survives a process restart (encoded)`() {
        val r = Ringing("1700000000000-3-INCOMING_CALL", now, answered = true)
        assertEquals(r, Ringing.decode(r.encode()))
        assertNull(Ringing.decode(null))
        assertNull(Ringing.decode("garbage"))
    }

    @Test fun `cleared with the rest of the call state`() {
        val store = CommsStore(MemoryKeyValue())
        store.cellularCall = Ringing("e", now)
        store.clearRecentCalls()
        assertNull(store.cellularCall)
        store.cellularCall = Ringing("e", now)
        store.clearUserData()
        assertNull(store.cellularCall)
    }
}
