package com.SilenceFocus.automation

import com.SilenceFocus.automation.GeofenceRegistrationGate.Outcome
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test

class GeofenceRegistrationGateTest {

    @Test fun `single registration applies`() {
        val g = GeofenceRegistrationGate()
        val t = g.beginRegister("A")!!
        assertEquals(Outcome.APPLY, g.finish(t, succeeded = true))
    }

    @Test fun `overlapping sync for identical targets is deduplicated`() {
        val g = GeofenceRegistrationGate()
        val t = g.beginRegister("A")!!
        assertNull(g.beginRegister("A")) // e.g. setZones + syncCalendar on Home load
        assertEquals(Outcome.APPLY, g.finish(t, succeeded = true))
        assertNotNull(g.beginRegister("A")) // a later forced re-registration still runs
    }

    @Test fun `rapid ON then OFF - stale success forces a re-sync instead of re-registering`() {
        val g = GeofenceRegistrationGate()
        val on = g.beginRegister("A")!!
        g.beginRemoval() // Custom OFF while the add is still pending
        assertEquals(Outcome.STALE_RESYNC_NOW, g.finish(on, succeeded = true))
    }

    @Test fun `rapid ON then OFF - stale failure needs no repair`() {
        val g = GeofenceRegistrationGate()
        val on = g.beginRegister("A")!!
        g.beginRemoval()
        assertEquals(Outcome.STALE_DEFERRED, g.finish(on, succeeded = false))
    }

    @Test fun `rapid OFF then ON - the newest registration applies`() {
        val g = GeofenceRegistrationGate()
        g.beginRemoval()
        val on = g.beginRegister("A")!!
        assertEquals(Outcome.APPLY, g.finish(on, succeeded = true))
    }

    @Test fun `targets changed while registering - stale result deferred, newest applies then re-syncs`() {
        val g = GeofenceRegistrationGate()
        val a = g.beginRegister("A")!!
        val b = g.beginRegister("B")!!
        assertEquals(Outcome.STALE_DEFERRED, g.finish(a, succeeded = true))
        assertEquals(Outcome.APPLY_THEN_RESYNC, g.finish(b, succeeded = true))
        // The follow-up forced re-sync is a fresh registration that applies normally.
        val again = g.beginRegister("B")!!
        assertEquals(Outcome.APPLY, g.finish(again, succeeded = true))
    }

    @Test fun `newest finishes first, older succeeds later with nothing in flight - re-sync now`() {
        val g = GeofenceRegistrationGate()
        val a = g.beginRegister("A")!!
        val b = g.beginRegister("B")!!
        assertEquals(Outcome.APPLY, g.finish(b, succeeded = true))
        assertEquals(Outcome.STALE_RESYNC_NOW, g.finish(a, succeeded = true))
    }

    @Test fun `ON OFF ON burst converges on the last request`() {
        val g = GeofenceRegistrationGate()
        val first = g.beginRegister("A")!!
        g.beginRemoval()
        val last = g.beginRegister("A")!!
        assertEquals(Outcome.STALE_DEFERRED, g.finish(first, succeeded = true))
        assertEquals(Outcome.APPLY_THEN_RESYNC, g.finish(last, succeeded = true))
    }
}
