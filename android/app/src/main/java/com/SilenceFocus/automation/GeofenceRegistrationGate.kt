package com.SilenceFocus.automation

/**
 * Orders overlapping geofence registrations (pure; GeofenceRegistrar holds
 * one per process). Every registration or removal starts a new generation;
 * an async Play Services callback only applies if it belongs to the newest
 * one. A callback that lost the race may have re-added geofences after a
 * newer removal or replacement, so it asks for a forced re-sync - right away
 * if nothing newer is in flight, otherwise once the newest one has finished.
 */
class GeofenceRegistrationGate {

    enum class Outcome {
        /** Newest request: record its result. */
        APPLY,

        /** Newest request, but an older one may have left geofences behind: record, then re-sync. */
        APPLY_THEN_RESYNC,

        /** Older request while a newer registration is still running: ignore (re-sync follows). */
        STALE_DEFERRED,

        /** Older request and nothing newer in flight: ignore its result and re-sync now. */
        STALE_RESYNC_NOW,
    }

    private var generation = 0L
    private var inFlight: String? = null
    private var dirty = false

    /** A ticket for registering [signature], or null if that exact registration is already running. */
    @Synchronized
    fun beginRegister(signature: String): Long? {
        if (inFlight == signature) return null
        generation++
        inFlight = signature
        return generation
    }

    /** Geofences are being removed (disabled, no zones, no permission, logout). */
    @Synchronized
    fun beginRemoval() {
        generation++
        inFlight = null
    }

    /** Play Services answered (success or failure) for [ticket]. */
    @Synchronized
    fun finish(ticket: Long, succeeded: Boolean): Outcome {
        if (ticket == generation) {
            inFlight = null
            val resync = dirty
            dirty = false
            return if (resync) Outcome.APPLY_THEN_RESYNC else Outcome.APPLY
        }
        // A failed stale request added nothing; nothing to repair.
        if (!succeeded) return Outcome.STALE_DEFERRED
        return if (inFlight != null) {
            dirty = true
            Outcome.STALE_DEFERRED
        } else {
            Outcome.STALE_RESYNC_NOW
        }
    }
}
