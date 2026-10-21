package com.SilenceFocus.comms

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Emergency Call Handling (Option A) and the 2-call urgent default. */
class SimCallModeTest {

    private val caller = "+919812345678"
    private val t0 = 1_000_000_000L
    private val min = 60_000L

    // ---- setting: defaults, persistence, unknown values

    @Test fun `new install and older install without a saved mode both read Ring Through DND`() {
        assertEquals(SimCallMode.RING_THROUGH_DND, CallSettings().simCallMode)
        assertEquals(SimCallMode.RING_THROUGH_DND, CommsStore(MemoryKeyValue()).callSettings.simCallMode)
        // An older install: call settings saved before the mode existed.
        val kv = MemoryKeyValue()
        kv.putBoolean("emergency_enabled", true)
        kv.putInt("urgent_threshold", 3)
        assertEquals(SimCallMode.RING_THROUGH_DND, CommsStore(kv).callSettings.simCallMode)
    }

    @Test fun `Alert Only persists across a restart (new store instance) and other settings are untouched`() {
        val kv = MemoryKeyValue()
        val store = CommsStore(kv)
        store.callSettings = store.callSettings.copy(simCallMode = SimCallMode.ALERT_ONLY, whatsAppNameMatch = true)
        val restored = CommsStore(kv).callSettings
        assertEquals(SimCallMode.ALERT_ONLY, restored.simCallMode)
        assertTrue(restored.whatsAppNameMatch)
        assertEquals("alert_only", kv.getString("sim_call_mode"))
        // Saving another setting keeps the mode.
        CommsStore(kv).callSettings = CommsStore(kv).callSettings.copy(urgentEnabled = false)
        assertEquals(SimCallMode.ALERT_ONLY, CommsStore(kv).callSettings.simCallMode)
    }

    @Test fun `unknown stored values fall back to Ring Through DND`() {
        listOf("", "ALERT_ONLY", "ring", "alert-only").forEach { raw ->
            val kv = MemoryKeyValue().apply { putString("sim_call_mode", raw) }
            assertEquals(raw, SimCallMode.RING_THROUGH_DND, CommsStore(kv).callSettings.simCallMode)
        }
        assertEquals(SimCallMode.ALERT_ONLY, SimCallMode.fromId("alert_only"))
        assertEquals(SimCallMode.RING_THROUGH_DND, SimCallMode.fromId(null))
    }

    @Test fun `logout clears the mode with the other call settings`() {
        val kv = MemoryKeyValue()
        CommsStore(kv).callSettings = CallSettings(simCallMode = SimCallMode.ALERT_ONLY)
        CommsStore(kv).clearUserData()
        assertEquals(SimCallMode.RING_THROUGH_DND, CommsStore(kv).callSettings.simCallMode)
    }

    // ---- urgent threshold 3 -> 2

    @Test fun `stored old default 3 becomes 2 once - other stored values and later choices are kept`() {
        val kv = MemoryKeyValue().apply { putInt("urgent_threshold", 3) }
        assertEquals(2, CommsStore(kv).callSettings.urgentThreshold)
        assertEquals(2, kv.getInt("urgent_threshold", -1))
        // Runs once: a 3 written after the migration (only possible through the native setter) stays.
        CommsStore(kv).callSettings = CommsStore(kv).callSettings.copy(urgentThreshold = 3)
        assertEquals(3, CommsStore(kv).callSettings.urgentThreshold)

        val custom = MemoryKeyValue().apply { putInt("urgent_threshold", 5) }
        assertEquals(5, CommsStore(custom).callSettings.urgentThreshold)
        assertEquals(2, CommsStore(MemoryKeyValue()).callSettings.urgentThreshold) // nothing stored
        assertEquals(2, CallSettings.migratedThreshold(3))
        assertEquals(4, CallSettings.migratedThreshold(4))
        assertNull(CallSettings.migratedThreshold(null))
    }

    private fun calls(vararg minutes: Long, d: CallDecider = CallDecider(emptyList(), CallSettings(), "salt")): List<CallOutcome> {
        var state = RepeatCallState()
        return minutes.map { m -> d.onCall(caller, true, true, t0 + m * min, state).also { state = it.state } }
    }

    @Test fun `default rule - 1st call silenced, 2nd within 15 min is urgent`() {
        val o = calls(0, 6)
        assertNull(o[0].breakthrough)
        assertEquals(1, o[0].repeatCount)
        assertEquals(CallDecider.REASON_BELOW_THRESHOLD, o[0].reason)
        assertEquals(BreakthroughKind.URGENT_REPEAT_CALLER, o[1].breakthrough)
        assertEquals(2, o[1].repeatCount)
    }

    @Test fun `default rule - 2nd call after the 15 min window is a new 1st call`() {
        val o = calls(0, 16)
        assertNull(o[1].breakthrough)
        assertEquals(1, o[1].repeatCount)
    }

    @Test fun `default rule - cooldown after the urgent call, then the counter starts again`() {
        val o = calls(0, 1, 2, 10, 17, 18)
        assertEquals(BreakthroughKind.URGENT_REPEAT_CALLER, o[1].breakthrough)
        assertEquals(CallDecider.REASON_COOLDOWN, o[2].reason) // within 15 min of the urgent call
        assertEquals(CallDecider.REASON_COOLDOWN, o[3].reason)
        assertNull(o[4].breakthrough) // cooldown over (16 min): counting restarts at 1
        assertEquals(1, o[4].repeatCount)
        assertEquals(BreakthroughKind.URGENT_REPEAT_CALLER, o[5].breakthrough)
    }

    @Test fun `WhatsApp urgent rule uses the same default of 2`() {
        var state = RepeatCallState()
        val r1 = WhatsAppCalls.repeat(CallSettings(), "wa:x", t0, state).also { state = it.state }
        val r2 = WhatsAppCalls.repeat(CallSettings(), "wa:x", t0 + 3 * min, state)
        assertFalse(r1.repeated)
        assertTrue(r2.repeated)
        assertEquals(2, r2.count)
    }

    // ---- the mode only changes the response, never the matching

    @Test fun `handling per mode - matching is identical, only the response differs`() {
        val mom = EmergencyContact("c", "Mom", caller)
        SimCallMode.values().forEach { mode ->
            val d = CallDecider(listOf(mom), CallSettings(simCallMode = mode), "salt")
            val o = d.onCall(caller, true, true, t0, RepeatCallState())
            assertEquals(BreakthroughKind.EMERGENCY_CONTACT, o.breakthrough)
            // Ordinary caller and Silent Focus off: nothing in either mode.
            val other = d.onCall("+919800000001", true, true, t0, RepeatCallState())
            assertEquals(SimCallAlerts.Handling.NONE, SimCallAlerts.handling(other.breakthrough, mode))
            val off = d.onCall(caller, true, silentActive = false, now = t0, state = RepeatCallState())
            assertEquals(SimCallAlerts.Handling.NONE, SimCallAlerts.handling(off.breakthrough, mode))
        }
        assertEquals(SimCallAlerts.Handling.RING_THROUGH, SimCallAlerts.handling(BreakthroughKind.EMERGENCY_CONTACT, SimCallMode.RING_THROUGH_DND))
        assertEquals(SimCallAlerts.Handling.RING_THROUGH, SimCallAlerts.handling(BreakthroughKind.URGENT_REPEAT_CALLER, SimCallMode.RING_THROUGH_DND))
        assertEquals(SimCallAlerts.Handling.ALERT, SimCallAlerts.handling(BreakthroughKind.EMERGENCY_CONTACT, SimCallMode.ALERT_ONLY))
        assertEquals(SimCallAlerts.Handling.ALERT, SimCallAlerts.handling(BreakthroughKind.URGENT_REPEAT_CALLER, SimCallMode.ALERT_ONLY))
    }

    // ---- Alert Only lifecycle

    private val rec = SimCallAlerts.Record("k1", BreakthroughKind.EMERGENCY_CONTACT, 0, t0)

    @Test fun `duplicate screening of the same call shows one alert`() {
        assertFalse(SimCallAlerts.isDuplicate(null, "k1", t0))
        assertTrue(SimCallAlerts.isDuplicate(rec, "k1", t0 + 5_000))
        assertFalse(SimCallAlerts.isDuplicate(rec, "k2", t0 + 5_000)) // another caller
        assertFalse(SimCallAlerts.isDuplicate(rec, "k1", t0 + SimCallAlerts.DUPLICATE_MS)) // a later call
    }

    @Test fun `answered removes the alert, missed or rejected leaves a silent notice, stale records do nothing`() {
        assertEquals(SimCallAlerts.EndAction.CANCEL, SimCallAlerts.onCallEnded(rec, answered = true, now = t0 + 8_000))
        assertEquals(SimCallAlerts.EndAction.ENDED_NOTICE, SimCallAlerts.onCallEnded(rec, answered = false, now = t0 + 25_000))
        assertEquals(SimCallAlerts.EndAction.NONE, SimCallAlerts.onCallEnded(null, answered = false, now = t0))
        assertEquals(SimCallAlerts.EndAction.NONE, SimCallAlerts.onCallEnded(rec, answered = false, now = t0 + SimCallAlerts.STALE_MS + 1))
        assertTrue(SimCallAlerts.ALERT_MS <= 30_000L) // the alert never sounds longer than ~30 s
    }

    @Test fun `record survives the store and is cleared with recent calls`() {
        val kv = MemoryKeyValue()
        val r = SimCallAlerts.Record("k1", BreakthroughKind.URGENT_REPEAT_CALLER, 2, t0)
        CommsStore(kv).simAlert = r
        assertEquals(r, CommsStore(kv).simAlert)
        CommsStore(kv).simAlert = null
        assertNull(CommsStore(kv).simAlert)
        CommsStore(kv).simAlert = r
        CommsStore(kv).clearRecentCalls()
        assertNull(CommsStore(kv).simAlert)
        assertNull(SimCallAlerts.Record.decode("garbage"))
    }

    @Test fun `private emergency alert names a confident contact while generic text stays private-safe`() {
        val (t, x) = SimCallAlerts.text(BreakthroughKind.EMERGENCY_CONTACT, 0, ended = false)
        assertEquals("Emergency phone call", t)
        assertTrue(x.contains("call screen"))
        assertTrue(SimCallAlerts.text(BreakthroughKind.EMERGENCY_CONTACT, 0, false, "Mom").second.startsWith("Mom is calling"))
        assertTrue(SimCallAlerts.text(BreakthroughKind.EMERGENCY_CONTACT, 0, true, "Mom").second.startsWith("Mom called you"))
        assertEquals("Urgent call" to "Someone has called 2 times. Answer on your phone's call screen.", SimCallAlerts.text(BreakthroughKind.URGENT_REPEAT_CALLER, 2, false))
        assertEquals("Emergency phone call ended", SimCallAlerts.text(BreakthroughKind.EMERGENCY_CONTACT, 0, ended = true).first)
        assertFalse(x.contains("Mom"))
    }
}
