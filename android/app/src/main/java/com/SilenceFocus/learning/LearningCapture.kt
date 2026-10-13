package com.SilenceFocus.learning

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.util.Log
import com.SilenceFocus.automation.EngineStore
import com.google.android.gms.location.CurrentLocationRequest
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import java.util.TimeZone
import java.util.UUID

/**
 * Takes ONE location fix after the user manually turns Silent Focus on and
 * feeds it to the learner. Only AutomationEngine.setManual(on = true) calls
 * [onManualSilentOn], so schedules, calendar events, zones, boot and call
 * handling can never produce samples. No continuous tracking; it never
 * delays or blocks silencing, and failures are simply ignored.
 * Coordinates are never logged.
 */
object LearningCapture {

    private const val TAG = "SilentFocusLearning"
    private const val FIX_TIMEOUT_MS = 20_000L
    private const val MAX_FIX_AGE_MS = 60_000L

    /** Called after a manual ON; [onSuggestion] runs if a place became suggestible. */
    @SuppressLint("MissingPermission")
    fun onManualSilentOn(context: Context, onSuggestion: () -> Unit) {
        val ctx = context.applicationContext
        val store = LearningStore(ctx)
        if (!store.enabled) return
        // Precise location only, and only if the user already granted it.
        if (ctx.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) return
        try {
            val request = CurrentLocationRequest.Builder()
                .setPriority(Priority.PRIORITY_HIGH_ACCURACY)
                .setDurationMillis(FIX_TIMEOUT_MS)
                .setMaxUpdateAgeMillis(MAX_FIX_AGE_MS)
                .build()
            LocationServices.getFusedLocationProviderClient(ctx)
                .getCurrentLocation(request, CancellationTokenSource().token)
                .addOnSuccessListener { loc ->
                    if (loc == null) return@addOnSuccessListener
                    val fix = LocationFix(loc.latitude, loc.longitude, if (loc.hasAccuracy()) loc.accuracy else Float.NaN, System.currentTimeMillis())
                    if (record(ctx, fix)) onSuggestion()
                }
                .addOnFailureListener { Log.i(TAG, "no fix for learning: ${it.javaClass.simpleName}") }
        } catch (e: SecurityException) {
            // Permission revoked in the meantime: nothing to learn.
        }
    }

    /** Records a fix; returns true when a suggestion is now pending. */
    @Synchronized
    fun record(context: Context, fix: LocationFix, tz: TimeZone = TimeZone.getDefault()): Boolean {
        val store = LearningStore(context)
        val zones = EngineStore(context).zones
        val learner = SmartLocationLearner()
        val r = learner.record(store.places, fix, zones, store.enabled) { UUID.randomUUID().toString() }
        Log.i(TAG, "manual activation sample: ${r.result}")
        var places = r.places
        val place = places.firstOrNull { it.id == r.placeId }
        val suggest = place != null && store.pendingSuggestionId == null && learner.canSuggest(place, zones, fix.at, tz)
        if (suggest) {
            places = learner.markSuggested(places, place!!.id, fix.at)
            store.pendingSuggestionId = place.id
        }
        store.places = places
        return suggest
    }
}
