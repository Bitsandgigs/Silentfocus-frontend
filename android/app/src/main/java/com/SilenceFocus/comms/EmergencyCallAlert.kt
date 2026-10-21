package com.SilenceFocus.comms

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.RingtoneManager
import android.os.Build
import android.provider.Settings
import android.util.Log
import androidx.core.app.NotificationCompat
import com.SilenceFocus.R
import com.SilenceFocus.comms.WhatsAppEmergency.Kind

/**
 * Emergency / urgent WhatsApp call alert, sounded by Silent Focus itself.
 *
 * WhatsApp's own ringing can't be let through selectively: DND treats all of
 * its call notifications alike, and no app may change another app's sound.
 * Silent Focus therefore posts its own short alert on a dedicated channel
 * created with "override Do Not Disturb" (`setBypassDnd`). Android honours
 * that flag only for apps that hold Do Not Disturb access - which Silent
 * Focus needs anyway - and the user can switch it off per channel in
 * Settings at any time. The channel is created only once DND access is
 * granted, so the flag isn't lost.
 *
 * - Sound: the user's ringtone file played once with NOTIFICATION usage
 *   (ringtone usage is muted by DND for calls), so it follows the ringer
 *   mode: Ring = sound + vibration, Vibrate = vibration, Silent = nothing.
 * - Sounds only when the active DND mode lets priority channels through:
 *   Silent Focus's own mode does; a user's own "total silence" / alarms-only
 *   mode, or a Samsung mode that excludes Silent Focus, does not.
 * - Never pauses DND, never changes WhatsApp, other apps or global settings.
 * - Lock screen: the public version has no name or number.
 * - Cancelled when WhatsApp stops ringing, or after [TIMEOUT_MS].
 * - Nothing is logged except the kind and outcome.
 */
object EmergencyCallAlert {

    private const val TAG = "SilentFocusWaAlert"
    const val CHANNEL_ID = "sf_whatsapp_emergency_calls"
    const val CHANNEL_NAME = "Important WhatsApp calls"
    const val CHANNEL_DESCRIPTION = "Silent Focus's own alert when an emergency contact or a repeat caller calls you on WhatsApp."
    private const val NOTIFICATION_ID = 7310
    const val TIMEOUT_MS = 45_000L

    /** Outcome recorded on the Activity row (`alert`). */
    const val SENT = "SENT"
    /** Posted, but this channel can't override Do Not Disturb (user setting / no DND access at creation). */
    const val SENT_SILENCED = "SENT_SILENCED"
    const val NOTIFICATIONS_OFF = "NOTIFICATIONS_OFF"
    const val CHANNEL_OFF = "CHANNEL_OFF"
    const val FAILED = "FAILED"

    private val VIBRATION = longArrayOf(0, 700, 250, 700, 250, 700)

    private fun nm(ctx: Context) = ctx.getSystemService(NotificationManager::class.java)

    /** One alert channel: WhatsApp calls ([WHATSAPP]) or SIM calls in Alert Only mode ([SIM]). */
    data class ChannelSpec(val id: String, val name: String, val description: String)

    val WHATSAPP = ChannelSpec(CHANNEL_ID, CHANNEL_NAME, CHANNEL_DESCRIPTION)
    val SIM = ChannelSpec(
        "sf_sim_emergency_calls",
        "Important phone calls",
        "Silent Focus's own alert when an emergency contact or a repeat caller phones you while Silent Focus is on (Alert Only).",
    )

    /** Creates the channel when it doesn't exist and DND access is granted (so the bypass flag sticks). */
    fun ensureChannel(context: Context, spec: ChannelSpec = WHATSAPP): NotificationChannel? {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return null
        val nm = nm(context) ?: return null
        val dndAccess = nm.isNotificationPolicyAccessGranted
        nm.getNotificationChannel(spec.id)?.let { existing ->
            // Round 4: plain-language name/description, and the "override Do Not
            // Disturb" flag re-asserted when DND access is (back). Re-registering
            // always passes the FULL desired channel: Android copies an app's
            // bypass flag onto a channel the user hasn't customised, so a bare
            // rename would switch the override off. A user's own changes
            // (sound, override, importance) are never overwritten by Android.
            val outdated = existing.name?.toString() != spec.name || existing.description != spec.description
            if (outdated || (dndAccess && !existing.canBypassDnd())) {
                runCatching { nm.createNotificationChannel(desiredChannel(context, existing.importance, bypass = dndAccess || existing.canBypassDnd(), spec)) }
                return nm.getNotificationChannel(spec.id) ?: existing
            }
            return existing
        }
        if (!dndAccess) return null
        return runCatching {
            nm.createNotificationChannel(desiredChannel(context, NotificationManager.IMPORTANCE_HIGH, bypass = true, spec))
            nm.getNotificationChannel(spec.id)
        }.getOrNull()
    }

    private fun desiredChannel(context: Context, importance: Int, bypass: Boolean, spec: ChannelSpec): NotificationChannel {
        val sound = RingtoneManager.getActualDefaultRingtoneUri(context, RingtoneManager.TYPE_RINGTONE)
            ?: Settings.System.DEFAULT_NOTIFICATION_URI
        return NotificationChannel(spec.id, spec.name, importance).apply {
            description = spec.description
            setBypassDnd(bypass)
            setSound(
                sound,
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build(),
            )
            enableVibration(true)
            vibrationPattern = VIBRATION
            lockscreenVisibility = Notification.VISIBILITY_PRIVATE
            setShowBadge(false)
        }
    }

    /** {notificationsAllowed, dndAccess, channelExists, channelEnabled, overridesDnd, sound} for the settings screen. */
    data class Status(
        val notificationsAllowed: Boolean,
        val dndAccess: Boolean,
        val channelExists: Boolean,
        val channelEnabled: Boolean,
        val overridesDnd: Boolean,
        val sound: Boolean,
    )

    fun status(context: Context, spec: ChannelSpec = WHATSAPP): Status {
        val nm = nm(context)
        val channel = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) ensureChannel(context, spec) else null
        val legacy = Build.VERSION.SDK_INT < Build.VERSION_CODES.O
        return Status(
            notificationsAllowed = nm?.areNotificationsEnabled() == true,
            dndAccess = nm?.isNotificationPolicyAccessGranted == true,
            channelExists = legacy || channel != null,
            channelEnabled = legacy || (channel != null && channel.importance != NotificationManager.IMPORTANCE_NONE),
            overridesDnd = !legacy && channel?.canBypassDnd() == true,
            sound = legacy || channel?.sound != null,
        )
    }

    /** Pure: the outcome to record for a [Status]. */
    fun outcomeFor(s: Status): String = when {
        !s.notificationsAllowed -> NOTIFICATIONS_OFF
        !s.channelExists || !s.channelEnabled -> CHANNEL_OFF
        !s.overridesDnd -> SENT_SILENCED
        else -> SENT
    }

    /**
     * Posts the alert for the ringing call [ref] (salted notification ref);
     * [open] is WhatsApp's own tap action for that call when available.
     * Returns the outcome (see constants).
     */
    fun show(
        context: Context,
        kind: Kind,
        app: String,
        appPackage: String,
        who: String?,
        repeatCount: Int,
        ref: String,
        open: PendingIntent?,
        /** The call was already marked missed by WhatsApp (it never rang): "call back" wording, no timeout. */
        missed: Boolean = false,
    ): String {
        val ctx = context.applicationContext
        val s = status(ctx)
        val outcome = outcomeFor(s)
        if (outcome == NOTIFICATIONS_OFF || outcome == CHANNEL_OFF) {
            Log.i(TAG, "$kind alert not shown: $outcome")
            return outcome
        }
        return try {
            val (pubTitle, pubText) = WhatsAppEmergency.publicText(kind, app, missed)
            val (title, text) = WhatsAppEmergency.privateText(kind, app, who, repeatCount, missed)
            val tap = open ?: launch(ctx, appPackage)
            val publicVersion = NotificationCompat.Builder(ctx, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_stat_silent_focus)
                .setContentTitle(pubTitle)
                .setContentText(pubText)
                .build()
            val n = NotificationCompat.Builder(ctx, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_stat_silent_focus)
                .setContentTitle(title)
                .setContentText(text)
                // Expanded: the whole line (a long contact name never hides "Open WhatsApp").
                .setStyle(NotificationCompat.BigTextStyle().bigText(text))
                .setCategory(NotificationCompat.CATEGORY_CALL)
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
                .setPublicVersion(publicVersion)
                .setVibrate(VIBRATION)
                .setAutoCancel(true)
                // A missed call stays until seen; a ringing one ends with the call.
                .apply { if (!missed) setTimeoutAfter(TIMEOUT_MS) }
                .apply { tap?.let { setContentIntent(it) } }
                .apply { tap?.let { addAction(0, "Open $app", it) } }
                .build()
            nm(ctx)?.notify(ref, NOTIFICATION_ID, n)
            Log.i(TAG, "$kind alert: $outcome")
            outcome
        } catch (e: RuntimeException) {
            Log.w(TAG, "alert failed: ${e.javaClass.simpleName}")
            FAILED
        }
    }

    /** WhatsApp stopped ringing (answered, declined, missed): stop the alert. True if one was showing. */
    fun cancel(context: Context, ref: String): Boolean = runCatching {
        val nm = nm(context.applicationContext) ?: return false
        val showing = nm.activeNotifications.any { it.id == NOTIFICATION_ID && it.tag == ref }
        nm.cancel(ref, NOTIFICATION_ID)
        showing
    }.getOrDefault(false)

    // ---- "Sound settings appear ready" (settings screen and the WhatsApp call check)

    enum class Sound { READY, VIBRATE, SILENT_MODE, NO_SOUND, BLOCKED, UNKNOWN }

    /**
     * Pure: whether an alert posted now would be heard, as far as Android
     * lets an app tell. [ringerMode] AudioManager.RINGER_MODE_*, [filter]
     * NotificationManager.INTERRUPTION_FILTER_*; [silentFocusOn]: the active
     * Do Not Disturb is Silent Focus's own (which lets this channel through).
     * Another app's or a Samsung mode can't be inspected: UNKNOWN.
     * Never proof that a sound was heard.
     */
    fun soundReadiness(outcome: String, sound: Boolean, ringerMode: Int, filter: Int, silentFocusOn: Boolean): Sound = when {
        outcome == NOTIFICATIONS_OFF || outcome == CHANNEL_OFF -> Sound.BLOCKED
        filter == NotificationManager.INTERRUPTION_FILTER_NONE || filter == NotificationManager.INTERRUPTION_FILTER_ALARMS -> Sound.BLOCKED
        filter == NotificationManager.INTERRUPTION_FILTER_PRIORITY && outcome == SENT_SILENCED -> Sound.BLOCKED
        ringerMode == AudioManager.RINGER_MODE_SILENT -> Sound.SILENT_MODE
        filter == NotificationManager.INTERRUPTION_FILTER_PRIORITY && !silentFocusOn -> Sound.UNKNOWN
        ringerMode == AudioManager.RINGER_MODE_VIBRATE -> Sound.VIBRATE
        !sound -> Sound.NO_SOUND
        else -> Sound.READY
    }

    data class Readiness(val sound: Sound, val ringerMode: Int, val filter: Int)

    fun readiness(context: Context, silentFocusOn: Boolean): Readiness {
        val ctx = context.applicationContext
        val s = status(ctx)
        val current = runCatching { ctx.getSystemService(AudioManager::class.java)?.ringerMode }.getOrNull() ?: -1
        // Android 15+: while Silent Focus's mode is on, the ringer reads Silent
        // because the mode mutes ringer sounds - the user's own setting is the
        // one captured when Silent Focus turned on.
        val before = com.SilenceFocus.automation.EngineStore(ctx).previousRingerMode
        val ringer = if (silentFocusOn && before >= 0) before else current
        val filter = runCatching { nm(ctx)?.currentInterruptionFilter }.getOrNull() ?: NotificationManager.INTERRUPTION_FILTER_UNKNOWN
        return Readiness(soundReadiness(outcomeFor(s), s.sound, ringer, filter, silentFocusOn), ringer, filter)
    }

    /** Opens this channel's system settings (sound, vibration, override DND, lock screen). */
    fun openSettings(context: Context): Boolean {
        val ctx = context.applicationContext
        ensureChannel(ctx)
        val intent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Intent(Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_CHANNEL_ID, CHANNEL_ID)
        } else {
            Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
        }.putExtra(Settings.EXTRA_APP_PACKAGE, ctx.packageName).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        return runCatching { ctx.startActivity(intent); true }.getOrDefault(false)
    }

    /** "Try an Alert" from the settings screen: the same channel, short text that fits collapsed (#C). */
    fun showTest(context: Context): String {
        val ctx = context.applicationContext
        val s = status(ctx)
        val outcome = outcomeFor(s)
        if (outcome == NOTIFICATIONS_OFF || outcome == CHANNEL_OFF) return outcome
        return runCatching {
            val n = NotificationCompat.Builder(ctx, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_stat_silent_focus)
                .setContentTitle(WhatsAppEmergency.TEST_TITLE)
                .setContentText(WhatsAppEmergency.TEST_TEXT)
                // Narrow screens cut the line; expanding always shows all of it.
                .setStyle(NotificationCompat.BigTextStyle().bigText(WhatsAppEmergency.TEST_TEXT))
                .setCategory(NotificationCompat.CATEGORY_CALL)
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setVibrate(VIBRATION)
                .setAutoCancel(true)
                .setTimeoutAfter(TIMEOUT_MS)
                .build()
            nm(ctx)?.notify(TEST_TAG, NOTIFICATION_ID, n)
            outcome
        }.getOrDefault(FAILED)
    }

    const val TEST_TAG = "sf-test-alert"

    // ---- SIM calls, Alert Only mode (Emergency Call Handling, Option A)

    private const val SIM_NOTIFICATION_ID = 7311
    private const val SIM_TAG = "sim-call"

    /**
     * Posts (or replaces) the alert for a qualifying SIM call that keeps
     * ringing silently under Silent Focus. FLAG_INSISTENT makes Android repeat
     * the channel's sound and vibration until the notification is dismissed,
     * cancelled or times out ([SimCallAlerts.ALERT_MS]); the system plays it,
     * following the ringer mode and the user's channel settings, so nothing
     * of ours can keep sounding once the notification is gone.
     */
    fun showSimCall(context: Context, kind: BreakthroughKind, count: Int, contactName: String? = null): String {
        val ctx = context.applicationContext
        val outcome = outcomeFor(status(ctx, SIM))
        if (outcome == NOTIFICATIONS_OFF || outcome == CHANNEL_OFF) {
            Log.i(TAG, "SIM $kind alert not shown: $outcome")
            return outcome
        }
        return try {
            val (title, text) = SimCallAlerts.text(kind, count, ended = false, contactName)
            val (publicTitle, publicText) = SimCallAlerts.text(kind, count, ended = false)
            val n = simBuilder(ctx, title, text, PhoneApp.DIALER, publicTitle, publicText)
                .setCategory(NotificationCompat.CATEGORY_CALL)
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setVibrate(VIBRATION)
                .setTimeoutAfter(SimCallAlerts.ALERT_MS)
                .build()
            n.flags = n.flags or Notification.FLAG_INSISTENT
            nm(ctx)?.notify(SIM_TAG, SIM_NOTIFICATION_ID, n)
            Log.i(TAG, "SIM $kind alert: $outcome")
            outcome
        } catch (e: RuntimeException) {
            Log.w(TAG, "SIM alert failed: ${e.javaClass.simpleName}")
            FAILED
        }
    }

    /**
     * The SIM call stopped ringing: the alert is removed and, for [notice]
     * (missed or rejected), replaced by a silent "call ended" notice.
     */
    fun endSimCall(context: Context, record: SimCallAlerts.Record, notice: Boolean) {
        val ctx = context.applicationContext
        val nm = nm(ctx) ?: return
        runCatching { nm.cancel(SIM_TAG, SIM_NOTIFICATION_ID) }
        if (!notice) return
        runCatching {
            val (title, text) = SimCallAlerts.text(record.kind, record.count, ended = true, record.contactName)
            val (publicTitle, publicText) = SimCallAlerts.text(record.kind, record.count, ended = true)
            nm.notify(SIM_TAG, SIM_NOTIFICATION_ID, simBuilder(ctx, title, text, PhoneApp.CALL_LOG, publicTitle, publicText).setSilent(true).build())
        }.onFailure { Log.w(TAG, "SIM call-ended notice failed: ${it.javaClass.simpleName}") }
    }

    /** The public lock-screen version is always generic; tapping opens the Phone app. */
    private fun simBuilder(ctx: Context, title: String, text: String, phoneTarget: String, publicTitle: String, publicText: String): NotificationCompat.Builder {
        val publicVersion = NotificationCompat.Builder(ctx, SIM.id)
            .setSmallIcon(R.drawable.ic_stat_silent_focus)
            .setContentTitle(publicTitle)
            .setContentText(publicText)
            .build()
        val open = runCatching {
            PendingIntent.getActivity(
                ctx, SIM_NOTIFICATION_ID, PhoneApp.intent(phoneTarget),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
        }.getOrNull()
        return NotificationCompat.Builder(ctx, SIM.id)
            .setSmallIcon(R.drawable.ic_stat_silent_focus)
            .setContentTitle(title)
            .setContentText(text)
            .setStyle(NotificationCompat.BigTextStyle().bigText(text))
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setPublicVersion(publicVersion)
            .setAutoCancel(true)
            .apply { open?.let(::setContentIntent) }
    }

    private fun launch(ctx: Context, pkg: String): PendingIntent? =
        runCatching { ctx.packageManager.getLaunchIntentForPackage(pkg) }.getOrNull()?.let {
            PendingIntent.getActivity(
                ctx, NOTIFICATION_ID, it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
        }
}
