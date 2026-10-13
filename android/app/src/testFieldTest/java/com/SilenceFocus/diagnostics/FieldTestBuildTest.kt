package com.SilenceFocus.diagnostics

import com.SilenceFocus.BuildConfig
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

/**
 * Round 3 client APK (`fieldTest` build type): release code without the
 * debug source set - no WhatsApp probe, no synthetic Activity harness - and
 * automatic uploads off.
 */
class FieldTestBuildTest {

    @Test fun `no probe or harness classes are in the field-test variant`() {
        listOf(
            "WhatsAppCallProbe", "WhatsAppCallProbeModel", "WhatsAppCallProbeStore", "WhatsAppCallProbeInstaller",
            "ActivityTestHarnessModel", "ActivityTestHarnessReceiver", "ActivityTestHarnessJanitor",
            "HarnessState", "HarnessJournal", "HarnessNotifications",
        ).forEach {
            try {
                Class.forName("com.SilenceFocus.diagnostics.$it")
                fail("$it must not be in the field-test variant")
            } catch (expected: ClassNotFoundException) {
            }
        }
    }

    @Test fun `flags - not debug, probe and harness off, automatic uploads off`() {
        assertFalse(BuildConfig.DEBUG)
        assertFalse(BuildConfig.SF_WHATSAPP_CALL_PROBE)
        assertFalse(BuildConfig.SF_ACTIVITY_TEST_HARNESS)
        assertEquals("", BuildConfig.DEBUG_SERVER_WRITES_ACCOUNT_ID)
        assertTrue(BuildConfig.SF_AUTOMATIC_UPLOADS_DISABLED)
    }
}
