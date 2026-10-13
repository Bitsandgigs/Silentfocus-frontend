package com.SilenceFocus.comms

import com.SilenceFocus.comms.NotificationNames as N
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Round 3 #1 / #2: caller and sender names from synthetic WhatsApp-shaped
 * notification fields. These fixtures model the documented notification
 * structure; they do not prove what a given WhatsApp build posts on a
 * Samsung phone (see docs/WHATSAPP_CALLS.md for the device checks).
 */
class NotificationNamesTest {

    private val wa = WhatsAppCalls.APPS.values

    // ---- #1 callers

    @Test fun `CallStyle person name wins, for WhatsApp and WhatsApp Business`() {
        assertEquals("Priya Sharma", N.callerName("Priya Sharma", "Incoming voice call", wa))
        assertEquals("Acme Support", N.callerName("Acme Support", "WhatsApp Business", wa))
    }

    @Test fun `pre-CallStyle and missed calls fall back to the title`() {
        assertEquals("Priya Sharma", N.callerName(null, "Priya Sharma", wa))
        assertEquals("Priya Sharma", N.callerName("", "Priya Sharma", wa))
        // Missed-call notifications often append a count.
        assertEquals("Priya Sharma", N.callerName(null, "Priya Sharma (2)", wa))
        assertEquals("Priya Sharma", N.callerName(null, "Priya Sharma (3 missed calls)", wa))
    }

    @Test fun `generic headings are never a caller name - Unknown caller instead`() {
        listOf(
            "WhatsApp", "WhatsApp Business", "whatsapp", "Missed voice call", "Missed video call", "Missed call",
            "3 missed calls", "2 missed voice calls", "Incoming voice call", "Incoming video call", "Ongoing voice call",
            "Calling…", "Ringing...", "WhatsApp call", "Voice call", "Unknown", "  ", "…", "•",
            "4 missed calls from 2 chats", "WhatsApp · 2 missed calls",
        ).forEach { assertNull(it, N.callerName(null, it, wa)) }
        assertNull(N.callerName(null, null, wa))
    }

    @Test fun `a bare number (not a contact) is shown only redacted`() {
        val name = N.callerName(null, "+91 98765 43210", wa)!!
        assertEquals("+91******3210", name)
        assertTrue(!name.contains("98765"))
    }

    @Test fun `invisible direction marks and whitespace are cleaned, long names capped`() {
        assertEquals("Ana María", N.clean("‪Ana  María‬"))
        val long = N.clean("x".repeat(200))!!
        assertEquals(N.MAX_CHARS, long.length)
        assertTrue(long.endsWith("…"))
    }

    // ---- #2 senders

    @Test fun `one-to-one message - the message person, else conversation title, else title`() {
        assertEquals(N.Sender("Rahul", null), N.messageSender(false, "Rahul", null, "Rahul", wa))
        assertEquals(N.Sender("Rahul", null), N.messageSender(false, null, "Rahul", "WhatsApp", wa))
        assertEquals(N.Sender("Rahul", null), N.messageSender(false, null, null, "Rahul (2 messages)", wa))
        assertEquals(N.Sender("Rahul", null), N.messageSender(false, null, null, "Rahul (3 new messages)", wa))
    }

    @Test fun `group message - sender is the person, the group is separate and never the sender`() {
        assertEquals(N.Sender("Rahul", "Family"), N.messageSender(true, "Rahul", "Family", "Family: Rahul", wa))
        // Sender unknown: the group name is kept as the group only.
        assertEquals(N.Sender(null, "Family"), N.messageSender(true, null, "Family", "Family", wa))
        assertEquals(N.Sender(null, "Family"), N.messageSender(true, "Family", "Family", null, wa))
    }

    @Test fun `summary or generic message titles are not a sender`() {
        assertEquals(N.Sender(null, null), N.messageSender(false, null, null, "WhatsApp", wa))
        assertEquals(N.Sender(null, null), N.messageSender(false, null, null, "5 new messages", wa))
        assertEquals(N.Sender(null, null), N.messageSender(false, null, "12 messages from 3 chats", null, wa))
        // Another messaging app: its own label is not a sender either.
        assertEquals(N.Sender(null, null), N.messageSender(false, null, null, "Messages", listOf("Messages")))
    }

    @Test fun `names never leave the phone - local-only fields are listed for outbox stripping`() {
        assertEquals(listOf("displayName", "groupName", "messageAt"), N.LOCAL_ONLY_FIELDS)
    }
}
