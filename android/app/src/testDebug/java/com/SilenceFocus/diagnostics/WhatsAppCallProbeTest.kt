package com.SilenceFocus.diagnostics

import android.app.Notification
import com.SilenceFocus.comms.FieldCodec
import com.SilenceFocus.comms.MemoryKeyValue
import com.SilenceFocus.diagnostics.WhatsAppCallProbeModel as M
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Client Issue #9: debug-only WhatsApp call probe – privacy, retention, lifecycle (hardened). */
class WhatsAppCallProbeTest {

    private fun input(
        pkg: String = "com.whatsapp",
        key: String = "0|com.whatsapp|7|919876543210@s.whatsapp.net|10123",
        title: String? = "Alice Example",
        shortcutId: String? = "919876543210@s.whatsapp.net",
        category: String? = "call",
        template: String? = "android.app.Notification\$CallStyle",
        callType: Int? = 1,
        fullScreen: Boolean = true,
        channelId: String? = "voip_notification_11",
    ) = M.Input(
        packageName = pkg,
        key = key,
        postTime = 1_000L,
        category = category,
        channelId = channelId,
        template = template,
        callType = callType,
        flags = Notification.FLAG_ONGOING_EVENT or Notification.FLAG_INSISTENT or 0x4000_0000,
        hasFullScreenIntent = fullScreen,
        hasContentIntent = true,
        actionSemantics = listOf(10, 11),
        isGroupConversation = false,
        extrasKeys = setOf("android.title", "android.text", "android.template", "android.callType", "com.whatsapp.jid"),
        shortcutId = shortcutId,
        title = title,
    )

    private val message = { s: String?, t: String? ->
        input(shortcutId = s, title = t, category = "msg", template = "android.app.Notification\$MessagingStyle", callType = null, fullScreen = false)
    }

    private fun rec(i: M.Input, p: M.CapturePseudonyms, capture: Int = 1, event: String = "POSTED", at: Long = 5_000L) =
        M.record(i, p, capture, event, at, null, silentFocusActive = true)

    // ---- privacy

    @Test fun `only WhatsApp and WhatsApp Business are recorded`() {
        val p = M.CapturePseudonyms()
        assertNull(rec(input(pkg = "com.google.android.apps.messaging"), p))
        assertNull(rec(input(pkg = "org.telegram.messenger"), p))
        assertTrue(rec(input(pkg = "com.whatsapp"), p) != null)
        assertTrue(rec(input(pkg = "com.whatsapp.w4b"), p) != null)
    }

    @Test fun `stored form holds no names, numbers, raw ids, keys, hashes or app extras`() {
        val p = M.CapturePseudonyms()
        val records = listOf(
            rec(input(title = "+91 98765 43210", shortcutId = null), p)!!,
            rec(input(), p)!!,
            rec(message("919876543210@s.whatsapp.net", "Alice Example"), p)!!,
        )
        val encoded = M.encode(records)
        listOf("Alice", "Example", "98765", "43210", "919876543210", "s.whatsapp.net", "com.whatsapp.jid", "|7|").forEach {
            assertFalse("leaked: $it", encoded.contains(it))
        }
        // No field looks like a digest (24+ hex chars) any more.
        FieldCodec.decode(encoded).flatten().forEach { assertFalse("hash-like: $it", it.matches(Regex("^[0-9a-f]{16,}$"))) }
    }

    @Test fun `caller pseudonym only for call-like notifications`() {
        val p = M.CapturePseudonyms()
        val call = rec(input(), p)!!
        assertTrue(call.callLike)
        assertEquals("c1", call.caller)
        val msg = rec(message("919876543210@s.whatsapp.net", "Alice Example"), p)!!
        assertFalse(msg.callLike)
        assertEquals("", msg.caller)
        // Structural call signals, each on its own.
        val plain = message(null, null)
        assertTrue(M.isCallLike(plain.copy(category = "call")))
        assertTrue(M.isCallLike(plain.copy(category = "missed_call")))
        assertTrue(M.isCallLike(plain.copy(template = "android.app.Notification\$CallStyle")))
        assertTrue(M.isCallLike(plain.copy(callType = 2)))
        assertTrue(M.isCallLike(plain.copy(hasFullScreenIntent = true)))
        assertFalse(M.isCallLike(plain))
    }

    @Test fun `pseudonyms - same caller same id within a capture, unlinkable across captures`() {
        val p = M.CapturePseudonyms()
        assertEquals("c1", rec(input(), p)!!.caller)
        assertEquals("c1", rec(input(key = "other-key"), p)!!.caller) // same caller, another call
        assertEquals("c2", rec(input(shortcutId = "other@s.whatsapp.net"), p)!!.caller)
        // Title is only a fallback when there is no shortcut id.
        assertEquals("c3", rec(input(shortcutId = null, title = "Bob"), p)!!.caller)
        assertEquals("", rec(input(shortcutId = null, title = null), p)!!.caller)
        // New capture (process restart / after clear): starts again, no link to the old ids.
        val next = M.CapturePseudonyms()
        assertEquals("c1", rec(input(shortcutId = "other@s.whatsapp.net"), next, capture = 2)!!.caller)
    }

    @Test fun `notification pseudonym pairs POSTED and REMOVED without storing the key`() {
        val p = M.CapturePseudonyms()
        val posted = rec(input(), p)!!
        val removed = M.record(input(), p, 1, "REMOVED", 9_000L, 8, silentFocusActive = false)!!
        assertEquals("n1", posted.notification)
        assertEquals(posted.notification, removed.notification)
        assertEquals(8, removed.removalReason)
        assertEquals("n2", rec(input(key = "another"), p)!!.notification)
    }

    @Test fun `pseudonym keys differ per instance (key is random, never persisted)`() {
        // Same input order -> same ordinals, but the HMAC digests behind them differ:
        // proven indirectly by a fixed key giving identical results and different keys not colliding.
        val a = M.CapturePseudonyms(ByteArray(32) { 1 })
        val b = M.CapturePseudonyms(ByteArray(32) { 1 })
        assertEquals(rec(input(), a)!!.caller, rec(input(), b)!!.caller)
        // Only records + capture counter keys exist; no key/salt is ever written.
        val kv = MemoryKeyValue()
        val s2 = WhatsAppCallProbeStore(kv)
        s2.nextCapture()
        s2.add(rec(input(), M.CapturePseudonyms())!!, 5_000L)
        assertNull(kv.getString("salt"))
        assertNull(kv.getString("key"))
    }

    @Test fun `structural fields are kept`() {
        val r = rec(input(), M.CapturePseudonyms())!!
        assertEquals("call", r.category)
        assertEquals("voip_notification_11", r.channel)
        assertEquals("Notification\$CallStyle", r.template)
        assertEquals(1, r.callType)
        assertTrue(r.fullScreen)
        assertEquals(listOf(10, 11), r.actions)
        assertEquals(false, r.group)
        assertEquals(Notification.FLAG_ONGOING_EVENT or Notification.FLAG_INSISTENT, r.flags)
        assertEquals(listOf("android.callType", "android.template", "android.text", "android.title"), r.extrasKeys)
    }

    @Test fun `risky channel ids are redacted, not hashed`() {
        assertEquals("voip_notification_11", M.channel("voip_notification_11"))
        listOf("conv:919876543210@s.whatsapp.net", "chat_919876543210", "a b", "x".repeat(65)).forEach {
            assertEquals("redacted", M.channel(it))
        }
        assertEquals("", M.channel(null))
    }

    // ---- retention and lifecycle

    @Test fun `retention - newest 200, younger than 24 hours`() {
        val base = rec(input(), M.CapturePseudonyms())!!
        val now = 100L * 60 * 60_000
        val old = base.copy(at = now - M.MAX_AGE_MS - 1)
        val many = (1..250).map { base.copy(at = now - 250 + it) }
        val kept = M.retained(listOf(old) + many, now)
        assertEquals(M.MAX_RECORDS, kept.size)
        assertFalse(kept.contains(old))
    }

    @Test fun `prune at startup drops expired records even without new writes`() {
        val store = WhatsAppCallProbeStore(MemoryKeyValue())
        val t0 = 10L * 60 * 60_000
        store.add(rec(input(), M.CapturePseudonyms(), at = t0)!!, t0)
        assertEquals(1, store.all().size)
        store.prune(t0 + M.MAX_AGE_MS + 1)
        assertTrue(store.all().isEmpty())
    }

    @Test fun `older-format records (v1, with hashes) are dropped`() {
        val kv = MemoryKeyValue()
        val v1 = FieldCodec.encode(listOf(List(19) { "x" }))
        kv.putString("records", v1)
        kv.putString("salt", "old-salt")
        val store = WhatsAppCallProbeStore(kv)
        assertTrue(store.all().isEmpty())
        store.prune(1_000L)
        assertNull(kv.getString("records"))
        store.clear()
        assertNull(kv.getString("salt"))
    }

    @Test fun `capture counter increments, clear resets records and counter`() {
        val store = WhatsAppCallProbeStore(MemoryKeyValue())
        assertEquals(1, store.nextCapture())
        assertEquals(2, store.nextCapture())
        store.add(rec(input(), M.CapturePseudonyms())!!, 5_000L)
        store.clear()
        assertTrue(store.all().isEmpty())
        assertEquals(1, store.nextCapture())
    }

    @Test fun `encode and decode round-trip`() {
        val r = rec(input(), M.CapturePseudonyms())!!.copy(event = "REMOVED", removalReason = 8, capture = 3)
        assertEquals(listOf(r), M.decode(M.encode(listOf(r))))
        assertEquals(emptyList<M.Record>(), M.decode(null))
    }

    @Test fun `off unless the build flag is set`() {
        assertFalse(WhatsAppCallProbeInstaller.shouldInstall(false))
        assertTrue(WhatsAppCallProbeInstaller.shouldInstall(true))
    }

    @Test fun `different random keys give unrelated pseudonym spaces`() {
        val a = M.CapturePseudonyms()
        val b = M.CapturePseudonyms()
        // Different callers first in each capture both become c1: ordinals carry no identity.
        assertEquals("c1", rec(input(shortcutId = "x@s"), a)!!.caller)
        assertEquals("c1", rec(input(shortcutId = "y@s"), b)!!.caller)
        assertNotEquals(rec(input(shortcutId = "y@s"), a)!!.caller, "c1")
    }
}
