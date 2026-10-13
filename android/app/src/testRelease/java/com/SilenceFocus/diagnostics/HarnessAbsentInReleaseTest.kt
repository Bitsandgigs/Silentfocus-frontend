package com.SilenceFocus.diagnostics

import com.SilenceFocus.BuildConfig
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.fail
import org.junit.Test

/** Client Issues #10/#11: the synthetic Activity test harness must not exist in release builds. */
class HarnessAbsentInReleaseTest {

    @Test fun `release has no harness classes, the flag is off and uploads are not disabled`() {
        assertFalse(BuildConfig.SF_ACTIVITY_TEST_HARNESS)
        assertEquals("", BuildConfig.DEBUG_SERVER_WRITES_ACCOUNT_ID)
        // Round 3: only the fieldTest build type turns automatic uploads off.
        assertFalse(BuildConfig.SF_AUTOMATIC_UPLOADS_DISABLED)
        listOf(
            "ActivityTestHarnessModel", "ActivityTestHarnessReceiver", "ActivityTestHarnessJanitor",
            "HarnessState", "HarnessJournal", "HarnessNotifications",
        ).forEach {
            try {
                Class.forName("com.SilenceFocus.diagnostics.$it")
                fail("$it must not be in the release variant")
            } catch (expected: ClassNotFoundException) {
            }
        }
    }
}
