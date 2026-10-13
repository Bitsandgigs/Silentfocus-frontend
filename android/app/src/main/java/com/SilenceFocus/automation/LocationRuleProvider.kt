package com.SilenceFocus.automation

import java.util.TimeZone

/**
 * Silent Zones. Android geofencing decides whether the device is inside a
 * zone (see GeofenceEventReceiver); this provider only turns that persisted
 * presence into rules. A zone visit is open-ended: it lasts until an exit.
 *
 * [presence] maps zone id -> time of entry. The entry time is part of the
 * activation key, so a manual OFF suppresses this visit only; leaving and
 * re-entering the zone silences again.
 */
class LocationRuleProvider(
    private val zones: List<ZoneRule>,
    private val presence: Map<String, Long>,
    private val enabled: Boolean,
) : SilenceRuleProvider {

    override fun activeRules(nowMillis: Long, tz: TimeZone): List<ActiveRule> {
        if (!enabled) return emptyList()
        return zones
            .filter { it.enabled && it.isValid && presence.containsKey(it.id) }
            .map { zone ->
                ActiveRule(RuleSource.ZONE, zone.id, zone.name, presence.getValue(zone.id), null)
            }
    }

    /** Zone changes are events (geofence callbacks), not times. */
    override fun nextBoundaryAfter(nowMillis: Long, tz: TimeZone): Boundary? = null
}
