package com.SilenceFocus.comms

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class AutoReplyPolicyTest {

    private val now = 2_000_000_000L
    private val session = 1_000L
    private val enabled = AutoReplySettings(enabled = true, cooldownMinutes = 30)
    private val silent = SilenceContext(active = true, sessionId = session, zoneId = null)
    private val msg = IncomingMessage(
        packageName = "com.whatsapp",
        senderKey = "k1",
        isMessaging = true,
        hasReplyAction = true,
        isGroup = false,
        fromSelf = false,
        looksLikeAutoReply = false,
    )

    private fun decide(
        settings: AutoReplySettings = enabled,
        ctx: SilenceContext = silent,
        m: IncomingMessage = msg,
        marks: Map<String, ReplyMark> = emptyMap(),
        lastHour: Int = 0,
        at: Long = now,
    ) = AutoReplyPolicy.decide(settings, ctx, m, marks, lastHour, at)

    @Test fun `1 Silent Focus inactive - no reply and nothing recorded`() {
        val d = decide(ctx = silent.copy(active = false))
        assertFalse(d.shouldSend)
        assertNull(d.status)
    }

    @Test fun `2 feature disabled - skipped`() {
        val d = decide(settings = enabled.copy(enabled = false))
        assertFalse(d.shouldSend)
        assertEquals(ReplyStatus.SKIPPED, d.status)
        assertEquals(AutoReplyPolicy.REASON_DISABLED, d.reason)
        assertEquals(ReplyStatus.SKIPPED, decide(settings = enabled.copy(messagingEnabled = false)).status)
    }

    @Test fun `3 supported inline-reply notification - reply`() {
        val d = decide()
        assertTrue(d.shouldSend)
        assertEquals(AutoReplySettings.DEFAULT_TEMPLATE, d.template)
    }

    @Test fun `4 notification without reply action - unsupported`() {
        val d = decide(m = msg.copy(hasReplyAction = false))
        assertEquals(ReplyStatus.UNSUPPORTED, d.status)
        assertEquals("AUTO_REPLY_SKIPPED", AutoReplyPolicy.eventTypeFor(d.status!!, d.reason))
        assertTrue(AutoReplyPolicy.marksSender(ReplyStatus.UNSUPPORTED))
    }

    @Test fun `5 same sender inside cooldown - skipped`() {
        val marks = mapOf("k1" to ReplyMark(now - 10 * 60_000L, session))
        val d = decide(marks = marks)
        assertEquals(ReplyStatus.SKIPPED, d.status)
        assertEquals(AutoReplyPolicy.REASON_COOLDOWN, d.reason)
        assertNull(AutoReplyPolicy.eventTypeFor(d.status!!, d.reason)) // not a separate activity entry
    }

    @Test fun `6 sender after cooldown or in a new session - allowed`() {
        assertTrue(decide(marks = mapOf("k1" to ReplyMark(now - 31 * 60_000L, session))).shouldSend)
        assertTrue(decide(marks = mapOf("k1" to ReplyMark(now - 60_000L, session - 1))).shouldSend)
        // Other senders are unaffected.
        assertTrue(decide(marks = mapOf("k2" to ReplyMark(now, session))).shouldSend)
    }

    @Test fun `once per session when cooldown is zero`() {
        val s = enabled.copy(cooldownMinutes = 0)
        assertEquals(
            AutoReplyPolicy.REASON_COOLDOWN,
            decide(settings = s, marks = mapOf("k1" to ReplyMark(now - 5 * 60 * 60_000L, session))).reason,
        )
    }

    @Test fun `7 per-zone template override`() {
        val s = enabled.copy(zoneTemplates = mapOf("12" to "I'm currently at work. I'll respond when available."))
        assertEquals(
            "I'm currently at work. I'll respond when available.",
            decide(settings = s, ctx = silent.copy(zoneId = "12")).template,
        )
    }

    @Test fun `8 default template fallback`() {
        val s = enabled.copy(defaultTemplate = "Busy", zoneTemplates = mapOf("12" to "   "))
        assertEquals("Busy", decide(settings = s, ctx = silent.copy(zoneId = "12")).template)
        assertEquals("Busy", decide(settings = s, ctx = silent.copy(zoneId = "99")).template)
        assertEquals(AutoReplySettings.DEFAULT_TEMPLATE, decide(settings = s.copy(defaultTemplate = "  ")).template)
    }

    @Test fun `9 failed reply action - failed event, sender marked so it isn't retried`() {
        assertEquals("AUTO_REPLY_FAILED", AutoReplyPolicy.eventTypeFor(ReplyStatus.FAILED, null))
        assertTrue(AutoReplyPolicy.marksSender(ReplyStatus.FAILED))
        val marks = mapOf("k1" to ReplyMark(now, session)) // recorded after the failure
        assertEquals(AutoReplyPolicy.REASON_COOLDOWN, decide(marks = marks, at = now + 1_000).reason)
        assertEquals("AUTO_REPLY_SENT", AutoReplyPolicy.eventTypeFor(ReplyStatus.SENT, null))
        assertFalse(AutoReplyPolicy.marksSender(ReplyStatus.SKIPPED))
    }

    @Test fun `10 settings and dedupe state survive a restart`() {
        val kv = MemoryKeyValue()
        val settings = AutoReplySettings(
            enabled = true,
            messagingEnabled = false,
            defaultTemplate = "Back soon",
            cooldownMinutes = 15,
            zoneTemplates = mapOf("3" to "At the library", "7" to "At work"),
        )
        CommsStore(kv).autoReplySettings = settings
        CommsStore(kv).replyMarks = mapOf("k1" to ReplyMark(now, session))
        CommsStore(kv).replyTimes = listOf(now - 1, now)
        // New instances = listener/process restarted.
        assertEquals(settings, CommsStore(kv).autoReplySettings)
        assertEquals(ReplyMark(now, session), CommsStore(kv).replyMarks["k1"])
        assertEquals(listOf(now - 1, now), CommsStore(kv).replyTimes)
        CommsStore(kv).clearUserData()
        assertEquals(AutoReplySettings(), CommsStore(kv).autoReplySettings)
    }

    @Test fun `own echoed reply, groups and loops are not replied to`() {
        assertEquals(AutoReplyPolicy.REASON_OWN_MESSAGE, decide(m = msg.copy(fromSelf = true)).reason)
        assertEquals(AutoReplyPolicy.REASON_GROUP, decide(m = msg.copy(isGroup = true)).reason)
        val loop = decide(m = msg.copy(looksLikeAutoReply = true))
        assertEquals(AutoReplyPolicy.REASON_LOOP, loop.reason)
        assertEquals("AUTO_REPLY_SKIPPED", AutoReplyPolicy.eventTypeFor(loop.status!!, loop.reason))
        assertTrue(AutoReplyPolicy.looksLikeOurTemplate("  i'm currently UNAVAILABLE and will get back to you soon. ", AutoReplySettings()))
        assertFalse(AutoReplyPolicy.looksLikeOurTemplate("hello?", AutoReplySettings()))
    }

    @Test fun `hourly cap and unknown sender`() {
        assertEquals(AutoReplyPolicy.REASON_RATE_LIMIT, decide(lastHour = AutoReplyPolicy.MAX_REPLIES_PER_HOUR).reason)
        assertEquals(AutoReplyPolicy.REASON_NO_SENDER, decide(m = msg.copy(senderKey = null)).reason)
        assertFalse(decide(m = msg.copy(isMessaging = false)).shouldSend)
    }

    @Test fun `dedupe state is pruned and bounded`() {
        val marks = (0 until 300).associate { "k$it" to ReplyMark(now - it * 60_000L, session) } +
            ("old" to ReplyMark(now - 2 * 24 * 60 * 60_000L, session))
        val pruned = AutoReplyPolicy.pruneMarks(marks, now)
        assertEquals(200, pruned.size)
        assertFalse(pruned.containsKey("old"))
        assertTrue(pruned.containsKey("k0"))
    }

    @Test fun `field codec strips separators`() {
        val encoded = FieldCodec.encode(listOf(listOf("a\u001Fb", "c\u001Ed"), listOf("e")))
        assertEquals(listOf(listOf("ab", "cd"), listOf("e")), FieldCodec.decode(encoded))
    }

    @Test fun `old unread conversation re-posted after the session began is not a new message`() {
        val sessionStart = 1_790_868_135_491L
        // Live repro 2026-10-01: Messages re-posted a thread whose newest SMS was from the day before.
        assertTrue(AutoReplyPolicy.isFromBeforeSession(1_790_786_292_140L, sessionStart))
        // Received during the session, or within the clock tolerance before it.
        assertFalse(AutoReplyPolicy.isFromBeforeSession(sessionStart + 5_000, sessionStart))
        assertFalse(AutoReplyPolicy.isFromBeforeSession(sessionStart - 30_000, sessionStart))
        // Unknown times are never treated as old.
        assertFalse(AutoReplyPolicy.isFromBeforeSession(null, sessionStart))
        assertFalse(AutoReplyPolicy.isFromBeforeSession(0L, sessionStart))
        assertFalse(AutoReplyPolicy.isFromBeforeSession(1_790_786_292_140L, 0L))
    }
}
