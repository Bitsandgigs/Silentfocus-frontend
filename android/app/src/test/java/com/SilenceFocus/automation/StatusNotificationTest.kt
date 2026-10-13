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

    @Test fun `manual on shows active and silent`() {
        val c = StatusNotification.content(owned = true, paused = false, source = RuleSource.MANUAL, ruleName = null)!!
        assertEquals("Silent Focus is active", c.title)
        assertEquals("Your phone is silent · Turned on manually", c.text)
    }

    @Test fun `source wording, calendar titles never shown`() {
        assertEquals("Your phone is silent · Silent Zone: Office", text(RuleSource.ZONE, "Office"))
        assertEquals("Your phone is silent · Schedule: Night", text(RuleSource.SCHEDULE, "Night"))
        assertEquals("Your phone is silent · Schedule", text(RuleSource.SCHEDULE))
        assertEquals("Your phone is silent · Calendar event", text(RuleSource.CALENDAR, "Doctor visit"))
        assertEquals("Your phone is silent", text(null))
    }

    @Test fun `break-through pause is not reported as silent`() {
        val c = StatusNotification.content(owned = true, paused = true, source = RuleSource.MANUAL, ruleName = null)!!
        assertEquals("Paused while an allowed call rings", c.text)
    }
}
