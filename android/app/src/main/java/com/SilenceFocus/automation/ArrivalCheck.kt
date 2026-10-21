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

    fun exitsReported(geofenceStatus: String): Boolean =
        geofenceStatus == GeofenceRegistrar.STATUS_REGISTERED || geofenceStatus == GeofenceRegistrar.STATUS_PENDING

    /**
     * Zones the user just made eligible (newly added or enabled, or moved /
     * resized while enabled): a reason to check right away.
     */
    fun newlyEligible(before: List<ZoneRule>, after: List<ZoneRule>): List<String> {
        val old = before.filter { it.enabled && it.isValid }.associateBy { it.id }
        return after.filter { it.enabled && it.isValid && old[it.id] != it }.map { it.id }
    }

    /** Whether a check may run now. */
    fun due(lastAt: Long, now: Long): Boolean = lastAt <= 0L || now - lastAt >= MIN_INTERVAL_MS || now < lastAt

    @Volatile private var lastAt = 0L

    /**
     * Starts one check if useful; returns immediately. [force] skips the
     * throttle: the user just switched zones on (Custom Mode, a zone enabled
     * or moved) - Client Issue #6. Play Services only reports the initial
     * ENTER of new geofences once something requests a fresh fix (opening the
     * zone map did, via its my-location layer), so without this the phone
     * stayed loud until the zone editor was opened.
     */
    fun run(context: Context, now: Long = System.currentTimeMillis(), force: Boolean = false) {
        val ctx = context.applicationContext
        val store = EngineStore(ctx)
        if (!store.settings.locationEnabled || store.zones.none { it.enabled }) return
        if (!GeofenceRegistrar.hasFine(ctx) || !GeofenceRegistrar.isLocationOn(ctx)) return
        synchronized(this) {
            if (!force && !due(lastAt, now)) return
            lastAt = now
        }
        try {
            val client = LocationServices.getFusedLocationProviderClient(ctx)
            client.getCurrentLocation(Priority.PRIORITY_HIGH_ACCURACY, CancellationTokenSource().token)
                .addOnSuccessListener { loc ->
                    if (loc != null) {
                        apply(ctx, loc)
                    } else {
                        // Some emulator/Play Services combinations return a
                        // null one-shot fix immediately after a simulated GPS
                        // update even though lastLocation is usable. A zone
                        // toggle is an explicit user action, so use that
                        // recent fused fix rather than waiting for the map or
                        // a delayed geofence ENTER.
                        client.lastLocation.addOnSuccessListener { last ->
                            last?.let { apply(ctx, it) }
                        }
                    }
                }
        } catch (e: SecurityException) {
            Log.i(TAG, "arrival check: no location permission")
        }
    }

    private fun apply(ctx: Context, loc: Location) = runCatching {
        val receivedAt = System.currentTimeMillis()
        val store = EngineStore(ctx)
        // Only while geofences are (being) registered: their EXIT is what
        // ends a zone visit, so never enter a zone nothing will ever leave.
        if (!exitsReported(store.geofenceStatus)) return@runCatching
        val fix = Fix(loc.latitude, loc.longitude, if (loc.hasAccuracy()) loc.accuracy.toDouble() else -1.0, receivedAt - loc.time)
        val distances = HashMap<String, Double>()
        val entered = enteredZones(store.zones, store.zonePresence.keys, fix) { z ->
            val d = FloatArray(1)
            Location.distanceBetween(loc.latitude, loc.longitude, z.latitude, z.longitude, d)
            d[0].toDouble().also { distances[z.id] = it }
        }
        val exited = store.zones.filter { zone ->
            zone.enabled && zone.isValid && zone.id in store.zonePresence &&
                zone.id !in entered &&
                (distances[zone.id] ?: run {
                    val d = FloatArray(1)
                    Location.distanceBetween(loc.latitude, loc.longitude, zone.latitude, zone.longitude, d)
                    d[0].toDouble().also { distances[zone.id] = it }
                }) - fix.accuracyM / 2 > maxOf(
                    zone.radiusMeters,
                    GeofenceRegistrar.MIN_RADIUS_METERS.toDouble(),
                )
        }.map { it.id }
        if (entered.isEmpty() && exited.isEmpty()) return@runCatching
        store.zonePresence = (store.zonePresence - exited) + entered.associateWith { receivedAt }
        val transition = if (entered.isNotEmpty()) "ENTER_ARRIVAL_CHECK" else "EXIT_ARRIVAL_CHECK"
        val reason = if (entered.isNotEmpty()) TriggerReason.ZONE_ENTER else TriggerReason.ZONE_EXIT
        Log.i(TAG, "arrival check: entered=${entered.size} exited=${exited.size} zone(s)")
        val state = AutomationEngine.evaluate(ctx, reason)
        val affected = if (entered.isNotEmpty()) entered else exited
        val nearest = affected.minByOrNull { distances[it] ?: Double.MAX_VALUE }
        GeofenceDiagnosticsStore(ctx).record(
            GeofenceDiagnostics.Record(
                kind = GeofenceDiagnostics.Kind.EVENT,
                at = receivedAt,
                transition = transition,
                zoneIds = affected,
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
