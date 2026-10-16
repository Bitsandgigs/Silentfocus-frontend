package com.SilenceFocus.automation

import android.content.Context
import android.util.Log
import com.SilenceFocus.comms.BreakthroughRinger
import com.SilenceFocus.comms.CommsStore
import com.SilenceFocus.learning.LearningCapture
import com.SilenceFocus.learning.LearningStore
import org.json.JSONArray
import org.json.JSONObject
import java.util.TimeZone

/**
 * The single authority for Silent Focus. Screens, alarms and system
 * broadcasts all go through [evaluate]; nothing else changes DND.
 *
 * Order of work on every call: decide locally -> apply to the device ->
 * persist -> re-arm the next alarm -> notify JS. There is no network I/O
 * here, so automation works offline; backend sync reads the journal later.
 */
object AutomationEngine {

    private const val TAG = "SilentFocusEngine"

    /** Set by the RN module while a JS runtime is alive. */
    @Volatile
    var listener: ((JSONObject) -> Unit)? = null

    /** Set by the RN module: a Smart Location Learning suggestion became pending. */
    @Volatile
    var learningListener: (() -> Unit)? = null

    /** Rule sources, highest priority first (Manual is the override). */
    private fun evaluator(store: EngineStore): AutomationEvaluator {
        val settings = store.settings
        return AutomationEvaluator(
            listOf(
                LocationRuleProvider(store.zones, store.zonePresence, settings.locationEnabled),
                PublicPlaceRuleProvider(store.publicPlaces, store.placePresence, settings.publicPlacesEnabled),
                ScheduleRuleProvider(store.schedules),
                CalendarRuleProvider(store.calendarEvents, settings),
            ),
        )
    }

    @Synchronized
    fun evaluate(context: Context, reason: TriggerReason, nowMillis: Long = System.currentTimeMillis()): JSONObject {
        val store = EngineStore(context)
        val dnd = DndController(context, store)
        val scheduler = AlarmScheduler(context)
        val tz = TimeZone.getDefault()

        val wasSilent = store.owned
        val previousSource = store.lastState?.takeUnless { it.isNull("source") }
            ?.let { runCatching { RuleSource.valueOf(it.getString("source")) }.getOrNull() }
        val decision = evaluator(store).evaluate(nowMillis, tz, store.override)
        // Expired overrides are dropped so they can't come back.
        if (decision.override != store.override) store.override = decision.override

        // A break-through call pauses silencing only; the rules and the
        // session stay as they are. It ends with the call (or its expiry),
        // or as soon as nothing is silenced any more.
        val stored = store.breakthrough
        val mode = deviceMode(decision.silent, stored, nowMillis)
        val breakthrough = stored.takeIf { mode == DeviceMode.BREAKTHROUGH }
        if (stored != null && breakthrough == null) store.breakthrough = null
        if (breakthrough == null) BreakthroughRinger.stop()

        val result = dnd.apply(decision.silent, nowMillis, paused = breakthrough != null)
        val next = listOfNotNull(
            decision.nextBoundary,
            breakthrough?.let { Boundary(it.until, BoundaryKind.BREAKTHROUGH_END) },
        ).minByOrNull { it.atMillis }
        val exact = scheduler.schedule(next)

        val state = buildState(decision, result, dnd, scheduler, store, reason, nowMillis, exact, breakthrough)
        store.lastState = state
        journal(store, wasSilent, store.owned, previousSource, decision, result, reason, nowMillis)
        recordSession(context, store, decision, nowMillis)
        runCatching {
            val ruleName = decision.activeRules.firstOrNull { it.source == decision.source }?.name
            StatusNotification.sync(context, store.owned, store.dndPaused, decision.source, ruleName, store.ownedSince)
        }.onFailure { Log.w(TAG, "status notification failed: ${it.javaClass.simpleName}") }
        Log.i(TAG, "evaluate($reason) silent=${decision.silent} source=${decision.source} mode=$mode applied=${result.applied}")

        runCatching { listener?.invoke(state) }
        return state
    }

    @Synchronized
    fun setManual(context: Context, on: Boolean): JSONObject {
        val store = EngineStore(context)
        val now = System.currentTimeMillis()
        if (on && !DndController(context, store).hasAccess()) {
            // Don't remember an ON we can't apply; it would silence the
            // phone unexpectedly once access is granted later.
            return evaluate(context, TriggerReason.MANUAL_ON, now).apply {
                put("desiredSilent", true)
                put("applied", false)
                put("blockedReason", DndController.BLOCKED_NO_DND_ACCESS)
            }
        }
        store.override = if (on) {
            ManualOverride.FORCE_ON
        } else {
            evaluator(store).manualOffOverride(now, TimeZone.getDefault())
        }
        val state = evaluate(context, if (on) TriggerReason.MANUAL_ON else TriggerReason.MANUAL_OFF, now)
        // The user's explicit tap is the only learning signal (never
        // schedules, calendar, zones, boot or calls). Runs in the background
        // and never affects silencing.
        if (on && state.optBoolean("silentActive")) {
            runCatching { LearningCapture.onManualSilentOn(context) { runCatching { learningListener?.invoke() } } }
        }
        return state
    }

    @Synchronized
    fun setSchedules(context: Context, rules: List<ScheduleRule>): JSONObject {
        EngineStore(context).schedules = rules
        return evaluate(context, TriggerReason.SCHEDULE_CHANGED)
    }

    /** New zone list from JS: persist, re-register geofences, evaluate. */
    @Synchronized
    fun setZones(context: Context, zones: List<ZoneRule>): JSONObject {
        val store = EngineStore(context)
        val changed = store.zones != zones
        store.zones = zones
        // Unchanged lists (every Home refresh) only verify the registration.
        GeofenceRegistrar.sync(context, force = changed)
        return evaluate(context, TriggerReason.ZONES_CHANGED)
    }

    @Synchronized
    fun setSettings(context: Context, settings: AutomationSettings): JSONObject {
        val store = EngineStore(context)
        val before = store.settings
        store.settings = settings
        if (before.publicPlacesEnabled != settings.publicPlacesEnabled) {
            if (settings.publicPlacesEnabled) {
                // The user's own switch-on may try again right away (daily cap still applies).
                store.placeLastAttempt = 0L
                PublicPlaces.onEnabled(context)
            } else {
                PublicPlaces.onDisabled(context)
            }
        }
        if (before.locationEnabled != settings.locationEnabled || before.publicPlacesEnabled != settings.publicPlacesEnabled) {
            GeofenceRegistrar.sync(context, force = true)
        }
        if (before != settings) CalendarSync.sync(context)
        return evaluate(context, TriggerReason.SETTINGS_CHANGED)
    }

    /** Re-read the device calendar now (app resume, permission granted). */
    @Synchronized
    fun syncCalendar(context: Context): JSONObject {
        CalendarSync.sync(context)
        // Also a cheap moment to confirm geofences match permissions, and
        // that nearby public places aren't older than Google allows.
        PublicPlaces.onEnabled(context)
        GeofenceRegistrar.sync(context, force = false)
        return evaluate(context, TriggerReason.CALENDAR_SYNCED)
    }

    /**
     * After boot / app update / clock or timezone change: rebuild what
     * Android may have dropped (geofences, calendar jobs) from the native
     * cache - no JS needed - then evaluate.
     */
    @Synchronized
    fun rebuild(context: Context, reason: TriggerReason): JSONObject {
        if (reason == TriggerReason.BOOT || reason == TriggerReason.APP_UPDATED) {
            PublicPlaces.onEnabled(context)
            GeofenceRegistrar.sync(context, force = true)
        }
        if (reason == TriggerReason.BOOT) {
            // No call can still be ringing after a reboot; recent-call
            // counting starts over too.
            EngineStore(context).breakthrough = null
            CommsStore(context).clearRecentCalls()
        }
        CalendarSync.sync(context)
        return evaluate(context, reason)
    }

    /**
     * A qualifying call (emergency contact / urgent repeat caller) is ringing
     * while Silent Focus is silencing: pause silencing until the call stops
     * ringing ([endBreakthrough]) or [Breakthrough.MAX_MS] passes. Returns
     * true if silencing is now paused. Overlapping calls extend the pause.
     */
    @Synchronized
    fun startBreakthrough(context: Context, kind: String, reason: TriggerReason, now: Long = System.currentTimeMillis()): Boolean {
        val store = EngineStore(context)
        val current = store.breakthrough?.takeIf { it.activeAt(now) }
        store.breakthrough = Breakthrough(
            kind = current?.kind ?: kind,
            since = current?.since ?: now,
            until = now + Breakthrough.MAX_MS,
        )
        val state = evaluate(context, reason, now)
        return !state.isNull("breakthrough")
    }

    /** The break-through call stopped ringing: resume silencing if still due. */
    @Synchronized
    fun endBreakthrough(context: Context, now: Long = System.currentTimeMillis()): JSONObject? {
        val store = EngineStore(context)
        if (store.breakthrough == null && !store.dndPaused) return null
        store.breakthrough = null
        return evaluate(context, TriggerReason.BREAKTHROUGH_ENDED, now)
    }

    /**
     * Logout: drop the user's rules/override and hand the device back.
     * [keepHistory]: keep the activity journal and session history (their
     * pending data could not be saved to the outbox); the open session is
     * closed by the evaluation below.
     */
    @Synchronized
    fun reset(context: Context, keepHistory: Boolean = false): JSONObject {
        EngineStore(context).clearUserData(keepHistory)
        CommsStore(context).clearUserData()
        LearningStore(context).clearUserData()
        if (!keepHistory) SessionStore(context).clearUserData()
        // Zone ids and timings belong to this account: never to the next one.
        runCatching { GeofenceDiagnosticsStore(context).clear() }
        com.SilenceFocus.comms.NotificationProbes.clear(context)
        runCatching { GeofenceRegistrar.removeAll(context) }
        PublicPlaces.cancel(context)
        CalendarSync.cancelJobs(context.applicationContext)
        return evaluate(context, TriggerReason.LOGOUT)
    }

    /**
     * The server rejected the session (HTTP 401 confirmed), not a user
     * logout: silencing and this account's rules stop, but everything the
     * account owns on this phone stays - journal, sessions (incl. pending
     * ones, so nothing is copied to the outbox and nothing can be uploaded
     * twice), emergency contacts, auto-reply settings, learned places and
     * diagnostics. The history is marked as [userId]'s, so the same account
     * gets it back at sign-in (KEEP) and any other account never sees it
     * (claim moves the pending part to the owner's outbox, then clears).
     * Without a known owner it falls back to the logout path.
     */
    @Synchronized
    fun expireSession(context: Context, userId: Long): JSONObject {
        val store = EngineStore(context)
        val owner = AccountHistory.ownerAfterExpiry(userId, store.historyOwner)
            ?: return if (preserveForLogout(context, userId) != null) reset(context) else reset(context, keepHistory = true)
        store.historyOwner = owner
        store.clearAutomationRules()
        runCatching { GeofenceRegistrar.removeAll(context) }
        PublicPlaces.cancel(context)
        CalendarSync.cancelJobs(context.applicationContext)
        return evaluate(context, TriggerReason.LOGOUT)
    }

    /**
     * Before logout: saves this account's unacknowledged data (incl. the
     * open session, closed now) to its outbox. [userId] <= 0 uses the
     * recorded history owner. Returns the number saved, or null if it could
     * not be saved durably (then the caller must keep the history).
     */
    @Synchronized
    fun preserveForLogout(context: Context, userId: Long, now: Long = System.currentTimeMillis()): Int? {
        val owner = if (userId > 0) userId else EngineStore(context).historyOwner
        if (owner <= 0) return null
        val snapshot = Outbox.pendingSnapshot(EngineStore(context).journalForOutbox(), SessionStore(context).sessions, now)
        return if (OutboxStore(context).save(owner, snapshot)) snapshot.size else null
    }

    /** Before sign-in completes: see [AccountHistory.claim]. */
    @Synchronized
    fun claimHistory(context: Context, userId: Long): AccountHistory.ClaimResult {
        val store = EngineStore(context)
        // Entries an older version wrote during a logout reset have no
        // account; never let the next sign-in adopt them. (Not uploaded types.)
        runCatching {
            val events = store.recentEvents()
            val artifacts = ActivityEvents.logoutArtifactIds((0 until events.length()).mapNotNull { i ->
                events.optJSONObject(i)?.let { it.optString("id").ifEmpty { null } to it.optString("reason") }
            })
            if (artifacts.isNotEmpty()) store.clearEvents(artifacts)
        }
        return AccountHistory.claim(
            userId = userId,
            owner = store.historyOwner,
            preserveFor = { owner -> preserveForLogout(context, owner) != null },
            clearHistory = {
                store.clearEvents(null)
                SessionStore(context).clearUserData()
                // Kept by a session expiry; never handed to another account.
                CommsStore(context).clearUserData()
                LearningStore(context).clearUserData()
                runCatching { GeofenceDiagnosticsStore(context).clear() }
            },
            setOwner = { store.historyOwner = it },
        ).also {
            // Debug-only #9 probe data never carries over to another account.
            if (AccountHistory.ownerChanged(it)) com.SilenceFocus.comms.NotificationProbes.clear(context)
        }
    }

    /**
     * App started signed out but the engine still holds a user's rules or is
     * silencing (e.g. crash after sign-out, before the reset): finish that
     * logout - keep the owner's pending data, then reset. Only Silent Focus's
     * own DND rule is turned off (DndController); other DND rules/modes are
     * untouched.
     */
    @Synchronized
    fun ensureSignedOut(context: Context): Boolean {
        val store = EngineStore(context)
        return AccountHistory.finishSignOut(
            hasUserAutomation = AccountHistory.hasUserAutomation(
                store.owned, store.override.mode, store.schedules.size, store.zones.size, store.calendarEvents.size,
            ),
            preserve = { preserveForLogout(context, 0L) != null },
            reset = { keep -> reset(context, keepHistory = keep) },
        )
    }

    @Synchronized
    fun state(context: Context): JSONObject =
        EngineStore(context).lastState ?: evaluate(context, TriggerReason.APP_RESUMED)

    fun recentEvents(context: Context): JSONArray = EngineStore(context).recentEvents()

    /** Journal for server sync: synthetic (test-harness) entries are never included. */
    fun syncableEvents(context: Context): JSONArray = EngineStore(context).syncableEvents()

    private fun buildState(
        d: Decision,
        r: DndController.Result,
        dnd: DndController,
        scheduler: AlarmScheduler,
        store: EngineStore,
        reason: TriggerReason,
        now: Long,
        exact: Boolean,
        breakthrough: Breakthrough?,
    ) = JSONObject().apply {
        // `silentActive` is what the device is actually doing; `desiredSilent`
        // is what the rules want (they differ when DND access is missing).
        put("silentActive", store.owned)
        put("desiredSilent", d.silent)
        put("applied", r.applied)
        put("blockedReason", r.blockedReason ?: JSONObject.NULL)
        put("source", d.source?.name ?: JSONObject.NULL)
        put("silentSince", if (store.owned) store.ownedSince else JSONObject.NULL)
        // Silent Focus stays active during a break-through call; only the
        // device silencing is paused.
        put("breakthrough", breakthrough?.let {
            JSONObject().put("kind", it.kind).put("since", it.since).put("until", it.until)
        } ?: JSONObject.NULL)
        put("devicePaused", store.dndPaused)
        put("activeRules", rulesJson(d.activeRules))
        put("suppressedRules", rulesJson(d.suppressedRules))
        put("manualOverride", JSONObject().apply {
            put("mode", d.override.mode.name)
            put("until", d.override.untilMillis ?: JSONObject.NULL)
        })
        put("nextTransition", d.nextBoundary?.let {
            JSONObject().put("at", it.atMillis).put("kind", it.kind.name)
        } ?: JSONObject.NULL)
        put("nextTransitionExact", exact)
        put("nextSilenceStart", d.nextStart?.let {
            JSONObject().put("at", it.atMillis).put("source", it.source?.name ?: JSONObject.NULL)
        } ?: JSONObject.NULL)
        put("dndAccess", dnd.hasAccess())
        put("exactAlarmAccess", scheduler.canScheduleExact())
        put("previousRingerMode", DndController.ringerModeName(store.previousRingerMode))
        put("scheduleCount", store.schedules.size)
        val settings = store.settings
        put("location", JSONObject().apply {
            put("enabled", settings.locationEnabled)
            put("zoneCount", store.zones.count { it.enabled && it.isValid })
            put("registeredCount", store.geofenceRegisteredCount)
            put("limitExceeded", GeofenceRegistrar.selectZones(store.zones).size > GeofenceRegistrar.MAX_GEOFENCES)
            put("status", store.geofenceStatus)
            put("insideZoneIds", JSONArray(store.zonePresence.keys.toList()))
        })
        put("publicPlaces", JSONObject().apply {
            put("enabled", settings.publicPlacesEnabled)
            put("status", store.placeStatus)
            put("placeCount", store.publicPlaces.size)
            put("lastSearchAt", store.placeSearch?.at ?: JSONObject.NULL)
            put("insidePlaceIds", JSONArray(store.placePresence.keys.toList()))
        })
        put("calendar", JSONObject().apply {
            put("enabled", settings.calendarEnabled)
            put("status", store.calendarStatus)
            put("upcomingCount", store.calendarEvents.count { it.end > now })
            put("lastSyncAt", if (store.calendarLastSync > 0) store.calendarLastSync else JSONObject.NULL)
            put("beforeMinutes", settings.calendarBeforeMinutes)
            put("afterMinutes", settings.calendarAfterMinutes)
            put("ignoreAllDayEvents", settings.ignoreAllDayEvents)
        })
        put("lastReason", reason.name)
        put("evaluatedAt", now)
    }

    private fun rulesJson(rules: List<ActiveRule>) = JSONArray().apply {
        rules.forEach {
            put(JSONObject().apply {
                put("source", it.source.name)
                put("ruleId", it.ruleId)
                put("name", it.name ?: JSONObject.NULL)
                put("windowStart", it.windowStart)
                put("windowEnd", it.windowEnd ?: JSONObject.NULL)
            })
        }
    }

    private fun journal(
        store: EngineStore,
        wasSilent: Boolean,
        isSilent: Boolean,
        previousSource: RuleSource?,
        d: Decision,
        r: DndController.Result,
        reason: TriggerReason,
        now: Long,
    ) {
        if (!ActivityEvents.journalsActivity(reason)) {
            store.lastRuleWindows = ruleWindows(d.activeRules + d.suppressedRules)
            return
        }
        val (started, endedSources) = journalRuleTransitions(store, d, reason, now)
        val type = when {
            !wasSilent && isSilent -> ActivityEvents.SILENCE_STARTED
            wasSilent && !isSilent -> ActivityEvents.SILENCE_ENDED
            !r.applied -> ActivityEvents.AUTOMATION_ERROR
            else -> return
        }
        if (type != ActivityEvents.AUTOMATION_ERROR &&
            !ActivityEvents.silenceChangeNeedsEvent(
                isStart = type == ActivityEvents.SILENCE_STARTED,
                source = d.source,
                previousSource = previousSource,
                startedActive = started.filter { it in d.activeRules },
                endedSources = endedSources,
            )
        ) return
        // Don't repeat the same failure on every evaluation.
        if (type == ActivityEvents.AUTOMATION_ERROR) {
            val events = store.recentEvents()
            val last = if (events.length() > 0) events.optJSONObject(events.length() - 1) else null
            if (last?.optString("type") == type && last.optString("detail") == r.blockedReason) return
        }
        store.appendEvent(JSONObject().apply {
            put("type", type)
            put("reason", reason.name)
            put("source", d.source?.name ?: JSONObject.NULL)
            put("ruleIds", JSONArray(d.activeRules.map { it.ruleId }))
            put("detail", r.blockedReason ?: JSONObject.NULL)
            put("previousRingerMode", DndController.ringerModeName(store.previousRingerMode))
            put("at", now)
        })
    }

    /** Session history follows Silent Focus being active (also while paused for a call). */
    private fun recordSession(context: Context, store: EngineStore, d: Decision, now: Long) {
        runCatching {
            val history = SessionStore(context)
            if (history.recordingSince == 0L) history.recordingSince = now
            history.update {
                SessionTracker.onEvaluate(it, store.owned, store.ownedSince, d.source?.name, d.activeRules, now)
            }
        }
    }

    /** Adds to the current session's counters (calls, replies). */
    fun countInSession(context: Context, counter: SessionCounter) {
        runCatching { SessionStore(context).update { SessionTracker.increment(it, counter) } }
    }

    /**
     * ZONE_ENTER/EXIT, SCHEDULE_/CALENDAR_STARTED/ENDED per rule occurrence.
     * Returns the occurrences that started and the sources of those that ended.
     */
    private fun journalRuleTransitions(
        store: EngineStore,
        d: Decision,
        reason: TriggerReason,
        now: Long,
    ): Pair<List<ActiveRule>, List<RuleSource>> {
        val before = store.lastRuleWindows
        val rules = d.activeRules + d.suppressedRules
        val (started, ended) = ActivityEvents.ruleTransitions(before, rules)
        if (started.isEmpty() && ended.isEmpty()) return started to emptyList()
        val endedSources = mutableListOf<RuleSource>()
        ended.forEach { key ->
            val (source, id) = ActivityEvents.parseWindowKey(key) ?: return@forEach
            endedSources += source
            store.appendEvent(JSONObject().apply {
                put("type", ActivityEvents.ruleEnded(source))
                put("source", source.name)
                put("ruleId", id)
                before[key]?.takeIf { it.isNotEmpty() }?.let { put("name", it) }
                put("reason", reason.name)
                put("at", now)
            })
        }
        started.forEach { rule ->
            store.appendEvent(JSONObject().apply {
                put("type", ActivityEvents.ruleStarted(rule.source))
                put("source", rule.source.name)
                put("ruleId", rule.ruleId)
                // Calendar occurrences never carry titles.
                if (rule.source != RuleSource.CALENDAR) rule.name?.let { put("name", it) }
                put("reason", reason.name)
                put("at", now)
            })
        }
        store.lastRuleWindows = ruleWindows(rules)
        return started to endedSources
    }

    private fun ruleWindows(rules: List<ActiveRule>) = rules.associate {
        it.windowKey to (if (it.source == RuleSource.CALENDAR) "" else it.name.orEmpty())
    }
}
