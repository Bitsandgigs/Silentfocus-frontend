package com.SilenceFocus.learning

import android.content.Context
import com.SilenceFocus.comms.FieldCodec
import com.SilenceFocus.comms.KeyValue
import com.SilenceFocus.comms.PrefsKeyValue

/**
 * Smart Location Learning state, on this device only (app-private prefs
 * "silent_focus_learning"; never uploaded). Holds learned place centres
 * (rounded to ~11 m), activation times inside the 30-day window, dismissal
 * state, the opt-in setting and the pending suggestion.
 */
class LearningStore(private val kv: KeyValue) {

    constructor(context: Context) : this(
        PrefsKeyValue(context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)),
    )

    /** Off by default: learning starts only after the user opts in. */
    var enabled: Boolean
        get() = kv.getBoolean(KEY_ENABLED, false)
        set(value) = kv.putBoolean(KEY_ENABLED, value)

    /** The one-time "turn on learning?" offer was answered. */
    var optInAnswered: Boolean
        get() = kv.getBoolean(KEY_OPT_IN_ANSWERED, false)
        set(value) = kv.putBoolean(KEY_OPT_IN_ANSWERED, value)

    var pendingSuggestionId: String?
        get() = kv.getString(KEY_PENDING)?.ifEmpty { null }
        set(value) = kv.putString(KEY_PENDING, value)

    var places: List<LearnedPlace>
        get() = FieldCodec.decode(kv.getString(KEY_PLACES)).mapNotNull(::decode)
        set(value) = kv.putString(KEY_PLACES, FieldCodec.encode(value.map(::encode)))

    /** Forget all learned places (the setting itself is kept). */
    fun clearLearned() = kv.remove(listOf(KEY_PLACES, KEY_PENDING))

    /** Logout: everything, including the opt-in. */
    fun clearUserData() = kv.remove(listOf(KEY_PLACES, KEY_PENDING, KEY_ENABLED, KEY_OPT_IN_ANSWERED))

    private fun encode(p: LearnedPlace) = listOf(
        p.id,
        p.latitude.toString(),
        p.longitude.toString(),
        p.weight.toString(),
        p.dismissals.toString(),
        p.suppressedUntil.toString(),
        p.lastSuggestedAt.toString(),
        if (p.stopped) "1" else "0",
        p.visits.joinToString(";") { "${it.at}:${if (it.good) 1 else 0}" },
    )

    private fun decode(f: List<String>): LearnedPlace? {
        if (f.size < 9) return null
        return runCatching {
            LearnedPlace(
                id = f[0],
                latitude = f[1].toDouble(),
                longitude = f[2].toDouble(),
                weight = f[3].toDouble(),
                dismissals = f[4].toInt(),
                suppressedUntil = f[5].toLong(),
                lastSuggestedAt = f[6].toLong(),
                stopped = f[7] == "1",
                visits = f[8].split(';').filter { it.isNotEmpty() }.map {
                    val (at, good) = it.split(':')
                    LearnedVisit(at.toLong(), good == "1")
                },
            )
        }.getOrNull()
    }

    companion object {
        private const val PREFS = "silent_focus_learning"
        private const val KEY_ENABLED = "enabled"
        private const val KEY_OPT_IN_ANSWERED = "opt_in_answered"
        private const val KEY_PENDING = "pending_suggestion"
        private const val KEY_PLACES = "places"
    }
}
