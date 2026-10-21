package com.SilenceFocus.automation

import android.provider.CalendarContract

/**
 * Calendar titles are normalized once from CalendarContract.Instances and
 * carried only in the device-local occurrence cache. This keeps the status
 * notification and React Native state on the same occurrence that owns DND;
 * titles are never journaled or uploaded. Empty or unreadable titles show the
 * plain "Calendar event".
 */
object CalendarTitles {

    data class EventInfo(val calendarId: Long, val title: String?, val accessLevel: Int)

    /** "calendarId:eventId:begin" -> (calendarId, eventId), or null. */
    fun parseKey(key: String): Pair<Long, Long>? {
        val parts = key.split(':')
        if (parts.size != 3) return null
        val cal = parts[0].toLongOrNull() ?: return null
        val ev = parts[1].toLongOrNull() ?: return null
        return cal to ev
    }

    /** A title that may be shown, or null (private / confidential / blank). */
    fun shownTitle(info: EventInfo?, expectedCalendarId: Long): String? {
        if (info == null || info.calendarId != expectedCalendarId) return null
        if (info.accessLevel == CalendarContract.Events.ACCESS_PRIVATE ||
            info.accessLevel == CalendarContract.Events.ACCESS_CONFIDENTIAL
        ) return null
        return normalize(info.title)
    }

    /** Provider title made safe for a compact notification / Home status. */
    fun normalize(title: String?): String? =
        title?.replace(Regex("\\s+"), " ")?.trim()?.take(MAX_TITLE)?.takeIf { it.isNotEmpty() }

    /**
     * The event to name when several silence at once: the one that started
     * last (the meeting the user most likely just joined); ties keep the
     * engine's order. Returns its key and how many others are active.
     */
    fun primary(active: List<ActiveRule>): Pair<String, Int>? {
        val cal = active.filter { it.source == RuleSource.CALENDAR }
        val pick = cal.maxByOrNull { it.windowStart } ?: return null
        return pick.ruleId to (cal.size - 1)
    }

    /** "Project Meeting", "Project Meeting +1 more", or null when no title may be shown. */
    fun label(title: String?, others: Int): String? =
        title?.let { if (others > 0) "$it +$others more" else it }

    /**
     * Label from the already-selected provider occurrence. This deliberately
     * does not re-query Events: an event id can have several Instances and a
     * second query can select metadata different from the occurrence owning
     * DND.
     */
    fun labelFor(active: List<ActiveRule>): String? {
        val (key, others) = primary(active) ?: return null
        return label(active.firstOrNull { it.source == RuleSource.CALENDAR && it.ruleId == key }?.name, others)
    }

    private const val MAX_TITLE = 80
}
