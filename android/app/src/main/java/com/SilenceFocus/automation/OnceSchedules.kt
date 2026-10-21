package com.SilenceFocus.automation

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.util.TimeZone

/**
 * Client feedback: one-time ("Once") schedules - silence from one exact
 * date/time to another, no weekdays, never repeated.
 *
 * Stored on this phone only, per account: the backend schedule table has no
 * type or date (an empty `days` reads back as "every day" in existing apps),
 * so writing them there would turn them into daily schedules. A backend
 * migration is prepared separately (docs/ONE_TIME_SCHEDULES_BACKEND.md) and
 * needs approval. Until then they are not synced to other devices.
 *
 * [startAt]/[endAt] are absolute instants (like a timed calendar event):
 * a timezone change or DST shift never moves them. Lifecycle:
 * PENDING -> ACTIVE -> COMPLETED, or CANCELLED (before or during). Completion
 * and cancellation are persisted, so a clock moved backwards, a reboot, an
 * app update or a re-sync can never make a finished schedule run again.
 */
data class OnceSchedule(
    val id: String,
    val startAt: Long,
    val endAt: Long,
    val createdAt: Long,
    val completedAt: Long? = null,
    val cancelledAt: Long? = null,
    val name: String? = null,
) {
    enum class Status { PENDING, ACTIVE, COMPLETED, CANCELLED }

    val isValid: Boolean get() = id.startsWith(ID_PREFIX) && startAt > 0 && endAt > startAt

    fun status(now: Long): Status = when {
        cancelledAt != null -> Status.CANCELLED
        completedAt != null -> Status.COMPLETED
        now >= endAt -> Status.COMPLETED
        now >= startAt -> Status.ACTIVE
        else -> Status.PENDING
    }

    /** Still able to silence (now or later). */
    fun isLive(now: Long): Boolean = isValid && status(now).let { it == Status.PENDING || it == Status.ACTIVE }

    fun toJson(): JSONObject = JSONObject().apply {
        put("id", id)
        put("startAt", startAt)
        put("endAt", endAt)
        put("createdAt", createdAt)
        completedAt?.let { put("completedAt", it) }
        cancelledAt?.let { put("cancelledAt", it) }
        name?.let { put("name", it) }
    }

    companion object {
        const val ID_PREFIX = "once-"
        /** A start this far in the past still counts as "now" (time spent on the confirm dialog). */
        const val START_GRACE_MS = 2 * 60_000L
        const val MIN_DURATION_MS = 60_000L
        const val MAX_DURATION_MS = 7L * 24 * 60 * 60_000L
        /** Finished schedules are listed for this long, then forgotten. */
        const val KEEP_FINISHED_MS = 7L * 24 * 60 * 60_000L

        fun fromJson(o: JSONObject?): OnceSchedule? {
            o ?: return null
            fun optLong(k: String) = if (o.has(k) && !o.isNull(k)) o.optLong(k) else null
            return OnceSchedule(
                id = o.optString("id"),
                startAt = o.optLong("startAt"),
                endAt = o.optLong("endAt"),
                createdAt = o.optLong("createdAt"),
                completedAt = optLong("completedAt"),
                cancelledAt = optLong("cancelledAt"),
                name = if (o.has("name") && !o.isNull("name")) o.optString("name") else null,
            ).takeIf { it.isValid }
        }

        fun listToJson(list: List<OnceSchedule>): JSONArray = JSONArray().apply { list.forEach { put(it.toJson()) } }

        fun parseList(raw: String?): List<OnceSchedule> {
            val arr = raw?.let { runCatching { JSONArray(it) }.getOrNull() } ?: return emptyList()
            return (0 until arr.length()).mapNotNull { fromJson(arr.optJSONObject(it)) }.distinctBy { it.id }
        }

        /** Why a new/edited schedule can't be saved, or null when it can. */
        fun validate(startAt: Long, endAt: Long, now: Long): String? = when {
            startAt <= 0 || endAt <= 0 -> ERROR_MISSING
            endAt <= startAt -> ERROR_END_BEFORE_START
            endAt - startAt < MIN_DURATION_MS -> ERROR_TOO_SHORT
            endAt - startAt > MAX_DURATION_MS -> ERROR_TOO_LONG
            startAt < now - START_GRACE_MS -> ERROR_START_PASSED
            else -> null
        }

        const val ERROR_MISSING = "MISSING"
        const val ERROR_END_BEFORE_START = "END_BEFORE_START"
        const val ERROR_TOO_SHORT = "TOO_SHORT"
        const val ERROR_TOO_LONG = "TOO_LONG"
        const val ERROR_START_PASSED = "START_PASSED"
        const val ERROR_NOT_EDITABLE = "NOT_EDITABLE"
        const val ERROR_NOT_FOUND = "NOT_FOUND"
        const val ERROR_NO_ACCOUNT = "NO_ACCOUNT"

        /**
         * Persists terminal states reached by time (so they survive clock
         * changes) and drops finished entries older than [KEEP_FINISHED_MS].
         * Returns null when nothing changed.
         */
        fun housekeep(list: List<OnceSchedule>, now: Long): List<OnceSchedule>? {
            var changed = false
            val next = list.mapNotNull { s ->
                val finishedAt = s.cancelledAt ?: s.completedAt
                when {
                    finishedAt != null && now - finishedAt > KEEP_FINISHED_MS -> { changed = true; null }
                    s.cancelledAt == null && s.completedAt == null && now >= s.endAt -> { changed = true; s.copy(completedAt = s.endAt) }
                    else -> s
                }
            }
            return if (changed) next else null
        }
    }
}

/** One-time schedules as silence rules (source SCHEDULE, like weekly ones). */
class OnceScheduleProvider(private val schedules: List<OnceSchedule>) : SilenceRuleProvider {

    private fun live(now: Long) = schedules.filter { it.isLive(now) }

    override fun activeRules(nowMillis: Long, tz: TimeZone): List<ActiveRule> =
        live(nowMillis).filter { it.status(nowMillis) == OnceSchedule.Status.ACTIVE }
            .map { ActiveRule(RuleSource.SCHEDULE, it.id, it.name, it.startAt, it.endAt) }

    override fun nextBoundaryAfter(nowMillis: Long, tz: TimeZone): Boundary? =
        live(nowMillis).flatMap {
            listOf(Boundary(it.startAt, BoundaryKind.START), Boundary(it.endAt, BoundaryKind.END))
        }.filter { it.atMillis > nowMillis }.minByOrNull { it.atMillis }?.from(RuleSource.SCHEDULE)

    override fun nextStartAfter(nowMillis: Long, tz: TimeZone): Boundary? =
        live(nowMillis).map { it.startAt }.filter { it > nowMillis }.minOrNull()
            ?.let { Boundary(it, BoundaryKind.START).from(RuleSource.SCHEDULE) }
}

/**
 * Per-account storage (own prefs file). Only the account recorded as the
 * schedule owner automates: set when the signed-in app loads its schedules,
 * cleared on logout / session expiry (EngineStore.clearUserData), so a
 * signed-out phone or another account never runs them. Signing back in to
 * the same account restores them; past windows are then simply completed.
 */
class OnceScheduleStore(context: Context) {

    private val prefs = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun list(owner: Long): List<OnceSchedule> =
        if (owner <= 0) emptyList() else OnceSchedule.parseList(prefs.getString(key(owner), null))

    fun save(owner: Long, list: List<OnceSchedule>) {
        if (owner <= 0) return
        prefs.edit().apply {
            if (list.isEmpty()) remove(key(owner)) else putString(key(owner), OnceSchedule.listToJson(list).toString())
        }.commit()
    }

    /** The account's data is deleted (account deletion): forget its schedules. */
    fun clear(owner: Long) {
        if (owner > 0) prefs.edit().remove(key(owner)).commit()
    }

    private fun key(owner: Long) = "owner:$owner"

    companion object {
        private const val PREFS = "silent_focus_once_schedules"
    }
}
