package com.SilenceFocus.automation

// Pure data types for the automation engine. Nothing in this file (or in
// ScheduleRuleProvider / AutomationEvaluator) touches Android APIs, so the
// decision logic is covered by plain JVM unit tests.

/** Why the engine is being asked to re-evaluate. */
enum class TriggerReason {
    MANUAL_ON,
    MANUAL_OFF,
    SCHEDULE_START,
    SCHEDULE_END,
    SCHEDULE_CHANGED,
    OVERRIDE_EXPIRED,
    BOOT,
    TIME_CHANGED,
    TIMEZONE_CHANGED,
    APP_UPDATED,
    APP_RESUMED,
    PERMISSION_CHANGED,
    LOGOUT,
    ZONE_ENTER,
    ZONE_EXIT,
    ZONES_CHANGED,
    CALENDAR_SYNCED,
    SETTINGS_CHANGED,

    CALENDAR_START,
    CALENDAR_END,

    // Phase 4 break-through exceptions (a call pauses silencing; see Breakthrough).
    EMERGENCY_EXCEPTION,
    URGENT_CALL,
    BREAKTHROUGH_ENDED;

    companion object {
        fun parse(value: String?): TriggerReason =
            values().firstOrNull { it.name == value } ?: APP_RESUMED
    }
}

/**
 * Where a silence decision comes from. Higher priority wins when several
 * are active: Manual > Silent Zone / public place > Schedule / Calendar > Normal.
 */
enum class RuleSource(val priority: Int) {
    MANUAL(400),
    ZONE(300),
    /** Location Mode: a library or place of worship found nearby (PublicPlaces). */
    PLACE(300),
    CALENDAR(200),
    SCHEDULE(200),
}

/**
 * A weekly recurring silence window in device-local wall-clock time.
 * [days] uses ISO numbering (1 = Monday .. 7 = Sunday) and names the day the
 * window STARTS on. [endMinute] < [startMinute] means it ends the next day.
 * Equal start and end is invalid and never activates.
 */
data class ScheduleRule(
    val id: String,
    val startMinute: Int,
    val endMinute: Int,
    val days: Set<Int>,
    val enabled: Boolean,
    val name: String? = null,
) {
    val isValid: Boolean
        get() = startMinute in 0..1439 && endMinute in 0..1439 &&
            startMinute != endMinute && days.isNotEmpty() && days.all { it in 1..7 }
    val isOvernight: Boolean get() = endMinute < startMinute
}

/**
 * One concrete activation of a rule that is silencing the device now.
 * [windowEnd] is null when the end isn't known in advance (a zone lasts
 * until the geofence reports an exit).
 */
data class ActiveRule(
    val source: RuleSource,
    val ruleId: String,
    val name: String?,
    val windowStart: Long,
    val windowEnd: Long?,
) {
    /** Identifies this occurrence, so a manual OFF can suppress just it. */
    val windowKey: String get() = "${source.name}:$ruleId:$windowStart"
}

enum class BoundaryKind { START, END, OVERRIDE_EXPIRY, BREAKTHROUGH_END }

data class Boundary(val atMillis: Long, val kind: BoundaryKind) {
    /** Which rule type the boundary belongs to (log/reason labelling only;
     *  deliberately not part of equality). */
    var source: RuleSource? = null
}

fun Boundary.from(source: RuleSource): Boundary = also { it.source = source }

enum class OverrideMode { NONE, FORCE_ON, FORCE_OFF }

/**
 * Manual override semantics:
 *  - FORCE_ON: silent until the user turns it off (no expiry).
 *  - FORCE_OFF: the rule activations that were running when the user turned
 *    Silent Focus off ([suppressedWindows]: a schedule/calendar occurrence,
 *    or a zone visit identified by its entry time) are ignored for as long
 *    as they keep running; the override ends when none of them is running
 *    any more (or at [untilMillis], the latest known end). Activations that
 *    start later - the next occurrence, re-entering a zone - still apply.
 *  - NONE: rules decide.
 */
data class ManualOverride(
    val mode: OverrideMode = OverrideMode.NONE,
    val untilMillis: Long? = null,
    val suppressedWindows: Set<String> = emptySet(),
) {
    fun effectiveAt(nowMillis: Long): ManualOverride =
        if (untilMillis != null && nowMillis >= untilMillis) NONE else this

    companion object {
        val NONE = ManualOverride()
        val FORCE_ON = ManualOverride(OverrideMode.FORCE_ON)
    }
}

/** Output of one evaluation: what the device should be doing right now. */
data class Decision(
    val silent: Boolean,
    val source: RuleSource?,
    val activeRules: List<ActiveRule>,
    val suppressedRules: List<ActiveRule>,
    val override: ManualOverride,
    val nextBoundary: Boundary?,
    /** The next time a schedule or calendar window starts (what Home shows as
     *  "Next automatic silence"); unlike [nextBoundary] never an END. */
    val nextStart: Boundary? = null,
)

/**
 * Supplies silence rules of one kind. Phase 3 adds zone and calendar
 * providers by implementing this; the evaluator and DND code stay as they are.
 */
interface SilenceRuleProvider {
    fun activeRules(nowMillis: Long, tz: java.util.TimeZone): List<ActiveRule>

    /** The first time strictly after [nowMillis] when a rule starts or ends. */
    fun nextBoundaryAfter(nowMillis: Long, tz: java.util.TimeZone): Boundary?

    /** The first time strictly after [nowMillis] when a rule window starts. */
    fun nextStartAfter(nowMillis: Long, tz: java.util.TimeZone): Boundary? = null
}

/**
 * Break-through exceptions (emergency contacts > urgent repeat callers; see
 * comms/CallExceptions.kt). They are NOT silence rules and never enter the
 * evaluator: Silent Focus stays logically active and only the device-level
 * silencing is paused while the qualifying call rings ([Breakthrough]).
 */
interface BreakThroughExceptionProvider {
    val priority: Int
}

/**
 * A qualifying call is ringing: silencing is paused until the call stops
 * ringing (phone-state callback) or, as a safety net, [until]. The active
 * zone/schedule/calendar/manual state is untouched.
 */
data class Breakthrough(
    val kind: String,
    val since: Long,
    val until: Long,
) {
    fun activeAt(now: Long) = now in since until until

    companion object {
        /** Longest a single breakthrough can keep silencing paused. */
        const val MAX_MS = 90_000L
    }
}

enum class DeviceMode { NORMAL, SILENT, BREAKTHROUGH }

/** What the device should do, given the rules' decision and any breakthrough. */
fun deviceMode(decisionSilent: Boolean, breakthrough: Breakthrough?, now: Long): DeviceMode = when {
    !decisionSilent -> DeviceMode.NORMAL
    breakthrough?.activeAt(now) == true -> DeviceMode.BREAKTHROUGH
    else -> DeviceMode.SILENT
}

/** A Silent Zone as the engine needs it (normalised from the API in JS). */
data class ZoneRule(
    val id: String,
    val name: String?,
    val latitude: Double,
    val longitude: Double,
    val radiusMeters: Double,
    val enabled: Boolean,
) {
    val isValid: Boolean
        get() = id.isNotEmpty() && latitude in -90.0..90.0 && longitude in -180.0..180.0 &&
            radiusMeters > 0 && !(latitude == 0.0 && longitude == 0.0)
}

/**
 * One occurrence of a device-calendar event. Only what automation needs is
 * kept: the provider title plus no description, location or attendees. The
 * title remains device-local in [EngineStore] so a process restart can render
 * the same occurrence that owns DND; it is never journaled or uploaded. [key] is
 * "calendarId:eventId:occurrenceBegin", stable across syncs. For all-day
 * events [begin]/[end] are UTC midnights (as CalendarContract stores them)
 * and are mapped to local days at evaluation time.
 */
data class CalendarEvent(
    val key: String,
    val begin: Long,
    val end: Long,
    val allDay: Boolean,
    val title: String? = null,
)

/**
 * A public place (library / place of worship) near the device, from the
 * Places API. [id] is the Places id; only id, name and centre are kept.
 */
data class PublicPlace(
    val id: String,
    val name: String?,
    val latitude: Double,
    val longitude: Double,
) {
    val isValid: Boolean
        get() = id.isNotEmpty() && latitude in -90.0..90.0 && longitude in -180.0..180.0 &&
            !(latitude == 0.0 && longitude == 0.0)
}

/** User automation settings pushed from JS (backend settings + Control Center). */
data class AutomationSettings(
    /** Gates the user's own Silent Zones (name kept for stored settings). */
    val locationEnabled: Boolean = false,
    val calendarEnabled: Boolean = false,
    val calendarBeforeMinutes: Int = 0,
    val calendarAfterMinutes: Int = 0,
    val ignoreAllDayEvents: Boolean = true,
    /** Location Mode: silence at public places (PublicPlaces). */
    val publicPlacesEnabled: Boolean = false,
)
