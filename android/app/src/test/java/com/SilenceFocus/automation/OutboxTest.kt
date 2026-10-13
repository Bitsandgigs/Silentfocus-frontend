package com.SilenceFocus.automation

import com.SilenceFocus.automation.Outbox.Claim
import com.SilenceFocus.comms.MemoryKeyValue
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class OutboxTest {

    private val now = 1_791_620_000_000L

    private fun ev(id: String, type: String = ActivityEvents.MESSAGE_RECEIVED, at: Long = now - 1000, acked: Boolean = false) =
        Outbox.Event(id, type, at, acked, """{"id":"$id","type":"$type","at":$at,"app":"Messages, Inc. \"x\""}""")

    private fun session(start: Long, end: Long?, ackedEnd: Long? = null) = SilenceSession(start, end, "MANUAL", ackedEnd = ackedEnd)

    // ---- what logout keeps

    @Test fun `snapshot keeps unconfirmed calls and messages, finished unconfirmed sessions and the open session closed now`() {
        val events = listOf(
            ev("1", ActivityEvents.MESSAGE_RECEIVED),
            ev("2", ActivityEvents.INCOMING_CALL, acked = true),
            ev("3", ActivityEvents.ZONE_ENTER), // never uploaded
            ev("4", ActivityEvents.AUTO_REPLY_SENT),
        )
        val sessions = listOf(
            session(now - 9000, now - 8000, ackedEnd = now - 8000), // confirmed
            session(now - 7000, now - 6000), // pending
            session(now - 5000, null), // open at logout
        )
        val c = Outbox.pendingSnapshot(events, sessions, now)
        assertEquals(listOf("1", "4"), c.events.map { it.id })
        assertEquals(
            listOf(Outbox.Session(now - 7000, now - 6000, "MANUAL"), Outbox.Session(now - 5000, now, "MANUAL")),
            c.sessions,
        )
    }

    @Test fun `merge is idempotent - re-saving after a crash adds no duplicates, a later end wins`() {
        val a = Outbox.Content(listOf(ev("1")), listOf(Outbox.Session(10, 20, null)))
        val b = Outbox.Content(listOf(ev("1"), ev("2")), listOf(Outbox.Session(10, 25, null)))
        val m = Outbox.merge(Outbox.merge(a, b), b)
        assertEquals(listOf("1", "2"), m.events.map { it.id }.sorted())
        assertEquals(listOf(Outbox.Session(10, 25, null)), m.sessions)
    }

    @Test fun `storage round trip keeps the original event JSON`() {
        val c = Outbox.Content(listOf(ev("1"), ev("2", acked = true)), listOf(Outbox.Session(10, 20, null), Outbox.Session(30, 40, "ZONE")))
        assertEquals(c, Outbox.decode(Outbox.encode(c)))
    }

    // ---- per-account storage

    @Test fun `accounts are isolated - each reads only its own outbox`() {
        val store = OutboxStore(MemoryKeyValue())
        assertTrue(store.save(3, Outbox.Content(listOf(ev("a3")))))
        assertTrue(store.save(7, Outbox.Content(listOf(ev("a7")))))
        assertEquals(listOf("a3"), store.read(3).events.map { it.id })
        assertEquals(listOf("a7"), store.read(7).events.map { it.id })
        assertTrue(store.read(9).isEmpty())
        assertFalse(store.save(0, Outbox.Content(listOf(ev("x"))))) // no account: never saved
    }

    @Test fun `failed durable write - reported, nothing changed`() {
        val kv = object : com.SilenceFocus.comms.KeyValue by MemoryKeyValue() {
            override fun commitString(key: String, value: String?) = false
        }
        val store = OutboxStore(kv)
        assertFalse(store.save(3, Outbox.Content(listOf(ev("1")))))
        assertTrue(store.read(3).isEmpty())
    }

    @Test fun `write that claims success but loses data - read-back reports failure`() {
        val kv = object : com.SilenceFocus.comms.KeyValue by MemoryKeyValue() {
            override fun commitString(key: String, value: String?) = true // nothing stored
        }
        assertFalse(OutboxStore(kv).save(3, Outbox.Content(listOf(ev("1")))))
    }

    @Test fun `only read-back-verified entries are removed (partial upload)`() {
        val store = OutboxStore(MemoryKeyValue())
        store.save(3, Outbox.Content(listOf(ev("1"), ev("2")), listOf(Outbox.Session(10, 20, null), Outbox.Session(30, 40, null))))
        assertTrue(store.removeVerified(3, setOf("1"), mapOf(10L to 20L, 30L to 99L))) // 30 read back with another end
        val left = store.read(3)
        assertEquals(listOf("2"), left.events.map { it.id })
        assertEquals(listOf(Outbox.Session(30, 40, null)), left.sessions)
        store.removeVerified(3, setOf("2"), mapOf(30L to 40L))
        assertTrue(store.read(3).isEmpty())
    }

    @Test fun `never trimmed for size`() {
        val store = OutboxStore(MemoryKeyValue())
        val many = (1..1500).map { ev("e$it", at = now - it) }
        assertTrue(store.save(3, Outbox.Content(many)))
        assertEquals(1500, store.read(3).events.size)
    }

    @Test fun `account deletion drops only that account`() {
        val store = OutboxStore(MemoryKeyValue())
        store.save(3, Outbox.Content(listOf(ev("a"))))
        store.save(7, Outbox.Content(listOf(ev("b"))))
        assertTrue(store.drop(3))
        assertTrue(store.read(3).isEmpty())
        assertEquals(1, store.read(7).size)
    }

    // ---- sign-in

    @Test fun `sign-in claim - same account keeps, no owner adopts, another account moves`() {
        assertEquals(Claim.KEEP, Outbox.claimAction(owner = 3, userId = 3))
        assertEquals(Claim.ADOPT, Outbox.claimAction(owner = 0, userId = 3))
        assertEquals(Claim.MOVE_TO_OWNER_OUTBOX, Outbox.claimAction(owner = 7, userId = 3))
    }

    // ---- account switching (AccountHistory.claim)

    private class Fake(var owner: Long, val preserveOk: Boolean) {
        val preserved = mutableListOf<Long>()
        var cleared = false
        fun claim(userId: Long) = AccountHistory.claim(
            userId, owner,
            preserveFor = { preserved += it; preserveOk },
            clearHistory = { cleared = true },
            setOwner = { owner = it },
        )
    }

    @Test fun `switch - storage failure blocks the sign-in and deletes nothing`() {
        val f = Fake(owner = 7, preserveOk = false)
        assertEquals(AccountHistory.ClaimResult.BLOCKED, f.claim(3))
        assertEquals(listOf(7L), f.preserved) // tried to save for the PREVIOUS account only
        assertFalse(f.cleared)
        assertEquals(7L, f.owner) // history still belongs to account 7
    }

    @Test fun `switch - saved to the previous account's outbox, then removed and re-owned`() {
        val f = Fake(owner = 7, preserveOk = true)
        assertEquals(AccountHistory.ClaimResult.MOVED, f.claim(3))
        assertEquals(listOf(7L), f.preserved)
        assertTrue(f.cleared)
        assertEquals(3L, f.owner)
    }

    @Test fun `same account keeps, unowned is adopted, no user id is refused - none preserve or clear`() {
        Fake(3, preserveOk = false).let { assertEquals(AccountHistory.ClaimResult.KEPT, it.claim(3)); assertFalse(it.cleared) }
        Fake(0, preserveOk = false).let { assertEquals(AccountHistory.ClaimResult.ADOPTED, it.claim(3)); assertEquals(3L, it.owner) }
        Fake(7, preserveOk = true).let { assertEquals(AccountHistory.ClaimResult.BLOCKED, it.claim(0)); assertFalse(it.cleared) }
    }

    // ---- signed-out start-up (crash after sign-out, before the reset)

    @Test fun `cut-short sign-out - reset, keeping history only if it could not be saved`() {
        val resets = mutableListOf<Boolean>()
        assertTrue(AccountHistory.finishSignOut(true, preserve = { true }, reset = { resets += it }))
        assertTrue(AccountHistory.finishSignOut(true, preserve = { false }, reset = { resets += it }))
        assertEquals(listOf(false, true), resets)
    }

    @Test fun `clean signed-out state - nothing is touched`() {
        var called = false
        assertFalse(AccountHistory.finishSignOut(false, preserve = { called = true; true }, reset = { called = true }))
        assertFalse(called)
    }

    @Test fun `user automation is detected from silencing, override, schedules, zones or calendar`() {
        assertFalse(AccountHistory.hasUserAutomation(false, OverrideMode.NONE, 0, 0, 0))
        assertTrue(AccountHistory.hasUserAutomation(true, OverrideMode.NONE, 0, 0, 0))
        assertTrue(AccountHistory.hasUserAutomation(false, OverrideMode.FORCE_ON, 0, 0, 0))
        assertTrue(AccountHistory.hasUserAutomation(false, OverrideMode.NONE, 1, 0, 0))
        assertTrue(AccountHistory.hasUserAutomation(false, OverrideMode.NONE, 0, 1, 0))
        assertTrue(AccountHistory.hasUserAutomation(false, OverrideMode.NONE, 0, 0, 1))
    }
}
