package com.SilenceFocus.automation

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.SilenceFocus.MainActivity
import com.SilenceFocus.R

/**
 * The "Silent Focus is active" status notification. A plain ongoing
 * notification (no foreground service): posted/updated/removed by
 * [AutomationEngine.evaluate] from the state actually applied to the device,
 * so every source (manual, zone, schedule, calendar) behaves the same and a
 * single id means it can never be duplicated.
 */
object StatusNotification {

    const val CHANNEL_ID = "silent_focus_status"
    private const val CHANNEL_NAME = "Silent Focus status"
    const val NOTIFICATION_ID = 7301

    const val TITLE = "Silent Focus is active"

    data class Content(val title: String, val text: String)

    /** What to show, or null when nothing should be shown. Pure, for tests. */
    fun content(owned: Boolean, paused: Boolean, source: RuleSource?, ruleName: String?): Content? {
        if (!owned) return null
        if (paused) return Content(TITLE, "Paused while an allowed call rings")
        val by = when (source) {
            RuleSource.MANUAL -> "Turned on manually"
            RuleSource.ZONE -> ruleName?.let { "Silent Zone: $it" } ?: "Silent Zone"
            RuleSource.SCHEDULE -> ruleName?.let { "Schedule: $it" } ?: "Schedule"
            // Calendar event titles are never shown.
            RuleSource.CALENDAR -> "Calendar event"
            null -> null
        }
        return Content(TITLE, listOfNotNull("Your phone is silent", by).joinToString(" · "))
    }

    // Avoids re-posting an unchanged notification on every evaluation.
    @Volatile
    private var shown: Content? = null

    fun sync(context: Context, owned: Boolean, paused: Boolean, source: RuleSource?, ruleName: String?, since: Long) {
        val ctx = context.applicationContext
        val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val content = content(owned, paused, source, ruleName)
        if (content == null || !NotificationManagerCompat.from(ctx).areNotificationsEnabled()) {
            nm.cancel(NOTIFICATION_ID)
            shown = null
            return
        }
        val posted = nm.activeNotifications.any { it.id == NOTIFICATION_ID }
        if (posted && shown == content) return
        ensureChannel(nm)
        nm.notify(NOTIFICATION_ID, build(ctx, content, since))
        shown = content
    }

    private fun ensureChannel(nm: NotificationManager) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        if (nm.getNotificationChannel(CHANNEL_ID) != null) return
        // LOW: visible in the shade and status bar, never makes a sound.
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL_ID, CHANNEL_NAME, NotificationManager.IMPORTANCE_LOW).apply {
                description = "Shows while Silent Focus is silencing your phone"
                setShowBadge(false)
            },
        )
    }

    private fun build(ctx: Context, content: Content, since: Long): Notification {
        val open = PendingIntent.getActivity(
            ctx,
            NOTIFICATION_ID,
            Intent(ctx, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        return NotificationCompat.Builder(ctx, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_silent_focus)
            .setContentTitle(content.title)
            .setContentText(content.text)
            .setContentIntent(open)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setCategory(NotificationCompat.CATEGORY_STATUS)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setShowWhen(since > 0)
            .setWhen(if (since > 0) since else System.currentTimeMillis())
            .build()
    }
}
