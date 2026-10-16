package com.SilenceFocus.automation

import java.util.TimeZone

/**
 * Location Mode: a public place silences once the device has been inside it
 * for [PublicPlaces.DWELL_MS] (since its geofence ENTER) and until it leaves
 * (EXIT). The end of that wait is a boundary, so the engine's alarm
 * re-evaluates exactly then; passing by (EXIT before the wait is over)
 * never silences. Play Services' own DWELL is not used: it can take 10+
 * minutes or not fire at all on some devices.
 */
class PublicPlaceRuleProvider(
    private val places: List<PublicPlace>,
    /** Place id -> geofence ENTER time. */
    private val entered: Map<String, Long>,
    private val enabled: Boolean,
) : SilenceRuleProvider {

    private fun visits(): List<Pair<PublicPlace, Long>> =
        if (!enabled) emptyList()
        else places.filter { it.isValid }.mapNotNull { p -> entered[p.id]?.let { p to it + PublicPlaces.DWELL_MS } }

    override fun activeRules(nowMillis: Long, tz: TimeZone): List<ActiveRule> =
        visits().filter { (_, silenceFrom) -> silenceFrom <= nowMillis }
            .map { (place, silenceFrom) -> ActiveRule(RuleSource.PLACE, place.id, place.name, silenceFrom, null) }

    /** When the next place the device is in has been waited out. */
    override fun nextBoundaryAfter(nowMillis: Long, tz: TimeZone): Boundary? =
        visits().map { it.second }.filter { it > nowMillis }.minOrNull()
            ?.let { Boundary(it, BoundaryKind.START).from(RuleSource.PLACE) }
}
