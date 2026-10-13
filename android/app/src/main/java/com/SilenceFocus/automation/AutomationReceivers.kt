package com.SilenceFocus.automation

import android.app.AlarmManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Fires at a schedule start/end or override expiry; re-evaluates everything. */
class AutomationAlarmReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != AlarmScheduler.ACTION_BOUNDARY) return
        val calendar = intent.getStringExtra(AlarmScheduler.EXTRA_SOURCE) == RuleSource.CALENDAR.name
        val reason = when (intent.getStringExtra(AlarmScheduler.EXTRA_KIND)) {
            BoundaryKind.START.name -> if (calendar) TriggerReason.CALENDAR_START else TriggerReason.SCHEDULE_START
            BoundaryKind.END.name -> if (calendar) TriggerReason.CALENDAR_END else TriggerReason.SCHEDULE_END
            BoundaryKind.OVERRIDE_EXPIRY.name -> TriggerReason.OVERRIDE_EXPIRED
            BoundaryKind.BREAKTHROUGH_END.name -> TriggerReason.BREAKTHROUGH_ENDED
            else -> TriggerReason.SCHEDULE_CHANGED
        }
        AutomationEngine.evaluate(context, reason)
    }
}

/**
 * Rebuilds alarms and re-applies the correct state after events that clear
 * alarms or move wall-clock time. All of these broadcasts are exempt from
 * the Android 8+ implicit-broadcast restrictions.
 */
class SystemEventReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_PACKAGE_DATA_CLEARED) {
            // Clearing Play Services data wipes every app's geofences.
            if (intent.data?.schemeSpecificPart == PLAY_SERVICES) {
                GeofenceRegistrar.scheduleReRegister(context.applicationContext)
            }
            return
        }
        val reason = when (intent.action) {
            Intent.ACTION_BOOT_COMPLETED -> TriggerReason.BOOT
            Intent.ACTION_TIME_CHANGED -> TriggerReason.TIME_CHANGED
            Intent.ACTION_TIMEZONE_CHANGED -> TriggerReason.TIMEZONE_CHANGED
            Intent.ACTION_MY_PACKAGE_REPLACED -> TriggerReason.APP_UPDATED
            AlarmManager.ACTION_SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED -> TriggerReason.PERMISSION_CHANGED
            else -> return
        }
        if (reason == TriggerReason.PERMISSION_CHANGED) {
            AutomationEngine.evaluate(context, reason)
        } else {
            AutomationEngine.rebuild(context, reason)
        }
    }

    private companion object {
        const val PLAY_SERVICES = "com.google.android.gms"
    }
}
