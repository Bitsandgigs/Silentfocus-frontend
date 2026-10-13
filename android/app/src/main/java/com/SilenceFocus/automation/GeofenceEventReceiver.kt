package com.SilenceFocus.automation

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.location.Location
import android.os.SystemClock
import android.util.Log
import com.google.android.gms.location.Geofence
import com.google.android.gms.location.GeofenceStatusCodes
import com.google.android.gms.location.GeofencingEvent

/**
 * Geofence transitions: record presence, then let the engine decide.
 * This receiver never touches DND directly. No coordinates are logged.
 * Timing diagnostics (GeofenceDiagnostics) are recorded around the
 * existing logic and never change it.
 */
class GeofenceEventReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        val receivedAt = System.currentTimeMillis()
        val event = GeofencingEvent.fromIntent(intent) ?: return
        val store = EngineStore(context)

        if (event.hasError()) {
            // e.g. location switched off: Play Services dropped our fences,
            // so presence can no longer be trusted.
            Log.w(TAG, "geofence error ${event.errorCode}")
            if (event.errorCode == GeofenceStatusCodes.GEOFENCE_NOT_AVAILABLE) {
                store.geofenceStatus = GeofenceRegistrar.STATUS_LOCATION_OFF
                store.geofenceSignature = null
            }
            store.zonePresence = emptyMap()
            val state = AutomationEngine.evaluate(context, TriggerReason.ZONE_EXIT)
            diagnose(context) {
                GeofenceDiagnostics.Record(
                    kind = GeofenceDiagnostics.Kind.ERROR, at = receivedAt, errorCode = event.errorCode,
                    evalMs = System.currentTimeMillis() - receivedAt,
                    silentActive = state.optBoolean("silentActive"), dndApplied = state.optBoolean("applied"),
                    blockedReason = state.optString("blockedReason").takeIf { !state.isNull("blockedReason") },
                    permissions = permissionFlags(context),
                )
            }
            return
        }

        val ids = event.triggeringGeofences.orEmpty()
            .map { it.requestId }
            .filter { it.startsWith(GeofenceRegistrar.REQUEST_PREFIX) }
            .map { it.removePrefix(GeofenceRegistrar.REQUEST_PREFIX) }
        if (ids.isEmpty()) return

        val now = System.currentTimeMillis()
        val presence = store.zonePresence.toMutableMap()
        val reason = when (event.geofenceTransition) {
            Geofence.GEOFENCE_TRANSITION_ENTER -> {
                // Keep the original entry time if we already knew we were
                // inside (initial triggers repeat ENTER on re-registration),
                // so a manual OFF for this visit stays in force.
                ids.forEach { id -> presence.putIfAbsent(id, now) }
                TriggerReason.ZONE_ENTER
            }
            Geofence.GEOFENCE_TRANSITION_EXIT -> {
                ids.forEach { presence.remove(it) }
                TriggerReason.ZONE_EXIT
            }
            else -> return
        }
        val known = store.zones.map { it.id }.toSet()
        store.zonePresence = presence.filterKeys { it in known }
        Log.i(TAG, "$reason for ${ids.size} zone(s)")
        val state = AutomationEngine.evaluate(context, reason)
        diagnose(context) {
            val fix = event.triggeringLocation
            val zones = store.zones.filter { it.id in ids }
            val nearest = fix?.let { f ->
                zones.map { z ->
                    val d = FloatArray(1)
                    Location.distanceBetween(f.latitude, f.longitude, z.latitude, z.longitude, d)
                    z to d[0].toDouble()
                }.minByOrNull { it.second }
            }
            GeofenceDiagnostics.Record(
                kind = GeofenceDiagnostics.Kind.EVENT,
                at = receivedAt,
                transition = if (reason == TriggerReason.ZONE_ENTER) "ENTER" else "EXIT",
                zoneIds = ids,
                fixTime = fix?.time?.takeIf { it > 0 },
                fixAgeMs = fix?.let { GeofenceDiagnostics.fixAgeMs(SystemClock.elapsedRealtimeNanos(), it.elapsedRealtimeNanos) },
                accuracyM = fix?.takeIf { it.hasAccuracy() }?.accuracy?.toInt(),
                provider = fix?.provider,
                distanceM = GeofenceDiagnostics.roundedDistance(nearest?.second),
                radiusM = nearest?.first?.radiusMeters?.toInt(),
                evalMs = System.currentTimeMillis() - receivedAt,
                silentActive = state.optBoolean("silentActive"),
                dndApplied = state.optBoolean("applied"),
                blockedReason = state.optString("blockedReason").takeIf { !state.isNull("blockedReason") },
                permissions = permissionFlags(context),
            )
        }
    }

    /** Records and logs one diagnostic; never fails the receiver. */
    private fun diagnose(context: Context, build: () -> GeofenceDiagnostics.Record) {
        runCatching {
            val r = build()
            GeofenceDiagnosticsStore(context).record(r)
            Log.i(
                DIAG_TAG,
                "${r.kind} ${r.transition ?: ""} zones=${r.zoneIds.size} fixAgeMs=${r.fixAgeMs} acc=${r.accuracyM} " +
                    "provider=${r.provider} distM=${r.distanceM}/${r.radiusM} evalMs=${r.evalMs} " +
                    "silent=${r.silentActive} applied=${r.dndApplied} err=${r.errorCode} perms=${r.permissions}",
            )
        }
    }

    private fun permissionFlags(context: Context): String = GeofenceDiagnostics.permissionFlags(
        GeofenceRegistrar.hasFine(context), GeofenceRegistrar.hasCoarse(context),
        GeofenceRegistrar.hasBackground(context), GeofenceRegistrar.isLocationOn(context),
    )

    companion object {
        private const val TAG = "SilentFocusGeofence"
        private const val DIAG_TAG = "SilentFocusDiag"
    }
}
