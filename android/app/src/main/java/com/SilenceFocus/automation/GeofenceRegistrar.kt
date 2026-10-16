package com.SilenceFocus.automation

import android.Manifest
import android.annotation.SuppressLint
import android.app.PendingIntent
import android.app.job.JobInfo
import android.app.job.JobScheduler
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.location.LocationManager
import android.os.Build
import android.provider.Settings
import android.util.Log
import androidx.core.location.LocationManagerCompat
import com.google.android.gms.common.api.ApiException
import com.google.android.gms.location.Geofence
import com.google.android.gms.location.GeofenceStatusCodes
import com.google.android.gms.location.GeofencingRequest
import com.google.android.gms.location.LocationServices

/**
 * Keeps Play Services geofences in line with the persisted Silent Zones.
 * It never changes DND: geofence callbacks update presence and ask the
 * engine to evaluate.
 *
 * - One geofence per enabled zone, request id "zone:<backend id>", so a
 *   re-registration replaces instead of duplicating.
 * - Location Mode adds one ENTER/EXIT geofence per nearby public place
 *   ("place:<places id>") and one EXIT-only "area" geofence around the last
 *   search centre that triggers the next search (PublicPlaces). Silent Zones
 *   always get their geofences first.
 * - Android allows 100 geofences per app; beyond that the lowest zone ids
 *   are registered (deterministic) and the state reports the overflow.
 * - Initial triggers ENTER|EXIT make Play Services report the current
 *   inside/outside state right after registration, which reconciles
 *   presence after boots/edits without clearing it (no silence flicker).
 * - Background location is required on Android 10+ for callbacks while the
 *   app isn't in use; without it nothing is registered and the state says so.
 * - Play Services drops every geofence when device Location is switched off
 *   or its own data is cleared. While geofences are wanted, a location-setting
 *   content job and a periodic job (GeofenceRecoveryJobService) re-register
 *   them from the native cache, so no screen has to be opened.
 */
object GeofenceRegistrar {

    private const val TAG = "SilentFocusGeofence"
    const val MAX_GEOFENCES = 100
    const val REQUEST_PREFIX = "zone:"

    /** Overlapping sync() calls (e.g. setZones + syncCalendar on Home load). */
    private val gate = GeofenceRegistrationGate()

    /** Geofences below ~100 m are unreliable; smaller zones are widened. */
    const val MIN_RADIUS_METERS = 100f

    const val STATUS_DISABLED = "DISABLED"
    const val STATUS_NO_ZONES = "NO_ZONES"
    const val STATUS_NO_LOCATION_PERMISSION = "LOCATION_PERMISSION_MISSING"
    const val STATUS_APPROXIMATE_ONLY = "PRECISE_LOCATION_MISSING"
    const val STATUS_NO_BACKGROUND = "BACKGROUND_LOCATION_MISSING"
    const val STATUS_PENDING = "REGISTERING"
    const val STATUS_REGISTERED = "REGISTERED"
    const val STATUS_LOCATION_OFF = "LOCATION_OFF"
    const val STATUS_FAILED = "FAILED"

    private fun granted(ctx: Context, permission: String) =
        ctx.checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED

    fun hasFine(ctx: Context) = granted(ctx, Manifest.permission.ACCESS_FINE_LOCATION)
    fun hasCoarse(ctx: Context) = granted(ctx, Manifest.permission.ACCESS_COARSE_LOCATION)
    fun hasBackground(ctx: Context) =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.Q ||
            granted(ctx, Manifest.permission.ACCESS_BACKGROUND_LOCATION)

    /** Zones that get a geofence, in registration order. */
    fun selectZones(zones: List<ZoneRule>): List<ZoneRule> =
        zones.filter { it.enabled && it.isValid }
            .sortedWith(compareBy<ZoneRule>({ it.id.toLongOrNull() ?: Long.MAX_VALUE }, { it.id }))

    /**
     * [force] re-registers even if nothing changed (after boot / app update /
     * app launch, when Play Services may have dropped our geofences).
     */
    @SuppressLint("MissingPermission")
    fun sync(context: Context, force: Boolean) {
        val ctx = context.applicationContext
        val store = EngineStore(ctx)
        val client = LocationServices.getGeofencingClient(ctx)
        val pi = pendingIntent(ctx)

        val settings = store.settings
        val blocked = when {
            !settings.locationEnabled && !settings.publicPlacesEnabled -> STATUS_DISABLED
            !hasFine(ctx) -> if (hasCoarse(ctx)) STATUS_APPROXIMATE_ONLY else STATUS_NO_LOCATION_PERMISSION
            !hasBackground(ctx) -> STATUS_NO_BACKGROUND
            else -> null
        }
        val selected = if (settings.locationEnabled) selectZones(store.zones).take(MAX_GEOFENCES) else emptyList()
        val search = store.placeSearch.takeIf { settings.publicPlacesEnabled }
        val places = if (search != null) PublicPlaces.placesForFences(store.publicPlaces, selected.size) else emptyList()
        val area = search?.takeIf { selected.size < MAX_GEOFENCES }
        if (blocked == null && settings.publicPlacesEnabled && search == null) PublicPlaces.scheduleRefresh(ctx)

        if (blocked != null || (selected.isEmpty() && area == null)) {
            // Without working geofences we can't know where the device is;
            // never keep a zone "active" from a stale callback.
            gate.beginRemoval()
            client.removeGeofences(pi)
            cancelRecoveryJobs(ctx)
            store.zonePresence = emptyMap()
            store.placePresence = emptyMap()
            store.geofenceRegisteredCount = 0
            store.geofenceSignature = null
            store.geofenceStatus = blocked ?: STATUS_NO_ZONES
            diagnoseRegistration(ctx, store.geofenceStatus, null, 0)
            return
        }

        // Presence only for zones still registered.
        val ids = selected.map { it.id }.toSet()
        store.zonePresence.let { p -> if (!ids.containsAll(p.keys)) store.zonePresence = p.filterKeys { it in ids } }
        val placeIds = places.map { it.id }.toSet()
        store.placePresence.let { p -> if (!placeIds.containsAll(p.keys)) store.placePresence = p.filterKeys { it in placeIds } }

        scheduleRecoveryJobs(ctx)

        val signature = selected.joinToString("|") { "${it.id}@${it.latitude},${it.longitude},${it.radiusMeters}" } +
            places.joinToString("|", prefix = "#") { it.id } +
            (area?.let { "#area@${it.latitude},${it.longitude}" } ?: "")
        if (!force && signature == store.geofenceSignature && store.geofenceStatus == STATUS_REGISTERED) return
        // The same registration already running covers this call too.
        val ticket = gate.beginRegister(signature) ?: return

        val placeFences = places.map { place ->
            Geofence.Builder()
                .setRequestId(PublicPlaces.REQUEST_PREFIX + place.id)
                .setCircularRegion(place.latitude, place.longitude, PublicPlaces.PLACE_RADIUS_M)
                .setExpirationDuration(Geofence.NEVER_EXPIRE)
                .setTransitionTypes(Geofence.GEOFENCE_TRANSITION_ENTER or Geofence.GEOFENCE_TRANSITION_EXIT)
                .build()
        } + listOfNotNull(area?.let {
            Geofence.Builder()
                .setRequestId(PublicPlaces.AREA_REQUEST_ID)
                .setCircularRegion(it.latitude, it.longitude, PublicPlaces.AREA_RADIUS_M)
                .setExpirationDuration(Geofence.NEVER_EXPIRE)
                .setTransitionTypes(Geofence.GEOFENCE_TRANSITION_EXIT)
                .build()
        })
        val request = GeofencingRequest.Builder()
            .setInitialTrigger(GeofencingRequest.INITIAL_TRIGGER_ENTER or GeofencingRequest.INITIAL_TRIGGER_EXIT)
            .addGeofences(placeFences)
            .addGeofences(selected.map { zone ->
                Geofence.Builder()
                    .setRequestId(REQUEST_PREFIX + zone.id)
                    .setCircularRegion(
                        zone.latitude,
                        zone.longitude,
                        maxOf(zone.radiusMeters.toFloat(), MIN_RADIUS_METERS),
                    )
                    .setExpirationDuration(Geofence.NEVER_EXPIRE)
                    .setTransitionTypes(Geofence.GEOFENCE_TRANSITION_ENTER or Geofence.GEOFENCE_TRANSITION_EXIT)
                    .build()
            })
            .build()

        store.geofenceStatus = STATUS_PENDING
        try {
            client.removeGeofences(pi).continueWithTask { client.addGeofences(request, pi) }
                .addOnSuccessListener {
                    val outcome = gate.finish(ticket, succeeded = true)
                    if (handledAsStale(ctx, outcome)) return@addOnSuccessListener
                    store.geofenceStatus = STATUS_REGISTERED
                    store.geofenceRegisteredCount = selected.size
                    store.geofenceSignature = signature
                    Log.i(TAG, "registered ${selected.size} zone and ${placeFences.size} place/area geofence(s)")
                    diagnoseRegistration(ctx, STATUS_REGISTERED, null, selected.size)
                    AutomationEngine.evaluate(ctx, TriggerReason.ZONES_CHANGED)
                    if (outcome == GeofenceRegistrationGate.Outcome.APPLY_THEN_RESYNC) sync(ctx, force = true)
                }
                .addOnFailureListener { e ->
                    val outcome = gate.finish(ticket, succeeded = false)
                    if (handledAsStale(ctx, outcome)) return@addOnFailureListener
                    val code = (e as? ApiException)?.statusCode
                    store.geofenceStatus =
                        if (code == GeofenceStatusCodes.GEOFENCE_NOT_AVAILABLE) STATUS_LOCATION_OFF else STATUS_FAILED
                    store.geofenceRegisteredCount = 0
                    store.geofenceSignature = null
                    store.zonePresence = emptyMap()
                    store.placePresence = emptyMap()
                    Log.w(TAG, "geofence registration failed: code=$code")
                    diagnoseRegistration(ctx, store.geofenceStatus, code, 0, always = true)
                    AutomationEngine.evaluate(ctx, TriggerReason.ZONES_CHANGED)
                    if (outcome == GeofenceRegistrationGate.Outcome.APPLY_THEN_RESYNC) sync(ctx, force = true)
                }
        } catch (e: SecurityException) {
            gate.finish(ticket, succeeded = false)
            store.geofenceStatus = STATUS_NO_LOCATION_PERMISSION
            store.zonePresence = emptyMap()
            store.placePresence = emptyMap()
            diagnoseRegistration(ctx, STATUS_NO_LOCATION_PERMISSION, null, 0, always = true)
        }
    }

    /**
     * Registration diagnostics (status, error code, zone count, permission
     * flags): only status changes and failures, so it stays bounded.
     * Never affects registration.
     */
    private fun diagnoseRegistration(ctx: Context, status: String?, errorCode: Int?, count: Int, always: Boolean = false) {
        runCatching {
            val diag = GeofenceDiagnosticsStore(ctx)
            if (!always && diag.lastRegistrationStatus() == status) return
            val r = GeofenceDiagnostics.Record(
                kind = GeofenceDiagnostics.Kind.REGISTRATION,
                at = System.currentTimeMillis(),
                status = status,
                errorCode = errorCode,
                permissions = GeofenceDiagnostics.permissionFlags(hasFine(ctx), hasCoarse(ctx), hasBackground(ctx), isLocationOn(ctx)),
            )
            diag.record(r)
            Log.i("SilentFocusDiag", "REGISTRATION status=$status count=$count err=$errorCode perms=${r.permissions}")
        }
    }

    /**
     * A callback from an older registration: never records its result. If it
     * may have re-added geofences after a newer removal and nothing newer is
     * running, re-sync now (forced remove + add of the current state).
     */
    private fun handledAsStale(ctx: Context, outcome: GeofenceRegistrationGate.Outcome): Boolean =
        when (outcome) {
            GeofenceRegistrationGate.Outcome.APPLY,
            GeofenceRegistrationGate.Outcome.APPLY_THEN_RESYNC -> false
            GeofenceRegistrationGate.Outcome.STALE_DEFERRED -> {
                Log.i(TAG, "stale geofence callback ignored")
                true
            }
            GeofenceRegistrationGate.Outcome.STALE_RESYNC_NOW -> {
                Log.i(TAG, "stale geofence registration; re-syncing")
                sync(ctx, force = true)
                true
            }
        }

    fun removeAll(context: Context) {
        gate.beginRemoval()
        LocationServices.getGeofencingClient(context.applicationContext)
            .removeGeofences(pendingIntent(context.applicationContext))
        cancelRecoveryJobs(context.applicationContext)
    }

    fun isLocationOn(ctx: Context): Boolean {
        val lm = ctx.getSystemService(LocationManager::class.java) ?: return false
        return LocationManagerCompat.isLocationEnabled(lm)
    }

    /**
     * Device Location was switched on or off. Off: Play Services has dropped
     * our geofences, so presence can't be trusted (same as its
     * GEOFENCE_NOT_AVAILABLE callback, which may arrive late or not at all).
     * On: re-register from the cache.
     */
    fun onLocationSettingChanged(context: Context) {
        val ctx = context.applicationContext
        if (isLocationOn(ctx)) {
            sync(ctx, force = true)
            return
        }
        val store = EngineStore(ctx)
        if (store.geofenceStatus != STATUS_REGISTERED && store.geofenceStatus != STATUS_PENDING) return
        store.geofenceStatus = STATUS_LOCATION_OFF
        store.geofenceRegisteredCount = 0
        store.geofenceSignature = null
        store.zonePresence = emptyMap()
        store.placePresence = emptyMap()
        Log.i(TAG, "location switched off; geofences paused")
        AutomationEngine.evaluate(ctx, TriggerReason.ZONE_EXIT)
    }

    /**
     * One-shot content job on the Location on/off setting (re-armed on every
     * run) and a periodic re-registration that also covers Play Services
     * resets Android doesn't announce. JobScheduler only, like CalendarSync.
     */
    @Suppress("DEPRECATION")
    fun scheduleRecoveryJobs(ctx: Context) {
        val js = ctx.getSystemService(JobScheduler::class.java) ?: return
        val service = ComponentName(ctx, GeofenceRecoveryJobService::class.java)
        runCatching {
            js.schedule(
                JobInfo.Builder(JOB_LOCATION_SETTING, service)
                    .addTriggerContentUri(
                        JobInfo.TriggerContentUri(Settings.Secure.getUriFor(Settings.Secure.LOCATION_MODE), 0),
                    )
                    .setTriggerContentUpdateDelay(2_000)
                    .setTriggerContentMaxDelay(30_000)
                    .build(),
            )
        }
        if (js.getPendingJob(JOB_PERIODIC) == null) {
            runCatching {
                js.schedule(
                    JobInfo.Builder(JOB_PERIODIC, service)
                        .setPeriodic(PERIODIC_MS)
                        .setPersisted(true)
                        .build(),
                )
            }
        }
    }

    /** Play Services data was cleared: re-register once it has restarted. */
    fun scheduleReRegister(ctx: Context) {
        val js = ctx.getSystemService(JobScheduler::class.java) ?: return
        runCatching {
            js.schedule(
                JobInfo.Builder(JOB_RE_REGISTER, ComponentName(ctx, GeofenceRecoveryJobService::class.java))
                    .setMinimumLatency(30_000)
                    .setOverrideDeadline(120_000)
                    .build(),
            )
        }
    }

    fun cancelRecoveryJobs(ctx: Context) {
        val js = ctx.getSystemService(JobScheduler::class.java) ?: return
        js.cancel(JOB_LOCATION_SETTING)
        js.cancel(JOB_PERIODIC)
        js.cancel(JOB_RE_REGISTER)
    }

    const val JOB_LOCATION_SETTING = 4301
    const val JOB_PERIODIC = 4302
    const val JOB_RE_REGISTER = 4303
    private const val PERIODIC_MS = 12L * 60 * 60 * 1000

    private fun pendingIntent(ctx: Context): PendingIntent {
        // Play Services adds the event extras, so the intent must be mutable
        // (required from Android 12).
        val flags = PendingIntent.FLAG_UPDATE_CURRENT or
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) PendingIntent.FLAG_MUTABLE else 0
        return PendingIntent.getBroadcast(ctx, REQUEST_CODE, Intent(ctx, GeofenceEventReceiver::class.java), flags)
    }

    private const val REQUEST_CODE = 4102
}
