package com.SilenceFocus.automation

import com.SilenceFocus.automation.ActivityEvents.JournalEntry
import com.SilenceFocus.comms.MemoryKeyValue
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Client Issues #10/#11 test harness: synthetic (`"synthetic": true`) journal
 * entries are never uploaded, outboxed or allowed to change how real entries
 * are kept - enforced in main code, independent of any debug flag.
 */
class SyntheticExclusionTest {

    private val now = 1_791_620_000_000L
    private val day = 24 * 60 * 60_000L

    private fun json(id: String, type: String, synthetic: Boolean) =
        """{"id":"$id","type":"$type","at":${now - 1000}""" + (if (synthetic) ""","synthetic":true}""" else "}")

    private fun ev(id: String, type: String = ActivityEvents.MESSAGE_RECEIVED, synthetic: Boolean = false, acked: Boolean = false) =
        Outbox.Event(id, type, now - 1000, acked, json(id, type, synthetic), synthetic = synthetic)

    private val realEvents = listOf(
        ev("r1", ActivityEvents.MESSAGE_RECEIVED),
        ev("r2", ActivityEvents.INCOMING_CALL),
        ev("r3", ActivityEvents.INCOMING_CALL, acked = true),
        ev("r4", ActivityEvents.ZONE_ENTER),
    )
    private val syntheticEvents = listOf(
        ev("sftest-0a1b2c3d-1", ActivityEvents.MESSAGE_RECEIVED, synthetic = true),
        ev("sftest-0a1b2c3d-2", ActivityEvents.INCOMING_CALL, synthetic = true),
        ev("sftest-0a1b2c3d-3", ActivityEvents.INCOMING_CALL, synthetic = true),
    )

    // ---- never pending (= never uploaded)

    @Test fun `synthetic entries of every uploaded type are never pending`() {
        ActivityEvents.UPLOADED_TYPES.forEach { type ->
            assertFalse(JournalEntry(type, now, acknowledged = false, synthetic = true).pending)
            assertTrue(JournalEntry(type, now, acknowledged = false).pending)
        }
    }

    @Test fun `syncable journal excludes exactly the synthetic entries`() {
        assertEquals(listOf(0, 2, 4), ActivityEvents.syncableIndices(listOf(false, true, false, true, false)))
        assertEquals(emptyList<Int>(), ActivityEvents.syncableIndices(listOf(true, true)))
    }

    // ---- logout outbox and interrupted-logout recovery

    @Test fun `logout snapshot - the real pending set is identical with or without synthetic rows`() {
        val without = Outbox.pendingSnapshot(realEvents, emptyList(), now)
        val with = Outbox.pendingSnapshot(realEvents + syntheticEvents, emptyList(), now)
        assertEquals(listOf("r1", "r2"), without.events.map { it.id })
        assertEquals(without, with)
    }

    @Test fun `outbox save stores no synthetic entry and still reports success`() {
        val store = OutboxStore(MemoryKeyValue())
        assertTrue(store.save(3, Outbox.Content(listOf(realEvents[0]) + syntheticEvents)))
        assertEquals(listOf("r1"), store.read(3).events.map { it.id })
    }

    @Test fun `a synthetic entry found in a stored outbox is dropped on read, so it can never be flushed`() {
        val kv = MemoryKeyValue()
        // Simulates a stored record whose JSON is synthetic even though the parsed flag was lost.
        val forged = Outbox.Event("sftest-0a1b2c3d-1", ActivityEvents.MESSAGE_RECEIVED, now, false, json("sftest-0a1b2c3d-1", ActivityEvents.MESSAGE_RECEIVED, true))
        kv.commitString("outbox:3", Outbox.encode(Outbox.Content(listOf(realEvents[0], forged))))
        assertEquals(listOf("r1"), OutboxStore(kv).read(3).events.map { it.id })
    }

    @Test fun `isSyntheticJson matches only a true synthetic field`() {
        assertTrue(Outbox.isSyntheticJson("""{"id":"x","synthetic": true}"""))
        assertFalse(Outbox.isSyntheticJson("""{"id":"x","synthetic":false}"""))
        assertFalse(Outbox.isSyntheticJson("""{"id":"x","app":"synthetic true"}"""))
        assertFalse(Outbox.isSyntheticJson(json("r1", ActivityEvents.MESSAGE_RECEIVED, false)))
    }

    @Test fun `interrupted logout recovery preserves only real pending data`() {
        val store = OutboxStore(MemoryKeyValue())
        var keptHistory: Boolean? = null
        val done = AccountHistory.finishSignOut(
            hasUserAutomation = true,
            preserve = { store.save(3, Outbox.pendingSnapshot(realEvents + syntheticEvents, emptyList(), now)) },
            reset = { keptHistory = it },
        )
        assertTrue(done)
        assertEquals(false, keptHistory)
        assertEquals(listOf("r1", "r2"), store.read(3).events.map { it.id })
    }

    // ---- retention: real entries are kept exactly as before

    private fun real(at: Long, acked: Boolean = true) = JournalEntry(ActivityEvents.INCOMING_CALL, at, acked)
    private fun synthetic(at: Long) = JournalEntry(ActivityEvents.MESSAGE_RECEIVED, at, false, synthetic = true)

    @Test fun `synthetic rows never evict a real entry at the 200 cap`() {
        val reals = (1..200).map { real(now - it * 1000L) }.reversed()
        val all = reals + (1..3).map { synthetic(now) }
        val kept = ActivityEvents.retained(all, now, 30 * day, 200)
        assertEquals(all.indices.toList(), kept)
    }

    @Test fun `real retention is unchanged by synthetic rows`() {
        val reals = (1..230).map { real(now - it * day / 10, acked = it % 3 == 0) }.reversed()
        val keptReal = ActivityEvents.retained(reals, now, 30 * day, 200).map { reals[it] }
        val mixed = reals + (1..5).map { synthetic(now - it) }
        val keptMixed = ActivityEvents.retained(mixed, now, 30 * day, 200).map { mixed[it] }.filter { !it.synthetic }
        assertEquals(keptReal, keptMixed)
    }

    @Test fun `synthetic rows have their own cap and age limit`() {
        val many = (1..30).map { synthetic(now - it) }.reversed()
        assertEquals(ActivityEvents.MAX_SYNTHETIC, ActivityEvents.retained(many, now, 30 * day, 200).size)
        assertEquals(emptyList<Int>(), ActivityEvents.retained(listOf(synthetic(now - 31 * day)), now, 30 * day, 200))
    }

    // ---- clear by id keeps everything else

    @Test fun `clearing synthetic ids keeps every real entry`() {
        val ids = listOf("r1", "sftest-0a1b2c3d-1", "r2", null, "sftest-0a1b2c3d-2")
        assertEquals(listOf(0, 2, 3), ActivityEvents.keptAfterClear(ids, setOf("sftest-0a1b2c3d-1", "sftest-0a1b2c3d-2")))
    }
}
