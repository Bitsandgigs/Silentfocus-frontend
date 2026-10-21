package com.SilenceFocus.automation

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class StatusNotificationTest {

    private fun text(source: RuleSource?, name: String? = null) =
        StatusNotification.content(owned = true, paused = false, source = source, ruleName = name)?.text

    @Test fun `nothing is shown while not silencing`() {
        assertNull(StatusNotification.content(owned = false, paused = false, source = RuleSource.MANUAL, ruleName = null))
        assertNull(StatusNotification.content(owned = false, paused = true, source = null, ruleName = null))
    }

    @Test fun `manual on keeps the header and only says why`() {
        val c = StatusNotification.content(owned = true, paused = false, source = RuleSource.MANUAL, ruleName = null)!!
        assertEquals("Silent Focus is active", c.title)
        assertEquals("Turned on manually", c.text)
    }

    @Test fun `source wording without the redundant silent text`() {
        assertEquals("Silent Zone: Office", text(RuleSource.ZONE, "Office"))
        assertEquals("Schedule: Night", text(RuleSource.SCHEDULE, "Night"))
        assertEquals("Schedule", text(RuleSource.SCHEDULE))
        assertEquals("Location Mode: City Library", text(RuleSource.PLACE, "City Library"))
        assertEquals("Your phone is silent", text(null))
    }

    @Test fun `calendar event shows its subject`() {
        assertEquals("Your phone is silent · Calendar event: Project Meeting", text(RuleSource.CALENDAR, "Project Meeting"))
        assertEquals("Calendar event", text(RuleSource.CALENDAR, null))
        assertEquals("Calendar event", text(RuleSource.CALENDAR, "   "))
    }

    @Test fun `lock screen version never carries names`() {
        val cal = StatusNotification.content(owned = true, paused = false, source = RuleSource.CALENDAR, ruleName = "Doctor visit")!!
        assertEquals("Calendar event", cal.publicText)
        val zone = StatusNotification.content(owned = true, paused = false, source = RuleSource.ZONE, ruleName = "Home")!!
        assertEquals("Silent Zone", zone.publicText)
    }

    @Test fun `break-through pause is not reported as silent`() {
        val c = StatusNotification.content(owned = true, paused = true, source = RuleSource.MANUAL, ruleName = null)!!
        assertEquals("Paused while an allowed call rings", c.text)
    }

    @Test fun `manual chronometer uses its wall clock session anchor`() {
        // Android 16 rejects an app-provided `when` that is an old
        // elapsedRealtime value. The manual timestamp must stay in epoch time.
        assertEquals(1_700_000_000_000L, StatusNotification.timestampFor(
            manual = true,
            manualStartedAt = 1_700_000_000_000L,
            since = 1_699_999_999_000L,
            now = 1_700_000_010_000L,
        ))
    }
}
