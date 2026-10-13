package com.SilenceFocus.comms

/**
 * Urgent client issue – Emergency Contacts and Urgent Callers for WhatsApp /
 * WhatsApp Business calls. Pure decision logic (JVM-tested); the Android side
 * is [WhatsAppCallRecorder] + [EmergencyCallAlert].
 *
 * WhatsApp calls never reach Android's call screening (they are app VoIP), so
 * the cellular path (CallDecider) can't see them. The only signal is
 * WhatsApp's ringing notification. Matching a caller to an emergency contact
 * therefore uses, strongest first:
 *  1. NUMBER  – a phone number WhatsApp itself exposes: a `tel:` person URI,
 *     a WhatsApp id ("919876543210@s.whatsapp.net") in the conversation
 *     shortcut / notification tag / person key, or a title that is a number;
 *  2. CONTACT – the person's contacts URI resolved to that contact's numbers
 *     (only when Contacts permission is already granted - never requested
 *     for this);
 *  3. NAME    – the display name, ONLY when the user turned on name matching,
 *     only if exactly one emergency contact has that name, and never when a
 *     number is known and contradicts it. Names change and repeat, so this
 *     is opt-in and labelled as less reliable.
 * Hidden numbers / unknown callers never match.
 */
object WhatsAppEmergency {

    enum class Method { NUMBER, CONTACT, NAME }

    data class Match(val contact: EmergencyContact, val method: Method)

    /** What identifies a WhatsApp caller, as read from the notification. */
    data class CallerIds(
        val personUri: String? = null,
        val personKey: String? = null,
        val shortcutId: String? = null,
        val tag: String? = null,
        val title: String? = null,
        /** Numbers resolved from a contacts URI (CONTACT); empty when not available. */
        val contactNumbers: List<String> = emptyList(),
        /** The CallStyle person's name (Android 12+), when WhatsApp set one. */
        val personName: String? = null,
    )

    /** A WhatsApp id: digits, an optional device suffix (":12"), then the user server. */
    private val JID = Regex("(?<![0-9])(\\d{6,15})(?::\\d{1,3})?@(s\\.whatsapp\\.net|c\\.us)\\b", RegexOption.IGNORE_CASE)
    private val PHONE_LIKE = Regex("^\\+?[0-9 ()\\-.]{7,}$")
    /** Direction marks and zero-width characters Android/WhatsApp wrap around numbers and names. */
    private val INVISIBLE = Regex("[\\u200B-\\u200F\\u202A-\\u202E\\u2066-\\u2069\\uFEFF]")
    private val SPACES = Regex("[\\s\\u00A0\\u2007\\u202F]+")
    private val LOOKUP = Regex("/contacts/lookup/([^/?#]+)", RegexOption.IGNORE_CASE)

    private fun visible(s: String?) = s?.replace(INVISIBLE, "")?.replace(SPACES, " ")?.trim()

    /** Numbers WhatsApp exposed directly (NUMBER method), normalised, distinct. */
    fun exposedNumbers(ids: CallerIds): List<String> {
        val out = LinkedHashSet<String>()
        visible(ids.personUri)?.let { uri ->
            if (uri.startsWith("tel:", ignoreCase = true)) {
                PhoneNumbers.normalize(android_decode(uri.substring(4)))?.let(out::add)
            }
        }
        listOf(ids.shortcutId, ids.tag, ids.personKey, ids.personUri).forEach { raw ->
            raw?.let { JID.find(it) }?.let { m ->
                PhoneNumbers.normalize("+" + m.groupValues[1])?.let(out::add)
            }
        }
        listOf(ids.title, ids.personName).forEach { raw ->
            visible(raw)?.takeIf { PHONE_LIKE.matches(it) && it.count(Char::isDigit) >= 7 }?.let { t ->
                PhoneNumbers.normalize(t)?.let(out::add)
            }
        }
        return out.toList()
    }

    /** "%2B91…" -> "+91…" without android.net.Uri (JVM tests). */
    private fun android_decode(s: String): String = s.replace("%2B", "+", ignoreCase = true).replace("%20", " ")

    /**
     * The contact lookup key in a contacts person URI
     * (content://com.android.contacts/contacts/lookup/KEY/ID). Emergency
     * contacts picked from the phone's contacts keep that same key as their
     * id, so it identifies the contact without reading Contacts.
     */
    fun lookupKey(uri: String?): String? =
        uri?.let { LOOKUP.find(it) }?.groupValues?.get(1)?.let(::percentDecode)?.takeIf { it.isNotBlank() }

    private fun percentDecode(s: String): String = runCatching {
        java.net.URLDecoder.decode(s.replace("+", "%2B"), "UTF-8")
    }.getOrDefault(s)

    /** Lower-case, single-spaced, no direction marks; null when empty. */
    fun nameKey(name: String?): String? =
        visible(name)?.lowercase()?.takeIf { it.isNotEmpty() }

    /** Names WhatsApp showed for the caller (CallStyle person first), cleaned; generic headings dropped. */
    private fun shownNames(ids: CallerIds): List<String> =
        listOf(ids.personName, ids.title).mapNotNull { raw ->
            NotificationNames.clean(raw, WhatsAppCalls.APPS.values)?.takeIf { !PHONE_LIKE.matches(it) && !it.contains('*') }
        }.distinct()

    fun match(
        contacts: List<EmergencyContact>,
        ids: CallerIds,
        enabled: Boolean,
        nameMatching: Boolean,
    ): Match? = identify(contacts, ids, enabled, nameMatching).match

    /**
     * How a caller was identified - for matching and for the "Check WhatsApp
     * Call Alerts" result. Booleans only; never the name or number itself.
     */
    data class Identity(
        val match: Match?,
        /** WhatsApp showed (or Contacts resolved) a phone number. */
        val numberShown: Boolean,
        /** WhatsApp showed a person's name. */
        val nameShown: Boolean,
        /** Name matching is off, but exactly one emergency contact has the name WhatsApp showed. */
        val nameWouldMatch: Boolean,
    )

    fun identify(
        contacts: List<EmergencyContact>,
        ids: CallerIds,
        enabled: Boolean,
        nameMatching: Boolean,
    ): Identity {
        val exposed = exposedNumbers(ids)
        val names = shownNames(ids)
        val numberShown = exposed.isNotEmpty() || ids.contactNumbers.isNotEmpty()
        fun result(m: Match?, wouldMatch: Boolean = false) = Identity(m, numberShown, names.isNotEmpty(), wouldMatch)
        if (!enabled || contacts.isEmpty()) return result(null)
        exposed.forEach { n -> contacts.firstOrNull { PhoneNumbers.sameNumber(it.number, n) }?.let { return result(Match(it, Method.NUMBER)) } }
        lookupKey(ids.personUri)?.let { key -> contacts.firstOrNull { it.id == key }?.let { return result(Match(it, Method.CONTACT)) } }
        ids.contactNumbers.forEach { n -> contacts.firstOrNull { PhoneNumbers.sameNumber(it.number, n) }?.let { return result(Match(it, Method.CONTACT)) } }
        // A known number that isn't an emergency contact's: never override it by name.
        if (numberShown) return result(null)
        val byName = names.asSequence().mapNotNull { shown ->
            val key = nameKey(shown) ?: return@mapNotNull null
            contacts.filter { nameKey(it.name) == key }.takeIf { it.size == 1 }?.first()
        }.firstOrNull()
        return if (nameMatching) result(byName?.let { Match(it, Method.NAME) }) else result(null, wouldMatch = byName != null)
    }

    /** Hashed identity for limits/repeats: the matched number when known, else the caller key. */
    fun alertKey(match: Match?, callerKey: String?): String? =
        match?.let { "ec:${it.contact.id}" } ?: callerKey

    // ---- duplicate / rate limiting

    enum class Kind { EMERGENCY, URGENT }

    /** Alerts are rare by design: one per caller per [PER_CALLER_GAP_MS], at most [MAX_PER_WINDOW] per [WINDOW_MS]. */
    const val PER_CALLER_GAP_MS = 45_000L
    const val WINDOW_MS = 10 * 60_000L
    const val MAX_PER_WINDOW = 5

    data class Sent(val key: String, val at: Long)

    data class LimitResult(val allowed: Boolean, val reason: String?, val history: List<Sent>)

    fun limit(history: List<Sent>, key: String, now: Long): LimitResult {
        val recent = history.filter { it.at in (now - WINDOW_MS + 1)..now }
        if (recent.any { it.key == key && now - it.at < PER_CALLER_GAP_MS }) return LimitResult(false, REASON_DUPLICATE, recent)
        if (recent.size >= MAX_PER_WINDOW) return LimitResult(false, REASON_RATE_LIMIT, recent)
        return LimitResult(true, null, (recent + Sent(key, now)).takeLast(MAX_PER_WINDOW))
    }

    const val REASON_DUPLICATE = "DUPLICATE"
    const val REASON_RATE_LIMIT = "RATE_LIMIT"
    const val REASON_DISABLED = "ALERTS_OFF"

    /**
     * Lock-screen text: never a name or number. Round 4 (#C): short enough
     * that the collapsed notification (Samsung shows one line) already says
     * what is happening; the title alone carries the meaning.
     */
    fun publicText(kind: Kind, app: String): Pair<String, String> = privateText(kind, app, null, 0).let { (t, x) ->
        if (kind == Kind.URGENT) t to "Someone is calling repeatedly." else t to x
    }

    /**
     * Alert text. Round 4: never a name or number, locked or not - Android
     * shows "private" notification content on the lock screen whenever the
     * user's lock-screen setting allows sensitive content (the default), so
     * only leaving the name out keeps it off the lock screen. [who] is kept
     * for the call site; the name stays in the local Activity Center.
     */
    @Suppress("UNUSED_PARAMETER")
    fun privateText(kind: Kind, app: String, who: String?, repeatCount: Int): Pair<String, String> = when (kind) {
        Kind.EMERGENCY -> "Emergency call on $app" to "Your emergency contact is calling."
        Kind.URGENT -> "Urgent call on $app" to "Someone called $repeatCount times."
    }

    /** The plain notice used when WhatsApp alerts are switched off (no sound). */
    fun repeatNoticeText(app: String, count: Int): Pair<String, String> =
        "Repeated $app calls" to "Someone called $count times. Open $app."

    /** "Try an Alert" (#C): fits a collapsed Samsung notification. */
    const val TEST_TITLE = "Important Call Alert Test"
    const val TEST_TEXT = "This is the alert for important WhatsApp calls."
}
