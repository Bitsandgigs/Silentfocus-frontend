package com.SilenceFocus.automation

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/** Client Issue #9: probe data is cleared with every account/data-reset path. */
class ProbeLifecycleTest {

    @Test fun `owner change = moved or adopted history`() {
        assertTrue(AccountHistory.ownerChanged(AccountHistory.ClaimResult.MOVED))
        assertTrue(AccountHistory.ownerChanged(AccountHistory.ClaimResult.ADOPTED))
        assertFalse(AccountHistory.ownerChanged(AccountHistory.ClaimResult.KEPT))
        assertFalse(AccountHistory.ownerChanged(AccountHistory.ClaimResult.BLOCKED))
    }

    private fun src(path: String) = File("src/main/java/com/SilenceFocus/$path").readText()

    @Test fun `probe cleared at logout, on owner change and on Clear phone activity`() {
        val engine = src("automation/AutomationEngine.kt")
        val reset = engine.substringAfter("fun reset(").substringBefore("fun preserveForLogout")
        assertTrue(reset.contains("NotificationProbes.clear(context)"))
        val claim = engine.substringAfter("fun claimHistory(").substringBefore("fun ensureSignedOut")
        assertTrue(claim.contains("if (AccountHistory.ownerChanged(it)) com.SilenceFocus.comms.NotificationProbes.clear(context)"))
        val clear = src("SilentFocusModule.kt").substringAfter("fun clearRecentEvents(").substringBefore("@ReactMethod")
        assertTrue(clear.contains("NotificationProbes.clear(reactContext)"))
    }

    @Test fun `release can never enable the probe`() {
        val gradle = File("build.gradle").readText()
        val release = gradle.substringAfter("        release {").substringBefore("firebaseCrashlytics")
        assertTrue(release.contains("buildConfigField \"boolean\", \"SF_WHATSAPP_CALL_PROBE\", \"false\""))
        assertFalse(File("src/main/java/com/SilenceFocus/diagnostics").exists())
        assertFalse(File("src/main/AndroidManifest.xml").readText().contains("WhatsAppCallProbe"))
    }
}
