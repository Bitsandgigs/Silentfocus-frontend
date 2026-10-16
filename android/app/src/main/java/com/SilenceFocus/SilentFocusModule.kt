package com.SilenceFocus

import android.Manifest
import android.app.Activity
import android.app.NotificationManager
import android.app.role.RoleManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.ContactsContract
import android.provider.Settings
import android.service.notification.NotificationListenerService
import android.annotation.SuppressLint
import com.SilenceFocus.comms.AutoReplySettings
import com.SilenceFocus.comms.CallSettings
import com.SilenceFocus.comms.CommsStore
import com.SilenceFocus.comms.SimCallMode
import com.SilenceFocus.comms.EmergencyCallAlert
import com.SilenceFocus.comms.WhatsAppCallCheck
import com.SilenceFocus.comms.PhoneNumbers
import com.SilenceFocus.comms.NotificationPreviews
import com.SilenceFocus.comms.NotificationSource
import com.SilenceFocus.comms.PhoneApp
import com.SilenceFocus.comms.SilentFocusNotificationListener
import com.SilenceFocus.automation.AlarmScheduler
import com.SilenceFocus.automation.EngineStore
import com.SilenceFocus.automation.SessionStore
import com.SilenceFocus.learning.LearningConfig
import com.SilenceFocus.learning.LearningStore
import com.SilenceFocus.learning.SmartLocationLearner
import com.facebook.react.bridge.BaseActivityEventListener
import com.google.firebase.crashlytics.FirebaseCrashlytics
import com.SilenceFocus.automation.AutomationEngine
import com.SilenceFocus.automation.OutboxStore
import com.SilenceFocus.automation.ArrivalCheck
import com.SilenceFocus.automation.AutomationSettings
import com.SilenceFocus.automation.CalendarSync
import com.SilenceFocus.automation.GeofenceRegistrar
import com.SilenceFocus.automation.ScheduleRule
import com.SilenceFocus.automation.TriggerReason
import com.SilenceFocus.automation.ZoneRule
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.ReadableType
import com.facebook.react.bridge.WritableArray
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import org.json.JSONArray
import org.json.JSONObject

/**
 * JS bridge to the native AutomationEngine. JS never changes DND itself: it
 * asks the engine (manual toggle, schedule list, re-evaluate) and renders
 * the state the engine reports.
 */
class SilentFocusModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "SilentFocus"

    private var pendingPick: Promise? = null
    private var pendingRole: Promise? = null

    private val activityListener = object : BaseActivityEventListener() {
        override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
            when (requestCode) {
                REQUEST_PICK_CONTACT -> {
                    val promise = pendingPick ?: return
                    pendingPick = null
                    val uri = data?.data
                    if (resultCode != Activity.RESULT_OK || uri == null) {
                        promise.resolve(null)
                        return
                    }
                    try {
                        promise.resolve(storePickedContact(uri)?.let { toWritableMap(it) })
                    } catch (e: Exception) {
                        promise.reject("ERR_CONTACT", "Could not read the selected contact")
                    }
                }
                REQUEST_SCREENING_ROLE -> {
                    val promise = pendingRole ?: return
                    pendingRole = null
                    promise.resolve(isScreeningRoleHeld())
                }
            }
        }
    }

    override fun initialize() {
        super.initialize()
        AutomationEngine.listener = { state -> emit(state) }
        AutomationEngine.learningListener = {
            if (reactContext.hasActiveReactInstance()) {
                reactContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                    .emit(EVENT_LEARNING_SUGGESTION, null)
            }
        }
        reactContext.addActivityEventListener(activityListener)
        SilentFocusNotificationListener.onActiveNotificationsChanged = {
            if (reactContext.hasActiveReactInstance()) {
                reactContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                    .emit(EVENT_NOTIFICATIONS_CHANGED, null)
            }
        }
    }

    override fun invalidate() {
        AutomationEngine.listener = null
        AutomationEngine.learningListener = null
        SilentFocusNotificationListener.onActiveNotificationsChanged = null
        reactContext.removeActivityEventListener(activityListener)
        super.invalidate()
    }

    private fun emit(state: JSONObject) {
        if (!reactContext.hasActiveReactInstance()) return
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(EVENT_STATE_CHANGED, toWritableMap(state))
    }

    private fun nm(): NotificationManager =
        reactContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

    // ---- Engine

    @ReactMethod
    fun getState(promise: Promise) = run(promise) { AutomationEngine.state(reactContext) }

    @ReactMethod
    fun evaluate(reason: String?, promise: Promise) = run(promise) {
        val r = TriggerReason.parse(reason)
        // #5: app opened / resumed (foreground) - one fresh fix may enter a
        // zone the geofence hasn't reported yet (throttled, ENTER only).
        if (r == TriggerReason.APP_RESUMED) runCatching { ArrivalCheck.run(reactContext) }
        AutomationEngine.evaluate(reactContext, r)
    }

    @ReactMethod
    fun setManualSilent(on: Boolean, promise: Promise) = run(promise) {
        AutomationEngine.setManual(reactContext, on)
    }

    /** [schedules]: [{id, startMinute, endMinute, days: [1..7], enabled, name?}] */
    @ReactMethod
    fun setSchedules(schedules: ReadableArray, promise: Promise) = run(promise) {
        AutomationEngine.setSchedules(reactContext, parseSchedules(schedules))
    }

    /** [zones]: [{id, name?, latitude, longitude, radius, enabled}] */
    @ReactMethod
    fun setZones(zones: ReadableArray, promise: Promise) = run(promise) {
        AutomationEngine.setZones(reactContext, parseZones(zones))
    }

    /** {locationEnabled, calendarEnabled, calendarBeforeMinutes, calendarAfterMinutes, ignoreAllDayEvents} */
    @ReactMethod
    fun setAutomationSettings(settings: ReadableMap, promise: Promise) = run(promise) {
        fun bool(key: String, def: Boolean) =
            if (settings.hasKey(key) && !settings.isNull(key)) settings.getBoolean(key) else def
        fun int(key: String) =
            if (settings.hasKey(key) && !settings.isNull(key)) settings.getDouble(key).toInt().coerceIn(0, 240) else 0
        AutomationEngine.setSettings(
            reactContext,
            AutomationSettings(
                locationEnabled = bool("locationEnabled", false),
                calendarEnabled = bool("calendarEnabled", false),
                calendarBeforeMinutes = int("calendarBeforeMinutes"),
                calendarAfterMinutes = int("calendarAfterMinutes"),
                ignoreAllDayEvents = bool("ignoreAllDayEvents", true),
                publicPlacesEnabled = bool("publicPlacesEnabled", false),
            ),
        )
    }

    @ReactMethod
    fun syncCalendar(promise: Promise) = run(promise) { AutomationEngine.syncCalendar(reactContext) }

    /**
     * Round 3 (#4): every calendar on this phone for the picker:
     * {permission: "granted"|"missing", selection: [id]|null (null = all
     * visible), status, lastSync, calendars: [{id, name, accountName,
     * provider, color, visible, synced, primary}]}. Ids are strings. No
     * events are read here; nothing is logged or uploaded.
     */
    @ReactMethod
    fun getDeviceCalendars(promise: Promise) {
        val store = EngineStore(reactContext)
        val result = JSONObject().apply {
            put("selection", store.calendarSelection?.let { sel -> JSONArray(sel.sorted().map { it.toString() }) } ?: JSONObject.NULL)
            put("status", store.calendarStatus)
            put("lastSync", store.calendarLastSync)
        }
        if (!CalendarSync.hasPermission(reactContext)) {
            promise.resolve(toWritableMap(result.put("permission", "missing").put("calendars", JSONArray())))
            return
        }
        try {
            val calendars = JSONArray()
            CalendarSync.listCalendars(reactContext).forEach { c ->
                calendars.put(JSONObject().apply {
                    put("id", c.id.toString())
                    put("name", c.name)
                    put("accountName", c.accountName ?: JSONObject.NULL)
                    put("provider", CalendarSync.providerLabel(c.accountType))
                    put("color", c.color?.let { String.format("#%06X", it and 0xFFFFFF) } ?: JSONObject.NULL)
                    put("visible", c.visible)
                    put("synced", c.synced)
                    put("primary", c.primary)
                })
            }
            promise.resolve(toWritableMap(result.put("permission", "granted").put("calendars", calendars)))
        } catch (e: Exception) {
            promise.reject("ERR_CALENDARS", e.javaClass.simpleName)
        }
    }

    /**
     * Round 3 (#4): which calendars silence the phone ([ids] as strings;
     * null = every visible calendar). Re-reads the calendar and re-evaluates.
     */
    @ReactMethod
    fun setCalendarSelection(ids: ReadableArray?, promise: Promise) = run(promise) {
        EngineStore(reactContext).calendarSelection = ids?.let { arr ->
            (0 until arr.size()).mapNotNull { i ->
                if (arr.getType(i) == ReadableType.String) arr.getString(i)?.toLongOrNull()?.takeIf { it >= 0 } else null
            }.toSet()
        }
        AutomationEngine.syncCalendar(reactContext)
    }

    /**
     * One fresh fused-location fix for "Use my current location". Resolves
     * {latitude, longitude, accuracy, time}; rejects with ERR_LOCATION_PERMISSION
     * / ERR_LOCATION_UNAVAILABLE. Coordinates are returned, never logged.
     */
    @SuppressLint("MissingPermission")
    @ReactMethod
    fun getCurrentLocation(promise: Promise) {
        if (!GeofenceRegistrar.hasFine(reactContext) && !GeofenceRegistrar.hasCoarse(reactContext)) {
            promise.reject("ERR_LOCATION_PERMISSION", "Location permission not granted")
            return
        }
        val priority = if (GeofenceRegistrar.hasFine(reactContext)) {
            Priority.PRIORITY_HIGH_ACCURACY
        } else {
            Priority.PRIORITY_BALANCED_POWER_ACCURACY
        }
        try {
            LocationServices.getFusedLocationProviderClient(reactContext)
                .getCurrentLocation(priority, CancellationTokenSource().token)
                .addOnSuccessListener { loc ->
                    if (loc == null) {
                        promise.reject("ERR_LOCATION_UNAVAILABLE", "No location fix (is location turned on?)")
                    } else {
                        promise.resolve(Arguments.createMap().apply {
                            putDouble("latitude", loc.latitude)
                            putDouble("longitude", loc.longitude)
                            putDouble("accuracy", loc.accuracy.toDouble())
                            putDouble("time", loc.time.toDouble())
                            putBoolean("precise", GeofenceRegistrar.hasFine(reactContext))
                        })
                    }
                }
                .addOnFailureListener { e -> promise.reject("ERR_LOCATION_UNAVAILABLE", e.javaClass.simpleName) }
        } catch (e: SecurityException) {
            promise.reject("ERR_LOCATION_PERMISSION", "Location permission not granted")
        }
    }

    @ReactMethod
    fun reset(promise: Promise) = run(promise) { AutomationEngine.reset(reactContext) }

    // ---- Logout outbox (per account; see automation/Outbox.kt)

    /** Saves this account's unacknowledged data; resolves {saved, count}. */
    @ReactMethod
    fun preserveForLogout(userId: Double, promise: Promise) {
        try {
            val count = AutomationEngine.preserveForLogout(reactContext, userId.toLong())
            promise.resolve(Arguments.createMap().apply {
                putBoolean("saved", count != null)
                putInt("count", count ?: 0)
            })
        } catch (e: Exception) {
            promise.resolve(Arguments.createMap().apply { putBoolean("saved", false); putInt("count", 0) })
        }
    }

    /** Confirmed HTTP 401 (not a logout): stops automation, keeps everything the account owns. */
    @ReactMethod
    fun expireSession(userId: Double, promise: Promise) = run(promise) { AutomationEngine.expireSession(reactContext, userId.toLong()) }

    /** Logout when the outbox could not be saved: keeps journal + sessions. */
    @ReactMethod
    fun resetKeepingHistory(promise: Promise) = run(promise) { AutomationEngine.reset(reactContext, keepHistory = true) }

    /** Before sign-in completes; resolves "KEPT" | "ADOPTED" | "MOVED" | "BLOCKED". */
    @ReactMethod
    fun claimHistory(userId: Double, promise: Promise) {
        try {
            promise.resolve(AutomationEngine.claimHistory(reactContext, userId.toLong()).name)
        } catch (e: Exception) {
            promise.resolve(com.SilenceFocus.automation.AccountHistory.ClaimResult.BLOCKED.name)
        }
    }

    /** Signed-out start-up: finishes a sign-out that was cut short; resolves whether it had to. */
    @ReactMethod
    fun ensureSignedOut(promise: Promise) {
        try {
            promise.resolve(AutomationEngine.ensureSignedOut(reactContext))
        } catch (e: Exception) {
            promise.reject("ERR_SIGNED_OUT", e.message, e)
        }
    }

    /** Only [userId]'s own outbox: {events: [journal JSON], sessions: [{start, end, primarySource}]}. */
    @ReactMethod
    fun getOutbox(userId: Double, promise: Promise) = run(promise) {
        val c = OutboxStore(reactContext).read(userId.toLong())
        JSONObject().apply {
            put("events", JSONArray().apply { c.events.forEach { put(JSONObject(it.json)) } })
            put("sessions", JSONArray().apply {
                c.sessions.forEach {
                    put(JSONObject().put("start", it.start).put("end", it.end).put("primarySource", it.primarySource ?: JSONObject.NULL))
                }
            })
        }
    }

    /** Drops outbox entries the server was read back to hold. */
    @ReactMethod
    fun removeFromOutbox(userId: Double, eventIds: ReadableArray, sessions: ReadableArray, promise: Promise) {
        try {
            val ids = (0 until eventIds.size()).mapNotNull { i ->
                if (eventIds.getType(i) == ReadableType.String) eventIds.getString(i) else null
            }.toSet()
            val ends = (0 until sessions.size()).mapNotNull { i ->
                val m = sessions.getMap(i) ?: return@mapNotNull null
                if (!m.hasKey("start") || !m.hasKey("end") || m.isNull("end")) return@mapNotNull null
                m.getDouble("start").toLong() to m.getDouble("end").toLong()
            }.toMap()
            promise.resolve(OutboxStore(reactContext).removeVerified(userId.toLong(), ids, ends))
        } catch (e: Exception) {
            promise.reject("ERR_OUTBOX", e.message, e)
        }
    }

    /** Local geofence timing diagnostics (Client Issue #5); never uploaded. */
    @ReactMethod
    fun getGeofenceDiagnostics(promise: Promise) {
        try {
            promise.resolve(toWritableArray(JSONArray().apply {
                com.SilenceFocus.automation.GeofenceDiagnosticsStore(reactContext).all().forEach { r ->
                    put(JSONObject().apply {
                        put("kind", r.kind.name)
                        put("at", r.at)
                        r.transition?.let { put("transition", it) }
                        put("zoneIds", JSONArray(r.zoneIds))
                        r.fixTime?.let { put("fixTime", it) }
                        r.fixAgeMs?.let { put("fixAgeMs", it) }
                        r.accuracyM?.let { put("accuracyM", it) }
                        r.provider?.let { put("provider", it) }
                        r.distanceM?.let { put("distanceM", it) }
                        r.radiusM?.let { put("radiusM", it) }
                        r.evalMs?.let { put("evalMs", it) }
                        r.silentActive?.let { put("silentActive", it) }
                        r.dndApplied?.let { put("dndApplied", it) }
                        r.blockedReason?.let { put("blockedReason", it) }
                        r.status?.let { put("status", it) }
                        r.errorCode?.let { put("errorCode", it) }
                        r.permissions?.let { put("permissions", it) }
                    })
                }
            }))
        } catch (e: Exception) {
            promise.reject("ERR_DIAG", e.message, e)
        }
    }

    @ReactMethod
    fun clearGeofenceDiagnostics(promise: Promise) {
        com.SilenceFocus.automation.GeofenceDiagnosticsStore(reactContext).clear()
        promise.resolve(true)
    }

    /** Account deleted: its outbox can never be uploaded. */
    @ReactMethod
    fun dropOutbox(userId: Double, promise: Promise) {
        promise.resolve(runCatching { OutboxStore(reactContext).drop(userId.toLong()) }.getOrDefault(false))
    }

    @ReactMethod
    fun getRecentEvents(promise: Promise) {
        try {
            promise.resolve(toWritableArray(AutomationEngine.recentEvents(reactContext)))
        } catch (e: Exception) {
            promise.reject("ERR_ENGINE", e.message, e)
        }
    }

    /** Server sync's only journal source: synthetic (test-harness) entries are excluded natively. */
    @ReactMethod
    fun getSyncableEvents(promise: Promise) {
        try {
            promise.resolve(toWritableArray(AutomationEngine.syncableEvents(reactContext)))
        } catch (e: Exception) {
            promise.reject("ERR_ENGINE", e.message, e)
        }
    }

    /**
     * "Clear activity history": the local journal and finished sessions.
     * [clearableStarts] / [clearableEventIds]: the finished sessions and
     * journal entries JS verified on the server; everything else (incl.
     * anything recorded after the check) is kept. null = all (no server copy).
     */
    @ReactMethod
    fun clearRecentEvents(clearableStarts: ReadableArray?, clearableEventIds: ReadableArray?, promise: Promise) {
        val starts = clearableStarts?.let { arr ->
            (0 until arr.size()).mapNotNull { i ->
                if (arr.getType(i) == ReadableType.Number) arr.getDouble(i).toLong() else null
            }.toSet()
        }
        val eventIds = clearableEventIds?.let { arr ->
            (0 until arr.size()).mapNotNull { i ->
                if (arr.getType(i) == ReadableType.String) arr.getString(i) else null
            }.toSet()
        }
        EngineStore(reactContext).clearEvents(eventIds)
        SessionStore(reactContext).clear(System.currentTimeMillis(), starts)
        // "Clear phone activity" also drops debug-only #9 probe data (no-op otherwise).
        com.SilenceFocus.comms.NotificationProbes.clear(reactContext)
        promise.resolve(true)
    }

    /**
     * JS read the server back and found these journal entries / sessions
     * ([{start, end}]): retention may drop them from now on.
     */
    @ReactMethod
    fun markAcknowledged(eventIds: ReadableArray, sessions: ReadableArray, promise: Promise) {
        try {
            val ids = (0 until eventIds.size()).mapNotNull { i ->
                if (eventIds.getType(i) == ReadableType.String) eventIds.getString(i) else null
            }.toSet()
            val ends = (0 until sessions.size()).mapNotNull { i ->
                val m = sessions.getMap(i) ?: return@mapNotNull null
                if (!m.hasKey("start") || !m.hasKey("end") || m.isNull("end")) return@mapNotNull null
                m.getDouble("start").toLong() to m.getDouble("end").toLong()
            }.toMap()
            EngineStore(reactContext).markEventsAcknowledged(ids)
            SessionStore(reactContext).markAcknowledged(ends)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERR_ACK", e.message, e)
        }
    }

    /**
     * Activity row tap: the original notification if still posted, else the
     * posting app. Resolves "NOTIFICATION" | "APP" | "UNAVAILABLE".
     */
    @ReactMethod
    fun openActivitySource(packageName: String, notificationRef: String?, promise: Promise) {
        promise.resolve(NotificationSource.open(reactContext, packageName, notificationRef))
    }

    /**
     * #11: phone call rows. Resolves "CALL_LOG" | "DIALER" | "UNAVAILABLE"
     * (a specific call can't be opened).
     */
    @ReactMethod
    fun openPhoneApp(promise: Promise) {
        promise.resolve(PhoneApp.open(reactContext))
    }

    /**
     * #10: ephemeral previews for [{appPackage, notificationRef, messageAt?, key?}]
     * -> {key (default: ref): {status, text?}}. Text only for still-posted
     * notifications; never stored or logged here.
     */
    @ReactMethod
    fun getActivityPreviews(items: ReadableArray, promise: Promise) {
        try {
            val requests = (0 until items.size()).mapNotNull { i ->
                if (items.getType(i) != ReadableType.Map) return@mapNotNull null
                val m = items.getMap(i) ?: return@mapNotNull null
                fun str(key: String) = if (m.hasKey(key) && !m.isNull(key)) m.getString(key) else null
                val pkg = str("appPackage")
                val ref = str("notificationRef")
                val at = if (m.hasKey("messageAt") && m.getType("messageAt") == ReadableType.Number) {
                    m.getDouble("messageAt").toLong().takeIf { it > 0 }
                } else {
                    null
                }
                if (pkg.isNullOrEmpty() || ref.isNullOrEmpty()) {
                    null
                } else {
                    NotificationPreviews.Request(pkg, ref, at, str("key")?.ifEmpty { null } ?: ref)
                }
            }
            val result = Arguments.createMap()
            NotificationPreviews.lookup(reactContext, requests).forEach { (key, p) ->
                result.putMap(key, Arguments.createMap().apply {
                    putString("status", p.status)
                    if (p.text != null) putString("text", p.text)
                })
            }
            promise.resolve(result)
        } catch (e: Exception) {
            // Never include notification content in the error.
            promise.reject("ERR_PREVIEWS", e.javaClass.simpleName)
        }
    }

    // ---- Phase 5: session history

    @ReactMethod
    fun getSessionHistory(promise: Promise) = run(promise) {
        val store = SessionStore(reactContext)
        JSONObject().apply {
            put("recordingSince", store.recordingSince.takeIf { it > 0 } ?: JSONObject.NULL)
            put("sessions", JSONArray().apply {
                store.sessions.forEach { s ->
                    put(JSONObject().apply {
                        put("id", s.id)
                        put("start", s.start)
                        put("end", s.end ?: JSONObject.NULL)
                        put("primarySource", s.primarySource ?: JSONObject.NULL)
                        put("sources", JSONArray(s.sources.toList()))
                        put("zoneNames", JSONArray(s.zoneNames.toList()))
                        put("emergencyBreakthroughs", s.emergencyBreakthroughs)
                        put("urgentBreakthroughs", s.urgentBreakthroughs)
                        put("callsSilenced", s.callsSilenced)
                        put("messagesReceived", s.messagesReceived)
                        put("autoRepliesSent", s.autoRepliesSent)
                        put("ackedEnd", s.ackedEnd ?: JSONObject.NULL)
                    })
                }
            })
        }
    }

    // ---- Phase 5: Smart Location Learning (suggestions only; never creates zones)

    @ReactMethod
    fun getLearningState(promise: Promise) = run(promise) { learningState() }

    /** Turning it off stops new samples; existing data is cleared separately. */
    @ReactMethod
    fun setLearningEnabled(enabled: Boolean, promise: Promise) = run(promise) {
        LearningStore(reactContext).apply {
            this.enabled = enabled
            optInAnswered = true
        }
        learningState()
    }

    /** Answer to the one-time offer on Home. */
    @ReactMethod
    fun answerLearningOptIn(accepted: Boolean, promise: Promise) = run(promise) {
        LearningStore(reactContext).apply {
            optInAnswered = true
            if (accepted) enabled = true
        }
        learningState()
    }

    /** "Not now": 30-day pause; the second time, never again for this place. */
    @ReactMethod
    fun dismissLearningSuggestion(id: String, promise: Promise) = run(promise) {
        val store = LearningStore(reactContext)
        store.places = SmartLocationLearner().dismiss(store.places, id, System.currentTimeMillis())
        if (store.pendingSuggestionId == id) store.pendingSuggestionId = null
        learningState()
    }

    /** "Create Silent Zone": the suggestion is answered; the place is resolved once the zone is saved. */
    @ReactMethod
    fun acceptLearningSuggestion(id: String, promise: Promise) = run(promise) {
        val store = LearningStore(reactContext)
        if (store.pendingSuggestionId == id) store.pendingSuggestionId = null
        learningState()
    }

    @ReactMethod
    fun resolveLearnedPlace(id: String, promise: Promise) = run(promise) {
        val store = LearningStore(reactContext)
        store.places = SmartLocationLearner().resolve(store.places, id)
        if (store.pendingSuggestionId == id) store.pendingSuggestionId = null
        learningState()
    }

    @ReactMethod
    fun clearLearnedLocations(promise: Promise) = run(promise) {
        LearningStore(reactContext).clearLearned()
        learningState()
    }

    private fun learningState(): JSONObject {
        val store = LearningStore(reactContext)
        val now = System.currentTimeMillis()
        val learner = SmartLocationLearner()
        val places = learner.prune(store.places, now)
        if (places != store.places) store.places = places
        val pending = store.pendingSuggestionId?.let { id -> places.firstOrNull { it.id == id } }
        if (store.pendingSuggestionId != null && pending == null) store.pendingSuggestionId = null
        return JSONObject().apply {
            put("enabled", store.enabled)
            put("optInAnswered", store.optInAnswered)
            put("placeCount", places.count { !it.stopped })
            put("suggestion", pending?.let { p ->
                JSONObject()
                    .put("id", p.id)
                    .put("latitude", p.latitude)
                    .put("longitude", p.longitude)
                    .put("radius", LearningConfig().suggestedRadiusMeters)
                    .put("activations", p.visits.size)
            } ?: JSONObject.NULL)
        }
    }

    // ---- Phase 5: permission hub (status only; requests start from explicit taps)

    @ReactMethod
    fun getPermissionHub(promise: Promise) = run(promise) {
        val comms = CommsStore(reactContext)
        val callFeatures = comms.emergencyContacts.isNotEmpty() || isScreeningRoleHeld()
        JSONObject().apply {
            put("dndAccess", nm().isNotificationPolicyAccessGranted)
            put("exactAlarms", AlarmScheduler(reactContext).canScheduleExact())
            put("notificationAccess", hasListenerAccess())
            put("fineLocation", GeofenceRegistrar.hasFine(reactContext))
            put("coarseLocation", GeofenceRegistrar.hasCoarse(reactContext))
            put("backgroundLocation", GeofenceRegistrar.hasBackground(reactContext))
            put("locationServicesOn", GeofenceRegistrar.isLocationOn(reactContext))
            put("calendar", granted(Manifest.permission.READ_CALENDAR))
            put("contacts", granted(Manifest.permission.READ_CONTACTS))
            put("phoneState", granted(Manifest.permission.READ_PHONE_STATE))
            put("callScreeningSupported", Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q &&
                reactContext.getSystemService(RoleManager::class.java)?.isRoleAvailable(RoleManager.ROLE_CALL_SCREENING) == true)
            put("callScreening", isScreeningRoleHeld())
            put("callFeaturesInUse", callFeatures)
            // #5: optional battery guidance (shown only when Silent Zones exist).
            put("batteryUnrestricted", isIgnoringBatteryOptimizations())
            put("zonesInUse", EngineStore(reactContext).zones.isNotEmpty())
        }
    }

    private fun isIgnoringBatteryOptimizations(): Boolean = runCatching {
        reactContext.getSystemService(android.os.PowerManager::class.java)?.isIgnoringBatteryOptimizations(reactContext.packageName) == true
    }.getOrDefault(true)

    /**
     * #5: opens where the user can set Silent Focus's battery use to
     * Unrestricted - this app's details page (Battery is one tap from there,
     * also on Samsung), else the system battery-optimisation list. No
     * exemption request and no new permission. Resolves "APP_DETAILS" |
     * "BATTERY_LIST" | "UNAVAILABLE".
     */
    @ReactMethod
    fun openBatterySettings(promise: Promise) {
        val tries = listOf(
            "APP_DETAILS" to Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).setData(Uri.parse("package:${reactContext.packageName}")),
            "BATTERY_LIST" to Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS),
        )
        for ((name, intent) in tries) {
            val opened = runCatching {
                reactContext.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                true
            }.getOrDefault(false)
            if (opened) {
                promise.resolve(name)
                return
            }
        }
        promise.resolve("UNAVAILABLE")
    }

    @ReactMethod
    fun openAppSettings() = openSettings(
        Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).setData(Uri.parse("package:${reactContext.packageName}")),
    )

    @ReactMethod
    fun openLocationSettings() = openSettings(Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS))

    /**
     * A JS rendering error caught by the ErrorBoundary. JS has already
     * scrubbed numbers, coordinates, e-mails and tokens; only release builds
     * send anything (collection is disabled in debug).
     */
    @ReactMethod
    fun recordJsError(name: String, message: String, where: String) {
        runCatching {
            FirebaseCrashlytics.getInstance().recordException(JsRenderError("$name: $message".take(360), where.take(400)))
        }
    }

    private class JsRenderError(message: String, where: String) : RuntimeException(message) {
        init {
            stackTrace = arrayOf(StackTraceElement("ReactNative", where.ifEmpty { "unknown" }, "js", 0))
        }
    }

    /** Build-time configuration for JS (no secrets beyond what the APK already contains). */
    override fun getConstants(): Map<String, Any> = mapOf(
        "mapsApiKey" to BuildConfig.MAPS_API_KEY,
        "isDebugBuild" to BuildConfig.DEBUG,
        // Debug builds only (release hard-codes ""): test account allowed to
        // receive server writes. See serverSync.serverWritesAllowed.
        "debugServerWritesAccountId" to if (BuildConfig.DEBUG) BuildConfig.DEBUG_SERVER_WRITES_ACCOUNT_ID else "",
        // Field-test build type: automatic uploads off (serverSync.serverWritesAllowed).
        "automaticUploadsDisabled" to BuildConfig.SF_AUTOMATIC_UPLOADS_DISABLED,
    )

    // ---- Phase 4: emergency contacts, urgent callers, auto reply

    /** Everything the Emergency Contacts / Auto Reply screens need. Numbers are redacted. */
    @ReactMethod
    fun getCommsState(promise: Promise) = run(promise) { commsState() }

    /** {emergencyEnabled, urgentEnabled, urgentThreshold, urgentWindowMinutes, urgentCooldownMinutes, ..., simCallMode} */
    @ReactMethod
    fun setCallSettings(settings: ReadableMap, promise: Promise) = run(promise) {
        val store = CommsStore(reactContext)
        val cur = store.callSettings
        store.callSettings = CallSettings(
            emergencyEnabled = settings.bool("emergencyEnabled", cur.emergencyEnabled),
            urgentEnabled = settings.bool("urgentEnabled", cur.urgentEnabled),
            urgentThreshold = settings.int("urgentThreshold", cur.urgentThreshold),
            urgentWindowMinutes = settings.int("urgentWindowMinutes", cur.urgentWindowMinutes),
            urgentCooldownMinutes = settings.int("urgentCooldownMinutes", cur.urgentCooldownMinutes),
            whatsAppAlertsEnabled = settings.bool("whatsAppAlertsEnabled", cur.whatsAppAlertsEnabled),
            whatsAppNameMatch = settings.bool("whatsAppNameMatch", cur.whatsAppNameMatch),
            // Only a known id changes the mode; an unknown value keeps the current one.
            simCallMode = settings.takeIf { it.hasKey("simCallMode") && !it.isNull("simCallMode") }
                ?.getString("simCallMode")
                ?.let { id -> SimCallMode.values().firstOrNull { it.id == id } }
                ?: cur.simCallMode,
        )
        commsState()
    }

    /** Opens the "Emergency & urgent WhatsApp calls" channel settings (sound, override DND, lock screen). */
    @ReactMethod
    fun openWhatsAppAlertSettings(promise: Promise) {
        promise.resolve(EmergencyCallAlert.openSettings(reactContext))
    }

    /** Posts a clearly-labelled test alert on that channel; resolves the outcome (SENT, SENT_SILENCED, ...). */
    @ReactMethod
    fun sendTestWhatsAppAlert(promise: Promise) {
        promise.resolve(EmergencyCallAlert.showTest(reactContext))
    }

    /** Round 4: starts the user-requested "Check WhatsApp Call Alerts" (see WhatsAppCallCheck). */
    @ReactMethod
    fun startWhatsAppCallCheck(promise: Promise) = run(promise) {
        val kv = WhatsAppCallCheck.store(reactContext)
        WhatsAppCallCheck.start(kv, System.currentTimeMillis())
        callCheckState()
    }

    @ReactMethod
    fun getWhatsAppCallCheck(promise: Promise) = run(promise) { callCheckState() }

    /** Stops the check early ([clear] = also delete the result). */
    @ReactMethod
    fun stopWhatsAppCallCheck(clear: Boolean, promise: Promise) = run(promise) {
        val kv = WhatsAppCallCheck.store(reactContext)
        if (clear) WhatsAppCallCheck.clear(kv) else WhatsAppCallCheck.stop(kv, System.currentTimeMillis())
        callCheckState()
    }

    /** Check result: yes/no facts and outcome codes only (no caller name, number or text). */
    private fun callCheckState(): JSONObject {
        val now = System.currentTimeMillis()
        val r = WhatsAppCallCheck.read(WhatsAppCallCheck.store(reactContext), now)
        val owned = EngineStore(reactContext).owned
        val ready = EmergencyCallAlert.readiness(reactContext, owned)
        return JSONObject().apply {
            put("exists", r != null)
            put("running", r?.running(now) == true)
            put("remainingMs", if (r?.running(now) == true) r.endsAt - now else 0L)
            put("silentFocusOnNow", owned)
            put("notificationAccess", hasListenerAccess())
            put("listenerConnected", SilentFocusNotificationListener.connected != null)
            put("soundReady", ready.sound.name)
            put("ringerMode", ready.ringerMode)
            if (r != null) {
                put("waSeen", r.waSeen)
                put("callLikeSeen", r.callLikeSeen)
                put("ringing", r.ringing)
                put("missed", r.missed)
                put("silenced", r.silenced)
                put("calls", r.calls)
                put("app", r.app)
                put("silentFocusOn", r.silentFocusOn)
                put("callerIdentified", r.callerIdentified)
                put("numberShown", r.numberShown)
                put("nameShown", r.nameShown)
                put("emergencyMatched", r.emergencyMatched)
                put("matchedBy", r.matchedBy)
                put("nameWouldMatch", r.nameWouldMatch)
                put("repeatCount", r.repeatCount)
                put("urgentReached", r.urgentReached)
                put("alertAttempted", r.alertAttempted)
                put("alertOutcome", r.alertOutcome)
                put("alertStoppedAfterMs", r.alertStoppedAfterMs)
                put("shape", r.shape)
            }
        }
    }

    /** {enabled, messagingEnabled, defaultTemplate, cooldownMinutes, zoneTemplates: {zoneId: text}} */
    @ReactMethod
    fun setAutoReplySettings(settings: ReadableMap, promise: Promise) = run(promise) {
        val store = CommsStore(reactContext)
        val cur = store.autoReplySettings
        val zones = if (settings.hasKey("zoneTemplates") && !settings.isNull("zoneTemplates")) {
            val m = settings.getMap("zoneTemplates")
            m?.toHashMap()?.mapNotNull { (k, v) -> (v as? String)?.let { k to it } }?.toMap() ?: cur.zoneTemplates
        } else {
            cur.zoneTemplates
        }
        store.autoReplySettings = AutoReplySettings(
            enabled = settings.bool("enabled", cur.enabled),
            messagingEnabled = settings.bool("messagingEnabled", cur.messagingEnabled),
            defaultTemplate = if (settings.hasKey("defaultTemplate") && !settings.isNull("defaultTemplate")) {
                settings.getString("defaultTemplate") ?: cur.defaultTemplate
            } else {
                cur.defaultTemplate
            },
            cooldownMinutes = settings.int("cooldownMinutes", cur.cooldownMinutes),
            zoneTemplates = zones,
        )
        commsState()
    }

    /**
     * Opens the system contact picker for phone numbers. Android grants read
     * access to the one picked row, so READ_CONTACTS isn't needed. Resolves
     * the stored contact ({id, name, number: redacted}) or null if cancelled.
     */
    @ReactMethod
    fun pickEmergencyContact(promise: Promise) {
        val activity = reactContext.currentActivity
        if (activity == null) {
            promise.reject("ERR_NO_ACTIVITY", "No screen to open the contact picker from")
            return
        }
        pendingPick?.resolve(null)
        pendingPick = promise
        try {
            activity.startActivityForResult(
                Intent(Intent.ACTION_PICK, ContactsContract.CommonDataKinds.Phone.CONTENT_URI),
                REQUEST_PICK_CONTACT,
            )
        } catch (e: Exception) {
            pendingPick = null
            promise.reject("ERR_NO_PICKER", "No contact picker available")
        }
    }

    @ReactMethod
    fun removeEmergencyContact(id: String, promise: Promise) = run(promise) {
        CommsStore(reactContext).removeEmergencyContact(id)
        commsState()
    }

    /**
     * Asks the user to make Silent Focus the call-screening app (Android
     * shows its own confirmation). Never requested silently.
     */
    @ReactMethod
    fun requestCallScreeningRole(promise: Promise) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            promise.resolve(false)
            return
        }
        val rm = reactContext.getSystemService(RoleManager::class.java)
        val activity = reactContext.currentActivity
        if (rm == null || !rm.isRoleAvailable(RoleManager.ROLE_CALL_SCREENING) || activity == null) {
            promise.resolve(false)
            return
        }
        if (rm.isRoleHeld(RoleManager.ROLE_CALL_SCREENING)) {
            promise.resolve(true)
            return
        }
        pendingRole?.resolve(false)
        pendingRole = promise
        try {
            activity.startActivityForResult(rm.createRequestRoleIntent(RoleManager.ROLE_CALL_SCREENING), REQUEST_SCREENING_ROLE)
        } catch (e: Exception) {
            pendingRole = null
            promise.resolve(false)
        }
    }

    /** Where the user can hand the call-screening role back or to another app. */
    @ReactMethod
    fun openCallScreeningSettings() = openSettings(Intent(Settings.ACTION_MANAGE_DEFAULT_APPS_SETTINGS))

    @ReactMethod
    fun openNotificationAccessSettings() {
        val component = ComponentName(reactContext, SilentFocusNotificationListener::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            try {
                reactContext.startActivity(
                    Intent(Settings.ACTION_NOTIFICATION_LISTENER_DETAIL_SETTINGS)
                        .putExtra(Settings.EXTRA_NOTIFICATION_LISTENER_COMPONENT_NAME, component.flattenToString())
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                )
                return
            } catch (_: Exception) {
                // Fall back to the list below.
            }
        }
        openSettings(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
    }

    @ReactMethod
    fun hasNotificationAccess(promise: Promise) {
        promise.resolve(hasListenerAccess())
    }

    private fun hasListenerAccess(): Boolean {
        val component = ComponentName(reactContext, SilentFocusNotificationListener::class.java)
        val granted = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            nm().isNotificationListenerAccessGranted(component)
        } else {
            val enabled = Settings.Secure.getString(reactContext.contentResolver, "enabled_notification_listeners").orEmpty()
            enabled.split(':').any { ComponentName.unflattenFromString(it) == component }
        }
        // Access granted but the listener isn't bound (Samsung after an app
        // update or battery kill): nothing would see WhatsApp calls or
        // messages until Android rebinds it, so ask for that now.
        if (granted && SilentFocusNotificationListener.connected == null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            runCatching { NotificationListenerService.requestRebind(component) }
        }
        return granted
    }

    private fun isScreeningRoleHeld(): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return false
        val rm = reactContext.getSystemService(RoleManager::class.java) ?: return false
        return rm.isRoleAvailable(RoleManager.ROLE_CALL_SCREENING) && rm.isRoleHeld(RoleManager.ROLE_CALL_SCREENING)
    }

    private fun granted(permission: String) =
        reactContext.checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED

    private fun storePickedContact(uri: Uri): JSONObject? {
        val projection = arrayOf(
            ContactsContract.CommonDataKinds.Phone.NUMBER,
            ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,
            ContactsContract.CommonDataKinds.Phone.LOOKUP_KEY,
        )
        reactContext.contentResolver.query(uri, projection, null, null, null)?.use { c ->
            if (!c.moveToFirst()) return null
            val number = c.getString(0)
            val name = c.getString(1)
            val lookup = c.getString(2)
            val stored = CommsStore(reactContext).addEmergencyContact(
                id = lookup ?: java.util.UUID.randomUUID().toString(),
                name = name,
                rawNumber = number,
            ) ?: return JSONObject().put("error", "INVALID_NUMBER")
            return JSONObject()
                .put("id", stored.id)
                .put("name", stored.name ?: JSONObject.NULL)
                .put("number", PhoneNumbers.redact(stored.number))
        }
        return null
    }

    private fun commsState(): JSONObject {
        val store = CommsStore(reactContext)
        val call = store.callSettings
        val reply = store.autoReplySettings
        val screeningSupported = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q &&
            reactContext.getSystemService(RoleManager::class.java)?.isRoleAvailable(RoleManager.ROLE_CALL_SCREENING) == true
        return JSONObject().apply {
            put("callSettings", JSONObject().apply {
                put("emergencyEnabled", call.emergencyEnabled)
                put("urgentEnabled", call.urgentEnabled)
                put("urgentThreshold", call.urgentThreshold)
                put("urgentWindowMinutes", call.urgentWindowMinutes)
                put("urgentCooldownMinutes", call.urgentCooldownMinutes)
                put("whatsAppAlertsEnabled", call.whatsAppAlertsEnabled)
                put("whatsAppNameMatch", call.whatsAppNameMatch)
                put("simCallMode", call.simCallMode.id)
            })
            val alert = EmergencyCallAlert.status(reactContext)
            put("whatsAppAlert", JSONObject().apply {
                put("notificationsAllowed", alert.notificationsAllowed)
                put("dndAccess", alert.dndAccess)
                put("channelExists", alert.channelExists)
                put("channelEnabled", alert.channelEnabled)
                put("overridesDnd", alert.overridesDnd)
                put("sound", alert.sound)
                put("outcome", EmergencyCallAlert.outcomeFor(alert))
                // Round 4: "Sound settings appear ready" + whether a Do Not Disturb mode is on now.
                val ready = EmergencyCallAlert.readiness(reactContext, EngineStore(reactContext).owned)
                put("soundReady", ready.sound.name)
                put("ringerMode", ready.ringerMode)
                put("dndOn", ready.filter > NotificationManager.INTERRUPTION_FILTER_ALL)
                put("silentFocusOn", EngineStore(reactContext).owned)
            })
            put("emergencyContacts", JSONArray().apply {
                store.emergencyContacts.forEach { c ->
                    put(JSONObject()
                        .put("id", c.id)
                        .put("name", c.name ?: JSONObject.NULL)
                        .put("number", PhoneNumbers.redact(c.number)))
                }
            })
            put("autoReply", JSONObject().apply {
                put("enabled", reply.enabled)
                put("messagingEnabled", reply.messagingEnabled)
                put("defaultTemplate", reply.defaultTemplate)
                put("cooldownMinutes", reply.cooldownMinutes)
                put("zoneTemplates", JSONObject(reply.zoneTemplates as Map<*, *>))
            })
            put("zones", JSONArray().apply {
                EngineStore(reactContext).zones.forEach { z ->
                    put(JSONObject().put("id", z.id).put("name", z.name ?: JSONObject.NULL).put("enabled", z.enabled))
                }
            })
            put("callScreening", JSONObject()
                .put("supported", screeningSupported)
                .put("held", isScreeningRoleHeld()))
            put("notificationAccess", hasListenerAccess())
            put("phoneStatePermission", granted(Manifest.permission.READ_PHONE_STATE))
            put("contactsPermission", granted(Manifest.permission.READ_CONTACTS))
            put("dndAccess", nm().isNotificationPolicyAccessGranted)
        }
    }

    private fun ReadableMap.bool(key: String, def: Boolean) =
        if (hasKey(key) && !isNull(key)) getBoolean(key) else def

    private fun ReadableMap.int(key: String, def: Int) =
        if (hasKey(key) && !isNull(key)) getDouble(key).toInt() else def

    // Required by NativeEventEmitter on Android.
    @ReactMethod
    fun addListener(eventName: String) {}

    @ReactMethod
    fun removeListeners(count: Int) {}

    // ---- Permissions / settings

    @ReactMethod
    fun hasDndAccess(promise: Promise) {
        try {
            promise.resolve(nm().isNotificationPolicyAccessGranted)
        } catch (e: Exception) {
            promise.reject("ERR_HAS_DND", e)
        }
    }

    /** Kept for PermissionScreen; same as [hasDndAccess]. */
    @ReactMethod
    fun checkDndPermission(promise: Promise) = hasDndAccess(promise)

    @ReactMethod
    fun openDndAccessSettings() = openSettings(Intent(Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS))

    @ReactMethod
    fun openExactAlarmSettings() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            openSettings(
                Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM)
                    .setData(Uri.parse("package:${reactContext.packageName}")),
            )
        }
    }

    private fun openSettings(intent: Intent) {
        try {
            reactContext.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        } catch (_: Exception) {
            // No settings screen for this on the device; nothing else to do.
        }
    }

    // ---- Helpers

    private inline fun run(promise: Promise, block: () -> JSONObject) {
        try {
            promise.resolve(toWritableMap(block()))
        } catch (e: Exception) {
            promise.reject("ERR_ENGINE", e.message, e)
        }
    }

    private fun parseSchedules(arr: ReadableArray): List<ScheduleRule> =
        (0 until arr.size()).mapNotNull { i ->
            if (arr.getType(i) != ReadableType.Map) return@mapNotNull null
            val m = arr.getMap(i) ?: return@mapNotNull null
            val days = if (m.hasKey("days") && !m.isNull("days")) m.getArray("days") else null
            ScheduleRule(
                id = when {
                    !m.hasKey("id") || m.isNull("id") -> ""
                    m.getType("id") == ReadableType.Number -> m.getDouble("id").toLong().toString()
                    else -> m.getString("id") ?: ""
                },
                startMinute = if (m.hasKey("startMinute")) m.getInt("startMinute") else -1,
                endMinute = if (m.hasKey("endMinute")) m.getInt("endMinute") else -1,
                days = days?.let { d -> (0 until d.size()).map { d.getInt(it) }.toSet() } ?: emptySet(),
                enabled = m.hasKey("enabled") && m.getBoolean("enabled"),
                name = if (m.hasKey("name") && !m.isNull("name")) m.getString("name") else null,
            ).takeIf { it.id.isNotEmpty() }
        }

    private fun parseZones(arr: ReadableArray): List<ZoneRule> =
        (0 until arr.size()).mapNotNull { i ->
            if (arr.getType(i) != ReadableType.Map) return@mapNotNull null
            val m = arr.getMap(i) ?: return@mapNotNull null
            fun num(key: String) =
                if (m.hasKey(key) && !m.isNull(key) && m.getType(key) == ReadableType.Number) m.getDouble(key) else Double.NaN
            ZoneRule(
                id = when {
                    !m.hasKey("id") || m.isNull("id") -> ""
                    m.getType("id") == ReadableType.Number -> m.getDouble("id").toLong().toString()
                    else -> m.getString("id") ?: ""
                },
                name = if (m.hasKey("name") && !m.isNull("name")) m.getString("name") else null,
                latitude = num("latitude"),
                longitude = num("longitude"),
                radiusMeters = num("radius").takeIf { !it.isNaN() } ?: 0.0,
                enabled = m.hasKey("enabled") && m.getBoolean("enabled"),
            ).takeIf { it.isValid }
        }

    private fun toWritableMap(o: JSONObject): WritableMap {
        val map = Arguments.createMap()
        o.keys().forEach { key ->
            when (val v = o.get(key)) {
                JSONObject.NULL -> map.putNull(key)
                is JSONObject -> map.putMap(key, toWritableMap(v))
                is JSONArray -> map.putArray(key, toWritableArray(v))
                is Boolean -> map.putBoolean(key, v)
                is Int -> map.putInt(key, v)
                is Long -> map.putDouble(key, v.toDouble())
                is Number -> map.putDouble(key, v.toDouble())
                else -> map.putString(key, v.toString())
            }
        }
        return map
    }

    private fun toWritableArray(a: JSONArray): WritableArray {
        val arr = Arguments.createArray()
        for (i in 0 until a.length()) {
            when (val v = a.get(i)) {
                JSONObject.NULL -> arr.pushNull()
                is JSONObject -> arr.pushMap(toWritableMap(v))
                is JSONArray -> arr.pushArray(toWritableArray(v))
                is Boolean -> arr.pushBoolean(v)
                is Int -> arr.pushInt(v)
                is Long -> arr.pushDouble(v.toDouble())
                is Number -> arr.pushDouble(v.toDouble())
                else -> arr.pushString(v.toString())
            }
        }
        return arr
    }

    companion object {
        const val EVENT_STATE_CHANGED = "SilentFocusStateChanged"
        const val EVENT_LEARNING_SUGGESTION = "SilentFocusLearningSuggestion"
        const val EVENT_NOTIFICATIONS_CHANGED = "SilentFocusNotificationsChanged"
        private const val REQUEST_PICK_CONTACT = 4401
        private const val REQUEST_SCREENING_ROLE = 4402
    }
}
