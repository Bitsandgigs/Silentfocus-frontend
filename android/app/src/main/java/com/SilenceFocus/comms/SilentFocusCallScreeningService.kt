package com.SilenceFocus.comms

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.telecom.Call
import android.telecom.CallScreeningService
import android.telecom.TelecomManager
import android.telephony.TelephonyManager
import android.util.Log
import androidx.annotation.RequiresApi

/**
 * Caller identification for emergency-contact and urgent-repeat-caller
 * exceptions. Bound by Telecom for incoming calls ONLY while the user has
 * made Silent Focus their call-screening app (ROLE_CALL_SCREENING, API 29+,
 * requested from Emergency Contacts with an explanation). It never blocks,
 * rejects or silences a call: every call gets the default "allow" response.
 */
@RequiresApi(Build.VERSION_CODES.Q)
class SilentFocusCallScreeningService : CallScreeningService() {

    override fun onScreenCall(details: Call.Details) {
        try {
            val incoming = details.callDirection == Call.Details.DIRECTION_INCOMING
            CallBreakthroughs.onCall(this, callerNumber(details), incoming)
        } catch (e: RuntimeException) {
            Log.w(TAG, "call handling failed: ${e.javaClass.simpleName}")
        } finally {
            // Always answer promptly and never interfere with the call.
            respondToCall(details, CallResponse.Builder().build())
        }
    }

    private fun callerNumber(details: Call.Details): String? {
        if (details.handlePresentation != TelecomManager.PRESENTATION_ALLOWED) return null
        val handle: Uri = details.handle ?: return null
        return if (handle.scheme == "tel") handle.schemeSpecificPart else null
    }

    private companion object {
        const val TAG = "SilentFocusCalls"
    }
}

/**
 * Ends a break-through, or an Alert Only alert, when the phone stops ringing
 * (answered -> OFFHOOK, missed/rejected -> IDLE). PHONE_STATE is delivered to manifest receivers
 * in the background; it needs READ_PHONE_STATE only (no call-log access, the
 * number isn't read here). Without that permission the break-through ends
 * at its safety expiry instead.
 */
class PhoneStateReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != TelephonyManager.ACTION_PHONE_STATE_CHANGED) return
        when (val state = intent.getStringExtra(TelephonyManager.EXTRA_STATE)) {
            TelephonyManager.EXTRA_STATE_IDLE, TelephonyManager.EXTRA_STATE_OFFHOOK -> {
                CallBreakthroughs.onRingingStopped(context)
                // Alert Only (no-op unless a SIM alert is showing).
                runCatching { CallBreakthroughs.onSimCallEnded(context, answered = state == TelephonyManager.EXTRA_STATE_OFFHOOK) }
            }
        }
    }
}
