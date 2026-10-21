package com.SilenceFocus.automation

import android.annotation.SuppressLint
import android.app.job.JobInfo
import android.app.job.JobScheduler
import android.content.ComponentName
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.os.Build
import android.util.Log
import com.SilenceFocus.BuildConfig
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import com.google.android.gms.tasks.Tasks
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.Calendar
import java.util.TimeZone
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Location Mode: silence at libraries and places of worship.
 *
 * One Places API (New) Nearby Search finds the nearest such places around
 * the device; GeofenceRegistrar then watches them (ENTER/EXIT; a place only
 * silences after [DWELL_MS] inside, so walking or driving past never does -
 * see PublicPlaceRuleProvider) together with one "area" geofence around the
 * search centre. Leaving that area (EXIT) schedules the next search, so the
 * API is only called when the device reaches a new neighbourhood - never on
 * a timer while it stays put (except after [MAX_AGE_MS], the longest Google
 * allows coordinates to be cached). At most [MAX_SEARCHES_PER_DAY] per day.
 *
 * Searches run in a JobScheduler job with a network constraint; nothing here
 * touches DND - presence comes from geofence callbacks and the engine decides.
 * Only the place id, name and centre are kept; the device position is never
 * stored except as the search centre (needed for the area geofence).
 */
object PublicPlaces {

    private const val TAG = "SilentFocusPlaces"

    const val STATUS_OFF = "OFF"
    const val STATUS_SEARCHING = "SEARCHING"
    const val STATUS_READY = "READY"
    const val STATUS_NO_LOCATION = "LOCATION_UNAVAILABLE"
    const val STATUS_NO_KEY = "NO_API_KEY"
    const val STATUS_KEY_REJECTED = "API_KEY_REJECTED"
    const val STATUS_DAILY_LIMIT = "DAILY_LIMIT"
    const val STATUS_FAILED = "SEARCH_FAILED"

    /** Places API (New) Table A types: libraries and places of worship. */
    val INCLUDED_TYPES = listOf(
        "library", "church", "mosque", "hindu_temple", "synagogue", "buddhist_temple", "shinto_shrine",
    )

    const val SEARCH_RADIUS_M = 1500.0
    /** Search again once the device is this far from the last search centre. */
    const val AREA_RADIUS_M = 1000f
    const val MAX_RESULTS = 20
    const val MAX_SEARCHES_PER_DAY = 20
    const val MAX_AGE_MS = 30L * 24 * 60 * 60 * 1000
    /** Geofence radius around a place centre (the geofencer's reliable minimum). */
    const val PLACE_RADIUS_M = 100f
    /** Stay this long before a place silences the phone. */
    const val DWELL_MS = 3 * 60_000L

    const val REQUEST_PREFIX = "place:"
    const val AREA_REQUEST_ID = "area:places"

    private const val ENDPOINT = "https://places.googleapis.com/v1/places:searchNearby"
    private const val FIELD_MASK = "places.id,places.displayName,places.location"
    const val JOB_REFRESH = 4401
    /** Least time between two Places requests; longer after the key/API was refused. */
    const val MIN_ATTEMPT_GAP_MS = 2 * 60_000L
    const val REJECTED_GAP_MS = 6 * 60 * 60_000L

    /** One search at a time in this process (jobs, re-schedules). */
    private val running = AtomicBoolean(false)

    data class SearchArea(val latitude: Double, val longitude: Double, val at: Long)

    // ---- Pure decisions (unit-tested)

    /** Whether the device at ([lat], [lng]) needs a new search. */
    fun shouldSearch(last: SearchArea?, now: Long, distanceToLast: (SearchArea) -> Double): Boolean =
        last == null || now - last.at >= MAX_AGE_MS || now < last.at ||
            distanceToLast(last) > AREA_RADIUS_M * 0.8

    fun dayKey(now: Long, tz: TimeZone): String {
        val c = Calendar.getInstance(tz).apply { timeInMillis = now }
        return "${c.get(Calendar.YEAR)}-${c.get(Calendar.DAY_OF_YEAR)}"
    }

    /** Searches already made on [day] according to the stored quota. */
    fun usedToday(quota: String?, day: String): Int {
        val parts = quota?.split(':') ?: return 0
        if (parts.size != 2 || parts[0] != day) return 0
        return parts[1].toIntOrNull() ?: 0
    }

    fun quotaAfterSearch(quota: String?, day: String): String = "$day:${usedToday(quota, day) + 1}"

    /** Whether a request may be sent now, given the last attempt and its outcome. */
    fun attemptAllowed(lastAttempt: Long, status: String, now: Long): Boolean {
        if (lastAttempt <= 0L || now < lastAttempt) return true
        val gap = if (status == STATUS_KEY_REJECTED || status == STATUS_NO_KEY) REJECTED_GAP_MS else MIN_ATTEMPT_GAP_MS
        return now - lastAttempt >= gap
    }

    /** The places that get a geofence next to [zoneFences] Silent Zones (one slot is the area fence). */
    fun placesForFences(places: List<PublicPlace>, zoneFences: Int): List<PublicPlace> {
        val slots = GeofenceRegistrar.MAX_GEOFENCES - zoneFences - 1
        return if (slots <= 0) emptyList() else places.filter { it.isValid }.distinctBy { it.id }.take(slots)
    }

    fun requestBody(lat: Double, lng: Double): String = JSONObject().apply {
        put("includedTypes", JSONArray(INCLUDED_TYPES))
        put("maxResultCount", MAX_RESULTS)
        put("rankPreference", "DISTANCE")
        put("locationRestriction", JSONObject().put(
            "circle",
            JSONObject()
                .put("center", JSONObject().put("latitude", lat).put("longitude", lng))
                .put("radius", SEARCH_RADIUS_M),
        ))
    }.toString()

    /** Places from a searchNearby response (an empty object means none nearby). */
    fun parseResponse(body: String): List<PublicPlace> {
        val arr = JSONObject(body).optJSONArray("places") ?: return emptyList()
        return (0 until arr.length()).mapNotNull { i ->
            val o = arr.optJSONObject(i) ?: return@mapNotNull null
            val loc = o.optJSONObject("location") ?: return@mapNotNull null
            PublicPlace(
                id = o.optString("id"),
                name = o.optJSONObject("displayName")?.optString("text")?.takeIf { it.isNotBlank() },
                latitude = loc.optDouble("latitude", Double.NaN),
                longitude = loc.optDouble("longitude", Double.NaN),
            ).takeIf { it.isValid }
        }.distinctBy { it.id }
    }

    /** Status for a non-200 answer: key problems are not retried. */
    fun statusForHttpError(code: Int, body: String?): String {
        val reason = runCatching { JSONObject(body ?: "").optJSONObject("error")?.optString("status") }.getOrNull()
        return when {
            code == 400 && body?.contains("API_KEY_INVALID") == true -> STATUS_KEY_REJECTED
            code == 403 || reason == "PERMISSION_DENIED" -> STATUS_KEY_REJECTED
            else -> STATUS_FAILED
        }
    }

    // ---- Android side

    /** Location Mode was switched on, or the app/boot wants places checked. */
    fun onEnabled(context: Context) {
        disablePermanently(context)
    }

    /** Location Mode was switched off: remove all obsolete automatic-place state. */
    fun onDisabled(context: Context) {
        disablePermanently(context)
    }

    /** Upgrade-safe cleanup. Never deletes Activity Center or Session History. */
    fun disablePermanently(context: Context) {
        EngineStore(context).clearPublicPlacesState()
        cancel(context)
        // Reconcile Play Services too: this removes obsolete place/area
        // geofences while re-registering any legitimate Custom Silent Zones.
        GeofenceRegistrar.sync(context, force = false)
    }

    fun scheduleRefresh(context: Context) {
        // Permanent fail-closed policy: callers from an older registration
        // can only clean up, never schedule a Places request.
        disablePermanently(context)
    }

    fun cancel(context: Context) {
        context.applicationContext.getSystemService(JobScheduler::class.java)?.cancel(JOB_REFRESH)
    }

    /**
     * Runs on the job's worker thread. Returns true to have the job retried
     * later (network / server trouble), false when done.
     */
    fun refresh(context: Context): Boolean {
        disablePermanently(context)
        return false
    }

    @SuppressLint("MissingPermission")
    private fun search(context: Context): Boolean {
        val ctx = context.applicationContext
        val store = EngineStore(ctx)
        if (!store.settings.publicPlacesActive) return false
        if (!GeofenceRegistrar.hasFine(ctx) || !GeofenceRegistrar.hasBackground(ctx) || !GeofenceRegistrar.isLocationOn(ctx)) {
            store.placeStatus = STATUS_NO_LOCATION
            return false
        }
        val loc = currentLocation(ctx) ?: run {
            store.placeStatus = STATUS_NO_LOCATION
            return false
        }
        val now = System.currentTimeMillis()
        val needed = shouldSearch(store.placeSearch, now) { last ->
            val d = FloatArray(1)
            Location.distanceBetween(loc.latitude, loc.longitude, last.latitude, last.longitude, d)
            d[0].toDouble()
        }
        if (!needed) {
            if (store.placeStatus != STATUS_READY) store.placeStatus = STATUS_READY
            GeofenceRegistrar.sync(ctx, force = false)
            return false
        }
        val key = BuildConfig.MAPS_API_KEY
        if (key.isBlank()) {
            store.placeStatus = STATUS_NO_KEY
            return false
        }
        if (!attemptAllowed(store.placeLastAttempt, store.placeStatus, now)) return false
        val day = dayKey(now, TimeZone.getDefault())
        if (usedToday(store.placeSearchQuota, day) >= MAX_SEARCHES_PER_DAY) {
            store.placeStatus = STATUS_DAILY_LIMIT
            return false
        }
        store.placeSearchQuota = quotaAfterSearch(store.placeSearchQuota, day)
        store.placeLastAttempt = now
        store.placeStatus = STATUS_SEARCHING

        val result = try {
            post(ctx, key, requestBody(loc.latitude, loc.longitude))
        } catch (e: IOException) {
            Log.w(TAG, "search failed: ${e.javaClass.simpleName}")
            store.placeStatus = STATUS_FAILED
            return true
        }
        if (result.first != HttpURLConnection.HTTP_OK) {
            val status = statusForHttpError(result.first, result.second)
            Log.w(TAG, "search answered ${result.first} -> $status")
            store.placeStatus = status
            return status == STATUS_FAILED && result.first >= 500
        }
        val places = runCatching { parseResponse(result.second.orEmpty()) }.getOrElse {
            store.placeStatus = STATUS_FAILED
            return false
        }
        store.publicPlaces = places
        store.placeSearch = SearchArea(loc.latitude, loc.longitude, now)
        val ids = places.map { it.id }.toSet()
        store.placePresence.let { p -> if (!ids.containsAll(p.keys)) store.placePresence = p.filterKeys { it in ids } }
        store.placeStatus = STATUS_READY
        Log.i(TAG, "found ${places.size} public place(s) nearby")
        GeofenceRegistrar.sync(ctx, force = true)
        AutomationEngine.evaluate(ctx, TriggerReason.ZONES_CHANGED)
        return false
    }

    @SuppressLint("MissingPermission")
    private fun currentLocation(ctx: Context): Location? = runCatching {
        val client = LocationServices.getFusedLocationProviderClient(ctx)
        Tasks.await(
            client.getCurrentLocation(Priority.PRIORITY_BALANCED_POWER_ACCURACY, CancellationTokenSource().token),
            30,
            TimeUnit.SECONDS,
        ) ?: Tasks.await(client.lastLocation, 10, TimeUnit.SECONDS)
    }.getOrNull()

    /** (HTTP code, body). The Android headers let a key restricted to this app work too. */
    private fun post(ctx: Context, key: String, body: String): Pair<Int, String?> {
        val conn = (URL(ENDPOINT).openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = 15_000
            readTimeout = 15_000
            doOutput = true
            setRequestProperty("Content-Type", "application/json")
            setRequestProperty("X-Goog-Api-Key", key)
            setRequestProperty("X-Goog-FieldMask", FIELD_MASK)
            setRequestProperty("X-Android-Package", ctx.packageName)
            signingSha1(ctx)?.let { setRequestProperty("X-Android-Cert", it) }
        }
        try {
            conn.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
            val code = conn.responseCode
            val stream = if (code in 200..299) conn.inputStream else conn.errorStream
            return code to stream?.bufferedReader()?.use { it.readText() }
        } finally {
            conn.disconnect()
        }
    }

    @Suppress("DEPRECATION")
    private fun signingSha1(ctx: Context): String? = runCatching {
        val pm = ctx.packageManager
        val signature = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            pm.getPackageInfo(ctx.packageName, PackageManager.GET_SIGNING_CERTIFICATES)
                .signingInfo?.apkContentsSigners?.firstOrNull()
        } else {
            pm.getPackageInfo(ctx.packageName, PackageManager.GET_SIGNATURES).signatures?.firstOrNull()
        } ?: return null
        MessageDigest.getInstance("SHA-1").digest(signature.toByteArray())
            .joinToString("") { "%02X".format(it) }
    }.getOrNull()
}
