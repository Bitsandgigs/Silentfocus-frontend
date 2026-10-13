package com.SilenceFocus.learning

import com.SilenceFocus.automation.ZoneRule
import java.util.Calendar
import java.util.TimeZone
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.roundToLong
import kotlin.math.sin
import kotlin.math.sqrt

// Smart Location Learning: when the user keeps turning Silent Focus on by
// hand at the same place, suggest (never create) a Silent Zone there.
// Pure Kotlin, covered by JVM tests. Only manual activations feed it (see
// LearningCapture, called from AutomationEngine.setManual).

/** One location fix taken right after a manual Silent ON. */
data class LocationFix(val latitude: Double, val longitude: Double, val accuracyMeters: Float, val at: Long)

/** A counted manual activation at a learned place. [good] = accuracy <= 50 m. */
data class LearnedVisit(val at: Long, val good: Boolean)

/**
 * A learned place: an approximate centre (rounded to ~11 m), the times of
 * the manual activations counted there, and the user's responses.
 */
data class LearnedPlace(
    val id: String,
    val latitude: Double,
    val longitude: Double,
    /** Sum of sample weights behind the centre (good = 1, fair = 0.5). */
    val weight: Double,
    val visits: List<LearnedVisit>,
    val dismissals: Int = 0,
    val suppressedUntil: Long = 0L,
    val lastSuggestedAt: Long = 0L,
    /** Dismissed twice: never suggested again until learned data is cleared. */
    val stopped: Boolean = false,
)

data class LearningConfig(
    val clusterRadiusMeters: Double = 100.0,
    val goodAccuracyMeters: Float = 50f,
    val maxAccuracyMeters: Float = 100f,
    val minVisits: Int = 3,
    val minDistinctDays: Int = 2,
    val windowDays: Int = 30,
    val suppressDays: Int = 30,
    /** A place that was suggested (e.g. "Create" tapped but not saved) waits this long. */
    val resuggestDays: Int = 7,
    val maxPlaces: Int = 20,
    val maxStoppedPlaces: Int = 20,
    val maxVisitsPerPlace: Int = 30,
    /** Suggested zone radius. */
    val suggestedRadiusMeters: Int = 150,
) {
    val windowMs get() = windowDays * DAY_MS
    companion object {
        const val DAY_MS = 24L * 60 * 60 * 1000
    }
}

enum class SampleResult { RECORDED, NEW_PLACE, DISABLED, INACCURATE, INSIDE_ZONE }

class SmartLocationLearner(private val config: LearningConfig = LearningConfig()) {

    data class Recorded(val places: List<LearnedPlace>, val result: SampleResult, val placeId: String?)

    /**
     * Counts one manual activation. Ignored when learning is off, the fix is
     * worse than 100 m, or the device is already inside an enabled zone.
     */
    fun record(
        places: List<LearnedPlace>,
        fix: LocationFix,
        zones: List<ZoneRule>,
        enabled: Boolean,
        newId: () -> String,
    ): Recorded {
        if (!enabled) return Recorded(places, SampleResult.DISABLED, null)
        if (!fix.accuracyMeters.isFinite() || fix.accuracyMeters <= 0f || fix.accuracyMeters > config.maxAccuracyMeters) {
            return Recorded(places, SampleResult.INACCURATE, null)
        }
        if (insideEnabledZone(fix.latitude, fix.longitude, zones)) {
            return Recorded(places, SampleResult.INSIDE_ZONE, null)
        }
        val good = fix.accuracyMeters <= config.goodAccuracyMeters
        val w = if (good) 1.0 else 0.5
        val current = prune(places, fix.at)
        val nearest = current
            .map { it to distanceMeters(it.latitude, it.longitude, fix.latitude, fix.longitude) }
            .filter { it.second <= config.clusterRadiusMeters }
            .minByOrNull { it.second }?.first

        if (nearest == null) {
            val place = LearnedPlace(
                id = newId(),
                latitude = round4(fix.latitude),
                longitude = round4(fix.longitude),
                weight = w,
                visits = listOf(LearnedVisit(fix.at, good)),
            )
            return Recorded(capPlaces(current + place), SampleResult.NEW_PLACE, place.id)
        }

        // Weighted centre: one noisy fix moves it only a little.
        val total = nearest.weight + w
        var updated = nearest.copy(
            latitude = round4((nearest.latitude * nearest.weight + fix.latitude * w) / total),
            longitude = round4((nearest.longitude * nearest.weight + fix.longitude * w) / total),
            weight = minOf(total, config.maxVisitsPerPlace.toDouble()),
            visits = (nearest.visits + LearnedVisit(fix.at, good)).takeLast(config.maxVisitsPerPlace),
        )
        var others = current.filterNot { it.id == nearest.id }
        // If the centre drifted next to another active place, merge them.
        others.filter { !it.stopped && distanceMeters(it.latitude, it.longitude, updated.latitude, updated.longitude) <= config.clusterRadiusMeters }
            .forEach { other ->
                updated = merge(updated, other)
                others = others.filterNot { it.id == other.id }
            }
        return Recorded(capPlaces(others + updated), SampleResult.RECORDED, updated.id)
    }

    /** 3+ activations within 30 days on 2+ different days, at least one accurate. */
    fun isEligible(place: LearnedPlace, now: Long, tz: TimeZone): Boolean {
        val recent = place.visits.filter { it.at > now - config.windowMs && it.at <= now }
        if (recent.size < config.minVisits) return false
        if (recent.none { it.good }) return false
        return recent.map { localDay(it.at, tz) }.toSet().size >= config.minDistinctDays
    }

    /** Whether [place] may be suggested right now (eligible and not held back). */
    fun canSuggest(place: LearnedPlace, zones: List<ZoneRule>, now: Long, tz: TimeZone): Boolean =
        !place.stopped &&
            now >= place.suppressedUntil &&
            (place.lastSuggestedAt == 0L || now - place.lastSuggestedAt >= config.resuggestDays * LearningConfig.DAY_MS) &&
            !insideEnabledZone(place.latitude, place.longitude, zones) &&
            isEligible(place, now, tz)

    fun markSuggested(places: List<LearnedPlace>, id: String, now: Long) =
        places.map { if (it.id == id) it.copy(lastSuggestedAt = now) else it }

    /** "Not now": 30-day pause; the second time, stop suggesting this place. */
    fun dismiss(places: List<LearnedPlace>, id: String, now: Long) = places.map {
        if (it.id != id) {
            it
        } else {
            val n = it.dismissals + 1
            it.copy(
                dismissals = n,
                stopped = n >= 2,
                suppressedUntil = if (n >= 2) Long.MAX_VALUE else now + config.suppressDays * LearningConfig.DAY_MS,
            )
        }
    }

    /** A zone was created from the suggestion: the learned place is done. */
    fun resolve(places: List<LearnedPlace>, id: String) = places.filterNot { it.id == id }

    /**
     * Drops visits older than the window and places with none left. Places
     * the user answered are kept without visits so their state survives:
     * stopped ones until learned data is cleared, dismissed ones for
     * [DISMISSAL_MEMORY_DAYS] after the pause ends (so a second "Not now"
     * still stops them).
     */
    fun prune(places: List<LearnedPlace>, now: Long): List<LearnedPlace> {
        val trimmed = places.mapNotNull { p ->
            val visits = p.visits.filter { it.at > now - config.windowMs && it.at <= now }
            when {
                visits.isNotEmpty() -> p.copy(visits = visits)
                p.stopped -> p.copy(visits = emptyList())
                p.dismissals > 0 && now < p.suppressedUntil + DISMISSAL_MEMORY_DAYS * LearningConfig.DAY_MS ->
                    p.copy(visits = emptyList())
                else -> null
            }
        }
        return capPlaces(trimmed)
    }

    private fun capPlaces(places: List<LearnedPlace>): List<LearnedPlace> {
        // Dormant = answered places without recent visits; capped separately
        // so they can't push out places that are being learned.
        val (dormant, active) = places.partition { it.stopped || it.visits.isEmpty() }
        val keptActive = active.sortedByDescending { p -> p.visits.maxOfOrNull { it.at } ?: 0L }.take(config.maxPlaces)
        val keptDormant = dormant.sortedByDescending { maxOf(it.lastSuggestedAt, minOf(it.suppressedUntil, Long.MAX_VALUE / 2)) }
            .take(config.maxStoppedPlaces)
        return keptActive + keptDormant
    }

    private fun merge(a: LearnedPlace, b: LearnedPlace): LearnedPlace {
        val total = a.weight + b.weight
        return a.copy(
            latitude = round4((a.latitude * a.weight + b.latitude * b.weight) / total),
            longitude = round4((a.longitude * a.weight + b.longitude * b.weight) / total),
            weight = minOf(total, config.maxVisitsPerPlace.toDouble()),
            visits = (a.visits + b.visits).sortedBy { it.at }.takeLast(config.maxVisitsPerPlace),
            dismissals = maxOf(a.dismissals, b.dismissals),
            suppressedUntil = maxOf(a.suppressedUntil, b.suppressedUntil),
            lastSuggestedAt = maxOf(a.lastSuggestedAt, b.lastSuggestedAt),
        )
    }

    fun insideEnabledZone(lat: Double, lng: Double, zones: List<ZoneRule>): Boolean =
        zones.any { z ->
            z.enabled && z.isValid &&
                distanceMeters(z.latitude, z.longitude, lat, lng) <= maxOf(z.radiusMeters, MIN_ZONE_RADIUS)
        }

    private fun localDay(at: Long, tz: TimeZone): Int {
        val c = Calendar.getInstance(tz).apply { timeInMillis = at }
        return c.get(Calendar.YEAR) * 1000 + c.get(Calendar.DAY_OF_YEAR)
    }

    companion object {
        const val DISMISSAL_MEMORY_DAYS = 150L

        /** Same widening the geofence registrar applies to small zones. */
        const val MIN_ZONE_RADIUS = 100.0

        fun round4(v: Double) = (v * 10_000).roundToLong() / 10_000.0

        fun distanceMeters(lat1: Double, lng1: Double, lat2: Double, lng2: Double): Double {
            val r = 6_371_000.0
            val dLat = Math.toRadians(lat2 - lat1)
            val dLng = Math.toRadians(lng2 - lng1)
            val a = sin(dLat / 2) * sin(dLat / 2) +
                cos(Math.toRadians(lat1)) * cos(Math.toRadians(lat2)) * sin(dLng / 2) * sin(dLng / 2)
            return 2 * r * atan2(sqrt(a), sqrt(1 - a))
        }
    }
}
