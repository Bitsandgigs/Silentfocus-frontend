package com.SilenceFocus.automation

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Logout must not leave an ownerless Activity entry that the next account
 * adopts (the old SILENCE_ENDED "LOGOUT" entry), while genuine
 * SILENCE_ENDED events keep being recorded.
 */
class LogoutJournalTest {

    // ---- what is journaled

    @Test fun `logout evaluation journals nothing`() {
        assertFalse(ActivityEvents.journalsActivity(TriggerReason.LOGOUT))
    }

    @Test fun `every other evaluation still journals`() {
        TriggerReason.values().filter { it != TriggerReason.LOGOUT }.forEach {
            assertTrue(it.name, ActivityEvents.journalsActivity(it))
        }
    }

    @Test fun `manual OFF and automation exits still record SILENCE_ENDED`() {
        val sched = ActiveRule(RuleSource.SCHEDULE, "5", "Night", 1_000, 2_000)
        // Manual OFF of a manual silence.
        assertTrue(ActivityEvents.journalsActivity(TriggerReason.MANUAL_OFF))
        assertTrue(ActivityEvents.silenceChangeNeedsEvent(false, null, RuleSource.MANUAL, emptyList(), emptyList()))
        // Manual OFF while a schedule keeps running.
        assertTrue(ActivityEvents.silenceChangeNeedsEvent(false, null, RuleSource.SCHEDULE, emptyList(), emptyList()))
        // Manual override expiring.
        assertTrue(ActivityEvents.journalsActivity(TriggerReason.OVERRIDE_EXPIRED))
        // Schedule / zone / calendar exits: recorded (as their rule event).
        listOf(TriggerReason.SCHEDULE_END, TriggerReason.ZONE_EXIT, TriggerReason.CALENDAR_END).forEach {
            assertTrue(ActivityEvents.journalsActivity(it))
        }
        assertEquals(ActivityEvents.SCHEDULE_ENDED, ActivityEvents.ruleEnded(sched.source))
        val (_, ended) = ActivityEvents.ruleTransitions(mapOf(sched.windowKey to "Night"), emptyList())
        assertEquals(listOf(sched.windowKey), ended)
    }

    @Test fun `logout artifacts are recognised by reason only`() {
        val ids = ActivityEvents.logoutArtifactIds(
            listOf(
                "a" to "LOGOUT",
                "b" to "MANUAL_OFF",
                "c" to "SCHEDULE_END",
                null to "LOGOUT", // no id: cannot be targeted, stays
                "d" to "",
            ),
        )
        assertEquals(setOf("a"), ids)
        assertTrue(ActivityEvents.isLogoutArtifact("LOGOUT"))
        assertFalse(ActivityEvents.isLogoutArtifact(null))
    }

    // ---- account flows, modelled with the engine's own decisions

    private data class Entry(val id: String, val type: String, val reason: String, val uploaded: Boolean = false)

    /** Journal + owner + outboxes, driven like AutomationEngine (reset / claimHistory / ensureSignedOut). */
    private class Device(var owner: Long, val journal: MutableList<Entry>) {
        val outboxes = mutableMapOf<Long, List<Entry>>()
        var preserveOk = true
        var silent = true

        fun preserve(forOwner: Long): Boolean {
            if (!preserveOk || forOwner <= 0) return false
            outboxes[forOwner] = outboxes[forOwner].orEmpty() + journal.filter { it.uploaded }
            return true
        }

        /** AutomationEngine.reset -> evaluate(LOGOUT). */
        fun reset(keepHistory: Boolean) {
            if (!keepHistory) {
                journal.clear()
                owner = 0
            }
            if (silent && ActivityEvents.journalsActivity(TriggerReason.LOGOUT)) {
                journal += Entry("end-${journal.size}", ActivityEvents.SILENCE_ENDED, TriggerReason.LOGOUT.name)
            }
            silent = false
        }

        /** session.clearSession('logout'): preserve, then reset (keep history if not saved). */
        fun logout(userId: Long) = reset(keepHistory = !preserve(if (userId > 0) userId else owner))

        /** AutomationEngine.claimHistory. */
        fun signIn(userId: Long): AccountHistory.ClaimResult {
            val artifacts = ActivityEvents.logoutArtifactIds(journal.map { it.id to it.reason })
            journal.removeAll { it.id in artifacts }
            return AccountHistory.claim(
                userId = userId,
                owner = owner,
                preserveFor = { preserve(it) },
                clearHistory = { journal.clear() },
                setOwner = { owner = it },
            )
        }
    }

    private fun userThreeDevice() = Device(
        owner = 3,
        journal = mutableListOf(
            Entry("call-1", ActivityEvents.INCOMING_CALL, "", uploaded = true),
            Entry("start-1", ActivityEvents.SILENCE_STARTED, TriggerReason.MANUAL_ON.name),
        ),
    )

    @Test fun `normal logout leaves no ownerless activity event`() {
        val d = userThreeDevice()
        d.logout(3)
        assertTrue(d.journal.isEmpty())
        assertEquals(0L, d.owner)
        // Pending uploadable data went to user 3's outbox.
        assertEquals(listOf("call-1"), d.outboxes[3]?.map { it.id })
    }

    @Test fun `offline and forced-401 logouts take the same local path`() {
        // Offline: the pre-logout sync fails but the outbox save is local.
        // 401: clearSession('logout') with the stored user id.
        listOf(3L, 0L).forEach { id ->
            val d = userThreeDevice()
            d.logout(id)
            assertTrue(d.journal.isEmpty())
            assertEquals(listOf("call-1"), d.outboxes[3]?.map { it.id })
        }
    }

    @Test fun `a different account cannot inherit the previous account's logout activity`() {
        val d = userThreeDevice()
        d.logout(3)
        assertEquals(AccountHistory.ClaimResult.ADOPTED, d.signIn(7))
        assertTrue(d.journal.isEmpty())
        assertEquals(7L, d.owner)
    }

    @Test fun `outbox save failed - history stays user 3's, no new entry, next account cannot see it`() {
        val d = userThreeDevice()
        d.preserveOk = false
        d.logout(3)
        assertEquals(3L, d.owner)
        assertEquals(listOf("call-1", "start-1"), d.journal.map { it.id })
        // Still unsaveable: sign-in as another account is blocked, nothing shown.
        assertEquals(AccountHistory.ClaimResult.BLOCKED, d.signIn(7))
        assertEquals(3L, d.owner)
        // Once it can be saved, it moves to user 3's outbox and is removed.
        d.preserveOk = true
        assertEquals(AccountHistory.ClaimResult.MOVED, d.signIn(7))
        assertTrue(d.journal.isEmpty())
        assertEquals(listOf("call-1"), d.outboxes[3]?.map { it.id })
    }

    @Test fun `interrupted logout recovery leaves no ownerless event`() {
        val d = userThreeDevice()
        val done = AccountHistory.finishSignOut(true, preserve = { d.preserve(d.owner) }, reset = { d.reset(it) })
        assertTrue(done)
        assertTrue(d.journal.isEmpty())
        assertEquals(AccountHistory.ClaimResult.ADOPTED, d.signIn(7))
        assertTrue(d.journal.isEmpty())
    }

    @Test fun `leftover logout entry from an older version is dropped at sign-in`() {
        val d = Device(owner = 0, journal = mutableListOf(Entry("old", ActivityEvents.SILENCE_ENDED, TriggerReason.LOGOUT.name)))
        d.silent = false
        assertEquals(AccountHistory.ClaimResult.ADOPTED, d.signIn(7))
        assertTrue(d.journal.isEmpty())
    }

    @Test fun `same account signing back in keeps its own history (minus logout artifacts)`() {
        val d = userThreeDevice()
        d.journal += Entry("old", ActivityEvents.SILENCE_ENDED, TriggerReason.LOGOUT.name)
        assertEquals(AccountHistory.ClaimResult.KEPT, d.signIn(3))
        assertEquals(listOf("call-1", "start-1"), d.journal.map { it.id })
    }
}
