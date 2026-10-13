package com.SilenceFocus.comms

import android.app.KeyguardManager
import android.app.Notification
import android.content.Context
import android.service.notification.StatusBarNotification
import androidx.core.app.NotificationCompat

/**
 * Client Issue #10 – ephemeral message previews for Activity rows.
 *
 * The text is read from the *still-posted* original notification, only when
 * the Activity screen asks, and handed straight to the UI. It is never
 * stored, uploaded, logged or put into diagnostics; once the notification is
 * gone (dismissed, read, replaced, app restarted without it) there is no
 * preview. Nothing is shown while the phone is locked. Android 15+ redacts
 * sensitive notifications (e.g. one-time codes) before any listener app sees
 * them, so such a preview can only ever show Android's placeholder text - the
 * original is never available to us. No new permission: this uses the
 * notification access the app already has.
 */
object NotificationPreviews {

    const val TEXT = "TEXT"
    const val GONE = "GONE"
    const val NONE = "NONE"
    const val HIDDEN_LOCKED = "LOCKED"

    const val MAX_CHARS = 160
    const val MAX_REQUESTS = 100

    data class Preview(val status: String, val text: String? = null)

    /** One message of a MessagingStyle notification, as far as previews care. */
    data class Message(val fromUser: Boolean, val text: String?, val at: Long = 0L)

    /**
     * One row's request. [messageAt]: the timestamp of the message the row
     * was recorded for (Round 3), so each row shows its own message rather
     * than the conversation's newest; null for rows recorded without it.
     * [key]: what the result is keyed by (defaults to the ref).
     */
    data class Request(val packageName: String, val ref: String, val messageAt: Long? = null, val key: String = ref)

    /** Pure decision for one row. */
    fun decide(found: Boolean, locked: Boolean, text: String?): Preview = when {
        locked -> Preview(HIDDEN_LOCKED)
        !found -> Preview(GONE)
        else -> sanitize(text)?.let { Preview(TEXT, it) } ?: Preview(NONE)
    }

    /** Single line, trimmed, at most [MAX_CHARS] characters; null when empty. */
    fun sanitize(text: String?): String? {
        val flat = text?.replace(Regex("\\s+"), " ")?.trim().orEmpty()
        if (flat.isEmpty()) return null
        return if (flat.length <= MAX_CHARS) flat else flat.take(MAX_CHARS - 1).trimEnd() + "…"
    }

    /**
     * The text of the message a row refers to. With [messageAt]: exactly
     * that message from someone else, or null once the app has dropped it
     * from the notification (never a different message). Without: the
     * newest message someone else sent, or the notification's text when it
     * has no messaging style. Our own replies (incl. auto replies) are never
     * the preview.
     */
    fun previewText(messages: List<Message>?, fallbackText: String?, messageAt: Long? = null): String? = when {
        messageAt != null -> messages?.lastOrNull { !it.fromUser && it.at == messageAt }?.text
        messages.isNullOrEmpty() -> fallbackText
        else -> messages.lastOrNull { !it.fromUser }?.text
    }

    /** Previews for [requests], keyed by [Request.key]. */
    fun lookup(context: Context, requests: List<Request>): Map<String, Preview> {
        val ctx = context.applicationContext
        val wanted = requests.take(MAX_REQUESTS)
        val locked = runCatching { ctx.getSystemService(KeyguardManager::class.java)?.isKeyguardLocked == true }
            .getOrDefault(true)
        if (locked) return wanted.associate { it.key to decide(false, true, null) }

        val listener = SilentFocusNotificationListener.connected
        val active = runCatching { listener?.activeNotifications }.getOrNull().orEmpty()
        val salt = CommsStore(ctx).salt
        val byRef = HashMap<Pair<String, String>, StatusBarNotification>()
        val packages = wanted.map { it.packageName }.toSet()
        active.filter { it.packageName in packages }.forEach {
            byRef[it.packageName to NotificationSource.ref(salt, it.key)] = it
        }
        return wanted.associate { r ->
            val sbn = byRef[r.packageName to r.ref]
            r.key to decide(
                found = sbn != null,
                locked = false,
                text = sbn?.notification?.let { textOf(it, r.messageAt) },
            )
        }
    }

    private fun textOf(n: Notification, messageAt: Long?): String? {
        val style = NotificationCompat.MessagingStyle.extractMessagingStyleFromNotification(n)
        val messages = style?.messages?.map { m ->
            Message(fromUser = m.person == null || samePerson(m.person, style.user), text = m.text?.toString(), at = m.timestamp)
        }
        return previewText(messages, n.extras?.getCharSequence(Notification.EXTRA_TEXT)?.toString(), messageAt)
    }

    private fun samePerson(a: androidx.core.app.Person?, b: androidx.core.app.Person?): Boolean {
        if (a == null || b == null) return false
        if (a.key != null && b.key != null) return a.key == b.key
        return a.name != null && a.name.toString() == b.name?.toString()
    }
}
