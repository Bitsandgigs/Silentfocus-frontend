package com.SilenceFocus.automation

import android.provider.CalendarContract
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class CalendarTitlesTest {

    private fun rule(key: String, start: Long) = ActiveRule(RuleSource.CALENDAR, key, null, start, start + 3_600_000)

    @Test fun `key parsing`() {
        assertEquals(3L to 42L, CalendarTitles.parseKey("3:42:1700000000000"))
        assertNull(CalendarTitles.parseKey("3:42"))
        assertNull(CalendarTitles.parseKey("a:42:1"))
    }

    @Test fun `title shown only for the same calendar and non-private events`() {
        val pub = CalendarTitles.EventInfo(3, "  Project   Meeting ", CalendarContract.Events.ACCESS_DEFAULT)
        assertEquals("Project Meeting", CalendarTitles.shownTitle(pub, 3))
        // Event moved to another calendar (maybe one the user didn't select).
        assertNull(CalendarTitles.shownTitle(pub, 4))
        assertNull(CalendarTitles.shownTitle(pub.copy(accessLevel = CalendarContract.Events.ACCESS_PRIVATE), 3))
        assertNull(CalendarTitles.shownTitle(pub.copy(accessLevel = CalendarContract.Events.ACCESS_CONFIDENTIAL), 3))
        assertNull(CalendarTitles.shownTitle(pub.copy(title = ""), 3))
        assertNull(CalendarTitles.shownTitle(pub.copy(title = null), 3))
        assertNull(CalendarTitles.shownTitle(null, 3))
    }

    @Test fun `several events - the latest started is named, others counted`() {
        val active = listOf(
            rule("1:10:100", 100),
            rule("1:11:200", 200),
            ActiveRule(RuleSource.ZONE, "z", "Office", 50, null),
        )
        assertEquals("1:11:200" to 1, CalendarTitles.primary(active))
        assertEquals("Standup +1 more", CalendarTitles.label("Standup", 1))
        assertEquals("Standup", CalendarTitles.label("Standup", 0))
        assertNull(CalendarTitles.label(null, 2))
        assertNull(CalendarTitles.primary(listOf(ActiveRule(RuleSource.ZONE, "z", null, 1, null))))
    }

    @Test fun `long titles are shortened`() {
        val long = "x".repeat(200)
        assertEquals(80, CalendarTitles.shownTitle(CalendarTitles.EventInfo(1, long, 0), 1)!!.length)
    }
}
