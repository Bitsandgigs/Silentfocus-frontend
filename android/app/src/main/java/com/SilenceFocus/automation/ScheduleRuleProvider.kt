package com.SilenceFocus.automation

import java.util.Calendar
import java.util.TimeZone

/**
 * Weekly schedules. Times are device-local wall-clock times in the zone
 * passed in, so a timezone change moves the absolute instants with it
 * (09:00 stays 09:00 local). DST gaps/overlaps follow java.util.Calendar's
 * lenient resolution.
 */
class ScheduleRuleProvider(private val rules: List<ScheduleRule>) : SilenceRuleProvider {

    private val usable: List<ScheduleRule> get() = rules.filter { it.enabled && it.isValid }

    override fun activeRules(nowMillis: Long, tz: TimeZone): List<ActiveRule> =
        usable.mapNotNull { rule ->
            // An occurrence that started today or yesterday (overnight) may
            // still be running.
            (0 downTo -1).asSequence()
                .mapNotNull { offset -> occurrence(rule, nowMillis, tz, offset) }
                .firstOrNull { (start, end) -> nowMillis in start until end }
                ?.let { (start, end) ->
                    ActiveRule(RuleSource.SCHEDULE, rule.id, rule.name, start, end)
                }
        }

    override fun nextBoundaryAfter(nowMillis: Long, tz: TimeZone): Boundary? {
        var best: Boundary? = null
        for (rule in usable) {
            for (offset in -1..8) {
                val (start, end) = occurrence(rule, nowMillis, tz, offset) ?: continue
                if (start > nowMillis && (best == null || start < best.atMillis)) {
                    best = Boundary(start, BoundaryKind.START)
                }
                if (end > nowMillis && (best == null || end < best.atMillis)) {
                    best = Boundary(end, BoundaryKind.END)
                }
            }
        }
        return best?.from(RuleSource.SCHEDULE)
    }

    override fun nextStartAfter(nowMillis: Long, tz: TimeZone): Boundary? =
        usable.flatMap { rule -> (0..8).mapNotNull { occurrence(rule, nowMillis, tz, it)?.first } }
            .filter { it > nowMillis }
            .minOrNull()
            ?.let { Boundary(it, BoundaryKind.START).from(RuleSource.SCHEDULE) }

    /**
     * The occurrence of [rule] starting on the day [dayOffset] days from the
     * day containing [nowMillis], or null if the rule doesn't run that day.
     */
    private fun occurrence(
        rule: ScheduleRule,
        nowMillis: Long,
        tz: TimeZone,
        dayOffset: Int,
    ): Pair<Long, Long>? {
        val day = Calendar.getInstance(tz).apply {
            timeInMillis = nowMillis
            add(Calendar.DAY_OF_MONTH, dayOffset)
        }
        if (isoDayOfWeek(day) !in rule.days) return null
        val start = atMinute(day, rule.startMinute, 0)
        val end = atMinute(day, rule.endMinute, if (rule.isOvernight) 1 else 0)
        return start to end
    }

    private fun atMinute(day: Calendar, minuteOfDay: Int, plusDays: Int): Long =
        (day.clone() as Calendar).apply {
            add(Calendar.DAY_OF_MONTH, plusDays)
            set(Calendar.HOUR_OF_DAY, minuteOfDay / 60)
            set(Calendar.MINUTE, minuteOfDay % 60)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
        }.timeInMillis

    companion object {
        /** 1 = Monday .. 7 = Sunday. */
        fun isoDayOfWeek(cal: Calendar): Int {
            val d = cal.get(Calendar.DAY_OF_WEEK)
            return if (d == Calendar.SUNDAY) 7 else d - 1
        }
    }
}
