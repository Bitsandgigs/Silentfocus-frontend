package com.SilenceFocus.diagnostics

import com.SilenceFocus.BuildConfig
import org.junit.Assert.assertFalse
import org.junit.Assert.fail
import org.junit.Test

/** Client Issue #9: the WhatsApp call probe must not exist in release builds. */
class ProbeAbsentInReleaseTest {

    @Test fun `release has no probe classes and the flag is off`() {
        assertFalse(BuildConfig.SF_WHATSAPP_CALL_PROBE)
        listOf("WhatsAppCallProbe", "WhatsAppCallProbeModel", "WhatsAppCallProbeStore", "WhatsAppCallProbeInstaller").forEach {
            try {
                Class.forName("com.SilenceFocus.diagnostics.$it")
                fail("$it must not be in the release variant")
            } catch (expected: ClassNotFoundException) {
            }
        }
    }
}
