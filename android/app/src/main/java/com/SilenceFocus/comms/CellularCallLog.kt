package com.SilenceFocus.comms

/**
 * Client Issue #5 ("not all calls are in the dashboard"). Cellular calls
 * reach Silent Focus two ways:
 *  - SilentFocusCallScreeningService: number + emergency/urgent check, but
 *    only while Silent Focus holds the call-screening role, and Telecom skips
 *    the screening app for saved contacts unless it can read contacts.
 *  - PHONE_STATE (READ_PHONE_STATE): every ringing / answered / ended
 *    change, without the number (that would need call-log access, which this
 *    app deliberately doesn't request).
 * Before, only the first path wrote Activity rows, so with no screening role
 * (or a skipped contact) calls silently went missing. Now a ringing phone
 * that screening didn't report gets an "Incoming call" row (caller not
 * available), and every call row learns whether it was answered or missed.
 * Pure decisions here; CallBreakthroughs does the I/O.
 */
object CellularCallLog {

    /** Screening reports a call before Telecom rings; this covers slow devices. */
    const val SCREENED_MATCH_MS = 20_000L
    /** A ring older than this without an end is forgotten (missed IDLE broadcast). */
    const val MAX_RING_MS = 5 * 60_000L

    const val DETAIL_NOT_SCREENED = "NOT_SCREENED"
    const val FIELD_CALL_STATE = "callState"
    const val STATE_ANSWERED = "ANSWERED"
    const val STATE_MISSED = "MISSED"

    /** The call being tracked: its Activity row and whether it was answered. */
    data class Ringing(val eventId: String, val since: Long, val answered: Boolean = false) {
        fun encode(): String = FieldCodec.encode(listOf(listOf(eventId, since.toString(), answered.toString())))

        companion object {
            fun decode(raw: String?): Ringing? = FieldCodec.decode(raw).firstOrNull()?.let { f ->
                if (f.size < 3 || f[0].isEmpty()) return@let null
                Ringing(f[0], f[1].toLongOrNull() ?: return@let null, f[2] == "true")
            }
        }
    }

    /** The row screening wrote for this ring, if one was written just before it. */
    fun screenedRow(lastScreened: Ringing?, now: Long): Ringing? =
        lastScreened?.takeIf { now >= it.since && now - it.since <= SCREENED_MATCH_MS }

    /**
     * Phone started ringing. [silentActive]: Silent Focus is silencing (rows
     * are only kept for calls while it is on, as before). Returns whether a
     * fallback row must be written (screening didn't report this call).
     */
    fun needsFallbackRow(silentActive: Boolean, lastScreened: Ringing?, now: Long): Boolean =
        silentActive && screenedRow(lastScreened, now) == null

    /** A tracked call is stale (no IDLE seen): forget it rather than mislabel the next call. */
    fun isStale(ringing: Ringing, now: Long): Boolean = now < ringing.since || now - ringing.since > MAX_RING_MS

    /** The phone went back to idle: answered (we saw OFFHOOK) or missed/declined. */
    fun finalState(ringing: Ringing): String = if (ringing.answered) STATE_ANSWERED else STATE_MISSED
}
