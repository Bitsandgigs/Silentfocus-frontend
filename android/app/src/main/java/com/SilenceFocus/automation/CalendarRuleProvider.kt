package com.SilenceFocus.automation

import java.util.Calendar
import java.util.TimeZone

/**
 * Device-calendar occurrences as dated silence windows (never weekly rules):
 * a one-off Wednesday meeting silences that Wednesday only. Recurring events
 * arrive already expanded into occurrences by CalendarContract.Instances.
 *
 * Effective window = [begin - before, end + after). Timed events are
 * absolute instants, so DST and timezone changes don't move them. All-day
 * events are local calendar days: their UTC-midnight bounds are mapped to
 * midnights in the evaluation timezone.
 */
class CalendarRuleProvider(
    private val events: List<CalendarEvent>,
    private val settings: AutomationSettings,
) : SilenceRuleProvider {

    private fun usable(): List<CalendarEvent> =
        if (!settings.calendarEnabled) emptyList()
        else events.filter { it.end > it.begin && !(it.allDay && settings.ignoreAllDayEvents) }

    fun effectiveWindow(event: CalendarEvent, tz: TimeZone): Pair<Long, Long> {
        val (start, end) = if (event.allDay) {
            utcMidnightToLocal(event.begin, tz) to utcMidnightToLocal(event.end, tz)
        } else {
            event.begin to event.end
        }
        return (start - settings.calendarBeforeMinutes.coerceAtLeast(0) * MINUTE) to
            (end + settings.calendarAfterMinutes.coerceAtLeast(0) * MINUTE)
    }

    override fun activeRules(nowMillis: Long, tz: TimeZone): List<ActiveRule> =
        usable().mapNotNull { e ->
            val (start, end) = effectiveWindow(e, tz)
            if (nowMillis in start until end) {
                ActiveRule(RuleSource.CALENDAR, e.key, null, start, end)
            } else {
                null
            }
        }

    override fun nextBoundaryAfter(nowMillis: Long, tz: TimeZone): Boundary? {
        var best: Boundary? = null
        for (e in usable()) {
            val (start, end) = effectiveWindow(e, tz)
            if (start > nowMillis && (best == null || start < best.atMillis)) best = Boundary(start, BoundaryKind.START)
            if (end > nowMillis && (best == null || end < best.atMillis)) best = Boundary(end, BoundaryKind.END)
        }
        return best?.from(RuleSource.CALENDAR)
    }

    override fun nextStartAfter(nowMillis: Long, tz: TimeZone): Boundary? =
        usable().map { effectiveWindow(it, tz).first }
            .filter { it > nowMillis }
            .minOrNull()
            ?.let { Boundary(it, BoundaryKind.START).from(RuleSource.CALENDAR) }

    companion object {
        private const val MINUTE = 60_000L
        private val UTC: TimeZone = TimeZone.getTimeZone("UTC")

        fun utcMidnightToLocal(utcMillis: Long, tz: TimeZone): Long {
            val utc = Calendar.getInstance(UTC).apply { timeInMillis = utcMillis }
            return Calendar.getInstance(tz).apply {
                clear()
                set(utc.get(Calendar.YEAR), utc.get(Calendar.MONTH), utc.get(Calendar.DAY_OF_MONTH), 0, 0, 0)
            }.timeInMillis
        }
    }
}
