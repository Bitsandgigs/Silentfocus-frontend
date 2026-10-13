package com.SilenceFocus.comms

import android.app.Notification
import android.app.PendingIntent
import android.app.RemoteInput
import android.content.Context
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.os.Build
import android.os.Bundle
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log
import androidx.core.app.NotificationCompat
import com.SilenceFocus.automation.ActivityEvents
import com.SilenceFocus.automation.AutomationEngine
import com.SilenceFocus.automation.SessionCounter
import com.SilenceFocus.automation.EngineStore
import org.json.JSONObject
import java.security.MessageDigest

/**
 * Native notification listener (replaces the JS headless listener): records
 * messages that arrive while Silent Focus is active and sends automated
 * replies through the posting app's own inline-reply action. Runs in the app
 * process under Android's listener lifecycle; no React Native needed.
 *
 * Privacy: message text is read in memory only to detect our own template
 * bouncing back (loops); it is never stored, logged or sent anywhere.
 * Round 3 (#2): the sender's display name (and a group's name) as the app
 * put it in the notification is kept in this account's local journal only
 * (see [NotificationNames]); never uploaded, outboxed or logged.
 */
class SilentFocusNotificationListener : NotificationListenerService() {

    override fun onListenerConnected() {
        connected = this
        activeChanged()
    }

    override fun onListenerDisconnected() {
        if (connected === this) connected = null
    }

    override fun onDestroy() {
        if (connected === this) connected = null
        super.onDestroy()
    }

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        // Debug-only diagnostics (#9); no-op unless a probe build installed one.
        NotificationProbes.posted(this, sbn)
        try {
            // The ranking carries the channel importance (a ringing-call signal for WhatsApp).
            WhatsAppCallRecorder.onPosted(this, sbn, if (WhatsAppCalls.isWhatsApp(sbn.packageName)) WhatsAppCallRecorder.rankingOf(this, sbn) else null)
        } catch (e: RuntimeException) {
            Log.w(TAG, "call handling failed: ${e.javaClass.simpleName}")
        }
        try {
            MessageAutoReply.onPosted(this, sbn)
        } catch (e: RuntimeException) {
            Log.w(TAG, "notification handling failed: ${e.javaClass.simpleName}")
        }
        activeChanged()
    }

    override fun onNotificationRemoved(sbn: StatusBarNotification, rankingMap: RankingMap, reason: Int) {
        NotificationProbes.removed(this, sbn, reason)
        try {
            WhatsAppCallRecorder.onRemoved(this, sbn)
        } catch (e: RuntimeException) {
            Log.w(TAG, "call removal handling failed: ${e.javaClass.simpleName}")
        }
        // Activity previews (#10) disappear as soon as their notification does.
        activeChanged()
    }

    /** Tells the open Activity screen to refresh previews; carries no data. */
    private fun activeChanged() {
        runCatching { onActiveNotificationsChanged?.invoke() }
    }

    companion object {
        private const val TAG = "SilentFocusReply"

        /** The bound listener (Activity rows open still-posted notifications through it). */
        @Volatile
        var connected: SilentFocusNotificationListener? = null
            private set

        /** Set by the RN module while JS is running (no payload: previews are re-read on demand). */
        @Volatile
        var onActiveNotificationsChanged: (() -> Unit)? = null
    }
}

object MessageAutoReply {

    private const val TAG = "SilentFocusReply"

    private val IGNORED_CATEGORIES = setOf(
        Notification.CATEGORY_CALL, Notification.CATEGORY_SYSTEM, Notification.CATEGORY_SERVICE,
        Notification.CATEGORY_TRANSPORT, Notification.CATEGORY_PROGRESS, Notification.CATEGORY_ALARM,
        Notification.CATEGORY_NAVIGATION, Notification.CATEGORY_STATUS, Notification.CATEGORY_ERROR,
        Notification.CATEGORY_EVENT, Notification.CATEGORY_REMINDER, Notification.CATEGORY_PROMO,
        Notification.CATEGORY_RECOMMENDATION, Notification.CATEGORY_EMAIL, Notification.CATEGORY_SOCIAL,
        "missed_call", "stopwatch", "location_sharing", "workout",
    )
    private val SYSTEM_PACKAGES = setOf("android", "com.android.systemui", "com.android.phone", "com.android.server.telecom")

    @Synchronized
    fun onPosted(context: Context, sbn: StatusBarNotification, now: Long = System.currentTimeMillis()) {
        val ctx = context.applicationContext
        if (sbn.packageName == ctx.packageName || sbn.packageName in SYSTEM_PACKAGES) return
        val n = sbn.notification ?: return
        if (n.flags and (Notification.FLAG_GROUP_SUMMARY or Notification.FLAG_ONGOING_EVENT or Notification.FLAG_FOREGROUND_SERVICE) != 0) return
        if (n.category in IGNORED_CATEGORIES) return

        val engine = EngineStore(ctx)
        // Only while Silent Focus is active (also while a break-through call
        // has silencing paused); otherwise nothing is recorded at all.
        if (!engine.owned) return

        val style = NotificationCompat.MessagingStyle.extractMessagingStyleFromNotification(n)
        val isMessaging = n.category == Notification.CATEGORY_MESSAGE || style != null
        if (!isMessaging) return

        val last = style?.messages?.lastOrNull()
        val comms = CommsStore(ctx)

        // Apps re-post the same notification (e.g. after our reply is added
        // to the thread); only a new newest message counts.
        val seenKey = "${sbn.key}|${last?.timestamp ?: n.`when`}"
        val seen = comms.seenNotifications
        if (seenKey in seen) return
        comms.seenNotifications = seen + seenKey

        // An old unread conversation re-posted by the app (its newest message
        // predates this session): not a message received while silent.
        if (AutoReplyPolicy.isFromBeforeSession(last?.timestamp ?: n.`when`, engine.ownedSince)) return

        val settings = comms.autoReplySettings
        val replyAction = findReplyAction(n)
        val lastText = last?.text?.toString() ?: n.extras?.getCharSequence(Notification.EXTRA_TEXT)?.toString()
        val msg = IncomingMessage(
            packageName = sbn.packageName,
            senderKey = senderKey(sbn, n, style, comms.salt),
            isMessaging = true,
            hasReplyAction = replyAction != null,
            isGroup = style?.isGroupConversation == true,
            // In MessagingStyle a message without a sender (or sent as the
            // style's own user) is the device owner's, e.g. our reply echoed.
            fromSelf = last != null && (last.person == null || samePerson(last.person, style?.user)),
            looksLikeAutoReply = AutoReplyPolicy.looksLikeOurTemplate(lastText, settings),
        )
        val session = engine.ownedSince
        val silence = SilenceContext(active = true, sessionId = session, zoneId = activeZoneId(engine))
        val marks = AutoReplyPolicy.pruneMarks(comms.replyMarks, now)
        val times = comms.replyTimes.filter { now - it < 60 * 60_000L }
        val decision = AutoReplyPolicy.decide(settings, silence, msg, marks, times.size, now)
        if (decision.reason == AutoReplyPolicy.REASON_OWN_MESSAGE) return

        val app = appLabel(ctx, sbn, n)
        val notificationRef = NotificationSource.ref(comms.salt, sbn.key)
        val status: ReplyStatus = decision.status ?: send(ctx, replyAction!!, decision.template!!)
        val sender = NotificationNames.messageSender(
            isGroup = msg.isGroup,
            personName = last?.person?.name,
            conversationTitle = style?.conversationTitle,
            title = n.extras?.getCharSequence(Notification.EXTRA_TITLE),
            appLabels = listOfNotNull(app, WhatsAppCalls.APPS[sbn.packageName]),
        )
        // Local-only identity of this row (never uploaded or outboxed).
        val identify: JSONObject.() -> Unit = {
            sender.name?.let { put(NotificationNames.FIELD_NAME, it) }
            sender.group?.let { put(NotificationNames.FIELD_GROUP, it) }
            last?.timestamp?.takeIf { it > 0 }?.let { put(NotificationNames.FIELD_MESSAGE_AT, it) }
        }

        engine.appendEvent(JSONObject().apply {
            put("type", ActivityEvents.MESSAGE_RECEIVED)
            identify()
            put("app", app)
            put("appPackage", sbn.packageName)
            put("notificationRef", notificationRef)
            put("replyStatus", status.name)
            decision.reason?.let { put("detail", it) }
            put("at", now)
        })

        val key = msg.senderKey
        val journalType = AutoReplyPolicy.eventTypeFor(status, decision.reason)
        if (journalType != null) {
            engine.appendEvent(JSONObject().apply {
                put("type", journalType)
                identify()
                put("app", app)
                put("appPackage", sbn.packageName)
                put("notificationRef", notificationRef)
                put("replyStatus", status.name)
                decision.reason?.let { put("detail", it) }
                if (status == ReplyStatus.SENT) put("template", if (silence.zoneId != null && settings.zoneTemplates.containsKey(silence.zoneId)) "ZONE" else "DEFAULT")
                put("at", now)
            })
        }
        // Mark the sender after any attempt (sent, failed or unsupported):
        // failures are not retried, and unsupported isn't repeated.
        if (key != null && AutoReplyPolicy.marksSender(status)) {
            comms.replyMarks = marks + (key to ReplyMark(now, session))
        }
        if (status == ReplyStatus.SENT) comms.replyTimes = times + now
        AutomationEngine.countInSession(ctx, SessionCounter.MESSAGE)
        if (status == ReplyStatus.SENT) AutomationEngine.countInSession(ctx, SessionCounter.AUTO_REPLY)
        Log.i(TAG, "message from ${sbn.packageName}: $status ${decision.reason ?: ""}")
    }

    private fun samePerson(a: androidx.core.app.Person?, b: androidx.core.app.Person?): Boolean {
        if (a == null || b == null) return false
        if (a.key != null && b.key != null) return a.key == b.key
        return a.name != null && a.name.toString() == b.name?.toString()
    }

    /** First action with a free-form text RemoteInput (the inline reply). */
    fun findReplyAction(n: Notification): Notification.Action? {
        val actions = n.actions ?: return null
        val candidates = actions.filter { a ->
            a.actionIntent != null && a.remoteInputs?.any { it.allowFreeFormInput } == true
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            candidates.firstOrNull { it.semanticAction == Notification.Action.SEMANTIC_ACTION_REPLY }?.let { return it }
        }
        return candidates.firstOrNull()
    }

    private fun send(ctx: Context, action: Notification.Action, text: String): ReplyStatus {
        return try {
            val inputs = action.remoteInputs ?: return ReplyStatus.UNSUPPORTED
            val results = Bundle()
            inputs.filter { it.allowFreeFormInput }.forEach { results.putCharSequence(it.resultKey, text) }
            val intent = Intent().addFlags(Intent.FLAG_RECEIVER_FOREGROUND)
            RemoteInput.addResultsToIntent(inputs, intent, results)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                RemoteInput.setResultsSource(intent, RemoteInput.SOURCE_FREE_FORM_INPUT)
            }
            action.actionIntent.send(ctx, 0, intent)
            ReplyStatus.SENT
        } catch (e: PendingIntent.CanceledException) {
            Log.w(TAG, "reply action cancelled")
            ReplyStatus.FAILED
        } catch (e: RuntimeException) {
            Log.w(TAG, "reply failed: ${e.javaClass.simpleName}")
            ReplyStatus.FAILED
        }
    }

    /** Hashed conversation identity: never a name or number. */
    private fun senderKey(
        sbn: StatusBarNotification,
        n: Notification,
        style: NotificationCompat.MessagingStyle?,
        salt: String,
    ): String? {
        val shortcut = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) n.shortcutId else null
        val raw = shortcut
            ?: style?.conversationTitle?.toString()
            ?: style?.messages?.lastOrNull { it.person != null }?.person?.let { it.key ?: it.name?.toString() }
            ?: n.extras?.getCharSequence(Notification.EXTRA_TITLE)?.toString()
            ?: return null
        val md = MessageDigest.getInstance("SHA-256")
        md.update(salt.toByteArray())
        md.update(sbn.packageName.toByteArray())
        md.update(raw.toByteArray())
        return md.digest().take(12).joinToString("") { "%02x".format(it) }
    }

    /** The zone that is the active silence source, from the last evaluation. */
    private fun activeZoneId(engine: EngineStore): String? {
        val state = engine.lastState ?: return null
        if (state.optString("source") != "ZONE") return null
        val rules = state.optJSONArray("activeRules") ?: return null
        for (i in 0 until rules.length()) {
            val r = rules.optJSONObject(i) ?: continue
            if (r.optString("source") == "ZONE") return r.optString("ruleId").ifEmpty { null }
        }
        return null
    }

    private fun appLabel(ctx: Context, sbn: StatusBarNotification, n: Notification): String {
        val pm = ctx.packageManager
        return runCatching { pm.getApplicationLabel(pm.getApplicationInfo(sbn.packageName, 0)).toString() }
            .recoverCatching {
                @Suppress("DEPRECATION")
                val info = n.extras?.getParcelable<ApplicationInfo>("android.appInfo") ?: throw it
                pm.getApplicationLabel(info).toString()
            }
            .getOrDefault(sbn.packageName)
    }
}
