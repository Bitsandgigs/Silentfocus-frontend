package com.SilenceFocus.comms

import android.app.Notification
import com.SilenceFocus.automation.ActivityEvents
import com.SilenceFocus.comms.WhatsAppCalls.Signals
import com.SilenceFocus.comms.WhatsAppCalls.State
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** #9 WhatsApp call rows and #6 repeated WhatsApp caller – synthetic notification structures only. */
class WhatsAppCallsTest {

    private val now = 1_791_620_000_000L
    private val callStyle = "android.app.Notification\$CallStyle"

    private fun sig(
        pkg: String = "com.whatsapp",
        category: String? = Notification.CATEGORY_CALL,
        template: String? = callStyle,
        callType: Int? = 1,
        ongoing: Boolean = false,
        fullScreen: Boolean = true,
        group: Boolean = false,
        summary: Boolean = false,
    ) = Signals(pkg, category, template, callType, ongoing, fullScreen, group, summary)

    // ---- classification (#9)

    @Test fun `ringing CallStyle incoming is INCOMING for WhatsApp and WhatsApp Business`() {
        assertEquals(State.INCOMING, WhatsAppCalls.classify(sig()))
        assertEquals(State.INCOMING, WhatsAppCalls.classify(sig(pkg = "com.whatsapp.w4b")))
        assertEquals("WhatsApp", WhatsAppCalls.APPS["com.whatsapp"])
        assertEquals("WhatsApp Business", WhatsAppCalls.APPS["com.whatsapp.w4b"])
    }

    @Test fun `pre-CallStyle ringing call - call category with a full-screen intent`() {
        assertEquals(State.INCOMING, WhatsAppCalls.classify(sig(template = null, callType = null)))
        assertNull(WhatsAppCalls.classify(sig(template = null, callType = null, fullScreen = false)))
    }

    @Test fun `ongoing or screening CallStyle is never claimed (answered is not detectable)`() {
        assertNull(WhatsAppCalls.classify(sig(callType = 2, ongoing = true, fullScreen = false)))
        assertNull(WhatsAppCalls.classify(sig(callType = 3)))
        // A CallStyle without a call type falls back to the structural signals.
        assertNull(WhatsAppCalls.classify(sig(callType = null, fullScreen = false)))
        assertEquals(State.INCOMING, WhatsAppCalls.classify(sig(callType = null)))
    }

    // ---- Round 4: real-world variants (structures differ between WhatsApp builds / One UI)

    private fun plain(fullScreen: Boolean = false, fsiDenied: Boolean = false, insistent: Boolean = false, importance: Int? = null,
                      chronometer: Boolean = false, actions: Int = 0, pkg: String = "com.whatsapp", category: String? = Notification.CATEGORY_CALL) =
        Signals(pkg, category, null, null, ongoing = true, hasFullScreenIntent = fullScreen, isGroupConversation = false, isGroupSummary = false,
            fsiDenied = fsiDenied, insistent = insistent, importance = importance, chronometer = chronometer, actionCount = actions)

    @Test fun `Android 14+ removed the full-screen intent (permission denied) - still a ringing call`() {
        assertEquals(State.INCOMING, WhatsAppCalls.classify(plain(fsiDenied = true)))
        assertEquals(State.INCOMING, WhatsAppCalls.classify(plain(fsiDenied = true, pkg = "com.whatsapp.w4b")))
    }

    @Test fun `heads-up call notification with Decline and Answer, or an insistent one, is ringing`() {
        assertEquals(State.INCOMING, WhatsAppCalls.classify(plain(importance = 4, actions = 2)))
        assertEquals(State.INCOMING, WhatsAppCalls.classify(plain(importance = 5, actions = 3)))
        assertEquals(State.INCOMING, WhatsAppCalls.classify(plain(insistent = true)))
    }

    @Test fun `answered or outgoing call shapes are not ringing calls`() {
        // Running call timer (answered / outgoing in progress).
        assertNull(WhatsAppCalls.classify(plain(importance = 4, actions = 2, chronometer = true)))
        assertNull(WhatsAppCalls.classify(plain(insistent = true, chronometer = true)))
        // Low-importance call notification ("Ongoing voice call") or a single Hang up action.
        assertNull(WhatsAppCalls.classify(plain(importance = 2, actions = 2)))
        assertNull(WhatsAppCalls.classify(plain(importance = 4, actions = 1)))
        assertNull(WhatsAppCalls.classify(plain()))
    }

    @Test fun `message-shaped WhatsApp notifications never become calls, whatever their importance`() {
        assertNull(WhatsAppCalls.classify(plain(category = Notification.CATEGORY_MESSAGE, importance = 4, actions = 3, insistent = true)))
        assertNull(WhatsAppCalls.classify(plain(category = null, importance = 4, actions = 2)))
        assertFalse(WhatsAppCalls.isCallLike(plain(category = Notification.CATEGORY_MESSAGE)))
        assertTrue(WhatsAppCalls.isCallLike(plain()))
        assertFalse(WhatsAppCalls.isCallLike(plain(pkg = "org.telegram.messenger")))
    }

    @Test fun `diagnostic shape holds structure only`() {
        val shape = WhatsAppCalls.shape(plain(fsiDenied = true, importance = 4, actions = 2).copy(channel = WhatsAppCalls.safeChannel("voip_notification_11")))
        assertEquals("cat=call style=- type=- fsi=0d ins=0 imp=4 chr=0 act=2 ong=1 ch=voip_notification_11", shape)
        // Channel ids that could carry an identity are dropped.
        assertNull(WhatsAppCalls.safeChannel("919876543210@s.whatsapp.net"))
        assertNull(WhatsAppCalls.safeChannel("chat_919876543210"))
        assertNull(WhatsAppCalls.safeChannel("Mum's calls"))
    }

    @Test fun `missed_call category is MISSED`() {
        assertEquals(State.MISSED, WhatsAppCalls.classify(sig(category = "missed_call", template = null, callType = null, fullScreen = false)))
    }

    @Test fun `messages, groups, summaries and other apps are ignored`() {
        assertNull(WhatsAppCalls.classify(sig(category = Notification.CATEGORY_MESSAGE, template = "android.app.Notification\$MessagingStyle", callType = null, fullScreen = false)))
        assertNull(WhatsAppCalls.classify(sig(group = true)))
        assertNull(WhatsAppCalls.classify(sig(summary = true)))
        assertNull(WhatsAppCalls.classify(sig(pkg = "com.google.android.dialer")))
        assertNull(WhatsAppCalls.classify(sig(pkg = "org.telegram.messenger")))
    }

    // ---- call episodes: one real call = one count / one alert

    private fun post(e: List<WhatsAppCalls.Episode>, ref: String, at: Long, caller: String? = "wa:a", state: State = State.INCOMING) =
        WhatsAppCalls.onPost(e, state, ref, caller, at)

    @Test fun `updates to the same ringing notification are one call`() {
        val p1 = post(emptyList(), "ref1", now)
        assertTrue(p1.isNew)
        val p2 = post(p1.episodes, "ref1", now + 5_000)
        assertFalse(p2.isNew)
        assertEquals("ref1", p2.alertRef)
        assertFalse(post(p2.episodes, "ref1", now + 40_000).isNew)
    }

    @Test fun `WhatsApp replacing its call notification (remove + re-post, new key) is the same call`() {
        val p1 = post(emptyList(), "ref1", now)
        val ended = WhatsAppCalls.end(p1.episodes, "ref1", now + 1_000)
        val p2 = post(ended, "ref2", now + 2_000)
        assertFalse(p2.isNew)
        // The alert stays tagged with the first notification and keeps ringing.
        assertEquals("ref1", p2.alertRef)
        assertTrue(WhatsAppCalls.stillRinging(p2.episodes, "ref1", now + 3_000))
        // The same key re-posted right after its removal is also the same call, even for an unknown caller.
        val q1 = post(emptyList(), "refU", now, caller = null)
        assertFalse(post(WhatsAppCalls.end(q1.episodes, "refU", now + 500), "refU", now + 1_500, caller = null).isNew)
        // Another notification for the same caller while still ringing (e.g. an extra heads-up).
        assertFalse(post(p1.episodes, "ref3", now + 2_000).isNew)
    }

    @Test fun `separate real calls are never merged`() {
        // Call 1 ends; the same caller calls again 30 s later - even with WhatsApp's notification key reused.
        val p1 = post(emptyList(), "ref1", now)
        val ended = WhatsAppCalls.end(p1.episodes, "ref1", now + 20_000)
        assertTrue(post(ended, "ref1", now + 50_000).isNew)
        assertTrue(post(ended, "ref2", now + 50_000).isNew)
        // A reused key that was never removed but went stale (no update for RING_MAX_MS).
        assertTrue(post(p1.episodes, "ref1", now + WhatsAppCalls.RING_MAX_MS + 1).isNew)
        // A different caller ringing at the same time is a different call.
        assertTrue(post(p1.episodes, "ref2", now + 1_000, caller = "wa:b").isNew)
        // Unknown callers are never grouped together.
        val u = post(emptyList(), "refA", now, caller = null)
        assertTrue(post(u.episodes, "refB", now + 1_000, caller = null).isNew)
    }

    @Test fun `ringing turning into a missed call is one missed row - the missed notification updated stays one`() {
        val p1 = post(emptyList(), "ref1", now)
        val ended = WhatsAppCalls.end(p1.episodes, "ref1", now + 30_000, State.INCOMING)
        assertFalse(WhatsAppCalls.stillRinging(ended, "ref1", now + 30_000))
        val m1 = post(ended, "ref1", now + 30_000, state = State.MISSED)
        assertTrue(m1.isNew)
        assertFalse(post(m1.episodes, "ref1", now + 90_000, state = State.MISSED).isNew)
        // After removal a later missed-call notification counts again.
        assertTrue(post(WhatsAppCalls.end(m1.episodes, "ref1", now + 100_000), "ref1", now + 200_000, state = State.MISSED).isNew)
    }

    @Test fun `the alert keeps going while any notification of the call rings, and stops after`() {
        val p1 = post(emptyList(), "ref1", now)
        val p2 = post(p1.episodes, "ref2", now + 1_000)
        val e1 = WhatsAppCalls.end(p2.episodes, "ref1", now + 2_000)
        assertEquals(setOf("ref1"), WhatsAppCalls.alertRefsOf(p2.episodes, "ref2"))
        assertTrue(WhatsAppCalls.stillRinging(e1, "ref1", now + 2_000))
        val e2 = WhatsAppCalls.end(e1, "ref2", now + 9_000)
        assertFalse(WhatsAppCalls.stillRinging(e2, "ref1", now + 9_000))
        // A ringing notification never updated again is treated as stopped (missed removal).
        assertFalse(WhatsAppCalls.stillRinging(p1.episodes, "ref1", now + WhatsAppCalls.RING_MAX_MS + 1))
    }

    @Test fun `three separate calls from the same caller reach the urgent rule exactly on the third`() {
        var eps = emptyList<WhatsAppCalls.Episode>()
        var st = RepeatCallState()
        val results = mutableListOf<Boolean>()
        listOf(0L, 4 * 60_000L, 8 * 60_000L).forEach { start ->
            // Each call: posted, updated twice, then removed.
            listOf(0L, 3_000L, 6_000L).forEach { d ->
                val p = post(eps, "ref-shared", now + start + d)
                eps = p.episodes
                if (p.isNew) WhatsAppCalls.repeat(settings, "wa:a", now + start + d, st).also { st = it.state; results += it.repeated }
            }
            eps = WhatsAppCalls.end(eps, "ref-shared", now + start + 30_000)
        }
        assertEquals(listOf(false, false, true), results)
    }

    @Test fun `episodes are bounded and persisted without names or numbers`() {
        var e = emptyList<WhatsAppCalls.Episode>()
        repeat(80) { i -> e = post(e, "r$i", now + i, caller = "wa:$i").episodes }
        assertEquals(WhatsAppCalls.MAX_TRACKED, e.size)
        val store = CommsStore(MemoryKeyValue())
        store.waCallEpisodes = e
        assertEquals(e, store.waCallEpisodes)
    }

    // ---- caller identity: hashed, namespaced, never raw

    @Test fun `caller key is a salted hash in the wa namespace - never the raw identity`() {
        val k = WhatsAppCalls.callerKey("salt", "com.whatsapp", "919876543210@s.whatsapp.net", null, "Alice")!!
        assertTrue(k.startsWith("wa:"))
        assertFalse(k.contains("9198765"))
        assertFalse(k.contains("Alice"))
        assertEquals(k, WhatsAppCalls.callerKey("salt", "com.whatsapp", "919876543210@s.whatsapp.net", null, "Bob"))
        assertNotEquals(k, WhatsAppCalls.callerKey("other-salt", "com.whatsapp", "919876543210@s.whatsapp.net", null, null))
        // WhatsApp and WhatsApp Business are different callers.
        assertNotEquals(k, WhatsAppCalls.callerKey("salt", "com.whatsapp.w4b", "919876543210@s.whatsapp.net", null, null))
    }

    @Test fun `caller identity falls back shortcut - person - title, null when nothing identifies`() {
        val byPerson = WhatsAppCalls.callerKey("s", "com.whatsapp", null, "person-1", "Alice")
        assertEquals(byPerson, WhatsAppCalls.callerKey("s", "com.whatsapp", "", "person-1", "Other"))
        assertEquals(WhatsAppCalls.callerKey("s", "com.whatsapp", null, null, "Alice"), WhatsAppCalls.callerKey("s", "com.whatsapp", " ", null, "Alice"))
        assertNull(WhatsAppCalls.callerKey("s", "com.whatsapp", null, null, null))
        // Round 4: a generic heading identifies nobody - unknown callers are never grouped by it.
        listOf("Incoming voice call", "WhatsApp", "Incoming video call", "Calling…").forEach {
            assertNull(it, WhatsAppCalls.callerKey("s", "com.whatsapp", null, null, it))
        }
    }

    // ---- #6 repeated caller

    private val settings = CallSettings(urgentEnabled = true, urgentThreshold = 3, urgentWindowMinutes = 15, urgentCooldownMinutes = 15)

    @Test fun `third call from the same caller within the window is a repeat - once`() {
        var st = RepeatCallState()
        val results = (0 until 3).map { i -> WhatsAppCalls.repeat(settings, "wa:a", now + i * 60_000L, st).also { st = it.state } }
        assertEquals(listOf(false, false, true), results.map { it.repeated })
        assertEquals(3, results[2].count)
        // A fourth call during the cooldown doesn't trigger again.
        assertFalse(WhatsAppCalls.repeat(settings, "wa:a", now + 4 * 60_000L, st).repeated)
    }

    @Test fun `calls outside the window, from different callers or unidentified never add up`() {
        var st = RepeatCallState()
        listOf(0L, 16, 32).forEach { m -> st = WhatsAppCalls.repeat(settings, "wa:a", now + m * 60_000L, st).also { assertFalse(it.repeated) }.state }
        st = RepeatCallState()
        listOf("wa:a", "wa:b", "wa:a", "wa:b").forEachIndexed { i, k -> st = WhatsAppCalls.repeat(settings, k, now + i * 1000L, st).also { assertFalse(it.repeated) }.state }
        repeat(5) { assertFalse(WhatsAppCalls.repeat(settings, null, now + it, RepeatCallState()).repeated) }
    }

    @Test fun `repeat rule off - nothing is a repeat`() {
        var st = RepeatCallState()
        repeat(5) { i -> st = WhatsAppCalls.repeat(settings.copy(urgentEnabled = false), "wa:a", now + i * 1000L, st).also { assertFalse(it.repeated) }.state }
    }

    @Test fun `WhatsApp repeat state is separate from cellular`() {
        val store = CommsStore(MemoryKeyValue())
        store.repeatCallState = RepeatCallState(listOf(CallRecord("cell", now)))
        store.waRepeatState = RepeatCallState(listOf(CallRecord("wa:a", now)))
        assertEquals(listOf("cell"), store.repeatCallState.calls.map { it.key })
        assertEquals(listOf("wa:a"), store.waRepeatState.calls.map { it.key })
    }

    @Test fun `logout and account change clear WhatsApp call state`() {
        val store = CommsStore(MemoryKeyValue())
        store.waRepeatState = RepeatCallState(listOf(CallRecord("wa:a", now)), mapOf("wa:a" to now + 1))
        store.waCallEpisodes = post(emptyList(), "r", now).episodes
        store.waAlertPostedAt = now
        store.clearUserData()
        assertTrue(store.waRepeatState.calls.isEmpty())
        assertTrue(store.waRepeatState.cooldowns.isEmpty())
        assertTrue(store.waCallEpisodes.isEmpty())
        assertEquals(0L, store.waAlertPostedAt)
    }

    // ---- journal type

    @Test fun `WhatsApp call rows are calls, local only (never uploaded)`() {
        assertEquals(ActivityEvents.CATEGORY_CALL, ActivityEvents.categoryOf(ActivityEvents.WHATSAPP_CALL))
        assertFalse(ActivityEvents.WHATSAPP_CALL in ActivityEvents.UPLOADED_TYPES)
    }

    // ---- WhatsApp silenced by Do Not Disturb: a missed call that never rang

    @Test fun `a re-posted missed-call notification with a later time is a further missed call`() {
        val p1 = WhatsAppCalls.onPost(emptyList(), State.MISSED, "m1", "wa:a", now, stamp = now)
        assertTrue(p1.isNew)
        // Same notification updated (e.g. read state) with the same time: not a new call.
        assertFalse(WhatsAppCalls.onPost(p1.episodes, State.MISSED, "m1", "wa:a", now + 2_000, stamp = now).isNew)
        // "2 missed calls": the same notification with a later `when`.
        val p3 = WhatsAppCalls.onPost(p1.episodes, State.MISSED, "m1", "wa:a", now + 60_000, stamp = now + 60_000)
        assertTrue(p3.isNew)
        assertFalse(WhatsAppCalls.onPost(p3.episodes, State.MISSED, "m1", "wa:a", now + 61_000, stamp = now + 60_000).isNew)
    }

    @Test fun `a missed call right after a ringing call is that call ending, not a silenced one`() {
        val ring = post(emptyList(), "ref1", now)
        assertTrue(WhatsAppCalls.rangRecently(ring.episodes, now + 30_000))
        assertFalse(WhatsAppCalls.rangRecently(ring.episodes, now + WhatsAppCalls.SILENCED_WINDOW_MS + 31_000))
        assertFalse(WhatsAppCalls.rangRecently(emptyList(), now))
        // Missed episodes never count as "rang".
        val missed = WhatsAppCalls.onPost(emptyList(), State.MISSED, "m1", "wa:a", now, stamp = now)
        assertFalse(WhatsAppCalls.rangRecently(missed.episodes, now + 1_000))
    }
}
