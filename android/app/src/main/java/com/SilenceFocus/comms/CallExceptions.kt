package com.SilenceFocus.comms

import com.SilenceFocus.automation.BreakThroughExceptionProvider

// Break-through exceptions (Phase 4). They are NOT silence rules: they never
// start or end Silent Focus. A qualifying incoming call only pauses the
// device-level silencing for the duration of that call (see
// AutomationEngine.startBreakthrough). Pure Kotlin, covered by JVM tests.

/** A user-picked emergency contact. [number] is normalised (PhoneNumbers.normalize). */
data class EmergencyContact(
    val id: String,
    val name: String?,
    val number: String,
)

/**
 * Call-exception settings. The urgent-caller rule is the product rule, not
 * Android's built-in "repeat callers" (which uses 2 calls / 15 min):
 *  - calls from the same caller are counted only while Silent Focus is
 *    silencing the device, only incoming, only with a usable number;
 *  - the call that brings the count within [urgentWindowMinutes] to
 *    [urgentThreshold] is urgent (default: the 2nd call in 15 min; it was
 *    the 3rd before 2026-10-14, see CommsStore's one-time migration);
 *  - after an urgent breakthrough that caller's count is cleared and their
 *    calls are neither counted nor allowed for [urgentCooldownMinutes], so a
 *    4th/5th call doesn't retrigger; after the cooldown counting starts again.
 */
data class CallSettings(
    val emergencyEnabled: Boolean = true,
    val urgentEnabled: Boolean = true,
    val urgentThreshold: Int = DEFAULT_THRESHOLD,
    val urgentWindowMinutes: Int = DEFAULT_WINDOW_MINUTES,
    val urgentCooldownMinutes: Int = DEFAULT_COOLDOWN_MINUTES,
    /** WhatsApp / WhatsApp Business: alert (own DND-exempt channel) for emergency contacts and urgent repeat callers. */
    val whatsAppAlertsEnabled: Boolean = true,
    /** Opt-in: match a WhatsApp caller to an emergency contact by name when no number is exposed. */
    val whatsAppNameMatch: Boolean = false,
    /** What a qualifying SIM call does while Silent Focus is silencing (WhatsApp is unaffected). */
    val simCallMode: SimCallMode = SimCallMode.DEFAULT,
) {
    fun sanitized() = copy(
        urgentThreshold = urgentThreshold.coerceIn(2, 10),
        urgentWindowMinutes = urgentWindowMinutes.coerceIn(1, MAX_WINDOW_MINUTES),
        urgentCooldownMinutes = urgentCooldownMinutes.coerceIn(0, 240),
    )

    companion object {
        const val DEFAULT_THRESHOLD = 2
        /** The default before 2026-10-14; see [migratedThreshold]. */
        const val LEGACY_DEFAULT_THRESHOLD = 3
        const val DEFAULT_WINDOW_MINUTES = 15
        const val DEFAULT_COOLDOWN_MINUTES = 15
        const val MAX_WINDOW_MINUTES = 60

        /**
         * One-time move of a stored threshold to the new default. No screen or
         * sync ever let a user pick the threshold (the app only sends on/off
         * switches; the native setter stores the whole object), so a stored 3
         * is always the old default echoed back, never a choice. Any other
         * stored value is kept. Null: nothing stored (the default applies).
         */
        fun migratedThreshold(stored: Int?): Int? =
            if (stored == LEGACY_DEFAULT_THRESHOLD) DEFAULT_THRESHOLD else stored
    }
}

/**
 * How a qualifying SIM call (emergency contact / urgent repeat caller) is
 * handled while Silent Focus is silencing. Stored by [id]; anything unknown
 * reads as [DEFAULT]. Existing and new installs keep [RING_THROUGH_DND]
 * (the behaviour before this setting existed) until the user changes it.
 */
enum class SimCallMode(val id: String) {
    /** Pause Silent Focus's Do Not Disturb for the call and play the ringtone (unchanged behaviour). */
    RING_THROUGH_DND("ring_through_dnd"),
    /** Keep Do Not Disturb on; post Silent Focus's own repeating alert instead. */
    ALERT_ONLY("alert_only"),
    ;

    companion object {
        val DEFAULT = RING_THROUGH_DND
        fun fromId(id: String?): SimCallMode = values().firstOrNull { it.id == id } ?: DEFAULT
    }
}

enum class BreakthroughKind { EMERGENCY_CONTACT, URGENT_REPEAT_CALLER }

/** One counted call: hashed caller key (never the number) and time. */
data class CallRecord(val key: String, val at: Long)

/** Bounded recent-call state for the urgent-caller rule. */
data class RepeatCallState(
    val calls: List<CallRecord> = emptyList(),
    /** Hashed caller key -> cooldown end. */
    val cooldowns: Map<String, Long> = emptyMap(),
) {
    /** Drops everything that can no longer matter at [now]. */
    fun pruned(now: Long, windowMs: Long): RepeatCallState = RepeatCallState(
        calls = calls.filter { it.at > now - windowMs && it.at <= now }.takeLast(MAX_RECORDS),
        cooldowns = cooldowns.filterValues { it > now },
    )

    companion object {
        const val MAX_RECORDS = 100
    }
}

class EmergencyContactException(
    private val contacts: List<EmergencyContact>,
    private val enabled: Boolean,
) : BreakThroughExceptionProvider {
    override val priority = 200

    fun match(number: String?): EmergencyContact? {
        if (!enabled || PhoneNumbers.normalize(number) == null) return null
        // Never guess when legacy/imported state contains two records whose
        // numbers collapse to the same conservative suffix match.
        return contacts.filter { PhoneNumbers.sameNumber(it.number, number) }
            .distinctBy { it.id }
            .singleOrNull()
    }
}

class UrgentRepeatCallerException(private val settings: CallSettings) : BreakThroughExceptionProvider {
    override val priority = 100

    data class Result(val urgent: Boolean, val countInWindow: Int, val inCooldown: Boolean, val state: RepeatCallState)

    /** Records the call [key] at [now] and says whether it is urgent. */
    fun onCall(key: String, now: Long, state: RepeatCallState): Result {
        val s = settings.sanitized()
        val windowMs = s.urgentWindowMinutes * 60_000L
        val current = state.pruned(now, windowMs)
        if (!s.urgentEnabled) return Result(false, 0, false, current)
        if ((current.cooldowns[key] ?: 0L) > now) return Result(false, 0, true, current)

        val count = current.calls.count { it.key == key } + 1
        if (count >= s.urgentThreshold) {
            val cooldownEnd = now + s.urgentCooldownMinutes * 60_000L
            return Result(
                urgent = true,
                countInWindow = count,
                inCooldown = false,
                state = RepeatCallState(
                    calls = current.calls.filterNot { it.key == key },
                    cooldowns = if (s.urgentCooldownMinutes > 0) current.cooldowns + (key to cooldownEnd) else current.cooldowns,
                ),
            )
        }
        val calls = (current.calls + CallRecord(key, now)).takeLast(RepeatCallState.MAX_RECORDS)
        return Result(false, count, false, current.copy(calls = calls))
    }
}

/** What happened to one incoming/outgoing call, for the engine and the journal. */
data class CallOutcome(
    val breakthrough: BreakthroughKind?,
    /** Emergency contact that matched, if any. */
    val contact: EmergencyContact? = null,
    /** Calls from this caller in the window, including this one (urgent rule). */
    val repeatCount: Int = 0,
    /** Why nothing special happened (for tests / journal detail). */
    val reason: String,
    val state: RepeatCallState,
    /** Whether the call should be journaled as INCOMING_CALL. */
    val record: Boolean,
)

/**
 * Decides whether an incoming call breaks through. Emergency contacts are
 * checked first and never counted toward the urgent-caller rule.
 */
class CallDecider(
    private val contacts: List<EmergencyContact>,
    private val settings: CallSettings,
    private val salt: String,
) {
    fun onCall(
        number: String?,
        incoming: Boolean,
        silentActive: Boolean,
        now: Long,
        state: RepeatCallState,
    ): CallOutcome {
        val s = settings.sanitized()
        val pruned = state.pruned(now, s.urgentWindowMinutes * 60_000L)
        if (!incoming) return CallOutcome(null, reason = REASON_OUTGOING, state = pruned, record = false)
        // Nothing is silenced: every call rings normally, nothing to do.
        if (!silentActive) return CallOutcome(null, reason = REASON_NOT_SILENT, state = pruned, record = false)
        if (PhoneNumbers.normalize(number) == null) {
            return CallOutcome(null, reason = REASON_UNKNOWN_CALLER, state = pruned, record = true)
        }

        EmergencyContactException(contacts, s.emergencyEnabled).match(number)?.let { contact ->
            return CallOutcome(BreakthroughKind.EMERGENCY_CONTACT, contact, reason = "", state = pruned, record = true)
        }

        if (!s.urgentEnabled) return CallOutcome(null, reason = REASON_DISABLED, state = pruned, record = true)
        val key = PhoneNumbers.hashedKey(number, salt)
            ?: return CallOutcome(null, reason = REASON_UNKNOWN_CALLER, state = pruned, record = true)
        val r = UrgentRepeatCallerException(s).onCall(key, now, pruned)
        return when {
            r.urgent -> CallOutcome(BreakthroughKind.URGENT_REPEAT_CALLER, repeatCount = r.countInWindow, reason = "", state = r.state, record = true)
            r.inCooldown -> CallOutcome(null, reason = REASON_COOLDOWN, state = r.state, record = true)
            else -> CallOutcome(null, repeatCount = r.countInWindow, reason = REASON_BELOW_THRESHOLD, state = r.state, record = true)
        }
    }

    companion object {
        const val REASON_OUTGOING = "OUTGOING"
        const val REASON_NOT_SILENT = "NOT_SILENT"
        const val REASON_UNKNOWN_CALLER = "UNKNOWN_CALLER"
        const val REASON_DISABLED = "DISABLED"
        const val REASON_COOLDOWN = "COOLDOWN"
        const val REASON_BELOW_THRESHOLD = "BELOW_THRESHOLD"
    }
}
