package com.SilenceFocus.comms

// Automated reply through a messaging notification's own inline-reply action
// (Android RemoteInput). Pure decision logic; the NotificationListener
// extracts [IncomingMessage] and performs the send. Works for any app whose
// notification exposes a free-form RemoteInput reply action - nothing is
// hard-coded per app. SMS sending and missed-call SMS are NOT implemented
// (they need SEND_SMS / default-SMS role; see Phase 4 report).

data class AutoReplySettings(
    val enabled: Boolean = false,
    val messagingEnabled: Boolean = true,
    val defaultTemplate: String = DEFAULT_TEMPLATE,
    /**
     * Per-sender limit inside one Silent Focus session: at most one reply per
     * [cooldownMinutes]. 0 = one reply per sender per session. A new session
     * always starts fresh.
     */
    val cooldownMinutes: Int = DEFAULT_COOLDOWN_MINUTES,
    /** Zone id -> template used while that zone is the active silence source. */
    val zoneTemplates: Map<String, String> = emptyMap(),
) {
    fun sanitized() = copy(
        defaultTemplate = defaultTemplate.trim().take(MAX_TEMPLATE_LENGTH).ifEmpty { DEFAULT_TEMPLATE },
        cooldownMinutes = cooldownMinutes.coerceIn(0, 24 * 60),
        zoneTemplates = zoneTemplates
            .mapValues { it.value.trim().take(MAX_TEMPLATE_LENGTH) }
            .filter { it.key.isNotBlank() && it.value.isNotEmpty() },
    )

    companion object {
        const val DEFAULT_TEMPLATE = "I'm currently unavailable and will get back to you soon."
        const val DEFAULT_COOLDOWN_MINUTES = 60
        const val MAX_TEMPLATE_LENGTH = 500
    }
}

/** What the listener could learn from one notification (no message text kept). */
data class IncomingMessage(
    val packageName: String,
    /** Hashed package+conversation key; never a name or number. */
    val senderKey: String?,
    val isMessaging: Boolean,
    val hasReplyAction: Boolean,
    val isGroup: Boolean,
    /** The newest message was written by the device owner (e.g. our own reply echoed back). */
    val fromSelf: Boolean,
    /** The newest message equals one of our templates: likely another auto-responder. */
    val looksLikeAutoReply: Boolean,
)

/** The Silent Focus situation the message arrived in. */
data class SilenceContext(
    val active: Boolean,
    /** Identifies the session (owned-since time); dedupe resets per session. */
    val sessionId: Long,
    /** The zone that is the active silence source, if any. */
    val zoneId: String?,
)

data class ReplyMark(val at: Long, val sessionId: Long)

enum class ReplyStatus { SENT, FAILED, SKIPPED, UNSUPPORTED }

data class ReplyDecision(
    /** Null when the notification isn't a message at all (nothing to record). */
    val status: ReplyStatus?,
    /** SKIPPED/UNSUPPORTED reason; null when a reply should be sent. */
    val reason: String?,
    val template: String? = null,
) {
    val shouldSend get() = status == null && reason == null && template != null
}

object AutoReplyPolicy {

    const val REASON_NOT_MESSAGE = "NOT_MESSAGE"
    const val REASON_NOT_SILENT = "NOT_SILENT"
    const val REASON_DISABLED = "DISABLED"
    const val REASON_OWN_MESSAGE = "OWN_MESSAGE"
    const val REASON_GROUP = "GROUP_CONVERSATION"
    const val REASON_LOOP = "POSSIBLE_AUTO_REPLY_LOOP"
    const val REASON_COOLDOWN = "COOLDOWN"
    const val REASON_RATE_LIMIT = "RATE_LIMIT"
    const val REASON_NO_REPLY_ACTION = "NO_REPLY_ACTION"
    const val REASON_NO_SENDER = "UNKNOWN_SENDER"

    /** Clock slack between the messaging app's timestamps and ours. */
    const val PRE_SESSION_TOLERANCE_MS = 60_000L

    /**
     * True when the newest message in a notification was received before the
     * current Silent Focus session began. Messaging apps re-post old unread
     * conversations (e.g. Google Messages refreshes every unread thread when
     * a new SMS arrives); after the "seen" list is cleared (logout, reinstall)
     * those would otherwise be treated as new and get an automatic reply.
     * Unknown times (0 / null) are not treated as old.
     */
    fun isFromBeforeSession(messageTime: Long?, sessionStart: Long): Boolean =
        messageTime != null && messageTime > 0 && sessionStart > 0 &&
            messageTime < sessionStart - PRE_SESSION_TOLERANCE_MS

    /** Hard cap across all senders, against runaway loops. */
    const val MAX_REPLIES_PER_HOUR = 20

    fun templateFor(settings: AutoReplySettings, zoneId: String?): String {
        val s = settings.sanitized()
        return zoneId?.let { s.zoneTemplates[it] } ?: s.defaultTemplate
    }

    /**
     * [marks]: sender key -> last reply. [repliesLastHour]: replies sent in the
     * last hour across all senders.
     */
    fun decide(
        settings: AutoReplySettings,
        silence: SilenceContext,
        msg: IncomingMessage,
        marks: Map<String, ReplyMark>,
        repliesLastHour: Int,
        now: Long,
    ): ReplyDecision {
        if (!msg.isMessaging) return ReplyDecision(null, REASON_NOT_MESSAGE)
        if (!silence.active) return ReplyDecision(null, REASON_NOT_SILENT)
        // Our own reply echoed back into the conversation: not a new message.
        if (msg.fromSelf) return ReplyDecision(null, REASON_OWN_MESSAGE)
        val s = settings.sanitized()
        if (!s.enabled || !s.messagingEnabled) return ReplyDecision(ReplyStatus.SKIPPED, REASON_DISABLED)
        if (msg.isGroup) return ReplyDecision(ReplyStatus.SKIPPED, REASON_GROUP)
        if (msg.looksLikeAutoReply) return ReplyDecision(ReplyStatus.SKIPPED, REASON_LOOP)
        val key = msg.senderKey ?: return ReplyDecision(ReplyStatus.SKIPPED, REASON_NO_SENDER)
        marks[key]?.let { mark ->
            if (mark.sessionId == silence.sessionId) {
                val cooldownMs = s.cooldownMinutes * 60_000L
                if (s.cooldownMinutes == 0 || now - mark.at < cooldownMs) {
                    return ReplyDecision(ReplyStatus.SKIPPED, REASON_COOLDOWN)
                }
            }
        }
        if (repliesLastHour >= MAX_REPLIES_PER_HOUR) return ReplyDecision(ReplyStatus.SKIPPED, REASON_RATE_LIMIT)
        if (!msg.hasReplyAction) return ReplyDecision(ReplyStatus.UNSUPPORTED, REASON_NO_REPLY_ACTION)
        return ReplyDecision(null, null, templateFor(s, silence.zoneId))
    }

    /**
     * Separate activity entry for an attempt, besides MESSAGE_RECEIVED (which
     * always carries the status). Cooldown/disabled/group skips aren't
     * repeated as their own entries; loops and the hourly cap are.
     */
    fun eventTypeFor(status: ReplyStatus, reason: String?): String? = when {
        status == ReplyStatus.SENT -> "AUTO_REPLY_SENT"
        status == ReplyStatus.FAILED -> "AUTO_REPLY_FAILED"
        status == ReplyStatus.UNSUPPORTED -> "AUTO_REPLY_SKIPPED"
        reason == REASON_LOOP || reason == REASON_RATE_LIMIT -> "AUTO_REPLY_SKIPPED"
        else -> null
    }

    /**
     * Whether the sender gets a reply mark after this attempt. Failures are
     * marked too, so a failing reply action is never retried in a loop, and
     * "unsupported" is reported once per cooldown instead of per message.
     */
    fun marksSender(status: ReplyStatus): Boolean =
        status == ReplyStatus.SENT || status == ReplyStatus.FAILED || status == ReplyStatus.UNSUPPORTED

    /** Keeps dedupe state bounded: drops marks older than a day and caps the size. */
    fun pruneMarks(marks: Map<String, ReplyMark>, now: Long, max: Int = 200): Map<String, ReplyMark> =
        marks.filterValues { now - it.at < 24L * 60 * 60 * 1000 }
            .entries.sortedByDescending { it.value.at }
            .take(max)
            .associate { it.key to it.value }

    fun normalizeForCompare(text: String?): String =
        text.orEmpty().trim().lowercase().replace(Regex("\\s+"), " ")

    fun looksLikeOurTemplate(text: String?, settings: AutoReplySettings): Boolean {
        val t = normalizeForCompare(text)
        if (t.isEmpty()) return false
        val s = settings.sanitized()
        return (listOf(s.defaultTemplate) + s.zoneTemplates.values).any { normalizeForCompare(it) == t }
    }
}
