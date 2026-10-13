package com.SilenceFocus.diagnostics

import com.SilenceFocus.automation.ActivityEvents

/**
 * Client Issues #10/#11 – DEBUG-ONLY synthetic Activity test harness (pure part).
 *
 * Creates clearly tagged journal rows (`synthetic: true`, id
 * `sftest-<runId>-<n>`, reason TEST_HARNESS) that the real Activity screen
 * renders and opens with its production code. Synthetic rows are never
 * uploaded or outboxed (enforced in main code: ActivityEvents/Outbox/
 * EngineStore.syncableEvents and serverSync.toServerLog). Cleanup removes
 * only rows of one run; a janitor expires leftovers after [EXPIRY_MS].
 *
 * Exists only in debug builds (src/debug); see ActivityTestHarness.kt.
 */
object ActivityTestHarnessModel {

    const val ID_PREFIX = "sftest-"
    const val REASON = "TEST_HARNESS"
    const val APP_LABEL = "SF TEST"
    const val EXPIRY_MS = 2 * 60 * 60_000L
    const val CHANNEL_ID = "sf_test_harness"
    const val MESSAGE_NOTIFICATION_ID = 1
    const val CALL_NOTIFICATION_ID = 2

    /** Why a seed was refused, or null when allowed. */
    fun seedRefusal(harnessFlag: Boolean, debugWritesAccount: String, activeRun: String?): String? = when {
        !harnessFlag -> "HARNESS_DISABLED"
        debugWritesAccount.isNotEmpty() -> "SERVER_WRITES_ENABLED_IN_THIS_BUILD"
        activeRun != null -> "RUN_ALREADY_ACTIVE:$activeRun"
        else -> null
    }

    /** Rows one seed writes. */
    const val ROWS_PER_RUN = 6

    /** Round 3: synthetic display names (clearly test values, never a real contact). */
    const val SENDER_NAME = "SF Test Sender"
    const val CALLER_NAME = "SF Test Caller"

    /** Synthetic emergency contact for the WhatsApp emergency-call checks (removed by cleanup). */
    const val EMERGENCY_CONTACT_ID = "sftest-emergency"
    const val EMERGENCY_CONTACT_NAME = "SF Test Emergency"
    const val EMERGENCY_CONTACT_NUMBER = "+15550100"

    /**
     * Whether appending a run's rows would make journal retention drop a real
     * entry (e.g. one that just turned 30 days old). Seeding is refused then,
     * so a test never changes real history.
     */
    fun evictsRealEntries(existing: List<ActivityEvents.JournalEntry>, now: Long, maxAgeMs: Long, maxCount: Int): Boolean {
        val all = existing + List(ROWS_PER_RUN) { ActivityEvents.JournalEntry(ActivityEvents.INCOMING_CALL, now, false, synthetic = true) }
        val kept = ActivityEvents.retained(all, now, maxAgeMs, maxCount).toSet()
        return existing.indices.any { !existing[it].synthetic && it !in kept }
    }

    private val RUN_ID = Regex("^[0-9a-f]{8}$")

    fun isValidRunId(runId: String?): Boolean = runId != null && RUN_ID.matches(runId)

    fun tag(runId: String) = "$ID_PREFIX$runId"

    fun idPrefix(runId: String) = "$ID_PREFIX$runId-"

    /** Text shown in the synthetic message notification only – never written to the journal. */
    fun messageText(runId: String) = "SF TEST $runId preview"

    /** An earlier message in the same synthetic conversation (per-message previews). */
    fun earlierMessageText(runId: String) = "SF TEST $runId earlier"

    /** One synthetic journal row; [fields] are added to the JSON object as-is. */
    data class Row(val id: String, val type: String, val fields: Map<String, Any>)

    /**
     * The rows of a run: a message row and an app-call row that point at
     * this app's own synthetic notifications (by the production ref), and a
     * phone-call row without a package (Phone-app path). Round 3 adds a named
     * missed app call, an unnamed repeated app call ("Unknown caller") and a
     * second message row for the earlier message of the same notification,
     * so per-message previews and names can be checked. No text, number or
     * real contact is included; names are the fixed SF Test values.
     * [messageAt] / [earlierMessageAt]: timestamps of the two posted messages.
     */
    fun rows(
        runId: String,
        packageName: String,
        messageRef: String,
        callRef: String,
        now: Long,
        messageAt: Long = now,
        earlierMessageAt: Long = now - 60_000L,
    ): List<Row> {
        val common = mapOf(
            ActivityEvents.SYNTHETIC_FIELD to true,
            "reason" to REASON,
            "at" to now,
        )
        return listOf(
            Row("${idPrefix(runId)}1", ActivityEvents.MESSAGE_RECEIVED, common + mapOf(
                "displayName" to SENDER_NAME,
                "messageAt" to messageAt,
                "app" to APP_LABEL,
                "appPackage" to packageName,
                "notificationRef" to messageRef,
                "replyStatus" to "SKIPPED",
                "detail" to "DISABLED",
            )),
            Row("${idPrefix(runId)}2", ActivityEvents.INCOMING_CALL, common + mapOf(
                "app" to APP_LABEL,
                "appPackage" to packageName,
                "notificationRef" to callRef,
                "caller" to "$APP_LABEL app call",
                "detail" to "BELOW_THRESHOLD",
            )),
            Row("${idPrefix(runId)}3", ActivityEvents.INCOMING_CALL, common + mapOf(
                "caller" to "+00******0000",
                "detail" to "BELOW_THRESHOLD",
            )),
            Row("${idPrefix(runId)}4", ActivityEvents.WHATSAPP_CALL, common + mapOf(
                "callState" to "MISSED",
                "displayName" to CALLER_NAME,
                "app" to APP_LABEL,
                "appPackage" to packageName,
                "notificationRef" to callRef,
            )),
            Row("${idPrefix(runId)}5", ActivityEvents.WHATSAPP_CALL, common + mapOf(
                "callState" to "INCOMING",
                "repeat" to true,
                "repeatCount" to 3,
                "app" to APP_LABEL,
                "appPackage" to packageName,
                "notificationRef" to callRef,
            )),
            Row("${idPrefix(runId)}6", ActivityEvents.MESSAGE_RECEIVED, common + mapOf(
                "displayName" to SENDER_NAME,
                "messageAt" to earlierMessageAt,
                "at" to now - 1_000L,
                "app" to APP_LABEL,
                "appPackage" to packageName,
                "notificationRef" to messageRef,
                "replyStatus" to "SKIPPED",
                "detail" to "COOLDOWN",
            )),
        )
    }

    /** What cleanup / the janitor need to know about one journal entry. */
    data class Entry(val id: String?, val synthetic: Boolean, val at: Long)

    /** Rows of exactly this run: synthetic AND id prefixed with this run's prefix. */
    fun cleanupIds(entries: List<Entry>, runId: String): Set<String> {
        if (!isValidRunId(runId)) return emptySet()
        val prefix = idPrefix(runId)
        return entries.mapNotNull { e -> e.id?.takeIf { e.synthetic && it.startsWith(prefix) } }.toSet()
    }

    /** Leftovers of any run older than [EXPIRY_MS]: synthetic AND `sftest-` id, nothing else. */
    fun expiredIds(entries: List<Entry>, now: Long): Set<String> =
        entries.mapNotNull { e ->
            e.id?.takeIf { e.synthetic && it.startsWith(ID_PREFIX) && e.at <= now - EXPIRY_MS }
        }.toSet()
}
