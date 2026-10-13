package com.SilenceFocus.diagnostics

import com.SilenceFocus.BuildConfig
import com.SilenceFocus.automation.ActivityEvents
import com.SilenceFocus.automation.ActivityEvents.JournalEntry
import com.SilenceFocus.diagnostics.ActivityTestHarnessModel as H
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Client Issues #10/#11: debug-only synthetic Activity test harness – gating, rows, cleanup. */
class ActivityTestHarnessTest {

    private val now = 1_791_620_000_000L
    private val run = "0a1b2c3d"

    // ---- gating

    @Test fun `off by default - a normal debug build compiles the flag off`() {
        // Unit tests run on default builds (no -PSF_ACTIVITY_TEST_HARNESS=true).
        assertFalse(BuildConfig.SF_ACTIVITY_TEST_HARNESS)
    }

    @Test fun `seeding is refused unless the flag is on, uploads are off and no run is active`() {
        assertEquals("HARNESS_DISABLED", H.seedRefusal(false, "", null))
        assertEquals("SERVER_WRITES_ENABLED_IN_THIS_BUILD", H.seedRefusal(true, "3", null))
        assertEquals("RUN_ALREADY_ACTIVE:$run", H.seedRefusal(true, "", run))
        assertNull(H.seedRefusal(true, "", null))
    }

    @Test fun `seeding is refused when it would make retention drop a real entry`() {
        val day = 24 * 60 * 60_000L
        // 200 real, verified entries: 3 synthetic rows must not push one out.
        val full = (1..200).map { JournalEntry(ActivityEvents.INCOMING_CALL, now - it * 1000L, true) }.reversed()
        assertFalse(H.evictsRealEntries(full, now, 30 * day, 200))
        // One real entry already older than 30 days would be trimmed by the append.
        val stale = listOf(JournalEntry(ActivityEvents.ZONE_ENTER, now - 31 * day, false))
        assertTrue(H.evictsRealEntries(stale, now, 30 * day, 200))
        // A stale pending entry is kept anyway (never evicted) -> allowed.
        val stalePending = listOf(JournalEntry(ActivityEvents.INCOMING_CALL, now - 31 * day, false))
        assertFalse(H.evictsRealEntries(stalePending, now, 30 * day, 200))
    }

    @Test fun `run ids are 8 lowercase hex characters`() {
        assertTrue(H.isValidRunId(run))
        listOf(null, "", "0A1B2C3D", "0a1b2c3", "0a1b2c3d4", "../x", "0a1b2c3-").forEach { assertFalse(it.toString(), H.isValidRunId(it)) }
    }

    // ---- rows

    private val rows = H.rows(run, "com.SilenceFocus", "aaaa", "bbbb", now)

    @Test fun `a run writes six tagged synthetic rows`() {
        assertEquals(H.ROWS_PER_RUN, rows.size)
        assertEquals((1..6).map { "sftest-$run-$it" }, rows.map { it.id })
        rows.forEach {
            assertEquals(true, it.fields[ActivityEvents.SYNTHETIC_FIELD])
            assertEquals(H.REASON, it.fields["reason"])
        }
        assertEquals(
            listOf(
                ActivityEvents.MESSAGE_RECEIVED, ActivityEvents.INCOMING_CALL, ActivityEvents.INCOMING_CALL,
                ActivityEvents.WHATSAPP_CALL, ActivityEvents.WHATSAPP_CALL, ActivityEvents.MESSAGE_RECEIVED,
            ),
            rows.map { it.type },
        )
    }

    @Test fun `Round 3 rows carry only fixed synthetic names and message times`() {
        assertEquals(H.SENDER_NAME, rows[0].fields["displayName"])
        assertEquals(H.CALLER_NAME, rows[3].fields["displayName"])
        assertFalse(rows[4].fields.containsKey("displayName")) // "Unknown caller" path
        assertEquals(now, rows[0].fields["messageAt"])
        assertEquals(now - 60_000L, rows[5].fields["messageAt"])
        assertEquals(rows[0].fields["notificationRef"], rows[5].fields["notificationRef"])
    }

    @Test fun `message and app-call rows point at this app's own notifications, the phone row has no package`() {
        assertEquals("com.SilenceFocus", rows[0].fields["appPackage"])
        assertEquals("aaaa", rows[0].fields["notificationRef"])
        assertEquals("com.SilenceFocus", rows[1].fields["appPackage"])
        assertEquals("bbbb", rows[1].fields["notificationRef"])
        assertFalse(rows[2].fields.containsKey("appPackage"))
        assertFalse(rows[2].fields.containsKey("notificationRef"))
    }

    @Test fun `no row carries the notification text, a real number or another app's identity`() {
        val text = H.messageText(run)
        rows.forEach { row ->
            row.fields.values.forEach { v ->
                assertFalse(v.toString().contains(text))
                assertFalse(v.toString().contains(H.earlierMessageText(run)))
            }
            row.fields["appPackage"]?.let { assertEquals("com.SilenceFocus", it) }
            row.fields["caller"]?.let { assertFalse(Regex("\\d{5,}").containsMatchIn(it.toString())) }
        }
    }

    @Test fun `every row is synthetic so it is never pending`() {
        rows.forEach { assertFalse(JournalEntry(it.type, now, false, it.fields[ActivityEvents.SYNTHETIC_FIELD] == true).pending) }
    }

    // ---- cleanup isolation

    private val journal = listOf(
        H.Entry("1791619000000-1-INCOMING_CALL", false, now - 5000),
        H.Entry("sftest-$run-1", true, now),
        H.Entry("sftest-$run-2", true, now),
        H.Entry("sftest-ffffffff-1", true, now), // another run
        H.Entry("sftest-$run-9", false, now), // prefix only, not synthetic: real-looking id
        H.Entry("custom-$run-1", true, now), // synthetic flag, wrong prefix
        H.Entry(null, true, now),
    )

    @Test fun `cleanup removes only this run's synthetic rows`() {
        assertEquals(setOf("sftest-$run-1", "sftest-$run-2"), H.cleanupIds(journal, run))
    }

    @Test fun `cleanup with an invalid run id removes nothing`() {
        assertEquals(emptySet<String>(), H.cleanupIds(journal, "sftest-"))
        assertEquals(emptySet<String>(), H.cleanupIds(journal, ""))
    }

    @Test fun `cleanup prefix can't match a different run that shares leading characters`() {
        val other = listOf(H.Entry("sftest-${run}0-1", true, now))
        assertEquals(emptySet<String>(), H.cleanupIds(other, run))
    }

    @Test fun `janitor expires only synthetic sftest rows older than 2 h`() {
        val old = now - H.EXPIRY_MS
        val entries = listOf(
            H.Entry("sftest-$run-1", true, old),
            H.Entry("sftest-$run-2", true, old + 1),
            H.Entry("real-1", false, old - 1),
            H.Entry("sftest-$run-3", false, old - 1),
        )
        assertEquals(setOf("sftest-$run-1"), H.expiredIds(entries, now))
    }
}
