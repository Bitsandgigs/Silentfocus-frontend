package com.SilenceFocus.automation

import org.junit.Assert.assertEquals
import org.junit.Test

class CalendarLauncherTest {
    @Test fun noHandlersIsNone() = assertEquals("none", CalendarLauncher.modeFor(0))
    @Test fun oneHandlerOpensDirectly() = assertEquals("app", CalendarLauncher.modeFor(1))
    @Test fun severalHandlersUseChooser() = assertEquals("chooser", CalendarLauncher.modeFor(3))
}
