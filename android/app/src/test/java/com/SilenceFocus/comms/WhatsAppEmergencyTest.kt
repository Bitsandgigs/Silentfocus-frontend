package com.SilenceFocus.comms

import com.SilenceFocus.comms.WhatsAppEmergency.CallerIds
import com.SilenceFocus.comms.WhatsAppEmergency.Kind
import com.SilenceFocus.comms.WhatsAppEmergency.Method
import com.SilenceFocus.comms.WhatsAppEmergency as E
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Emergency contacts / urgent callers for WhatsApp calls. Synthetic
 * WhatsApp-shaped identifiers; they model the documented notification
 * fields and don't prove what a given WhatsApp build exposes on a Samsung.
 */
class WhatsAppEmergencyTest {

    private val mum = EmergencyContact("c1", "Mum", "+919876543210")
    private val dad = EmergencyContact("c2", "Dad", "+919812345678")
    private val contacts = listOf(mum, dad)

    private fun match(ids: CallerIds, nameMatching: Boolean = false, enabled: Boolean = true) =
        E.match(contacts, ids, enabled, nameMatching)

    // ---- numbers WhatsApp exposes

    @Test fun `WhatsApp id in the conversation shortcut, tag or person key matches by number`() {
        assertEquals(Match(mum, Method.NUMBER), match(CallerIds(shortcutId = "919876543210@s.whatsapp.net")))
        assertEquals(Match(mum, Method.NUMBER), match(CallerIds(tag = "call:919876543210@s.whatsapp.net")))
        assertEquals(Match(dad, Method.NUMBER), match(CallerIds(personKey = "919812345678@c.us")))
    }

    @Test fun `tel person URI and a numeric title match by number (national or international format)`() {
        assertEquals(Match(mum, Method.NUMBER), match(CallerIds(personUri = "tel:+91%2098765%2043210")))
        assertEquals(Match(mum, Method.NUMBER), match(CallerIds(personUri = "tel:09876543210")))
        assertEquals(Match(dad, Method.NUMBER), match(CallerIds(title = "+91 98123 45678")))
    }

    @Test fun `WhatsApp Business ids look the same and match the same way`() {
        assertEquals(Match(mum, Method.NUMBER), match(CallerIds(shortcutId = "919876543210@s.whatsapp.net", title = "Mum")))
    }

    @Test fun `resolved contact numbers match as CONTACT`() {
        assertEquals(Match(dad, Method.CONTACT), match(CallerIds(contactNumbers = listOf("+919812345678"))))
    }

    // ---- Round 4: real-world number and contact variants

    @Test fun `numbers wrapped in direction marks or odd spaces still match`() {
        assertEquals(Match(mum, Method.NUMBER), match(CallerIds(title = "\u202A+91 98765 43210\u202C")))
        assertEquals(Match(mum, Method.NUMBER), match(CallerIds(title = "\u2068+91\u00A098765\u202F43210\u2069")))
        assertEquals(Match(mum, Method.NUMBER), match(CallerIds(personUri = "tel:\u202A+919876543210\u202C")))
        assertEquals("+919876543210", PhoneNumbers.normalize("\u202A+91 98765 43210\u202C"))
    }

    @Test fun `WhatsApp ids with a device suffix and in the person URI match by number`() {
        assertEquals(Match(mum, Method.NUMBER), match(CallerIds(shortcutId = "919876543210:12@s.whatsapp.net")))
        assertEquals(Match(dad, Method.NUMBER), match(CallerIds(personUri = "919812345678@s.whatsapp.net")))
        // Privacy ids (@lid) and group ids are not phone numbers.
        assertTrue(E.exposedNumbers(CallerIds(shortcutId = "123456789012345@lid")).isEmpty())
    }

    @Test fun `CallStyle person name or number is used like the title`() {
        assertEquals(Match(dad, Method.NUMBER), match(CallerIds(personName = "+91 98123 45678", title = "Incoming voice call")))
        assertEquals(Match(mum, Method.NAME), match(CallerIds(personName = "Mum", title = "Incoming voice call"), nameMatching = true))
    }

    @Test fun `the phone contact itself (lookup key in the person URI) matches without reading Contacts`() {
        val picked = EmergencyContact("3789r1-2B4D", "Mum", "+919876543210")
        val uri = "content://com.android.contacts/contacts/lookup/3789r1-2B4D/12"
        assertEquals("3789r1-2B4D", E.lookupKey(uri))
        assertEquals(E.Match(picked, Method.CONTACT), E.match(listOf(picked), CallerIds(personUri = uri), true, false))
        // Another contact's key: no match (and no name fallback when name matching is off).
        assertNull(E.match(listOf(picked), CallerIds(personUri = "content://com.android.contacts/contacts/lookup/other/9", title = "Mum"), true, false))
        assertNull(E.lookupKey("content://com.android.contacts/data/5"))
    }

    @Test fun `identity reports what WhatsApp showed - never the values themselves`() {
        val nameOnly = E.identify(contacts, CallerIds(title = "Mum"), enabled = true, nameMatching = false)
        assertNull(nameOnly.match)
        assertTrue(nameOnly.nameShown)
        assertFalse(nameOnly.numberShown)
        // Name matching would have recognised the emergency contact: the check can suggest it.
        assertTrue(nameOnly.nameWouldMatch)
        assertFalse(E.identify(contacts, CallerIds(title = "Someone else"), true, false).nameWouldMatch)
        val number = E.identify(contacts, CallerIds(shortcutId = "15550199@s.whatsapp.net", title = "Mum"), true, false)
        assertTrue(number.numberShown)
        assertFalse(number.nameWouldMatch) // a contradicting number always wins
        val generic = E.identify(contacts, CallerIds(title = "Incoming voice call"), true, true)
        assertFalse(generic.nameShown)
        assertNull(generic.match)
        val redactedNumberIsNotAName = E.identify(contacts, CallerIds(title = "+44 7700 900123"), true, true)
        assertFalse(redactedNumberIsNotAName.nameShown)
        assertTrue(redactedNumberIsNotAName.numberShown)
    }

    // ---- names

    @Test fun `name alone never matches unless the user turned name matching on`() {
        assertNull(match(CallerIds(title = "Mum")))
        assertEquals(Match(mum, Method.NAME), match(CallerIds(title = "Mum"), nameMatching = true))
        // Case, spacing and direction marks don't matter.
        assertEquals(Match(mum, Method.NAME), match(CallerIds(title = "‪ mum ‬"), nameMatching = true))
    }

    @Test fun `duplicate names never match by name`() {
        val twoMums = listOf(mum, EmergencyContact("c3", "Mum", "+447700900123"))
        assertNull(E.match(twoMums, CallerIds(title = "Mum"), enabled = true, nameMatching = true))
    }

    @Test fun `a known number that is not an emergency contact is never overridden by the name`() {
        // Someone else saved as "Mum" (or a changed name): the number decides.
        assertNull(match(CallerIds(shortcutId = "15550199@s.whatsapp.net", title = "Mum"), nameMatching = true))
        assertNull(match(CallerIds(contactNumbers = listOf("+15550199"), title = "Mum"), nameMatching = true))
    }

    @Test fun `unknown and hidden callers never match`() {
        listOf(
            CallerIds(),
            CallerIds(title = "WhatsApp"),
            CallerIds(title = "Incoming voice call"),
            CallerIds(title = "Unknown"),
            CallerIds(personUri = "tel:"),
            CallerIds(title = "Private number"),
        ).forEach { assertNull(it.toString(), match(it, nameMatching = true)) }
    }

    @Test fun `emergency contacts switched off - nothing matches`() {
        assertNull(match(CallerIds(shortcutId = "919876543210@s.whatsapp.net"), enabled = false))
        assertNull(E.match(emptyList(), CallerIds(shortcutId = "919876543210@s.whatsapp.net"), true, true))
    }

    @Test fun `ids that only look similar are not numbers`() {
        assertTrue(E.exposedNumbers(CallerIds(shortcutId = "group-12345@g.us", tag = "abc@s.whatsapp.net")).isEmpty())
        assertTrue(E.exposedNumbers(CallerIds(title = "Room 1234")).isEmpty())
    }

    // ---- urgent repeat callers (existing rule, WhatsApp state)

    @Test fun `third WhatsApp call within the window is urgent - once, then cooldown`() {
        val settings = CallSettings(urgentThreshold = 3, urgentWindowMinutes = 15, urgentCooldownMinutes = 15)
        var state = RepeatCallState()
        val t = 1_000_000L
        val r1 = WhatsAppCalls.repeat(settings, "wa:x", t, state).also { state = it.state }
        val r2 = WhatsAppCalls.repeat(settings, "wa:x", t + 60_000, state).also { state = it.state }
        val r3 = WhatsAppCalls.repeat(settings, "wa:x", t + 120_000, state).also { state = it.state }
        val r4 = WhatsAppCalls.repeat(settings, "wa:x", t + 180_000, state).also { state = it.state }
        assertFalse(r1.repeated)
        assertFalse(r2.repeated)
        assertTrue(r3.repeated)
        assertEquals(3, r3.count)
        assertFalse(r4.repeated) // cooldown
    }

    @Test fun `urgent rule off or unknown caller - never urgent`() {
        val off = CallSettings(urgentEnabled = false)
        var state = RepeatCallState()
        repeat(5) { i -> assertFalse(WhatsAppCalls.repeat(off, "wa:x", 1000L + i, state).also { state = it.state }.repeated) }
        repeat(5) { i -> assertFalse(WhatsAppCalls.repeat(CallSettings(), null, 1000L + i, RepeatCallState()).repeated) }
    }

    // ---- duplicate alerts, rate limit

    @Test fun `the same caller alerts once per gap - others still alert`() {
        val t = 5_000_000L
        val a = E.limit(emptyList(), "ec:c1", t)
        assertTrue(a.allowed)
        val dup = E.limit(a.history, "ec:c1", t + 5_000)
        assertFalse(dup.allowed)
        assertEquals(E.REASON_DUPLICATE, dup.reason)
        assertTrue(E.limit(a.history, "ec:c2", t + 5_000).allowed)
        assertTrue(E.limit(a.history, "ec:c1", t + E.PER_CALLER_GAP_MS).allowed)
    }

    @Test fun `no more than MAX_PER_WINDOW alerts in the window`() {
        var h = emptyList<E.Sent>()
        val t = 9_000_000L
        repeat(E.MAX_PER_WINDOW) { i -> E.limit(h, "k$i", t + i).also { assertTrue(it.allowed); h = it.history } }
        val blocked = E.limit(h, "k-next", t + 10)
        assertFalse(blocked.allowed)
        assertEquals(E.REASON_RATE_LIMIT, blocked.reason)
        assertTrue(E.limit(h, "k-next", t + E.WINDOW_MS + 10).allowed)
    }

    @Test fun `alert key prefers the matched emergency contact, else the hashed caller`() {
        assertEquals("ec:c1", E.alertKey(Match(mum, Method.NAME), "wa:abc"))
        assertEquals("wa:abc", E.alertKey(null, "wa:abc"))
    }

    // ---- privacy

    @Test fun `lock-screen text never contains a name or number`() {
        Kind.values().forEach { k ->
            val (t, x) = E.publicText(k, "WhatsApp")
            listOf(t, x).forEach { s ->
                assertFalse(s, s.contains("Mum"))
                assertFalse(s, Regex("\\d{3,}").containsMatchIn(s))
            }
        }
        // Round 4: the alert never shows the name, locked or unlocked (lock-screen settings vary).
        Kind.values().forEach { k ->
            val (t, x) = E.privateText(k, "WhatsApp", "Mum", 3)
            assertFalse(t + x, (t + x).contains("Mum"))
        }
        assertTrue(E.privateText(Kind.URGENT, "WhatsApp Business", null, 3).second.contains("3 times"))
    }

    @Test fun `notification text is short enough to read collapsed (Samsung shows about 40 characters)`() {
        assertEquals("Important Call Alert Test", E.TEST_TITLE)
        assertEquals("This is the alert for important WhatsApp calls.", E.TEST_TEXT)
        assertTrue(E.TEST_TEXT.length <= 50)
        Kind.values().forEach { k ->
            listOf("WhatsApp", "WhatsApp Business").forEach { app ->
                // The title alone says what is happening, and is the same locked and unlocked.
                val (pt, px) = E.publicText(k, app)
                val (t, _) = E.privateText(k, app, "Mum", 3)
                assertEquals(pt, t)
                assertTrue(t, t.length <= 40)
                assertTrue(px, px.length <= 40)
                assertTrue(t.startsWith(if (k == Kind.EMERGENCY) "Emergency" else "Urgent"))
            }
        }
        val (rt, rx) = E.repeatNoticeText("WhatsApp", 3)
        assertTrue(rt.length <= 40 && rx.length <= 45)
        assertFalse(Regex("\\d{5,}").containsMatchIn(rx))
    }

    @Test fun `sound readiness never claims more than Android can tell`() {
        val r = { outcome: String, sound: Boolean, ringer: Int, filter: Int, sf: Boolean -> EmergencyCallAlert.soundReadiness(outcome, sound, ringer, filter, sf) }

        // ringer 2 = normal, 1 = vibrate, 0 = silent; filter 1 = all, 2 = priority, 3 = none, 4 = alarms.
        assertEquals(EmergencyCallAlert.Sound.READY, r("SENT", true, 2, 1, false))
        assertEquals(EmergencyCallAlert.Sound.READY, r("SENT", true, 2, 2, true)) // Silent Focus's own DND lets the channel through
        assertEquals(EmergencyCallAlert.Sound.VIBRATE, r("SENT", true, 1, 2, true))
        assertEquals(EmergencyCallAlert.Sound.SILENT_MODE, r("SENT", true, 0, 2, true))
        assertEquals(EmergencyCallAlert.Sound.UNKNOWN, r("SENT", true, 2, 2, false)) // someone else's DND / Samsung mode
        assertEquals(EmergencyCallAlert.Sound.BLOCKED, r("SENT", true, 2, 3, true))
        assertEquals(EmergencyCallAlert.Sound.BLOCKED, r("SENT", true, 2, 4, true))
        assertEquals(EmergencyCallAlert.Sound.BLOCKED, r("SENT_SILENCED", true, 2, 2, true))
        assertEquals(EmergencyCallAlert.Sound.BLOCKED, r("CHANNEL_OFF", true, 2, 1, false))
        assertEquals(EmergencyCallAlert.Sound.BLOCKED, r("NOTIFICATIONS_OFF", true, 2, 1, false))
        assertEquals(EmergencyCallAlert.Sound.NO_SOUND, r("SENT", false, 2, 1, false))
    }

    @Test fun `alert outcome reflects what the user allowed`() {
        val ok = EmergencyCallAlert.Status(true, true, true, true, true, true)
        assertEquals(EmergencyCallAlert.SENT, EmergencyCallAlert.outcomeFor(ok))
        assertEquals(EmergencyCallAlert.SENT_SILENCED, EmergencyCallAlert.outcomeFor(ok.copy(overridesDnd = false)))
        assertEquals(EmergencyCallAlert.CHANNEL_OFF, EmergencyCallAlert.outcomeFor(ok.copy(channelEnabled = false)))
        assertEquals(EmergencyCallAlert.NOTIFICATIONS_OFF, EmergencyCallAlert.outcomeFor(ok.copy(notificationsAllowed = false)))
    }

    @Test fun `settings - alerts on by default, name matching opt-in, both cleared on logout`() {
        val store = CommsStore(MemoryKeyValue())
        assertTrue(store.callSettings.whatsAppAlertsEnabled)
        assertFalse(store.callSettings.whatsAppNameMatch)
        store.callSettings = store.callSettings.copy(whatsAppAlertsEnabled = false, whatsAppNameMatch = true)
        store.waAlertsSent = listOf(E.Sent("ec:c1", 1L))
        assertFalse(store.callSettings.whatsAppAlertsEnabled)
        assertTrue(store.callSettings.whatsAppNameMatch)
        store.clearUserData()
        assertTrue(store.callSettings.whatsAppAlertsEnabled)
        assertFalse(store.callSettings.whatsAppNameMatch)
        assertTrue(store.waAlertsSent.isEmpty())
    }

    private fun Match(c: EmergencyContact, m: Method) = E.Match(c, m)
}
