package com.SilenceFocus.comms

import android.app.Notification
import com.SilenceFocus.comms.WhatsAppCallCheck as C
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Round 4 – "Check WhatsApp Call Alerts": lifecycle, what it records and what it never records. */
class WhatsAppCallCheckTest {

    private val now = 1_791_620_000_000L

    private fun ringing(pkg: String = "com.whatsapp") = WhatsAppCalls.Signals(
        pkg, Notification.CATEGORY_CALL, null, null, ongoing = true, hasFullScreenIntent = true,
        isGroupConversation = false, isGroupSummary = false, importance = 4, actionCount = 2, channel = "voip_notification_11",
    )

    private fun message() = WhatsAppCalls.Signals(
        "com.whatsapp", Notification.CATEGORY_MESSAGE, "android.app.Notification\$MessagingStyle", null,
        ongoing = false, hasFullScreenIntent = false, isGroupConversation = false, isGroupSummary = false,
    )

    private fun handled(
        alert: String? = null,
        matchedBy: String? = null,
        kind: WhatsAppEmergency.Kind? = null,
        identity: WhatsAppEmergency.Identity? = WhatsAppEmergency.Identity(null, numberShown = false, nameShown = true, nameWouldMatch = false),
        repeat: Int = 1,
    ) = WhatsAppCallRecorder.Handled(WhatsAppCalls.State.INCOMING, kind, alert, matchedBy, identity, repeat, callerKnown = true)

    @Test fun `off by default - nothing is recorded until the user starts it`() {
        val kv = MemoryKeyValue()
        assertFalse(C.running(kv, now))
        C.sawNotification(kv, ringing(), WhatsAppCalls.State.INCOMING, now)
        C.sawCall(kv, "com.whatsapp", handled(), true, "ref1", now)
        assertNull(C.load(kv))
        assertNull(kv.getString(C.KEY))
    }

    @Test fun `runs for a short window only, then stops recording by itself`() {
        val kv = MemoryKeyValue()
        C.start(kv, now)
        assertTrue(C.running(kv, now + 1_000))
        assertFalse(C.running(kv, now + C.DURATION_MS))
        C.sawCall(kv, "com.whatsapp", handled(), true, "late", now + C.DURATION_MS + 1)
        assertEquals(0, C.load(kv)!!.calls)
        assertTrue(C.DURATION_MS <= 5 * 60_000L)
    }

    @Test fun `stop ends recording - the result is deleted when closed or after a while`() {
        val kv = MemoryKeyValue()
        C.start(kv, now)
        C.stop(kv, now + 10_000)
        assertFalse(C.running(kv, now + 11_000))
        assertNotNull(C.read(kv, now + 11_000))
        // Old results delete themselves.
        assertNull(C.read(kv, now + 10_000 + C.KEEP_MS + 1))
        assertNull(kv.getString(C.KEY))
        C.start(kv, now)
        C.clear(kv)
        assertNull(C.read(kv, now))
    }

    @Test fun `a detected emergency call - every step reported`() {
        val kv = MemoryKeyValue()
        C.start(kv, now)
        C.sawNotification(kv, ringing(), WhatsAppCalls.State.INCOMING, now + 1)
        C.sawCall(kv, "com.whatsapp", handled(alert = EmergencyCallAlert.SENT, matchedBy = "NUMBER", kind = WhatsAppEmergency.Kind.EMERGENCY,
            identity = WhatsAppEmergency.Identity(null, numberShown = true, nameShown = true, nameWouldMatch = false)), true, "ref1", now + 2)
        val r = C.load(kv)!!
        assertTrue(r.waSeen && r.callLikeSeen && r.ringing && r.callerIdentified && r.numberShown && r.emergencyMatched && r.alertAttempted)
        assertEquals("NUMBER", r.matchedBy)
        assertEquals(EmergencyCallAlert.SENT, r.alertOutcome)
        assertEquals("WhatsApp", r.app)
        assertEquals(1, r.silentFocusOn)
        assertEquals(1, r.calls)
        assertTrue(r.shapeRinging)
    }

    @Test fun `each call is counted once - updates of one notification are ignored`() {
        val kv = MemoryKeyValue()
        C.start(kv, now)
        repeat(3) { C.sawCall(kv, "com.whatsapp.w4b", handled(repeat = 1), false, "ref1", now + it) }
        C.sawCall(kv, "com.whatsapp.w4b", handled(repeat = 2), false, "ref2", now + 10)
        val r = C.load(kv)!!
        assertEquals(2, r.calls)
        assertEquals("WhatsApp Business", r.app)
        assertEquals(0, r.silentFocusOn)
    }

    @Test fun `urgent rule reached and blocked alerts are told apart from attempted ones`() {
        val kv = MemoryKeyValue()
        C.start(kv, now)
        C.sawCall(kv, "com.whatsapp", handled(alert = WhatsAppEmergency.REASON_DUPLICATE, kind = WhatsAppEmergency.Kind.URGENT, repeat = 3), true, "r3", now + 1)
        var r = C.load(kv)!!
        assertTrue(r.urgentReached)
        assertEquals(3, r.repeatCount)
        assertFalse(r.alertAttempted)
        assertEquals(WhatsAppEmergency.REASON_DUPLICATE, r.alertOutcome)
        C.sawCall(kv, "com.whatsapp", handled(alert = EmergencyCallAlert.SENT_SILENCED, kind = WhatsAppEmergency.Kind.URGENT, repeat = 3), true, "r4", now + 2)
        r = C.load(kv)!!
        assertTrue(r.alertAttempted)
        assertEquals(EmergencyCallAlert.SENT_SILENCED, r.alertOutcome)
    }

    @Test fun `name-only caller that name matching would recognise is reported (as a yes-no)`() {
        val kv = MemoryKeyValue()
        C.start(kv, now)
        C.sawCall(kv, "com.whatsapp", handled(identity = WhatsAppEmergency.Identity(null, false, true, nameWouldMatch = true)), true, "r", now)
        val r = C.load(kv)!!
        assertTrue(r.nameWouldMatch)
        assertFalse(r.emergencyMatched)
    }

    @Test fun `a call that was not recognised still leaves its structure for support, and messages are not calls`() {
        val kv = MemoryKeyValue()
        C.start(kv, now)
        C.sawNotification(kv, message(), null, now)
        var r = C.load(kv)!!
        assertTrue(r.waSeen)
        assertFalse(r.callLikeSeen)
        assertEquals("", r.shape)
        val odd = ringing().copy(hasFullScreenIntent = false, importance = 3, actionCount = 2)
        C.sawNotification(kv, odd, WhatsAppCalls.classify(odd), now + 1)
        r = C.load(kv)!!
        assertTrue(r.callLikeSeen)
        assertFalse(r.ringing)
        assertTrue(r.shape, r.shape.startsWith("cat=call "))
    }

    @Test fun `an alert cut short by WhatsApp is reported`() {
        val kv = MemoryKeyValue()
        C.start(kv, now)
        C.alertStopped(kv, 1_200, now + 5)
        assertEquals(1_200L, C.load(kv)!!.alertStoppedAfterMs)
    }

    @Test fun `stored result holds no caller data and is cleared at logout`() {
        val store = CommsStore(MemoryKeyValue())
        val kv = store.callCheck
        C.start(kv, now)
        C.sawNotification(kv, ringing(), WhatsAppCalls.State.INCOMING, now)
        C.sawCall(kv, "com.whatsapp", handled(matchedBy = "NAME", alert = "SENT"), true, "ref-salted-hash", now)
        val raw = kv.getString(C.KEY)!!
        listOf("Mum", "+91", "98765", "@s.whatsapp.net", "content://", "tel:").forEach { assertFalse(it, raw.contains(it)) }
        store.clearUserData()
        assertNull(C.load(kv))
    }

    @Test fun `a call notification's shape is kept over a later missed-call one`() {
        val kv = MemoryKeyValue()
        C.start(kv, now)
        val unrecognised = WhatsAppCalls.Signals(
            "com.whatsapp", Notification.CATEGORY_CALL, null, null, ongoing = true, hasFullScreenIntent = false,
            isGroupConversation = false, isGroupSummary = false, importance = 2, actionCount = 0, channel = "voip_notification_11",
        )
        val missed = WhatsAppCalls.Signals(
            "com.whatsapp", WhatsAppCalls.CATEGORY_MISSED_CALL, null, null, ongoing = false, hasFullScreenIntent = false,
            isGroupConversation = false, isGroupSummary = false, importance = 2, actionCount = 2, channel = "silent_notifications_3",
        )
        C.sawNotification(kv, unrecognised, WhatsAppCalls.classify(unrecognised), now + 1)
        C.sawNotification(kv, missed, WhatsAppCalls.State.MISSED, now + 2)
        val r = C.load(kv)!!
        assertTrue(r.shape.startsWith("cat=call "))
        assertTrue(r.missed)
        // Only a missed call seen: its shape is reported.
        val kv2 = MemoryKeyValue()
        C.start(kv2, now)
        C.sawNotification(kv2, missed, WhatsAppCalls.State.MISSED, now + 1)
        assertTrue(C.load(kv2)!!.shape.startsWith("cat=missed_call "))
    }

    @Test fun `a silenced missed call is recorded as detected but not ringing`() {
        val kv = MemoryKeyValue()
        C.start(kv, now)
        val h = WhatsAppCallRecorder.Handled(
            WhatsAppCalls.State.MISSED, WhatsAppEmergency.Kind.EMERGENCY, EmergencyCallAlert.SENT, "NUMBER",
            WhatsAppEmergency.Identity(null, numberShown = true, nameShown = true, nameWouldMatch = false), 0, callerKnown = true, silenced = true,
        )
        C.sawCall(kv, "com.whatsapp", h, true, "m1", now + 1, ringing = false)
        val r = C.load(kv)!!
        assertFalse(r.ringing)
        assertTrue(r.silenced)
        assertTrue(r.emergencyMatched)
        assertTrue(r.alertAttempted)
    }
}
