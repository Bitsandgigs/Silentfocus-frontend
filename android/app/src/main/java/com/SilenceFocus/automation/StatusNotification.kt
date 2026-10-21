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

    // Android treats channel DND bypass as an immutable user-facing setting.
    // v2 migrates devices that already have the old, non-bypass channel so
    // the ongoing silent status is not hidden by the DND state it represents.
    const val CHANNEL_ID = "silent_focus_status_v2"
    private const val CHANNEL_NAME = "Silent Focus status"
    const val NOTIFICATION_ID = 7301

    const val TITLE = "Silent Focus is active"

    /**
     * The timestamp sent to Android must be epoch/wall time.  Keep this pure
     * so API-level posting regressions cannot reintroduce an elapsed-realtime
     * value here.
     */
    internal fun timestampFor(manual: Boolean, manualStartedAt: Long, since: Long, now: Long): Long = when {
        manual && manualStartedAt > 0 -> manualStartedAt
        since > 0 -> since
        else -> now
    }

    /** [publicText]: the lock-screen version (no zone, schedule or event names). */
    data class Content(val title: String, val text: String, val publicText: String = text)

    /**
     * What to show, or null when nothing should be shown. Pure, for tests.
     * Client feedback: the header already says Silent Focus is active, so the
     * line says why. [ruleName] for CALENDAR is from the selected provider
     * occurrence, null
     * when it may not be shown.
     */
    fun content(owned: Boolean, paused: Boolean, source: RuleSource?, ruleName: String?): Content? {
        if (!owned) return null
        if (paused) return Content(TITLE, "Paused while an allowed call rings")
        val generic = when (source) {
            RuleSource.MANUAL -> "Turned on manually"
            RuleSource.ZONE -> "Silent Zone"
            RuleSource.PLACE -> "Location Mode"
            RuleSource.SCHEDULE -> "Schedule"
            RuleSource.CALENDAR -> "Calendar event"
            null -> "Your phone is silent"
        }
        val name = ruleName?.trim()?.takeIf { it.isNotEmpty() && source != RuleSource.MANUAL && source != null }
        val text = when {
            name == null -> generic
            source == RuleSource.CALENDAR -> "Your phone is silent · $generic: $name"
            else -> "$generic: $name"
        }
        return Content(TITLE, text, publicText = generic)
    }

    // Avoids re-posting an unchanged notification on every evaluation.
    @Volatile
    private var shown: Content? = null

    fun sync(
        context: Context, owned: Boolean, paused: Boolean, source: RuleSource?, ruleName: String?,
        since: Long, manualStartedAt: Long,
    ) {
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
        nm.notify(NOTIFICATION_ID, build(ctx, content, since, source == RuleSource.MANUAL, manualStartedAt))
        shown = content
    }

    private fun ensureChannel(nm: NotificationManager) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        // The status itself must remain visible while SF owns DND. It has no
        // sound/vibration, and bypassing DND only prevents Android from
        // hiding this ongoing state notification in its silent section.
        val channel = nm.getNotificationChannel(CHANNEL_ID)
            ?: NotificationChannel(CHANNEL_ID, CHANNEL_NAME, NotificationManager.IMPORTANCE_LOW)
        channel.description = "Shows while Silent Focus is silencing your phone"
        channel.setShowBadge(false)
        channel.setBypassDnd(true)
        nm.createNotificationChannel(channel)
    }

    private fun build(ctx: Context, content: Content, since: Long, manual: Boolean, manualStartedAt: Long): Notification {
        val open = PendingIntent.getActivity(
            ctx,
            NOTIFICATION_ID,
            Intent(ctx, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        // Notification.when is explicitly a wall-clock timestamp.  Supplying
        // elapsedRealtime here made API 36 classify the notification as years
        // old and reject it before it reached System UI.  The platform's
        // chronometer treats this wall-clock session anchor as its count-up
        // base, including after an app-process restart.
        val whenMillis = timestampFor(manual, manualStartedAt, since, System.currentTimeMillis())
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
            // Names (event subject, zone) stay off a secure lock screen that
            // hides sensitive content; the public version gives only the reason.
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setPublicVersion(
                NotificationCompat.Builder(ctx, CHANNEL_ID)
                    .setSmallIcon(R.drawable.ic_stat_silent_focus)
                    .setContentTitle(content.title)
                    .setContentText(content.publicText)
                    .setOngoing(true)
                    .setSilent(true)
                    .build(),
            )
            .setShowWhen(whenMillis > 0)
            .setWhen(whenMillis)
            .setUsesChronometer(manual && manualStartedAt > 0)
            .setChronometerCountDown(false)
            .build()
    }
}
