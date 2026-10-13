package com.SilenceFocus.comms

/**
 * Round 3 (client feedback #1 / #2) – the display name of a caller or message
 * sender, as the posting app itself put it in its notification (CallStyle
 * person, MessagingStyle person / conversation title, or the notification
 * title). Nothing is looked up elsewhere: no contacts, no guessing.
 *
 * A name is shown only when it plausibly names a person or chat. Generic
 * headings ("WhatsApp", "3 missed calls", "Incoming voice call", "2 new
 * messages", the app's own label) are rejected and the UI says "Unknown
 * caller" / "Unknown sender" instead. A title that is just a phone number
 * (a caller not in the user's contacts) is kept only in redacted form
 * ("+91******3210"), like every other number this app records.
 *
 * Privacy: names are kept only in the local Activity journal of the account
 * that owns it (cleared with those rows, never uploaded - see
 * src/utils/serverSync.js toServerLog, which maps explicit fields only - and
 * stripped from logout outboxes). Never logged.
 */
object NotificationNames {

    const val MAX_CHARS = 60

    /** Journal fields (local only). */
    const val FIELD_NAME = "displayName"
    const val FIELD_GROUP = "groupName"
    /** Timestamp of the message a row was recorded for (no content); picks its preview. */
    const val FIELD_MESSAGE_AT = "messageAt"

    /** Fields removed before an event is saved to a logout outbox. */
    val LOCAL_ONLY_FIELDS = listOf(FIELD_NAME, FIELD_GROUP, FIELD_MESSAGE_AT)

    private val INVISIBLE = Regex("[\\u200B-\\u200F\\u202A-\\u202E\\u2066-\\u2069\\uFEFF]")
    private val COUNT_SUFFIX = Regex(
        "\\s*[(\\[]\\s*\\d+\\s*(new\\s+)?(messages?|msgs?|missed\\s+(voice\\s+|video\\s+)?calls?|calls?)?\\s*[)\\]]\\s*$",
        RegexOption.IGNORE_CASE,
    )
    private val SPACES = Regex("[\\s\\u00A0\\u2007\\u202F]+")
    private val PHONE_LIKE = Regex("^\\+?[0-9 ()\\-.]{7,}$")

    /** Headings apps use instead of a person (lower-case, whole title). */
    private val GENERIC = listOf(
        Regex("^\\d+\\s+(new\\s+)?messages?(\\s+from\\s+\\d+\\s+chats?)?$"),
        Regex("^(new\\s+)?messages?$"),
        Regex("^\\d+\\s+(new\\s+)?(missed\\s+)?(voice\\s+|video\\s+)?calls?(\\s+from\\s+\\d+\\s+chats?)?$"),
        Regex("^missed\\s+(voice\\s+|video\\s+|group\\s+)*calls?$"),
        Regex("^(incoming|ongoing|outgoing)\\s+(group\\s+)?(voice\\s+|video\\s+)?call$"),
        Regex("^(calling|ringing|connecting|reconnecting)(\\s*(…|\\.\\.\\.))?$"),
        Regex("^(voice|video|whatsapp|whatsapp business)\\s+call$"),
        Regex("^(unknown|unknown caller|unknown sender|private number|null|you|me)$"),
        Regex("^(whatsapp|whatsapp business|whatsapp web)(\\s*[·:\\-].*)?$"),
        Regex("^(checking for new messages|backup in progress|sending message|sending messages)(…|\\.\\.\\.)?$"),
    )

    /**
     * A safe display name from one raw candidate, or null when it doesn't
     * name anyone. [appLabels] are the posting app's own names.
     */
    fun clean(raw: CharSequence?, appLabels: Collection<String> = emptyList()): String? {
        var s = raw?.toString()?.replace(INVISIBLE, "")?.replace(SPACES, " ")?.trim().orEmpty()
        if (s.isEmpty()) return null
        s = s.replace(COUNT_SUFFIX, "").trim()
        if (s.isEmpty()) return null
        val lower = s.lowercase()
        if (appLabels.any { it.equals(s, ignoreCase = true) }) return null
        if (GENERIC.any { it.matches(lower) }) return null
        if (PHONE_LIKE.matches(s) && s.count { it.isDigit() } >= 7) return PhoneNumbers.redact(s)
        // Text without a single letter or digit (e.g. "…", "•") names nobody.
        if (s.none { it.isLetterOrDigit() }) return null
        return if (s.length <= MAX_CHARS) s else s.take(MAX_CHARS - 1).trimEnd() + "…"
    }

    /** #1: the CallStyle person first (Android 12+), else the notification title. */
    fun callerName(callPersonName: CharSequence?, title: CharSequence?, appLabels: Collection<String>): String? =
        clean(callPersonName, appLabels) ?: clean(title, appLabels)

    data class Sender(val name: String?, val group: String?)

    /**
     * #2: who sent the newest message. One-to-one: that message's person,
     * else the conversation title, else the notification title. Groups: the
     * message's person is the sender and the conversation title is the group
     * - the group name is never presented as the sender.
     */
    fun messageSender(
        isGroup: Boolean,
        personName: CharSequence?,
        conversationTitle: CharSequence?,
        title: CharSequence?,
        appLabels: Collection<String>,
    ): Sender {
        if (isGroup) {
            val group = clean(conversationTitle, appLabels)
            val sender = clean(personName, appLabels)?.takeIf { it != group }
            return Sender(sender, group)
        }
        return Sender(
            clean(personName, appLabels) ?: clean(conversationTitle, appLabels) ?: clean(title, appLabels),
            null,
        )
    }
}
