package com.SilenceFocus.automation

import android.content.Context
import android.location.Location
import android.util.Log
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource

/**
 * Client Issue #5 – foreground arrival check. Play Services' geofencer can
 * report ENTER a minute or two late (indoor accuracy, batched background
 * fixes). When the user opens or returns to the app, one fresh
 * high-accuracy fix is taken (foreground location, no new permission, no
 * foreground service); if it is confidently inside a monitored zone the
 * geofence hasn't reported yet, the zone is entered right away through the
 * same path as a geofence ENTER. Exits stay Play Services' job. At most one
 * check per [MIN_INTERVAL_MS]. Recorded in GeofenceDiagnostics as
 * transition "ENTER_ARRIVAL_CHECK" (no coordinates).
 */
object ArrivalCheck {

    private const val TAG = "SilentFocusGeofence"
    const val MIN_INTERVAL_MS = 2 * 60_000L
    /** A fix worse than this can't place the phone inside a 100 m zone. */
    const val MAX_ACCURACY_M = 75.0
    const val MAX_FIX_AGE_MS = 2 * 60_000L

    data class Fix(val latitude: Double, val longitude: Double, val accuracyM: Double, val ageMs: Long)

    /**
     * Zones the fix is confidently inside: the whole "likely position" circle
     * (distance + accuracy / 2) within the monitored radius (at least the
     * registered minimum), using enabled zones not already marked present.
     */
    fun enteredZones(
        zones: List<ZoneRule>,
        presence: Set<String>,
        fix: Fix,
        distance: (ZoneRule) -> Double,
    ): List<String> {
        if (!(fix.accuracyM > 0 && fix.accuracyM <= MAX_ACCURACY_M) || fix.ageMs > MAX_FIX_AGE_MS || fix.ageMs < 0) return emptyList()
        return zones.filter { z ->
            z.enabled && z.isValid && z.id !in presence &&
                distance(z) + fix.accuracyM / 2 <= maxOf(z.radiusMeters, GeofenceRegistrar.MIN_RADIUS_METERS.toDouble())
        }.map { it.id }
    }

    /** Whether a check may run now. */
    fun due(lastAt: Long, now: Long): Boolean = lastAt <= 0L || now - lastAt >= MIN_INTERVAL_MS || now < lastAt

    @Volatile private var lastAt = 0L

    /** Starts one check if useful; returns immediately. */
    fun run(context: Context, now: Long = System.currentTimeMillis()) {
        val ctx = context.applicationContext
        val store = EngineStore(ctx)
        if (!store.settings.locationEnabled || store.zones.none { it.enabled }) return
        if (!GeofenceRegistrar.hasFine(ctx) || !GeofenceRegistrar.isLocationOn(ctx)) return
        synchronized(this) {
            if (!due(lastAt, now)) return
            lastAt = now
        }
        try {
            LocationServices.getFusedLocationProviderClient(ctx)
                .getCurrentLocation(Priority.PRIORITY_HIGH_ACCURACY, CancellationTokenSource().token)
                .addOnSuccessListener { loc -> loc?.let { apply(ctx, it) } }
        } catch (e: SecurityException) {
            Log.i(TAG, "arrival check: no location permission")
        }
    }

    private fun apply(ctx: Context, loc: Location) = runCatching {
        val receivedAt = System.currentTimeMillis()
        val store = EngineStore(ctx)
        val fix = Fix(loc.latitude, loc.longitude, if (loc.hasAccuracy()) loc.accuracy.toDouble() else -1.0, receivedAt - loc.time)
        val distances = HashMap<String, Double>()
        val entered = enteredZones(store.zones, store.zonePresence.keys, fix) { z ->
            val d = FloatArray(1)
            Location.distanceBetween(loc.latitude, loc.longitude, z.latitude, z.longitude, d)
            d[0].toDouble().also { distances[z.id] = it }
        }
        if (entered.isEmpty()) return@runCatching
        store.zonePresence = store.zonePresence + entered.associateWith { receivedAt }
        Log.i(TAG, "arrival check: entered ${entered.size} zone(s)")
        val state = AutomationEngine.evaluate(ctx, TriggerReason.ZONE_ENTER)
        val nearest = entered.minByOrNull { distances[it] ?: Double.MAX_VALUE }
        GeofenceDiagnosticsStore(ctx).record(
            GeofenceDiagnostics.Record(
                kind = GeofenceDiagnostics.Kind.EVENT,
                at = receivedAt,
                transition = "ENTER_ARRIVAL_CHECK",
                zoneIds = entered,
                fixTime = loc.time,
                fixAgeMs = fix.ageMs,
                accuracyM = fix.accuracyM.toInt(),
                provider = loc.provider,
                distanceM = GeofenceDiagnostics.roundedDistance(nearest?.let { distances[it] }),
                radiusM = store.zones.firstOrNull { it.id == nearest }?.radiusMeters?.toInt(),
                evalMs = System.currentTimeMillis() - receivedAt,
                silentActive = state.optBoolean("silentActive"),
                dndApplied = state.optBoolean("applied"),
            ),
        )
    }.onFailure { Log.w(TAG, "arrival check failed: ${it.javaClass.simpleName}") }
}
