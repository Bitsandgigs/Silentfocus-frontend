package com.SilenceFocus.automation

import android.content.Context
import com.SilenceFocus.comms.FieldCodec
import com.SilenceFocus.comms.KeyValue
import com.SilenceFocus.comms.PrefsKeyValue

/**
 * Per-account logout outbox: data not yet acknowledged by the server
 * (unconfirmed calls/messages and sessions, incl. the session open at
 * logout, closed at that time) survives logout here until the SAME account
 * signs in again on this phone, uploads it and the server reads it back.
 *
 * - Keyed by server user id; nothing here is ever shown, merged into history
 *   or uploaded for another account.
 * - Never trimmed for age or size; entries leave only after read-back
 *   verification or when that account is deleted.
 * - Journal events are kept as their original JSON (same content as the
 *   local journal: no message text, numbers already redacted).
 */
object Outbox {

    /** A journal entry: [json] is the stored event, the rest is parsed from it. */
    data class Event(
        val id: String,
        val type: String,
        val at: Long,
        val acknowledged: Boolean,
        val json: String,
        /** Debug test-harness entry: never saved to an outbox (see ActivityEvents.SYNTHETIC_FIELD). */
        val synthetic: Boolean = false,
    ) {
        val pending: Boolean get() = !synthetic && type in ActivityEvents.UPLOADED_TYPES && !acknowledged
    }

    data class Session(val start: Long, val end: Long, val primarySource: String?)

    data class Content(val events: List<Event> = emptyList(), val sessions: List<Session> = emptyList()) {
        val size: Int get() = events.size + sessions.size
        fun isEmpty() = events.isEmpty() && sessions.isEmpty()
    }

    /**
     * What logout must keep: unconfirmed uploaded-type events and finished
     * unconfirmed sessions, plus the open session closed at [now].
     */
    fun pendingSnapshot(events: List<Event>, sessions: List<SilenceSession>, now: Long): Content = Content(
        events = events.filter { it.pending },
        sessions = sessions.mapNotNull { s ->
            when {
                s.end == null -> Session(s.start, maxOf(now, s.start), s.primarySource)
                s.pending -> Session(s.start, s.end, s.primarySource)
                else -> null
            }
        },
    )

    /** Union; the same event id once, the same session start once (later end wins). */
    fun merge(a: Content, b: Content): Content = Content(
        events = (a.events + b.events).associateBy { it.id }.values.sortedBy { it.at },
        sessions = (a.sessions + b.sessions)
            .groupBy { it.start }
            .map { (_, same) -> same.maxByOrNull { it.end }!! }
            .sortedBy { it.start },
    )

    /** Removes only what the server was read back to hold. */
    fun withoutVerified(c: Content, eventIds: Set<String>, sessionEnds: Map<Long, Long>): Content = Content(
        events = c.events.filter { it.id !in eventIds },
        sessions = c.sessions.filter { sessionEnds[it.start] != it.end },
    )

    enum class Claim {
        /** Already this account's history. */
        KEEP,

        /** No recorded owner (first sign-in / recorded before owners existed): adopt it. */
        ADOPT,

        /** Another account's history: save its pending data to ITS outbox, then remove it here. */
        MOVE_TO_OWNER_OUTBOX,
    }

    /** What sign-in as [userId] does with history owned by [owner] (0 = none). */
    fun claimAction(owner: Long, userId: Long): Claim = when {
        owner == userId -> Claim.KEEP
        owner <= 0L -> Claim.ADOPT
        else -> Claim.MOVE_TO_OWNER_OUTBOX
    }

    private val SYNTHETIC_JSON = Regex("\"${ActivityEvents.SYNTHETIC_FIELD}\"\\s*:\\s*true")

    /** Whether a stored journal JSON is a synthetic (test-harness) entry. */
    fun isSyntheticJson(json: String): Boolean = SYNTHETIC_JSON.containsMatchIn(json)

    // ---- storage format (FieldCodec records)

    fun encode(c: Content): String = FieldCodec.encode(
        c.events.map { listOf("E", it.id, it.type, it.at.toString(), if (it.acknowledged) "1" else "", it.json) } +
            c.sessions.map { listOf("S", it.start.toString(), it.end.toString(), it.primarySource.orEmpty()) },
    )

    fun decode(raw: String?): Content {
        val records = FieldCodec.decode(raw)
        return Content(
            // A synthetic entry is never saved; one found here anyway is dropped,
            // so it can't be read, merged or flushed.
            events = records.filter { it.firstOrNull() == "E" && it.size >= 6 && !isSyntheticJson(it[5]) }.mapNotNull { f ->
                f[3].toLongOrNull()?.let { at -> Event(f[1], f[2], at, f[4] == "1", f[5]) }
            },
            sessions = records.filter { it.firstOrNull() == "S" && it.size >= 4 }.mapNotNull { f ->
                val start = f[1].toLongOrNull() ?: return@mapNotNull null
                val end = f[2].toLongOrNull() ?: return@mapNotNull null
                Session(start, end, f[3].ifEmpty { null })
            },
        )
    }
}

/**
 * Sign-in / signed-out decisions, with storage passed in (pure, tested).
 */
object AccountHistory {

    enum class ClaimResult { KEPT, ADOPTED, MOVED, BLOCKED }

    /**
     * Sign-in as [userId] with local history owned by [owner]. Another
     * account's history is saved to ITS outbox ([preserveFor]) and only then
     * removed; if that save fails nothing is deleted and the sign-in is
     * BLOCKED.
     */
    fun claim(
        userId: Long,
        owner: Long,
        preserveFor: (Long) -> Boolean,
        clearHistory: () -> Unit,
        setOwner: (Long) -> Unit,
    ): ClaimResult {
        if (userId <= 0) return ClaimResult.BLOCKED
        return when (Outbox.claimAction(owner, userId)) {
            Outbox.Claim.KEEP -> ClaimResult.KEPT
            Outbox.Claim.ADOPT -> {
                setOwner(userId)
                ClaimResult.ADOPTED
            }
            Outbox.Claim.MOVE_TO_OWNER_OUTBOX -> {
                if (!preserveFor(owner)) return ClaimResult.BLOCKED
                clearHistory()
                setOwner(userId)
                ClaimResult.MOVED
            }
        }
    }

    /**
     * Owner to record when [userId]'s session expires, or null when none can
     * be determined (then the logout path is used). An existing owner is
     * kept: the history is already theirs.
     */
    fun ownerAfterExpiry(userId: Long, owner: Long): Long? = when {
        owner > 0L -> owner
        userId > 0L -> userId
        else -> null
    }

    /** The local history now belongs to a different account than before. */
    fun ownerChanged(result: ClaimResult): Boolean = result == ClaimResult.MOVED || result == ClaimResult.ADOPTED

    /** Engine still carries a user's automation while signed out. */
    fun hasUserAutomation(owned: Boolean, override: OverrideMode, schedules: Int, zones: Int, calendarEvents: Int): Boolean =
        owned || override != OverrideMode.NONE || schedules > 0 || zones > 0 || calendarEvents > 0

    /**
     * Finishes a sign-out that was cut short: keep pending data if possible,
     * then reset - keeping the history if it could not be saved. Silencing
     * always ends. Returns true if anything had to be done.
     */
    fun finishSignOut(hasUserAutomation: Boolean, preserve: () -> Boolean, reset: (keepHistory: Boolean) -> Unit): Boolean {
        if (!hasUserAutomation) return false
        reset(!preserve())
        return true
    }
}

/** App-private outbox storage ("silent_focus_outbox"), one key per account. */
class OutboxStore(private val kv: KeyValue) {

    constructor(context: Context) : this(
        PrefsKeyValue(context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)),
    )

    fun read(userId: Long): Outbox.Content = Outbox.decode(kv.getString(key(userId)))

    /**
     * Adds [add] to this account's outbox with a durable write, then reads it
     * back. True only if everything in [add] is stored.
     */
    fun save(userId: Long, content: Outbox.Content): Boolean = synchronized(LOCK) {
        if (userId <= 0) return false
        // Synthetic (test-harness) entries never enter an outbox.
        val add = content.copy(events = content.events.filter { !it.synthetic && !Outbox.isSyntheticJson(it.json) })
        if (add.isEmpty()) return true
        val merged = Outbox.merge(read(userId), add)
        if (!kv.commitString(key(userId), Outbox.encode(merged))) return false
        val back = read(userId)
        val ids = back.events.map { it.id }.toSet()
        val sessions = back.sessions.associate { it.start to it.end }
        add.events.all { it.id in ids } && add.sessions.all { s -> (sessions[s.start] ?: Long.MIN_VALUE) >= s.end }
    }

    /** Drops what the server was read back to hold; durable. */
    fun removeVerified(userId: Long, eventIds: Set<String>, sessionEnds: Map<Long, Long>): Boolean = synchronized(LOCK) {
        val left = Outbox.withoutVerified(read(userId), eventIds, sessionEnds)
        kv.commitString(key(userId), if (left.isEmpty()) null else Outbox.encode(left))
    }

    /** Account deleted: its pending data has nowhere to go. */
    fun drop(userId: Long): Boolean = synchronized(LOCK) { kv.commitString(key(userId), null) }

    private fun key(userId: Long) = "outbox:$userId"

    companion object {
        private const val PREFS = "silent_focus_outbox"
        private val LOCK = Any()
    }
}
