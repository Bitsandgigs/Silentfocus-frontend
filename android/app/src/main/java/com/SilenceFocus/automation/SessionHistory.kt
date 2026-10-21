package com.SilenceFocus.automation

import android.content.Context
import com.SilenceFocus.comms.FieldCodec
import com.SilenceFocus.comms.KeyValue
import com.SilenceFocus.comms.PrefsKeyValue

/**
 * One real period during which Silent Focus was active (the engine owned
 * the device), from the first evaluation that silenced to the one that
 * stopped. Break-through pauses stay inside the session. Counters only -
 * no numbers, names of callers or message content.
 */
data class SilenceSession(
    val start: Long,
    val end: Long?,
    /** Source that started the session (MANUAL / ZONE / SCHEDULE / CALENDAR). */
    val primarySource: String?,
    /** Every source that was active at some point during the session. */
    val sources: Set<String> = emptySet(),
    val zoneNames: Set<String> = emptySet(),
    /** Selected CalendarContract.Instances title, retained only locally. */
    val calendarEventTitle: String? = null,
    val emergencyBreakthroughs: Int = 0,
    val urgentBreakthroughs: Int = 0,
    val callsSilenced: Int = 0,
    val messagesReceived: Int = 0,
    val autoRepliesSent: Int = 0,
    /** The end the server acknowledged (read back by JS); null = not yet. */
    val ackedEnd: Long? = null,
) {
    val id: String get() = start.toString()

    /** Finished, but the server doesn't hold this end yet: retention keeps it. */
    val pending: Boolean get() = end != null && ackedEnd != end
}

enum class SessionCounter { EMERGENCY, URGENT, CALL_SILENCED, MESSAGE, AUTO_REPLY }

/** Pure session bookkeeping (JVM-tested). */
object SessionTracker {
    const val MAX_SESSIONS = 100
    const val MAX_AGE_MS = 90L * 24 * 60 * 60 * 1000
    private const val MAX_ZONE_NAMES = 10

    /**
     * Called on every evaluation. [active] = Silent Focus active after it
     * (EngineStore.owned), [since] = its start, [source] / [rules] = what
     * silences now.
     */
    fun onEvaluate(
        sessions: List<SilenceSession>,
        active: Boolean,
        since: Long,
        source: String?,
        rules: List<ActiveRule>,
        now: Long,
    ): List<SilenceSession> {
        val open = sessions.lastOrNull()?.takeIf { it.end == null }
        if (!active) {
            // Wall-clock corrections can move `now` behind a session that
            // was opened before the correction. Never persist an impossible
            // negative interval in Session History.
            return if (open == null) sessions else sessions.dropLast(1) + open.copy(end = maxOf(open.start, now))
        }
        val start = if (since > 0) since else now
        val zones = rules.filter { it.source == RuleSource.ZONE || it.source == RuleSource.PLACE }.mapNotNull { it.name?.takeIf(String::isNotBlank) }
        val calendarTitle = rules.firstOrNull { it.source == RuleSource.CALENDAR }
            ?.name?.trim()?.takeIf { it.isNotEmpty() }
        val srcs = (rules.map { it.source.name } + listOfNotNull(source)).toSet()
        if (open == null || (since > 0 && open.start != since)) {
            // A different activation than the open one (e.g. the end was
            // missed): close the old one where the new one began.
            val closed = if (open == null) sessions else sessions.dropLast(1) + open.copy(end = maxOf(open.start, start))
            return prune(
                closed + SilenceSession(
                    start = start,
                    end = null,
                    primarySource = source,
                    sources = srcs,
                    zoneNames = zones.toSet(),
                    calendarEventTitle = calendarTitle,
                ),
                now,
            )
        }
        val updated = open.copy(
            sources = open.sources + srcs,
            zoneNames = (open.zoneNames + zones).take(MAX_ZONE_NAMES).toSet(),
            calendarEventTitle = open.calendarEventTitle ?: calendarTitle,
            primarySource = open.primarySource ?: source,
        )
        return if (updated == open) sessions else sessions.dropLast(1) + updated
    }

    /**
     * When the clock jumps forward past a finite rule window, close at the
     * last expected end rather than attributing the skipped wall-clock time
     * to Silent Focus. Open-ended sources (zones/manual) still close at now.
     */
    fun closeTime(now: Long, clockChanged: Boolean, previousWindowEnds: List<Long?>): Long {
        if (!clockChanged || previousWindowEnds.isEmpty() || previousWindowEnds.any { it == null }) return now
        val expected = previousWindowEnds.filterNotNull().maxOrNull() ?: return now
        return if (expected <= now) expected else now
    }

    /** Adds to the open session's counters; ignored when nothing is open. */
    fun increment(sessions: List<SilenceSession>, counter: SessionCounter): List<SilenceSession> {
        val open = sessions.lastOrNull()?.takeIf { it.end == null } ?: return sessions
        val updated = when (counter) {
            SessionCounter.EMERGENCY -> open.copy(emergencyBreakthroughs = open.emergencyBreakthroughs + 1)
            SessionCounter.URGENT -> open.copy(urgentBreakthroughs = open.urgentBreakthroughs + 1)
            SessionCounter.CALL_SILENCED -> open.copy(callsSilenced = open.callsSilenced + 1)
            SessionCounter.MESSAGE -> open.copy(messagesReceived = open.messagesReceived + 1)
            SessionCounter.AUTO_REPLY -> open.copy(autoRepliesSent = open.autoRepliesSent + 1)
        }
        return sessions.dropLast(1) + updated
    }

    /**
     * At most [MAX_SESSIONS], none that ended more than 90 days ago - except
     * pending sessions (not yet acknowledged by the server), which are never
     * evicted for age or count.
     */
    fun prune(sessions: List<SilenceSession>, now: Long): List<SilenceSession> {
        val keep = sessions.indices.filter { sessions[it].pending }.toSet() +
            sessions.indices
                .filter { !sessions[it].pending && (sessions[it].end ?: now) > now - MAX_AGE_MS }
                .takeLast(MAX_SESSIONS)
        return sessions.filterIndexed { i, _ -> i in keep }
    }
}

/** Session history storage (app-private prefs "silent_focus_history"). */
class SessionStore(private val kv: KeyValue) {

    constructor(context: Context) : this(
        PrefsKeyValue(context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)),
    )

    var sessions: List<SilenceSession>
        get() = FieldCodec.decode(kv.getString(KEY_SESSIONS)).mapNotNull(::decode)
        set(value) = kv.putString(KEY_SESSIONS, FieldCodec.encode(value.map(::encode)))

    /** When session recording started on this device (history before it is unknown). */
    var recordingSince: Long
        get() = kv.getString(KEY_SINCE)?.toLongOrNull() ?: 0L
        set(value) = kv.putString(KEY_SINCE, value.toString())

    fun update(block: (List<SilenceSession>) -> List<SilenceSession>) = synchronized(LOCK) {
        val before = sessions
        val after = block(before)
        if (after != before) sessions = after
    }

    /**
     * Keeps an open session open (Silent Focus may be on right now). Finished
     * sessions are dropped only if [clearableStarts] lists them (the server
     * acknowledged their final state); null drops all finished sessions
     * (no server copy is kept, e.g. writes disabled).
     */
    fun clear(now: Long, clearableStarts: Set<Long>? = null) = synchronized(LOCK) {
        val all = sessions
        val open = all.lastOrNull()?.takeIf { it.end == null }
        val kept = if (clearableStarts == null) emptyList() else
            all.filter { it.end != null && it.start !in clearableStarts }
        sessions = kept + listOfNotNull(open?.copy(
            emergencyBreakthroughs = 0, urgentBreakthroughs = 0, callsSilenced = 0,
            messagesReceived = 0, autoRepliesSent = 0,
        ))
        recordingSince = kept.minOfOrNull { it.start }?.coerceAtMost(now) ?: now
    }

    /** The server acknowledged these sessions with these ends ([start] -> end). */
    fun markAcknowledged(ends: Map<Long, Long>) = update { list ->
        list.map { s -> if (s.end != null && ends[s.start] == s.end) s.copy(ackedEnd = s.end) else s }
    }

    fun clearUserData() = kv.remove(listOf(KEY_SESSIONS, KEY_SINCE))

    private fun encode(s: SilenceSession) = listOf(
        s.start.toString(),
        s.end?.toString().orEmpty(),
        s.primarySource.orEmpty(),
        s.sources.joinToString(","),
        s.zoneNames.joinToString("\u001D") { it.replace("\u001D", "") },
        s.calendarEventTitle?.replace("\u001D", "") ?: "",
        s.emergencyBreakthroughs.toString(),
        s.urgentBreakthroughs.toString(),
        s.callsSilenced.toString(),
        s.messagesReceived.toString(),
        s.autoRepliesSent.toString(),
        s.ackedEnd?.toString().orEmpty(),
    )

    private fun decode(f: List<String>): SilenceSession? {
        if (f.size < 10) return null
        return runCatching {
            SilenceSession(
                start = f[0].toLong(),
                end = f[1].toLongOrNull(),
                primarySource = f[2].ifEmpty { null },
                sources = f[3].split(',').filter { it.isNotEmpty() }.toSet(),
                zoneNames = f[4].split('\u001D').filter { it.isNotEmpty() }.toSet(),
                // v2 added calendarEventTitle at index 5.  Older persisted
                // records remain readable without fabricated titles.
                calendarEventTitle = if (f.size >= 12) f[5].ifEmpty { null } else null,
                emergencyBreakthroughs = f[if (f.size >= 12) 6 else 5].toInt(),
                urgentBreakthroughs = f[if (f.size >= 12) 7 else 6].toInt(),
                callsSilenced = f[if (f.size >= 12) 8 else 7].toInt(),
                messagesReceived = f[if (f.size >= 12) 9 else 8].toInt(),
                autoRepliesSent = f[if (f.size >= 12) 10 else 9].toInt(),
                // Absent in records written before this field existed.
                ackedEnd = f.getOrNull(if (f.size >= 12) 11 else 10)?.toLongOrNull(),
            )
        }.getOrNull()
    }

    companion object {
        private const val PREFS = "silent_focus_history"
        private const val KEY_SESSIONS = "sessions"
        private const val KEY_SINCE = "recording_since"
        private val LOCK = Any()
    }
}
