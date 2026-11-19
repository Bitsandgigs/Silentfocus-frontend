package com.SilenceFocus.automation

/**
 * What the user's plan allows on this phone. The server owns the plan; JS pushes its limits here
 * ([EngineStore.setEntitlements]) so muting, which runs offline and in the background, can honour them.
 * A limit of null means unlimited, 0 means the feature is locked.
 *
 * [untilMillis] > 0 is the moment the entitlement lapses by itself (end of the free trial or of the paid period
 * plus the server's grace): after it, and until the app refreshes the plan, the Free limits apply, so a phone that
 * stays offline cannot keep premium features forever.
 */
data class PlanLimits(
    val calendars: Int?,
    val zones: Int?,
    /** Automatic reply texts (0 = automatic replies locked). */
    val replies: Int?,
    /** Messaging apps that may be auto-replied to. */
    val apps: Int?,
    val suggestions: Int?,
)

object Entitlements {
    val UNLIMITED = PlanLimits(null, null, null, null, null)
    val FREE = PlanLimits(0, 0, 0, 0, 0)

    /** Before the first sync from the server nothing is restricted, so existing behaviour never regresses. */
    fun effective(stored: PlanLimits?, untilMillis: Long, now: Long): PlanLimits = when {
        stored == null -> UNLIMITED
        untilMillis > 0 && now > untilMillis -> FREE
        else -> stored
    }

    /** "calendars,zones,replies,apps,suggestions"; "n" = unlimited (plain text so it needs no JSON library). */
    fun parse(text: String?): PlanLimits? {
        val parts = text?.split(',') ?: return null
        if (parts.size != 5) return null
        val values = parts.map { part ->
            when {
                part == "n" -> null
                else -> part.toIntOrNull()?.coerceAtLeast(0) ?: return null
            }
        }
        return PlanLimits(values[0], values[1], values[2], values[3], values[4])
    }

    fun toJson(l: PlanLimits): String =
        listOf(l.calendars, l.zones, l.replies, l.apps, l.suggestions).joinToString(",") { it?.toString() ?: "n" }

    fun calendarsAllowed(l: PlanLimits) = l.calendars != 0
    fun zonesAllowed(l: PlanLimits) = l.zones != 0
    fun autoReplyAllowed(l: PlanLimits) = l.replies != 0

    /** Suggested Silent Zones: a plan allows only so many suggestions in total (null = unlimited, 0 = none). */
    fun suggestionAllowed(l: PlanLimits, alreadyShown: Int) = l.suggestions == null || alreadyShown < l.suggestions

    /** The first [PlanLimits.zones] zones (lowest id first, as geofences are registered); all when unlimited. */
    fun capZones(zones: List<ZoneRule>, l: PlanLimits): List<ZoneRule> {
        val cap = l.zones ?: return zones
        return zones.sortedWith(compareBy<ZoneRule>({ it.id.toLongOrNull() ?: Long.MAX_VALUE }, { it.id })).take(cap)
    }

    /**
     * Unlimited apps: every messaging app. Otherwise only the apps the user picked, up to the limit (a picked
     * list longer than the limit, e.g. after a downgrade, only honours its first entries).
     */
    fun appAllowed(l: PlanLimits, packageName: String, chosen: List<String>): Boolean {
        val cap = l.apps ?: return true
        return cap > 0 && chosen.take(cap).contains(packageName)
    }
}
