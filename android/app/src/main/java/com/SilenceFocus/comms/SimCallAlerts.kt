package com.SilenceFocus.comms

/**
 * Emergency Call Handling (Option A) – the pure rules for SIM calls. Pure
 * Kotlin, covered by JVM tests; the Android side is [CallBreakthroughs] and
 * [EmergencyCallAlert].
 *
 * Caller matching (emergency contacts, urgent repeat callers, cooldowns) is
 * the same in both modes ([CallDecider]); only the response to a qualifying
 * call differs:
 *  - [SimCallMode.RING_THROUGH_DND]: pause Silent Focus's Do Not Disturb
 *    for the call and play the ringtone (unchanged);
 *  - [SimCallMode.ALERT_ONLY]: Do Not Disturb stays on; Silent Focus posts
 *    its own repeating alert, which the phone's call state then stops
 *    (answered) or turns into a silent "call ended" notice (missed or
 *    rejected). The alert never answers, rejects or ends the call.
 */
object SimCallAlerts {

    enum class Handling { NONE, RING_THROUGH, ALERT }

    /** What to do for a call [CallDecider] let through ([kind] null: an ordinary call). */
    fun handling(kind: BreakthroughKind?, mode: SimCallMode): Handling = when {
        kind == null -> Handling.NONE
        mode == SimCallMode.ALERT_ONLY -> Handling.ALERT
        else -> Handling.RING_THROUGH
    }

    /** The alert sounds for at most this long (the notification times out). */
    const val ALERT_MS = 30_000L
    /** The same caller screened again within this time is the same call (no second alert). */
    const val DUPLICATE_MS = 60_000L
    /** A record older than this is ignored at call end (a missed callback). */
    const val STALE_MS = 10 * 60_000L

    /** The alert currently showing: salted caller key (never the number), kind, urgent count, time. */
    data class Record(val key: String, val kind: BreakthroughKind, val count: Int, val at: Long, val contactName: String? = null) {
        fun encode(): String = FieldCodec.encode(listOf(listOf(key, kind.name, count.toString(), at.toString(), contactName.orEmpty())))

        companion object {
            fun decode(raw: String?): Record? = FieldCodec.decode(raw).firstOrNull()?.let { f ->
                if (f.size < 4) return@let null
                val kind = runCatching { BreakthroughKind.valueOf(f[1]) }.getOrNull() ?: return@let null
                val at = f[3].toLongOrNull() ?: return@let null
                Record(f[0], kind, f[2].toIntOrNull() ?: 0, at, f.getOrNull(4)?.ifEmpty { null })
            }
        }
    }

    /** A second screening of the same call (or a quick re-dial) while its alert is showing. */
    fun isDuplicate(current: Record?, key: String, now: Long): Boolean =
        current != null && current.key == key && now - current.at in 0 until DUPLICATE_MS

    enum class EndAction { NONE, CANCEL, ENDED_NOTICE }

    /**
     * The phone left the ringing state: answered (OFFHOOK) removes the alert;
     * ringing -> idle (missed or rejected - Android doesn't say which) leaves
     * a silent "call ended" notice so the user can call back.
     */
    fun onCallEnded(current: Record?, answered: Boolean, now: Long): EndAction = when {
        current == null || now - current.at !in 0..STALE_MS -> EndAction.NONE
        answered -> EndAction.CANCEL
        else -> EndAction.ENDED_NOTICE
    }

    /** Private alert text; emergency names are used only after a confident saved-contact match. */
    fun text(kind: BreakthroughKind, count: Int, ended: Boolean, contactName: String? = null): Pair<String, String> {
        val name = if (kind == BreakthroughKind.EMERGENCY_CONTACT) WhatsAppEmergency.displayName(contactName) else null
        return when {
        ended && kind == BreakthroughKind.EMERGENCY_CONTACT ->
            "Emergency phone call ended" to (name?.let { "$it called you. Call them back if needed." }
                ?: "Your emergency contact called. Call them back if needed.")
        ended -> "Urgent call ended" to "Someone called $count times. Call them back if needed."
        kind == BreakthroughKind.EMERGENCY_CONTACT ->
            "Emergency phone call" to (name?.let { "$it is calling. Answer on your phone's call screen." }
                ?: "Your emergency contact is calling. Answer on your phone's call screen.")
        else -> "Urgent call" to "Someone has called $count times. Answer on your phone's call screen."
        }
    }
}
