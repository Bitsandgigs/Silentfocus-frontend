package com.SilenceFocus.automation

import android.content.Context
import com.SilenceFocus.comms.FieldCodec
import com.SilenceFocus.comms.KeyValue
import com.SilenceFocus.comms.PrefsKeyValue
import kotlin.math.roundToInt

/**
 * Local, bounded geofence diagnostics (Client Issue #5): when a transition
 * was detected (the triggering fix), when it reached the app, when the
 * engine evaluated it and whether DND was applied - so a slow office
 * detection can be split into "location noticed late" vs "delivered late"
 * vs "applied late".
 *
 * Privacy: never stores coordinates - only the fix time, accuracy, provider
 * and the distance to the zone centre rounded to 10 m. App-private storage,
 * newest [MAX_RECORDS] only, never uploaded, cleared at logout.
 * Diagnostics never change detection, polling, radius or DND behaviour.
 */
object GeofenceDiagnostics {

    const val MAX_RECORDS = 100

    enum class Kind { EVENT, ERROR, REGISTRATION }

    data class Record(
        val kind: Kind,
        /** When the app received the event / recorded the registration state. */
        val at: Long,
        val transition: String? = null,
        val zoneIds: List<String> = emptyList(),
        /** Triggering fix: its own time, its age when it reached the app, accuracy and provider. */
        val fixTime: Long? = null,
        val fixAgeMs: Long? = null,
        val accuracyM: Int? = null,
        val provider: String? = null,
        /** Distance from the fix to the nearest triggering zone centre, rounded to 10 m. */
        val distanceM: Int? = null,
        val radiusM: Int? = null,
        /** Engine evaluation right after the event (ms since [at]) and its result. */
        val evalMs: Long? = null,
        val silentActive: Boolean? = null,
        val dndApplied: Boolean? = null,
        val blockedReason: String? = null,
        /** Registration state / errors. */
        val status: String? = null,
        val errorCode: Int? = null,
        /** "fine,coarse,background,locationOn" as 1/0 flags. */
        val permissions: String? = null,
    )

    /** Rounded so the record can't be used to recover a position. */
    fun roundedDistance(meters: Double?): Int? =
        meters?.takeIf { it.isFinite() && it >= 0 }?.let { (it / 10.0).roundToInt() * 10 }

    /** Age of the triggering fix when it reached the app (elapsed-realtime clocks), or null. */
    fun fixAgeMs(nowElapsedNanos: Long, fixElapsedNanos: Long): Long? =
        if (fixElapsedNanos <= 0L || nowElapsedNanos < fixElapsedNanos) null else (nowElapsedNanos - fixElapsedNanos) / 1_000_000L

    fun permissionFlags(fine: Boolean, coarse: Boolean, background: Boolean, locationOn: Boolean): String =
        listOf(fine, coarse, background, locationOn).joinToString("") { if (it) "1" else "0" }

    /** Newest [max] records (oldest dropped). */
    fun append(records: List<Record>, record: Record, max: Int = MAX_RECORDS): List<Record> = (records + record).takeLast(max)

    // ---- storage format (FieldCodec)

    private fun s(v: Any?) = v?.toString().orEmpty()

    fun encode(records: List<Record>): String = FieldCodec.encode(
        records.map { r ->
            listOf(
                r.kind.name, s(r.at), s(r.transition), r.zoneIds.joinToString(","),
                s(r.fixTime), s(r.fixAgeMs), s(r.accuracyM), s(r.provider), s(r.distanceM), s(r.radiusM),
                s(r.evalMs), s(r.silentActive), s(r.dndApplied), s(r.blockedReason),
                s(r.status), s(r.errorCode), s(r.permissions),
            )
        },
    )

    fun decode(raw: String?): List<Record> = FieldCodec.decode(raw).mapNotNull { f ->
        if (f.size < 17) return@mapNotNull null
        val kind = runCatching { Kind.valueOf(f[0]) }.getOrNull() ?: return@mapNotNull null
        val at = f[1].toLongOrNull() ?: return@mapNotNull null
        fun str(i: Int) = f[i].ifEmpty { null }
        fun bool(i: Int) = when (f[i]) { "true" -> true; "false" -> false; else -> null }
        Record(
            kind = kind,
            at = at,
            transition = str(2),
            zoneIds = f[3].split(',').filter { it.isNotEmpty() },
            fixTime = f[4].toLongOrNull(),
            fixAgeMs = f[5].toLongOrNull(),
            accuracyM = f[6].toIntOrNull(),
            provider = str(7),
            distanceM = f[8].toIntOrNull(),
            radiusM = f[9].toIntOrNull(),
            evalMs = f[10].toLongOrNull(),
            silentActive = bool(11),
            dndApplied = bool(12),
            blockedReason = str(13),
            status = str(14),
            errorCode = f[15].toIntOrNull(),
            permissions = str(16),
        )
    }
}

/** App-private storage ("silent_focus_diagnostics"); never synced. */
class GeofenceDiagnosticsStore(private val kv: KeyValue) {

    constructor(context: Context) : this(
        PrefsKeyValue(context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)),
    )

    fun all(): List<GeofenceDiagnostics.Record> = GeofenceDiagnostics.decode(kv.getString(KEY))

    fun record(r: GeofenceDiagnostics.Record) = synchronized(LOCK) {
        kv.putString(KEY, GeofenceDiagnostics.encode(GeofenceDiagnostics.append(all(), r)))
    }

    /** Last registration status recorded (to log only changes). */
    fun lastRegistrationStatus(): String? =
        all().lastOrNull { it.kind == GeofenceDiagnostics.Kind.REGISTRATION }?.status

    fun clear() = synchronized(LOCK) { kv.remove(listOf(KEY)) }

    companion object {
        private const val PREFS = "silent_focus_diagnostics"
        private const val KEY = "geofence"
        private val LOCK = Any()
    }
}
