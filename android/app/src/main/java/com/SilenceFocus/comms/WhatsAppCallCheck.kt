package com.SilenceFocus.comms

import android.content.Context

/**
 * Round 4 – "Check WhatsApp Call Alerts": a short, user-started check of the
 * real WhatsApp call path on the user's own phone. While it runs, the
 * notification listener (already granted) notes what happened to WhatsApp
 * call notifications - was a call seen, recognised as ringing, was the caller
 * identified, did an emergency contact match, was the urgent rule reached,
 * was an alert attempted and was it stopped early.
 *
 * Privacy:
 * - OFF by default; starts only from the button, ends by itself after
 *   [DURATION_MS]; the result is deleted when the user closes it, after
 *   [KEEP_MS], at logout and when another account claims the phone.
 * - Only WhatsApp / WhatsApp Business notifications are looked at, and only
 *   yes/no facts, counts, outcome codes and the notification's structure
 *   ([WhatsAppCalls.shape]) are kept: never a name, number, message text,
 *   notification key or raw payload. The only per-call value is the salted
 *   notification ref, kept to count calls once, and dropped with the result.
 * - Nothing is uploaded or logged.
 */
object WhatsAppCallCheck {

    const val KEY = "wa_call_check"
    const val DURATION_MS = 5 * 60_000L
    const val KEEP_MS = 30 * 60_000L
    private const val MAX_REFS = 10
    private const val MAX_SHAPE = 160

    data class Result(
        val startedAt: Long,
        val endsAt: Long,
        val stoppedAt: Long = 0L,
        /** Any WhatsApp / WhatsApp Business notification arrived. */
        val waSeen: Boolean = false,
        /** A call-shaped notification arrived (call / missed call category, CallStyle). */
        val callLikeSeen: Boolean = false,
        /** A ringing call was recognised. */
        val ringing: Boolean = false,
        val missed: Boolean = false,
        val calls: Int = 0,
        val app: String = "",
        /** Silent Focus was on at the last ringing call: 1 / 0, -1 unknown. */
        val silentFocusOn: Int = -1,
        val callerIdentified: Boolean = false,
        val numberShown: Boolean = false,
        val nameShown: Boolean = false,
        val emergencyMatched: Boolean = false,
        val matchedBy: String = "",
        val nameWouldMatch: Boolean = false,
        val repeatCount: Int = 0,
        val urgentReached: Boolean = false,
        val alertAttempted: Boolean = false,
        val alertOutcome: String = "",
        /** Milliseconds between the alert and its early stop (WhatsApp stopped ringing); -1 none. */
        val alertStoppedAfterMs: Long = -1L,
        val shape: String = "",
        val shapeRinging: Boolean = false,
        val refs: List<String> = emptyList(),
    ) {
        fun running(now: Long) = stoppedAt == 0L && now in startedAt until endsAt
        fun endedAt() = if (stoppedAt != 0L) minOf(stoppedAt, endsAt) else endsAt
    }

    fun store(context: Context): KeyValue = CommsStore(context.applicationContext).callCheck

    // ---- persistence (FieldCodec key/value records; no org.json, JVM-testable)

    fun load(kv: KeyValue): Result? {
        val m = FieldCodec.decode(kv.getString(KEY)).filter { it.size >= 2 }.associate { it[0] to it[1] }
        val started = m["startedAt"]?.toLongOrNull() ?: return null
        val ends = m["endsAt"]?.toLongOrNull() ?: return null
        fun b(k: String) = m[k] == "1"
        fun i(k: String) = m[k]?.toIntOrNull() ?: 0
        return Result(
            startedAt = started,
            endsAt = ends,
            stoppedAt = m["stoppedAt"]?.toLongOrNull() ?: 0L,
            waSeen = b("waSeen"),
            callLikeSeen = b("callLikeSeen"),
            ringing = b("ringing"),
            missed = b("missed"),
            calls = i("calls"),
            app = m["app"].orEmpty(),
            silentFocusOn = m["silentFocusOn"]?.toIntOrNull() ?: -1,
            callerIdentified = b("callerIdentified"),
            numberShown = b("numberShown"),
            nameShown = b("nameShown"),
            emergencyMatched = b("emergencyMatched"),
            matchedBy = m["matchedBy"].orEmpty(),
            nameWouldMatch = b("nameWouldMatch"),
            repeatCount = i("repeatCount"),
            urgentReached = b("urgentReached"),
            alertAttempted = b("alertAttempted"),
            alertOutcome = m["alertOutcome"].orEmpty(),
            alertStoppedAfterMs = m["alertStoppedAfterMs"]?.toLongOrNull() ?: -1L,
            shape = m["shape"].orEmpty(),
            shapeRinging = b("shapeRinging"),
            refs = m["refs"].orEmpty().split(',').filter { it.isNotEmpty() },
        )
    }

    private fun save(kv: KeyValue, r: Result) {
        fun b(v: Boolean) = if (v) "1" else "0"
        val fields = listOf(
            "startedAt" to r.startedAt.toString(),
            "endsAt" to r.endsAt.toString(),
            "stoppedAt" to r.stoppedAt.toString(),
            "waSeen" to b(r.waSeen),
            "callLikeSeen" to b(r.callLikeSeen),
            "ringing" to b(r.ringing),
            "missed" to b(r.missed),
            "calls" to r.calls.toString(),
            "app" to r.app,
            "silentFocusOn" to r.silentFocusOn.toString(),
            "callerIdentified" to b(r.callerIdentified),
            "numberShown" to b(r.numberShown),
            "nameShown" to b(r.nameShown),
            "emergencyMatched" to b(r.emergencyMatched),
            "matchedBy" to r.matchedBy,
            "nameWouldMatch" to b(r.nameWouldMatch),
            "repeatCount" to r.repeatCount.toString(),
            "urgentReached" to b(r.urgentReached),
            "alertAttempted" to b(r.alertAttempted),
            "alertOutcome" to r.alertOutcome,
            "alertStoppedAfterMs" to r.alertStoppedAfterMs.toString(),
            "shape" to r.shape.take(MAX_SHAPE),
            "shapeRinging" to b(r.shapeRinging),
            "refs" to r.refs.takeLast(MAX_REFS).joinToString(","),
        )
        kv.putString(KEY, FieldCodec.encode(fields.map { listOf(it.first, it.second) }))
    }

    private inline fun update(kv: KeyValue, now: Long, f: (Result) -> Result) {
        val r = load(kv) ?: return
        if (!r.running(now)) return
        save(kv, f(r))
    }

    // ---- lifecycle

    fun start(kv: KeyValue, now: Long): Result = Result(startedAt = now, endsAt = now + DURATION_MS).also { save(kv, it) }

    fun running(kv: KeyValue, now: Long): Boolean = load(kv)?.running(now) == true

    fun stop(kv: KeyValue, now: Long) {
        val r = load(kv) ?: return
        if (r.stoppedAt == 0L) save(kv, r.copy(stoppedAt = minOf(now, r.endsAt)))
    }

    fun clear(kv: KeyValue) = kv.remove(listOf(KEY))

    /** The current result; an old one (ended more than [KEEP_MS] ago) is deleted instead. */
    fun read(kv: KeyValue, now: Long): Result? {
        val r = load(kv) ?: return null
        if (now - r.endedAt() > KEEP_MS || r.startedAt > now + 60_000L) {
            clear(kv)
            return null
        }
        return r
    }

    // ---- observations (only while running)

    fun sawNotification(kv: KeyValue, signals: WhatsAppCalls.Signals, state: WhatsAppCalls.State?, now: Long) =
        update(kv, now) { r ->
            val callLike = WhatsAppCalls.isCallLike(signals) || state != null
            val ringing = state == WhatsAppCalls.State.INCOMING
            val takeShape = callLike && (r.shape.isEmpty() || (ringing && !r.shapeRinging) || (!r.ringing && !ringing && !r.shapeRinging))
            r.copy(
                waSeen = true,
                callLikeSeen = r.callLikeSeen || callLike,
                missed = r.missed || state == WhatsAppCalls.State.MISSED,
                shape = if (takeShape) WhatsAppCalls.shape(signals) else r.shape,
                shapeRinging = if (takeShape) ringing else r.shapeRinging,
            )
        }

    /**
     * A ringing call was handled ([silentFocusOn]) or evaluated without
     * alerting (Silent Focus off). [ref] counts each call notification once.
     */
    fun sawCall(kv: KeyValue, packageName: String, h: WhatsAppCallRecorder.Handled, silentFocusOn: Boolean, ref: String, now: Long) =
        update(kv, now) { r ->
            if (ref in r.refs) return@update r
            val outcome = h.alert.orEmpty()
            val attempted = outcome == EmergencyCallAlert.SENT || outcome == EmergencyCallAlert.SENT_SILENCED || outcome == EmergencyCallAlert.FAILED
            val id = h.identity
            r.copy(
                ringing = true,
                callLikeSeen = true,
                calls = r.calls + 1,
                app = WhatsAppCalls.APPS[packageName] ?: r.app,
                silentFocusOn = if (silentFocusOn) 1 else 0,
                callerIdentified = r.callerIdentified || h.callerKnown,
                numberShown = r.numberShown || id?.numberShown == true,
                nameShown = r.nameShown || id?.nameShown == true,
                emergencyMatched = r.emergencyMatched || h.matchedBy != null,
                matchedBy = h.matchedBy ?: r.matchedBy,
                nameWouldMatch = r.nameWouldMatch || id?.nameWouldMatch == true,
                repeatCount = maxOf(r.repeatCount, h.repeatCount),
                urgentReached = r.urgentReached || h.kind == WhatsAppEmergency.Kind.URGENT,
                alertAttempted = r.alertAttempted || attempted,
                alertOutcome = if (outcome.isNotEmpty()) outcome else r.alertOutcome,
                refs = r.refs + ref,
            )
        }

    fun alertStopped(kv: KeyValue, afterMs: Long, now: Long) =
        update(kv, now) { it.copy(alertStoppedAfterMs = afterMs.coerceAtLeast(0L)) }
}
