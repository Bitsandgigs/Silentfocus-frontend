package com.SilenceFocus.comms

import android.content.Context
import android.service.notification.StatusBarNotification
import android.util.Log

/**
 * Optional diagnostics hook for the notification listener (Client Issue #9).
 *
 * Release builds never install a probe: the only implementation lives in the
 * debug source set (src/debug/.../diagnostics/WhatsAppCallProbe.kt) and is
 * installed only when the debug build was made with
 * SF_WHATSAPP_CALL_PROBE=true. With no probe installed every call here is a
 * no-op. A probe can never break the listener: failures are swallowed.
 */
interface NotificationProbe {
    fun onPosted(context: Context, sbn: StatusBarNotification)
    fun onRemoved(context: Context, sbn: StatusBarNotification, reason: Int)

    /** Drops everything recorded (logout). */
    fun clear(context: Context)
}

object NotificationProbes {
    private const val TAG = "SilentFocusProbe"

    @Volatile
    var installed: NotificationProbe? = null

    fun posted(context: Context, sbn: StatusBarNotification) = safely { it.onPosted(context, sbn) }

    fun removed(context: Context, sbn: StatusBarNotification, reason: Int) = safely { it.onRemoved(context, sbn, reason) }

    fun clear(context: Context) = safely { it.clear(context) }

    private inline fun safely(block: (NotificationProbe) -> Unit) {
        val probe = installed ?: return
        try {
            block(probe)
        } catch (e: RuntimeException) {
            Log.w(TAG, "probe failed: ${e.javaClass.simpleName}")
        }
    }
}
