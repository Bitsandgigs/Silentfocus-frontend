package com.SilenceFocus.comms

import com.SilenceFocus.comms.NotificationPreviews.Message
import com.SilenceFocus.comms.NotificationPreviews as P
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Client Issues #10 (ephemeral previews) and #11 (open the Phone app). */
class PreviewsAndPhoneTest {

    @Test fun `preview only while the notification is posted and the phone is unlocked`() {
        assertEquals(P.Preview(P.TEXT, "See you at 5"), P.decide(found = true, locked = false, text = "See you at 5"))
        assertEquals(P.Preview(P.GONE), P.decide(found = false, locked = false, text = null))
        // Locked: nothing, even if the notification is there.
        assertEquals(P.Preview(P.HIDDEN_LOCKED), P.decide(found = true, locked = true, text = "secret"))
        assertEquals(P.Preview(P.NONE), P.decide(found = true, locked = false, text = "   "))
    }

    @Test fun `text is one line and capped`() {
        assertEquals("a b c", P.sanitize(" a\n b\t\tc "))
        assertNull(P.sanitize(null))
        assertNull(P.sanitize("\n \n"))
        val long = P.sanitize("x".repeat(500))!!
        assertEquals(P.MAX_CHARS, long.length)
        assertTrue(long.endsWith("…"))
    }

    @Test fun `Round 3 - each row previews its own message, never a newer one`() {
        val thread = listOf(
            Message(fromUser = false, text = "First", at = 100L),
            Message(fromUser = true, text = "Busy (auto reply)", at = 150L),
            Message(fromUser = false, text = "Second", at = 200L),
        )
        assertEquals("First", P.previewText(thread, "Second", messageAt = 100L))
        assertEquals("Second", P.previewText(thread, "Second", messageAt = 200L))
        // Dropped from the notification: no preview (not the newest instead).
        assertNull(P.previewText(thread, "Second", messageAt = 50L))
        // Our own message is never a preview, even if its time matches.
        assertNull(P.previewText(thread, "Second", messageAt = 150L))
        // A row with a message time but a notification without messages: nothing.
        assertNull(P.previewText(null, "fallback", messageAt = 100L))
        // Older-format rows (no time) keep the newest message.
        assertEquals("Second", P.previewText(thread, "x"))
    }

    @Test fun `our own replies are never the preview`() {
        val thread = listOf(
            Message(fromUser = false, text = "Are you free?"),
            Message(fromUser = true, text = "I'm busy right now (auto reply)"),
        )
        assertEquals("Are you free?", P.previewText(thread, fallbackText = "I'm busy right now (auto reply)"))
        // Only our messages: no preview rather than our own text.
        assertNull(P.previewText(listOf(Message(true, "auto")), "auto"))
        // No messaging style: the notification text.
        assertEquals("Hello", P.previewText(null, "Hello"))
        assertEquals("Hello", P.previewText(emptyList(), "Hello"))
    }

    @Test fun `phone rows - call history first, then the dialer, else unavailable`() {
        assertEquals(listOf(PhoneApp.CALL_LOG, PhoneApp.DIALER), PhoneApp.ORDER)
        val tried = mutableListOf<String>()
        assertEquals(PhoneApp.CALL_LOG, PhoneApp.openFirst(PhoneApp.ORDER) { tried += it; true })
        assertEquals(listOf(PhoneApp.CALL_LOG), tried)
        assertEquals(PhoneApp.DIALER, PhoneApp.openFirst(PhoneApp.ORDER) { it == PhoneApp.DIALER })
        assertEquals(PhoneApp.UNAVAILABLE, PhoneApp.openFirst(PhoneApp.ORDER) { false })
        // A crashing start counts as "could not open".
        assertEquals(PhoneApp.DIALER, PhoneApp.openFirst(PhoneApp.ORDER) { if (it == PhoneApp.CALL_LOG) throw IllegalStateException() else true })
    }

    @Test fun `preview code never writes, logs or uploads text (source check)`() {
        val src = java.io.File("src/main/java/com/SilenceFocus/comms/NotificationPreviews.kt").readText()
        listOf("Log.", "appendEvent", "putString", "SharedPreferences", "edit()", "println").forEach {
            assertTrue("must not use $it", !src.contains(it))
        }
    }
}
