package com.SilenceFocus.comms

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.provider.CallLog

/**
 * Client Issue #11 – a phone call Activity row opens the Phone app.
 *
 * A specific call can't be opened: Android has no standard intent for one
 * call-log entry, and the journal keeps only a redacted number (by design),
 * so nothing is pre-filled. Order: the Phone app's call history, else the
 * dialer, else unavailable. No permission is needed for either intent.
 */
object PhoneApp {

    const val CALL_LOG = "CALL_LOG"
    const val DIALER = "DIALER"
    const val UNAVAILABLE = "UNAVAILABLE"

    val ORDER = listOf(CALL_LOG, DIALER)

    /** First target [start] could open, or [UNAVAILABLE]. */
    fun openFirst(targets: List<String>, start: (String) -> Boolean): String =
        targets.firstOrNull { runCatching { start(it) }.getOrDefault(false) } ?: UNAVAILABLE

    fun open(context: Context): String {
        val ctx = context.applicationContext
        return openFirst(ORDER) { target -> start(ctx, intentFor(target)) }
    }

    private fun intentFor(target: String): Intent = when (target) {
        // Data AND type together: type alone resolved to Contacts' "non-phone"
        // screen and the URI alone to Messages on a Pixel image; together they
        // reach the Phone app (verified on the emulator; Samsung to confirm).
        CALL_LOG -> Intent(Intent.ACTION_VIEW).setDataAndType(CallLog.Calls.CONTENT_URI, CallLog.Calls.CONTENT_TYPE)
        else -> Intent(Intent.ACTION_DIAL)
    }.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)

    private fun start(ctx: Context, intent: Intent): Boolean = try {
        ctx.startActivity(intent)
        true
    } catch (e: ActivityNotFoundException) {
        false
    } catch (e: SecurityException) {
        false
    }
}
