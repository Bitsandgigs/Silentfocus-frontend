package com.SilenceFocus.comms

import android.app.ActivityOptions
import android.app.PendingIntent
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.os.Build
import android.service.notification.StatusBarNotification
import android.util.Log
import java.security.MessageDigest

/**
 * Opens what an Activity "Message received" row refers to.
 *
 * The journal never stores a notification key (WhatsApp tags can contain the
 * sender's number), only [ref] - a salted hash of it. On tap, the still-posted
 * notifications are read from the connected listener and the matching one's
 * own tap intent is sent, exactly like tapping it in the shade. When it is no
 * longer posted (dismissed, read, replaced, listener not bound) the posting
 * app is opened instead; an expired notification is never claimed as opened.
 */
object NotificationSource {

    private const val TAG = "SilentFocusOpen"

    const val OPENED_NOTIFICATION = "NOTIFICATION"
    const val OPENED_APP = "APP"
    const val UNAVAILABLE = "UNAVAILABLE"

    /** Salted, so the stored value can't be matched against known keys. */
    fun ref(salt: String, notificationKey: String): String {
        val md = MessageDigest.getInstance("SHA-256")
        md.update("notification|".toByteArray())
        md.update(salt.toByteArray())
        md.update(notificationKey.toByteArray())
        return md.digest().take(12).joinToString("") { "%02x".format(it) }
    }

    /** The posted notification [ref] points to, if it is still active. */
    fun findActive(active: Array<StatusBarNotification>?, salt: String, packageName: String, ref: String): StatusBarNotification? =
        active?.firstOrNull { it.packageName == packageName && ref(salt, it.key) == ref }

    fun open(context: Context, packageName: String, ref: String?): String {
        val ctx = context.applicationContext
        if (!ref.isNullOrEmpty()) {
            val active = runCatching { SilentFocusNotificationListener.connected?.activeNotifications }.getOrNull()
            val sbn = findActive(active, CommsStore(ctx).salt, packageName, ref)
            val intent = sbn?.notification?.contentIntent
            if (intent != null && send(ctx, intent)) return OPENED_NOTIFICATION
        }
        return if (launchApp(ctx, packageName)) OPENED_APP else UNAVAILABLE
    }

    private fun send(ctx: Context, intent: PendingIntent): Boolean = try {
        // Android 14+: a PendingIntent sender must opt in to share its
        // (foreground) right to start activities; the user just tapped us.
        val options = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            ActivityOptions.makeBasic()
                .setPendingIntentBackgroundActivityStartMode(ActivityOptions.MODE_BACKGROUND_ACTIVITY_START_ALLOWED)
                .toBundle()
        } else {
            null
        }
        intent.send(ctx, 0, null, null, null, null, options)
        true
    } catch (e: PendingIntent.CanceledException) {
        Log.i(TAG, "notification intent no longer valid")
        false
    } catch (e: RuntimeException) {
        Log.w(TAG, "notification intent failed: ${e.javaClass.simpleName}")
        false
    }

    /**
     * Launcher entry of the posting app. An implicit startActivity always
     * adds CATEGORY_DEFAULT, which most launcher filters (MAIN + LAUNCHER
     * only) don't declare - so the explicit launch intent comes first. It
     * needs package visibility (own package, the WhatsApp packages declared
     * in <queries>, apps Android makes visible); the implicit intent is the
     * fallback for apps whose filter does declare DEFAULT.
     */
    private fun launchApp(ctx: Context, packageName: String): Boolean {
        val flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED
        val candidates = listOfNotNull(
            runCatching { ctx.packageManager.getLaunchIntentForPackage(packageName) }.getOrNull(),
            Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER).setPackage(packageName),
        )
        for (intent in candidates) {
            try {
                ctx.startActivity(intent.addFlags(flags))
                return true
            } catch (e: ActivityNotFoundException) {
                // try the next form
            } catch (e: RuntimeException) {
                Log.w(TAG, "launch failed: ${e.javaClass.simpleName}")
            }
        }
        return false
    }
}
