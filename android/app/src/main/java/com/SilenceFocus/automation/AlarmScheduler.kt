package com.SilenceFocus.automation

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build

/**
 * Keeps exactly one alarm registered: the next boundary (a schedule start/end
 * or a manual-override expiry). When it fires, the engine re-evaluates all
 * rules and registers the following one. No JS timers or polling loops.
 *
 * Exact alarms need "Alarms & reminders" access on Android 12+ (denied by
 * default for new installs on 14+). Without it we fall back to an inexact
 * allow-while-idle alarm, which Android may deliver a few minutes late in
 * Doze; the UI is told via [canScheduleExact].
 */
class AlarmScheduler(context: Context) {

    private val ctx = context.applicationContext
    private val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager

    fun canScheduleExact(): Boolean =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.S || am.canScheduleExactAlarms()

    /** Returns true if an exact alarm was registered. */
    fun schedule(boundary: Boundary?): Boolean {
        val pi = pendingIntent(boundary?.kind, boundary?.source)
        am.cancel(pi)
        if (boundary == null) return false
        if (canScheduleExact()) {
            try {
                am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, boundary.atMillis, pi)
                return true
            } catch (_: SecurityException) {
                // Access revoked between the check and the call; fall through.
            }
        }
        am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, boundary.atMillis, pi)
        return false
    }

    fun cancel() = am.cancel(pendingIntent(null, null))

    private fun pendingIntent(kind: BoundaryKind?, source: RuleSource?): PendingIntent {
        // Same request code/action for every kind, so a new alarm always
        // replaces the previous one (extras don't take part in matching).
        val intent = Intent(ctx, AutomationAlarmReceiver::class.java)
            .setAction(ACTION_BOUNDARY)
            .putExtra(EXTRA_KIND, kind?.name)
            .putExtra(EXTRA_SOURCE, source?.name)
        return PendingIntent.getBroadcast(
            ctx,
            REQUEST_CODE,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    companion object {
        const val ACTION_BOUNDARY = "com.SilenceFocus.automation.BOUNDARY"
        const val EXTRA_KIND = "kind"
        const val EXTRA_SOURCE = "source"
        private const val REQUEST_CODE = 4101
    }
}
