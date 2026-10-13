package com.SilenceFocus.automation

import com.SilenceFocus.automation.CalendarSync.DeviceCalendar
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** Round 3 #4: every calendar on the phone, user selection, instances filter. */
class CalendarSelectionTest {

    private fun cal(id: Long, name: String, account: String?, type: String?, primary: Boolean = false) =
        DeviceCalendar(id, name, account, type, null, visible = true, synced = true, primary = primary)

    @Test fun `providers beyond Google are recognised`() {
        assertEquals("Google", CalendarSync.providerLabel("com.google"))
        assertEquals("Samsung", CalendarSync.providerLabel("com.osp.app.signin"))
        assertEquals("Samsung", CalendarSync.providerLabel("com.samsung.android.exchange"))
        assertEquals("Outlook / Exchange", CalendarSync.providerLabel("com.microsoft.office.outlook.USER_ACCOUNT"))
        assertEquals("Outlook / Exchange", CalendarSync.providerLabel("com.android.exchange"))
        assertEquals("On this phone", CalendarSync.providerLabel("LOCAL"))
        assertEquals("Other", CalendarSync.providerLabel("org.dmfs.caldav.account"))
        assertEquals("Other", CalendarSync.providerLabel(null))
    }

    @Test fun `no selection = every visible calendar (unchanged default)`() {
        assertEquals("visible = 1", CalendarSync.instanceSelection(null))
    }

    @Test fun `a selection filters by calendar id only - numbers, never user text`() {
        assertEquals("calendar_id IN (2,7,11)", CalendarSync.instanceSelection(setOf(11L, 2L, 7L)))
        assertEquals("0", CalendarSync.instanceSelection(emptySet()))
    }

    @Test fun `deleted calendars drop out of the selection`() {
        assertEquals(setOf(2L), CalendarSync.effectiveSelection(setOf(2L, 99L), listOf(1L, 2L, 3L)))
        assertNull(CalendarSync.effectiveSelection(null, listOf(1L)))
    }

    @Test fun `picker order - Google first, grouped by account, primary first`() {
        val sorted = CalendarSync.sortForPicker(
            listOf(
                cal(5, "Work", "me@corp.com", "com.microsoft.office.outlook.USER_ACCOUNT"),
                cal(3, "Holidays", "me@gmail.com", "com.google"),
                cal(4, "me@gmail.com", "me@gmail.com", "com.google", primary = true),
                cal(6, "My calendar", "My calendar", "com.osp.app.signin"),
            ),
        )
        assertEquals(listOf(4L, 3L, 5L, 6L), sorted.map { it.id })
    }

    @Test fun `no stored selection means all calendars`() {
        // (org.json is stubbed on the JVM; parsing is checked on the emulator.)
        assertNull(EngineStore.parseIds(null))
    }
}
