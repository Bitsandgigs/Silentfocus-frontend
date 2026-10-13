package com.SilenceFocus.comms

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.telephony.TelephonyManager
import android.util.Log
import com.SilenceFocus.automation.ActivityEvents
import com.SilenceFocus.automation.AutomationEngine
import com.SilenceFocus.automation.EngineStore
import com.SilenceFocus.automation.SessionCounter
import com.SilenceFocus.automation.TriggerReason
import org.json.JSONObject

/**
 * Glue between call detection (SilentFocusCallScreeningService) and the
 * engine. Runs natively in the app process; no React Native involved.
 */
object CallBreakthroughs {

    private const val TAG = "SilentFocusCalls"

    /**
     * Handles one call. Returns the outcome; when it qualifies, silencing is
     * paused through the engine and the caller's ringtone is played.
     */
    @Synchronized
    fun onCall(context: Context, number: String?, incoming: Boolean, now: Long = System.currentTimeMillis()): CallOutcome {
        val ctx = context.applicationContext
        val engine = EngineStore(ctx)
        val comms = CommsStore(ctx)
        // "Silent Focus is silencing the device" - also true while an earlier
        // break-through call has it paused (overlapping calls).
        val silentActive = engine.owned
        val outcome = CallDecider(comms.emergencyContacts, comms.callSettings, comms.salt)
            .onCall(number, incoming, silentActive, now, comms.repeatCallState)
        comms.repeatCallState = outcome.state

        val caller = PhoneNumbers.redact(number)
        Log.i(TAG, "call ${if (incoming) "in" else "out"} from $caller: ${outcome.breakthrough ?: outcome.reason}")

        if (outcome.record) {
            engine.appendEvent(JSONObject().apply {
                put("type", when (outcome.breakthrough) {
                    BreakthroughKind.EMERGENCY_CONTACT -> ActivityEvents.EMERGENCY_BREAKTHROUGH
                    BreakthroughKind.URGENT_REPEAT_CALLER -> ActivityEvents.URGENT_REPEAT_CALLER
                    null -> ActivityEvents.INCOMING_CALL
                })
                put("caller", caller)
                outcome.contact?.name?.let { put("contactName", it) }
                if (outcome.repeatCount > 0) put("repeatCount", outcome.repeatCount)
                if (outcome.breakthrough == null) put("detail", outcome.reason)
                put("at", now)
            })
        }

        if (outcome.record) {
            AutomationEngine.countInSession(ctx, when (outcome.breakthrough) {
                BreakthroughKind.EMERGENCY_CONTACT -> SessionCounter.EMERGENCY
                BreakthroughKind.URGENT_REPEAT_CALLER -> SessionCounter.URGENT
                null -> SessionCounter.CALL_SILENCED
            })
        }

        val kind = outcome.breakthrough ?: return outcome
        val reason = if (kind == BreakthroughKind.EMERGENCY_CONTACT) TriggerReason.EMERGENCY_EXCEPTION else TriggerReason.URGENT_CALL
        val paused = AutomationEngine.startBreakthrough(ctx, kind.name, reason, now)
        if (paused) {
            // The call may already have ended while it was being screened
            // (the IDLE broadcast then arrived before this breakthrough).
            if (isPhoneIdle(ctx) == true) onRingingStopped(ctx) else BreakthroughRinger.startSoon(ctx)
        }
        return outcome
    }

    /**
     * True/false when the call state is readable (READ_PHONE_STATE granted),
     * null otherwise - then the breakthrough relies on its expiry.
     */
    fun isPhoneIdle(context: Context): Boolean? {
        if (context.checkSelfPermission(Manifest.permission.READ_PHONE_STATE) != PackageManager.PERMISSION_GRANTED) return null
        val tm = context.getSystemService(TelephonyManager::class.java) ?: return null
        return try {
            val state = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                tm.callStateForSubscription
            } else {
                @Suppress("DEPRECATION")
                tm.callState
            }
            state == TelephonyManager.CALL_STATE_IDLE
        } catch (e: SecurityException) {
            null
        }
    }

    /** The phone stopped ringing (answered, rejected, missed). */
    fun onRingingStopped(context: Context) {
        BreakthroughRinger.stop()
        AutomationEngine.endBreakthrough(context.applicationContext)
    }
}
