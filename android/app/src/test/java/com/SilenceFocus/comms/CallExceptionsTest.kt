package com.SilenceFocus.comms

import com.SilenceFocus.automation.Breakthrough
import com.SilenceFocus.automation.DeviceMode
import com.SilenceFocus.automation.deviceMode
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class PhoneNumbersTest {

    @Test fun `formatting and country code differences match`() {
        assertTrue(PhoneNumbers.sameNumber("+91 98765 43210", "098765-43210"))
        assertTrue(PhoneNumbers.sameNumber("+91 98765 43210", "(98765) 43210"))
        assertTrue(PhoneNumbers.sameNumber("0091 9876543210", "+919876543210"))
        assertTrue(PhoneNumbers.sameNumber("tel:+15550199", "555-0199"))
    }

    @Test fun `different numbers and short codes don't match loosely`() {
        assertFalse(PhoneNumbers.sameNumber("+91 98765 43210", "+91 98765 43211"))
        assertFalse(PhoneNumbers.sameNumber("121", "0121"))
        assertTrue(PhoneNumbers.sameNumber("121", "121"))
    }

    @Test fun `private or invalid numbers are not identities`() {
        assertNull(PhoneNumbers.normalize(null))
        assertNull(PhoneNumbers.normalize(""))
        assertNull(PhoneNumbers.normalize("Private"))
        assertNull(PhoneNumbers.normalize("*31#"))
        assertNull(PhoneNumbers.normalize("0000000"))
        assertFalse(PhoneNumbers.sameNumber(null, null))
    }

    @Test fun `redaction keeps country prefix and last four only`() {
        assertEquals("+91******3210", PhoneNumbers.redact("+91 98765 43210"))
        assertEquals("******3210", PhoneNumbers.redact("9876543210"))
        assertEquals("Unknown", PhoneNumbers.redact(null))
    }

    @Test fun `hashed key is stable across formats and never contains the number`() {
        val a = PhoneNumbers.hashedKey("+91 98765 43210", "salt")
        val b = PhoneNumbers.hashedKey("09876543210", "salt")
        assertEquals(a, b)
        assertFalse(a!!.contains("43210"))
        assertNotEquals(a, PhoneNumbers.hashedKey("+91 98765 43210", "other-salt"))
    }
}

class EmergencyContactTest {

    private val mom = EmergencyContact("c1", "Mom", "+919876543210")
    private fun decider(settings: CallSettings = CallSettings()) = CallDecider(listOf(mom), settings, "salt")
    private val now = 1_000_000_000L

    @Test fun `1 emergency contact while Normal needs no breakthrough`() {
        val o = decider().onCall("+919876543210", incoming = true, silentActive = false, now = now, state = RepeatCallState())
        assertNull(o.breakthrough)
        assertEquals(CallDecider.REASON_NOT_SILENT, o.reason)
        assertFalse(o.record)
    }

    @Test fun `2 emergency contact while Silent breaks through`() {
        val o = decider().onCall("+919876543210", true, true, now, RepeatCallState())
        assertEquals(BreakthroughKind.EMERGENCY_CONTACT, o.breakthrough)
        assertEquals("Mom", o.contact?.name)
    }

    @Test fun `3 non-emergency caller while Silent does not`() {
        val o = decider().onCall("+919812345678", true, true, now, RepeatCallState())
        assertNull(o.breakthrough)
        assertEquals(CallDecider.REASON_BELOW_THRESHOLD, o.reason)
        assertTrue(o.record)
    }

    @Test fun `4 differently formatted same number matches`() {
        listOf("098765 43210", "9876543210", "+91-98765-43210", "0091 98765 43210").forEach {
            assertEquals(it, BreakthroughKind.EMERGENCY_CONTACT, decider().onCall(it, true, true, now, RepeatCallState()).breakthrough)
        }
    }

    @Test fun `5 exception disabled`() {
        val o = decider(CallSettings(emergencyEnabled = false, urgentEnabled = false))
            .onCall("+919876543210", true, true, now, RepeatCallState())
        assertNull(o.breakthrough)
    }

    @Test fun `6 unknown or private caller`() {
        listOf(null, "", "Private", "Unknown").forEach {
            val o = decider().onCall(it, true, true, now, RepeatCallState())
            assertNull(o.breakthrough)
            assertEquals(CallDecider.REASON_UNKNOWN_CALLER, o.reason)
        }
    }

    @Test fun `ambiguous stored number never guesses an emergency contact`() {
        val ambiguous = listOf(
            mom,
            EmergencyContact("c2", "Someone else", "+449876543210"),
        )
        val o = CallDecider(ambiguous, CallSettings(), "salt")
            .onCall("9876543210", true, true, now, RepeatCallState())
        assertNull(o.breakthrough)
        assertNull(o.contact)
    }

    @Test fun `7 breakthrough ends and Silent Focus stays active`() {
        val bt = Breakthrough("EMERGENCY_CONTACT", since = now, until = now + Breakthrough.MAX_MS)
        // Rules still want silence the whole time; only the device is paused.
        assertEquals(DeviceMode.BREAKTHROUGH, deviceMode(decisionSilent = true, breakthrough = bt, now = now + 5_000))
        // Call stopped ringing: breakthrough cleared -> silent again.
        assertEquals(DeviceMode.SILENT, deviceMode(true, null, now + 20_000))
        // Safety expiry without a phone-state callback -> silent again.
        assertEquals(DeviceMode.SILENT, deviceMode(true, bt, now + Breakthrough.MAX_MS + 1))
        // A breakthrough never turns silence on by itself.
        assertEquals(DeviceMode.NORMAL, deviceMode(false, bt, now + 5_000))
    }

    @Test fun `duplicate contacts are stored once`() {
        val store = CommsStore(MemoryKeyValue())
        store.addEmergencyContact("a", "Mom", "+91 98765 43210")
        store.addEmergencyContact("b", "Mother", "098765 43210")
        assertEquals(1, store.emergencyContacts.size)
        assertEquals("Mother", store.emergencyContacts.single().name)
        assertNull(store.addEmergencyContact("c", "Nobody", "Private"))
    }
}

class UrgentRepeatCallerTest {

    private val caller = "+919812345678"
    private val t0 = 1_000_000_000L
    private val min = 60_000L
    /** These cases exercise the rule's mechanics with 3 calls (the default is 2 since 2026-10-14; see SimCallModeTest). */
    private fun decider(settings: CallSettings = CallSettings(urgentThreshold = 3), contacts: List<EmergencyContact> = emptyList()) =
        CallDecider(contacts, settings, "salt")

    /** Places calls at the given minute offsets; returns outcomes. */
    private fun calls(vararg minutes: Long, number: String = caller, d: CallDecider = decider(), start: RepeatCallState = RepeatCallState()): List<CallOutcome> {
        var state = start
        return minutes.map { m ->
            d.onCall(number, true, true, t0 + m * min, state).also { state = it.state }
        }
    }

    @Test fun `1 and 2 first and second calls are not urgent, 3 third within 15 min is`() {
        val o = calls(0, 4, 9)
        assertNull(o[0].breakthrough)
        assertEquals(1, o[0].repeatCount)
        assertNull(o[1].breakthrough)
        assertEquals(2, o[1].repeatCount)
        assertEquals(BreakthroughKind.URGENT_REPEAT_CALLER, o[2].breakthrough)
        assertEquals(3, o[2].repeatCount)
    }

    @Test fun `4 third call outside the window is not urgent`() {
        val o = calls(0, 10, 16) // first call has left the 15-minute window
        assertNull(o[2].breakthrough)
        assertEquals(2, o[2].repeatCount)
    }

    @Test fun `5 different callers are tracked separately`() {
        val d = decider()
        var s = RepeatCallState()
        listOf(caller, "+919800000001", caller, "+919800000001").forEachIndexed { i, n ->
            val o = d.onCall(n, true, true, t0 + i * min, s)
            assertNull(o.breakthrough)
            s = o.state
        }
        assertEquals(BreakthroughKind.URGENT_REPEAT_CALLER, d.onCall(caller, true, true, t0 + 5 * min, s).breakthrough)
    }

    @Test fun `6 outgoing calls are ignored`() {
        val d = decider()
        var s = RepeatCallState()
        repeat(5) { i ->
            val o = d.onCall(caller, incoming = false, silentActive = true, now = t0 + i * min, state = s)
            assertNull(o.breakthrough)
            assertFalse(o.record)
            s = o.state
        }
        assertTrue(s.calls.isEmpty())
    }

    @Test fun `7 cooldown after a breakthrough, then counting restarts`() {
        val o = calls(0, 1, 2, 3, 4, 17, 18, 19)
        assertEquals(BreakthroughKind.URGENT_REPEAT_CALLER, o[2].breakthrough)
        // Calls 4 and 5 (within the 15-min cooldown) don't retrigger or count.
        assertNull(o[3].breakthrough)
        assertEquals(CallDecider.REASON_COOLDOWN, o[3].reason)
        assertNull(o[4].breakthrough)
        // After the cooldown a fresh sequence of 3 is needed.
        assertNull(o[5].breakthrough)
        assertEquals(1, o[5].repeatCount)
        assertNull(o[6].breakthrough)
        assertEquals(BreakthroughKind.URGENT_REPEAT_CALLER, o[7].breakthrough)
    }

    @Test fun `8 stale calls expire and state stays bounded`() {
        val o = calls(0, 1)
        val later = o.last().state.pruned(t0 + 60 * min, 15 * min)
        assertTrue(later.calls.isEmpty())
        var s = RepeatCallState()
        val d = decider()
        repeat(RepeatCallState.MAX_RECORDS + 50) { i ->
            s = d.onCall("+91980000${1000 + i}", true, true, t0 + i, s).state
        }
        assertTrue(s.calls.size <= RepeatCallState.MAX_RECORDS)
    }

    @Test fun `9 feature disabled`() {
        val o = calls(0, 1, 2, 3, d = decider(CallSettings(urgentEnabled = false)))
        assertTrue(o.all { it.breakthrough == null })
        assertEquals(CallDecider.REASON_DISABLED, o[2].reason)
    }

    @Test fun `10 emergency contact takes priority and isn't counted`() {
        val d = decider(contacts = listOf(EmergencyContact("c", "Mom", caller)))
        val o = calls(0, 1, 2, d = d)
        assertTrue(o.all { it.breakthrough == BreakthroughKind.EMERGENCY_CONTACT })
        assertTrue(o.last().state.calls.isEmpty())
    }

    @Test fun `calls while not silent are not counted`() {
        val d = decider()
        var s = RepeatCallState()
        repeat(2) { i -> s = d.onCall(caller, true, silentActive = false, now = t0 + i * min, state = s).state }
        assertNull(d.onCall(caller, true, true, t0 + 3 * min, s).breakthrough)
    }

    @Test fun `threshold and window are settings`() {
        val o = calls(0, 20, d = decider(CallSettings(urgentThreshold = 2, urgentWindowMinutes = 30)))
        assertEquals(BreakthroughKind.URGENT_REPEAT_CALLER, o[1].breakthrough)
    }

    @Test fun `repeat state survives a store round trip`() {
        val kv = MemoryKeyValue()
        val o = calls(0, 1)
        CommsStore(kv).repeatCallState = o.last().state
        val restored = CommsStore(kv).repeatCallState
        assertEquals(o.last().state, restored)
        assertEquals(BreakthroughKind.URGENT_REPEAT_CALLER, decider().onCall(caller, true, true, t0 + 2 * min, restored).breakthrough)
        CommsStore(kv).clearRecentCalls()
        assertTrue(CommsStore(kv).repeatCallState.calls.isEmpty())
        assertNotNull(CommsStore(kv).salt)
    }
}

/** In-memory KeyValue for store tests. */
class MemoryKeyValue : KeyValue {
    private val map = HashMap<String, Any?>()
    override fun getString(key: String) = map[key] as? String
    override fun putString(key: String, value: String?) { map[key] = value }
    override fun getBoolean(key: String, def: Boolean) = map[key] as? Boolean ?: def
    override fun putBoolean(key: String, value: Boolean) { map[key] = value }
    override fun getInt(key: String, def: Int) = map[key] as? Int ?: def
    override fun putInt(key: String, value: Int) { map[key] = value }
    override fun remove(keys: List<String>) { keys.forEach { map.remove(it) } }
}
