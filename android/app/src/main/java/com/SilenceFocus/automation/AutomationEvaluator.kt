package com.SilenceFocus.automation

import java.util.TimeZone

/**
 * Decides whether the device should be silent. Every trigger (manual tap,
 * schedule boundary, boot, clock change...) re-runs [evaluate] over ALL
 * rules, so e.g. the end of one schedule never ends silence while an
 * overlapping one is still running.
 */
class AutomationEvaluator(private val providers: List<SilenceRuleProvider>) {

    fun evaluate(nowMillis: Long, tz: TimeZone, override: ManualOverride): Decision {
        val all = providers.flatMap { it.activeRules(nowMillis, tz) }
            .sortedByDescending { it.source.priority }
        // A manual OFF lasts only while something it suppressed is still
        // running (e.g. until the user leaves the zone they were in).
        var effective = override.effectiveAt(nowMillis)
        if (effective.mode == OverrideMode.FORCE_OFF &&
            all.none { it.windowKey in effective.suppressedWindows }
        ) {
            effective = ManualOverride.NONE
        }
        val (suppressed, active) = if (effective.mode == OverrideMode.FORCE_OFF) {
            all.partition { it.windowKey in effective.suppressedWindows }
        } else {
            emptyList<ActiveRule>() to all
        }

        val (silent, source) = when (effective.mode) {
            OverrideMode.FORCE_ON -> true to RuleSource.MANUAL
            else -> if (active.isNotEmpty()) true to active.first().source else false to null
        }

        val candidates = providers.mapNotNull { it.nextBoundaryAfter(nowMillis, tz) } +
            listOfNotNull(effective.untilMillis?.let { Boundary(it, BoundaryKind.OVERRIDE_EXPIRY) })

        return Decision(
            silent = silent,
            source = source,
            activeRules = active,
            suppressedRules = suppressed,
            override = effective,
            nextBoundary = candidates.minByOrNull { it.atMillis },
        )
    }

    /**
     * Override to store when the user turns Silent Focus OFF at [nowMillis]:
     * suppress the rule occurrences active right now until the last of them
     * ends; with nothing active, just clear any override.
     */
    fun manualOffOverride(nowMillis: Long, tz: TimeZone): ManualOverride {
        val active = providers.flatMap { it.activeRules(nowMillis, tz) }
        if (active.isEmpty()) return ManualOverride.NONE
        // Open-ended activations (zones) have no end time; the override is
        // then cleared by evaluate() once they stop, not by a timer.
        val until = if (active.any { it.windowEnd == null }) null else active.maxOf { it.windowEnd!! }
        return ManualOverride(
            mode = OverrideMode.FORCE_OFF,
            untilMillis = until,
            suppressedWindows = active.map { it.windowKey }.toSet(),
        )
    }
}
