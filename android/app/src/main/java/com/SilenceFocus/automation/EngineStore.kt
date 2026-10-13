package com.SilenceFocus.automation

import android.content.Context
import android.content.SharedPreferences
import com.SilenceFocus.comms.NotificationNames
import org.json.JSONArray
import org.json.JSONObject

/**
 * Native source of truth for automation, in app-private SharedPreferences
 * (survives JS reloads, process death and reboot; AsyncStorage is not used).
 */
class EngineStore(context: Context) {

    private val prefs: SharedPreferences =
        context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    // ---- Schedules (last copy pushed from JS; used offline and after boot)

    var schedules: List<ScheduleRule>
        get() = parseSchedules(prefs.getString(KEY_SCHEDULES, null))
        set(value) = prefs.edit().putString(KEY_SCHEDULES, schedulesToJson(value).toString()).apply()

    // ---- Silent Zones (last copy pushed from JS) and where the device is

    var zones: List<ZoneRule>
        get() = parseZones(prefs.getString(KEY_ZONES, null))
        set(value) = prefs.edit().putString(KEY_ZONES, zonesToJson(value).toString()).apply()

    /** Zone id -> entry time, from geofence callbacks. */
    var zonePresence: Map<String, Long>
        get() = prefs.getString(KEY_PRESENCE, null)?.let { raw ->
            runCatching {
                val o = JSONObject(raw)
                o.keys().asSequence().associateWith { o.getLong(it) }
            }.getOrNull()
        } ?: emptyMap()
        set(value) = prefs.edit().putString(KEY_PRESENCE, JSONObject(value as Map<*, *>).toString()).apply()

    /** GeofenceRegistrar outcome, e.g. REGISTERED / BACKGROUND_LOCATION_MISSING. */
    var geofenceStatus: String
        get() = prefs.getString(KEY_GEOFENCE_STATUS, null) ?: "NOT_CONFIGURED"
        set(value) = prefs.edit().putString(KEY_GEOFENCE_STATUS, value).apply()

    var geofenceRegisteredCount: Int
        get() = prefs.getInt(KEY_GEOFENCE_COUNT, 0)
        set(value) = prefs.edit().putInt(KEY_GEOFENCE_COUNT, value).apply()

    var geofenceSignature: String?
        get() = prefs.getString(KEY_GEOFENCE_SIGNATURE, null)
        set(value) = prefs.edit().putString(KEY_GEOFENCE_SIGNATURE, value).apply()

    // ---- Automation settings

    var settings: AutomationSettings
        get() = AutomationSettings(
            locationEnabled = prefs.getBoolean(KEY_SET_LOCATION, false),
            calendarEnabled = prefs.getBoolean(KEY_SET_CALENDAR, false),
            calendarBeforeMinutes = prefs.getInt(KEY_SET_BEFORE, 0),
            calendarAfterMinutes = prefs.getInt(KEY_SET_AFTER, 0),
            ignoreAllDayEvents = prefs.getBoolean(KEY_SET_IGNORE_ALL_DAY, true),
        )
        set(value) = prefs.edit()
            .putBoolean(KEY_SET_LOCATION, value.locationEnabled)
            .putBoolean(KEY_SET_CALENDAR, value.calendarEnabled)
            .putInt(KEY_SET_BEFORE, value.calendarBeforeMinutes)
            .putInt(KEY_SET_AFTER, value.calendarAfterMinutes)
            .putBoolean(KEY_SET_IGNORE_ALL_DAY, value.ignoreAllDayEvents)
            .apply()

    // ---- Cached device-calendar occurrences (no titles or other details)

    var calendarEvents: List<CalendarEvent>
        get() = parseEvents(prefs.getString(KEY_CAL_EVENTS, null))
        set(value) = prefs.edit().putString(KEY_CAL_EVENTS, eventsToJson(value).toString()).apply()

    var calendarStatus: String
        get() = prefs.getString(KEY_CAL_STATUS, null) ?: "NOT_CONFIGURED"
        set(value) = prefs.edit().putString(KEY_CAL_STATUS, value).apply()

    var calendarLastSync: Long
        get() = prefs.getLong(KEY_CAL_LAST_SYNC, 0L)
        set(value) = prefs.edit().putLong(KEY_CAL_LAST_SYNC, value).apply()

    /**
     * Round 3 (#4): device calendar ids that silence the phone; null = every
     * calendar visible in the phone's calendar app (default). Device-local,
     * never uploaded; cleared on logout with the other calendar settings.
     */
    var calendarSelection: Set<Long>?
        get() = parseIds(prefs.getString(KEY_CAL_SELECTION, null))
        set(value) = prefs.edit().apply {
            if (value == null) remove(KEY_CAL_SELECTION) else putString(KEY_CAL_SELECTION, JSONArray(value.sorted()).toString())
        }.apply()

    // ---- Manual override

    var override: ManualOverride
        get() {
            val mode = runCatching {
                OverrideMode.valueOf(prefs.getString(KEY_OVERRIDE_MODE, null) ?: "NONE")
            }.getOrDefault(OverrideMode.NONE)
            val until = prefs.getLong(KEY_OVERRIDE_UNTIL, -1L).takeIf { it >= 0 }
            val windows = prefs.getStringSet(KEY_OVERRIDE_WINDOWS, emptySet())?.toSet() ?: emptySet()
            return ManualOverride(mode, until, windows)
        }
        set(value) = prefs.edit()
            .putString(KEY_OVERRIDE_MODE, value.mode.name)
            .putLong(KEY_OVERRIDE_UNTIL, value.untilMillis ?: -1L)
            .putStringSet(KEY_OVERRIDE_WINDOWS, value.suppressedWindows)
            .apply()

    // ---- Device ownership / state to restore

    /** True while Silent Focus has changed the device and must restore it. */
    var owned: Boolean
        get() = prefs.getBoolean(KEY_OWNED, false)
        set(value) = prefs.edit().putBoolean(KEY_OWNED, value).apply()

    var ownedSince: Long
        get() = prefs.getLong(KEY_OWNED_SINCE, 0L)
        set(value) = prefs.edit().putLong(KEY_OWNED_SINCE, value).apply()

    var previousRingerMode: Int
        get() = prefs.getInt(KEY_PREV_RINGER, -1)
        set(value) = prefs.edit().putInt(KEY_PREV_RINGER, value).apply()

    var previousInterruptionFilter: Int
        get() = prefs.getInt(KEY_PREV_FILTER, -1)
        set(value) = prefs.edit().putInt(KEY_PREV_FILTER, value).apply()

    /** Filter we set on API < 29, so restore can tell if the user changed it. */
    var appliedInterruptionFilter: Int
        get() = prefs.getInt(KEY_APPLIED_FILTER, -1)
        set(value) = prefs.edit().putInt(KEY_APPLIED_FILTER, value).apply()

    var zenRuleId: String?
        get() = prefs.getString(KEY_ZEN_RULE_ID, null)
        set(value) = prefs.edit().putString(KEY_ZEN_RULE_ID, value).apply()

    /** Silencing is paused for a break-through call (Silent Focus stays owned). */
    var dndPaused: Boolean
        get() = prefs.getBoolean(KEY_DND_PAUSED, false)
        set(value) = prefs.edit().putBoolean(KEY_DND_PAUSED, value).apply()

    // ---- Break-through call in progress (survives process death)

    var breakthrough: Breakthrough?
        get() {
            val kind = prefs.getString(KEY_BT_KIND, null) ?: return null
            return Breakthrough(kind, prefs.getLong(KEY_BT_SINCE, 0L), prefs.getLong(KEY_BT_UNTIL, 0L))
        }
        set(value) {
            val e = prefs.edit()
            if (value == null) {
                e.remove(KEY_BT_KIND).remove(KEY_BT_SINCE).remove(KEY_BT_UNTIL)
            } else {
                e.putString(KEY_BT_KIND, value.kind).putLong(KEY_BT_SINCE, value.since).putLong(KEY_BT_UNTIL, value.until)
            }
            e.commit() // synchronous: a crash right after must not lose it
        }

    /** Rule occurrences active at the last evaluation: windowKey -> display name. */
    var lastRuleWindows: Map<String, String>
        get() = prefs.getStringSet(KEY_RULE_WINDOWS, emptySet()).orEmpty().associate {
            val i = it.indexOf(SEP)
            if (i < 0) it to "" else it.substring(0, i) to it.substring(i + 1)
        }
        set(value) = prefs.edit()
            .putStringSet(KEY_RULE_WINDOWS, value.map { "${it.key}$SEP${it.value}" }.toSet())
            .apply()

    // ---- Last evaluation (what the UI shows)

    var lastState: JSONObject?
        get() = prefs.getString(KEY_LAST_STATE, null)?.let { runCatching { JSONObject(it) }.getOrNull() }
        set(value) = prefs.edit().putString(KEY_LAST_STATE, value?.toString()).apply()

    // ---- Unified activity journal (bounded, local only). Never holds message
    // text, full phone numbers or contact lists; see ActivityEvents.

    /** Adds `id` and `category`; safe to call from any thread/component. */
    fun appendEvent(event: JSONObject) = synchronized(JOURNAL_LOCK) {
        val events = recentEvents()
        val at = event.optLong("at", System.currentTimeMillis())
        if (!event.has("id")) event.put("id", "$at-${(events.length() + 1)}-${event.optString("type")}")
        if (!event.has("category")) event.put("category", ActivityEvents.categoryOf(event.optString("type")))
        events.put(event)
        // Bounded by count and age (30 days), except entries still waiting
        // for the server to acknowledge them (ActivityEvents.retained).
        val all = (0 until events.length()).mapNotNull { events.optJSONObject(it) }
        val entries = all.map {
            ActivityEvents.JournalEntry(
                it.optString("type"), it.optLong("at", at), it.optBoolean("acked", false),
                it.optBoolean(ActivityEvents.SYNTHETIC_FIELD, false),
            )
        }
        val trimmed = JSONArray()
        ActivityEvents.retained(entries, at, MAX_EVENT_AGE_MS, MAX_EVENTS).forEach { trimmed.put(all[it]) }
        prefs.edit().putString(KEY_EVENTS, trimmed.toString()).apply()
    }

    /** The server acknowledged these entries (read back by JS): retention may drop them now. */
    fun markEventsAcknowledged(ids: Set<String>) = synchronized(JOURNAL_LOCK) {
        if (ids.isEmpty()) return@synchronized
        val events = recentEvents()
        var changed = false
        for (i in 0 until events.length()) {
            val e = events.optJSONObject(i) ?: continue
            if (e.optString("id") in ids && !e.optBoolean("acked", false)) {
                e.put("acked", true)
                changed = true
            }
        }
        if (changed) prefs.edit().putString(KEY_EVENTS, events.toString()).apply()
    }

    /** The journal without synthetic (test-harness) entries: the only input for server sync. */
    fun syncableEvents(): JSONArray {
        val events = recentEvents()
        val all = (0 until events.length()).map { events.optJSONObject(it) }
        val out = JSONArray()
        ActivityEvents.syncableIndices(all.map { it?.optBoolean(ActivityEvents.SYNTHETIC_FIELD, false) ?: true })
            .forEach { all[it]?.let(out::put) }
        return out
    }

    fun recentEvents(): JSONArray =
        prefs.getString(KEY_EVENTS, null)?.let { runCatching { JSONArray(it) }.getOrNull() } ?: JSONArray()

    /** Removes the journal entries in [clearableIds] (null = all); others, incl. newer ones, stay. */
    fun clearEvents(clearableIds: Set<String>? = null) = synchronized(JOURNAL_LOCK) {
        if (clearableIds == null) {
            prefs.edit().remove(KEY_EVENTS).apply()
            return@synchronized
        }
        val events = recentEvents()
        val ids = (0 until events.length()).map { events.optJSONObject(it)?.optString("id")?.ifEmpty { null } }
        val kept = JSONArray()
        ActivityEvents.keptAfterClear(ids, clearableIds).forEach { kept.put(events.get(it)) }
        prefs.edit().putString(KEY_EVENTS, kept.toString()).apply()
    }

    /** Logout: forget the user's rules and override (ownership is handled by the engine). */
    /** Server user id the local journal/session history belongs to (0 = unknown). */
    var historyOwner: Long
        get() = prefs.getLong(KEY_HISTORY_OWNER, 0L)
        set(value) = prefs.edit().putLong(KEY_HISTORY_OWNER, value).apply()

    /**
     * The journal as outbox entries (original JSON kept, minus the local-only
     * caller/sender names and message times, which an outbox never needs).
     */
    fun journalForOutbox(): List<Outbox.Event> {
        val events = recentEvents()
        return (0 until events.length()).mapNotNull { i ->
            val e = events.optJSONObject(i) ?: return@mapNotNull null
            val id = e.optString("id").ifEmpty { return@mapNotNull null }
            Outbox.Event(
                id, e.optString("type"), e.optLong("at"), e.optBoolean("acked", false), outboxJson(e).toString(),
                synthetic = e.optBoolean(ActivityEvents.SYNTHETIC_FIELD, false),
            )
        }
    }

    /**
     * Logout: forget the user's rules and override. [keepHistory]: keep the
     * journal (and its owner) - used when its pending data could not be
     * saved to the outbox, so nothing unsynced is destroyed.
     */
    fun clearUserData(keepHistory: Boolean) {
        clearUserData()
        if (keepHistory) return
        synchronized(JOURNAL_LOCK) { prefs.edit().remove(KEY_EVENTS).remove(KEY_HISTORY_OWNER).apply() }
    }

    /** Session expiry: this account's rules and override only; history and owner stay. */
    fun clearAutomationRules() = clearUserData()

    private fun clearUserData() {
        prefs.edit()
            .remove(KEY_SCHEDULES)
            .remove(KEY_ZONES)
            .remove(KEY_PRESENCE)
            .remove(KEY_GEOFENCE_STATUS)
            .remove(KEY_GEOFENCE_COUNT)
            .remove(KEY_GEOFENCE_SIGNATURE)
            .remove(KEY_SET_LOCATION)
            .remove(KEY_SET_CALENDAR)
            .remove(KEY_SET_BEFORE)
            .remove(KEY_SET_AFTER)
            .remove(KEY_SET_IGNORE_ALL_DAY)
            .remove(KEY_CAL_EVENTS)
            .remove(KEY_CAL_STATUS)
            .remove(KEY_CAL_LAST_SYNC)
            .remove(KEY_CAL_SELECTION)
            .remove(KEY_OVERRIDE_MODE)
            .remove(KEY_OVERRIDE_UNTIL)
            .remove(KEY_OVERRIDE_WINDOWS)
            .remove(KEY_RULE_WINDOWS)
            .remove(KEY_BT_KIND)
            .remove(KEY_BT_SINCE)
            .remove(KEY_BT_UNTIL)
            .apply()
    }

    companion object {
        private const val PREFS = "silent_focus_engine"
        private const val KEY_HISTORY_OWNER = "history_owner"
        private const val KEY_SCHEDULES = "schedules"
        private const val KEY_OVERRIDE_MODE = "override_mode"
        private const val KEY_OVERRIDE_UNTIL = "override_until"
        private const val KEY_OVERRIDE_WINDOWS = "override_windows"
        private const val KEY_OWNED = "owned"
        private const val KEY_OWNED_SINCE = "owned_since"
        private const val KEY_PREV_RINGER = "prev_ringer"
        private const val KEY_PREV_FILTER = "prev_filter"
        private const val KEY_APPLIED_FILTER = "applied_filter"
        private const val KEY_ZEN_RULE_ID = "zen_rule_id"
        private const val KEY_LAST_STATE = "last_state"
        private const val KEY_EVENTS = "events"
        const val MAX_EVENTS = 200
        const val MAX_EVENT_AGE_MS = 30L * 24 * 60 * 60 * 1000
        private const val KEY_DND_PAUSED = "dnd_paused"
        private const val KEY_BT_KIND = "breakthrough_kind"
        private const val KEY_BT_SINCE = "breakthrough_since"
        private const val KEY_BT_UNTIL = "breakthrough_until"
        private const val KEY_RULE_WINDOWS = "rule_windows"
        private const val SEP = '\u001F'
        private val JOURNAL_LOCK = Any()
        private const val KEY_ZONES = "zones"
        private const val KEY_PRESENCE = "zone_presence"
        private const val KEY_GEOFENCE_STATUS = "geofence_status"
        private const val KEY_GEOFENCE_COUNT = "geofence_count"
        private const val KEY_GEOFENCE_SIGNATURE = "geofence_signature"
        private const val KEY_SET_LOCATION = "set_location_enabled"
        private const val KEY_SET_CALENDAR = "set_calendar_enabled"
        private const val KEY_SET_BEFORE = "set_calendar_before"
        private const val KEY_SET_AFTER = "set_calendar_after"
        private const val KEY_SET_IGNORE_ALL_DAY = "set_ignore_all_day"
        private const val KEY_CAL_EVENTS = "calendar_events"
        private const val KEY_CAL_STATUS = "calendar_status"
        private const val KEY_CAL_LAST_SYNC = "calendar_last_sync"
        private const val KEY_CAL_SELECTION = "calendar_selection"

        /** "[1,2]" -> {1, 2}; null / malformed -> null (all calendars). */
        fun parseIds(json: String?): Set<Long>? {
            val arr = json?.let { runCatching { JSONArray(it) }.getOrNull() } ?: return null
            return (0 until arr.length()).mapNotNull { i -> arr.optLong(i, -1L).takeIf { it >= 0 } }.toSet()
        }

        /** A copy of journal entry [e] without the fields that stay on this phone only. */
        fun outboxJson(e: JSONObject): JSONObject = JSONObject(e.toString()).apply {
            NotificationNames.LOCAL_ONLY_FIELDS.forEach { remove(it) }
        }

        fun zonesToJson(zones: List<ZoneRule>): JSONArray = JSONArray().apply {
            zones.forEach { z ->
                put(JSONObject().apply {
                    put("id", z.id)
                    z.name?.let { put("name", it) }
                    put("lat", z.latitude)
                    put("lng", z.longitude)
                    put("radius", z.radiusMeters)
                    put("enabled", z.enabled)
                })
            }
        }

        fun parseZones(json: String?): List<ZoneRule> {
            val arr = json?.let { runCatching { JSONArray(it) }.getOrNull() } ?: return emptyList()
            return (0 until arr.length()).mapNotNull { i ->
                val o = arr.optJSONObject(i) ?: return@mapNotNull null
                ZoneRule(
                    id = o.optString("id"),
                    name = if (o.has("name")) o.optString("name") else null,
                    latitude = o.optDouble("lat", Double.NaN),
                    longitude = o.optDouble("lng", Double.NaN),
                    radiusMeters = o.optDouble("radius", 0.0),
                    enabled = o.optBoolean("enabled", false),
                ).takeIf { it.id.isNotEmpty() }
            }
        }

        fun eventsToJson(events: List<CalendarEvent>): JSONArray = JSONArray().apply {
            events.forEach { e ->
                put(JSONObject().put("k", e.key).put("b", e.begin).put("e", e.end).put("a", e.allDay))
            }
        }

        fun parseEvents(json: String?): List<CalendarEvent> {
            val arr = json?.let { runCatching { JSONArray(it) }.getOrNull() } ?: return emptyList()
            return (0 until arr.length()).mapNotNull { i ->
                val o = arr.optJSONObject(i) ?: return@mapNotNull null
                CalendarEvent(o.optString("k"), o.optLong("b"), o.optLong("e"), o.optBoolean("a"))
                    .takeIf { it.key.isNotEmpty() }
            }
        }

        fun schedulesToJson(rules: List<ScheduleRule>): JSONArray = JSONArray().apply {
            rules.forEach { r ->
                put(JSONObject().apply {
                    put("id", r.id)
                    put("startMinute", r.startMinute)
                    put("endMinute", r.endMinute)
                    put("days", JSONArray(r.days.sorted()))
                    put("enabled", r.enabled)
                    r.name?.let { put("name", it) }
                })
            }
        }

        fun parseSchedules(json: String?): List<ScheduleRule> {
            if (json.isNullOrEmpty()) return emptyList()
            val arr = runCatching { JSONArray(json) }.getOrNull() ?: return emptyList()
            return (0 until arr.length()).mapNotNull { i ->
                val o = arr.optJSONObject(i) ?: return@mapNotNull null
                val days = o.optJSONArray("days")
                ScheduleRule(
                    id = o.optString("id"),
                    startMinute = o.optInt("startMinute", -1),
                    endMinute = o.optInt("endMinute", -1),
                    days = days?.let { d -> (0 until d.length()).map { d.optInt(it) }.toSet() } ?: emptySet(),
                    enabled = o.optBoolean("enabled", false),
                    name = if (o.has("name")) o.optString("name") else null,
                ).takeIf { it.id.isNotEmpty() }
            }
        }
    }
}
