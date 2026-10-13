package com.SilenceFocus.automation

import com.SilenceFocus.automation.AccountHistory.ClaimResult
import com.SilenceFocus.comms.MemoryKeyValue
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Confirmed HTTP 401 = session expiry, not logout (AutomationEngine.expireSession):
 * rules stop, the account's history and pending data stay on the phone owned
 * by it; same account gets it back, another account never sees it.
 */
class SessionExpiryTest {

    private val now = 1_791_620_000_000L

    @Test fun `owner recorded at expiry - the expiring account, or the existing owner`() {
        assertEquals(3L, AccountHistory.ownerAfterExpiry(userId = 3, owner = 0))
        assertEquals(3L, AccountHistory.ownerAfterExpiry(userId = 3, owner = 3))
        // Already someone's history: it stays theirs.
        assertEquals(5L, AccountHistory.ownerAfterExpiry(userId = 3, owner = 5))
        assertEquals(5L, AccountHistory.ownerAfterExpiry(userId = 0, owner = 5))
        // Nobody known: caller falls back to the logout path.
        assertNull(AccountHistory.ownerAfterExpiry(userId = 0, owner = 0))
    }

    /** Local stores of one phone after a session expiry of account 3. */
    private class Phone {
        var owner = 3L
        var history = listOf("journal", "sessions", "contacts", "learned")
        var cleared = 0
        val outbox = OutboxStore(MemoryKeyValue())
        val pending = Outbox.Content(
            listOf(Outbox.Event("e1", ActivityEvents.INCOMING_CALL, 1L, false, """{"id":"e1"}""")),
            listOf(Outbox.Session(10, 20, "MANUAL")),
        )

        fun signIn(userId: Long) = AccountHistory.claim(
            userId = userId,
            owner = owner,
            preserveFor = { o -> outbox.save(o, pending) },
            clearHistory = {
                history = emptyList()
                cleared++
            },
            setOwner = { owner = it },
        )
    }

    @Test fun `same account signs in again - everything kept, nothing copied to the outbox`() {
        val phone = Phone()
        assertEquals(ClaimResult.KEPT, phone.signIn(3))
        assertEquals(4, phone.history.size)
        assertEquals(0, phone.cleared)
        assertTrue(phone.outbox.read(3).isEmpty())
    }

    @Test fun `another account signs in - pending saved to the owner's outbox, then everything cleared`() {
        val phone = Phone()
        assertEquals(ClaimResult.MOVED, phone.signIn(7))
        assertEquals(emptyList<String>(), phone.history)
        assertEquals(7L, phone.owner)
        assertEquals(listOf("e1"), phone.outbox.read(3).events.map { it.id })
        assertTrue(phone.outbox.read(7).isEmpty())
        assertTrue(AccountHistory.ownerChanged(ClaimResult.MOVED))
    }

    @Test fun `a repeated move does not duplicate outbox entries`() {
        val phone = Phone()
        phone.outbox.save(3, phone.pending)
        phone.signIn(7)
        assertEquals(1, phone.outbox.read(3).events.size)
        assertEquals(1, phone.outbox.read(3).sessions.size)
    }

    @Test fun `another account is blocked when the owner's pending data can't be saved - nothing deleted`() {
        var owner = 3L
        var cleared = false
        val r = AccountHistory.claim(7, owner, preserveFor = { false }, clearHistory = { cleared = true }, setOwner = { owner = it })
        assertEquals(ClaimResult.BLOCKED, r)
        assertFalse(cleared)
        assertEquals(3L, owner)
    }

    @Test fun `signed-out start after an expiry does not wipe the kept history`() {
        // Expiry cleared rules and override and ended silencing.
        val automation = AccountHistory.hasUserAutomation(owned = false, override = OverrideMode.NONE, schedules = 0, zones = 0, calendarEvents = 0)
        var resetCalled = false
        assertFalse(AccountHistory.finishSignOut(automation, preserve = { true }, reset = { resetCalled = true }))
        assertFalse(resetCalled)
    }

    @Test fun `kept pending entries survive retention while signed out`() {
        val entries = listOf(
            ActivityEvents.JournalEntry(ActivityEvents.INCOMING_CALL, now - 40L * 24 * 60 * 60_000, acknowledged = false),
            ActivityEvents.JournalEntry(ActivityEvents.ZONE_ENTER, now - 1000, acknowledged = false),
        )
        assertEquals(listOf(0, 1), ActivityEvents.retained(entries, now, 30L * 24 * 60 * 60_000, 200))
    }
}
