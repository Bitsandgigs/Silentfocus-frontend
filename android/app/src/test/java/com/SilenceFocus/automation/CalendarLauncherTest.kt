package com.SilenceFocus.automation

import org.junit.Assert.assertEquals
import org.junit.Test

class CalendarLauncherTest {
    @Test fun noHandlersIsNone() = assertEquals("none", CalendarLauncher.modeFor(0))
    @Test fun oneHandlerOpensDirectly() = assertEquals("app", CalendarLauncher.modeFor(1))
    @Test fun severalHandlersUseChooser() = assertEquals("chooser", CalendarLauncher.modeFor(3))

    private val google = "com.google.android.calendar"
    private val outlook = "com.microsoft.office.outlook"
    private val samsung = "com.samsung.android.calendar"
    private val all = listOf(google, outlook, samsung)

    @Test fun outlookOnlyNeverOffersGoogle() =
        assertEquals(listOf(outlook, samsung), CalendarLauncher.filterHandlers(all, setOf("Outlook / Exchange")))
    @Test fun googleOnlyNeverOffersOutlook() =
        assertEquals(listOf(google, samsung), CalendarLauncher.filterHandlers(all, setOf("Google")))
    @Test fun googleAndOutlookOfferBoth() =
        assertEquals(all, CalendarLauncher.filterHandlers(all, setOf("Google", "Outlook / Exchange")))
    @Test fun outlookOnlyWithoutOutlookAppOffersNothingFromGoogle() =
        assertEquals(emptyList<String>(), CalendarLauncher.filterHandlers(listOf(google), setOf("Outlook / Exchange")))
    @Test fun noSelectionInfoKeepsAll() = assertEquals(all, CalendarLauncher.filterHandlers(all, emptySet()))
}
