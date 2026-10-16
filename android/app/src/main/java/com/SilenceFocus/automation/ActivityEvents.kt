package com.SilenceFocus.automation

/**
 * The one local activity/event model (EngineStore journal, shown by the
 * Activity screen). Every event is a flat JSON object:
 *   id, type, category, at (epoch ms)
 * plus optional, type-specific fields:
 *   reason, source, ruleIds, ruleId, name (zone/schedule name),
 *   caller (redacted, e.g. "+91******1234"), contactName (emergency contacts
 *   only - already stored locally by the user), repeatCount,
 *   app (label), appPackage, notificationRef (salted hash of the
 *   notification key, see comms.NotificationSource), replyStatus, detail.
 * Never: message text, notification content, notification keys, full
 * numbers, contact lists.
 */
object ActivityEvents {
    const val SILENCE_STARTED = "SILENCE_STARTED"
    const val SILENCE_ENDED = "SILENCE_ENDED"
    const val ZONE_ENTER = "ZONE_ENTER"
    const val ZONE_EXIT = "ZONE_EXIT"
    const val PLACE_ENTER = "PLACE_ENTER"
    const val PLACE_EXIT = "PLACE_EXIT"
    const val CALENDAR_STARTED = "CALENDAR_STARTED"
    const val CALENDAR_ENDED = "CALENDAR_ENDED"
    const val SCHEDULE_STARTED = "SCHEDULE_STARTED"
    const val SCHEDULE_ENDED = "SCHEDULE_ENDED"
    const val INCOMING_CALL = "INCOMING_CALL"
    const val EMERGENCY_BREAKTHROUGH = "EMERGENCY_BREAKTHROUGH"
    const val URGENT_REPEAT_CALLER = "URGENT_REPEAT_CALLER"
    const val MESSAGE_RECEIVED = "MESSAGE_RECEIVED"
    const val AUTO_REPLY_SENT = "AUTO_REPLY_SENT"
    const val AUTO_REPLY_FAILED = "AUTO_REPLY_FAILED"
    const val AUTO_REPLY_SKIPPED = "AUTO_REPLY_SKIPPED"
    const val AUTOMATION_ERROR = "AUTOMATION_ERROR"
    /** #9: a WhatsApp / WhatsApp Business call (`callState` INCOMING | MISSED), local only. */
    const val WHATSAPP_CALL = "WHATSAPP_CALL"

    const val CATEGORY_CALL = "CALL"
    const val CATEGORY_MESSAGE = "MESSAGE"
    const val CATEGORY_AUTOMATION = "AUTOMATION"

    /**
     * Journal types the app uploads as server logs (keep in sync with
     * LOG_TYPES in src/utils/serverSync.js). Until the server has
     * acknowledged one, retention never drops it.
     */
    val UPLOADED_TYPES = setOf(INCOMING_CALL, EMERGENCY_BREAKTHROUGH, URGENT_REPEAT_CALLER, MESSAGE_RECEIVED, AUTO_REPLY_SENT)

    /**
     * Debug test-harness entries (#10/#11) carry `"synthetic": true`. They
     * are never pending: never uploaded, never put into a logout outbox, and
     * retention treats them like any non-uploaded entry. Real entries never
     * have the field.
     */
    const val SYNTHETIC_FIELD = "synthetic"

    data class JournalEntry(val type: String, val at: Long, val acknowledged: Boolean, val synthetic: Boolean = false) {
        /** Uploaded type the server hasn't acknowledged yet (read back). */
        val pending: Boolean get() = !synthetic && type in UPLOADED_TYPES && !acknowledged
    }

    /** Indices of journal entries (by their synthetic flag) that may ever be synced: all but synthetic ones. */
    fun syncableIndices(synthetic: List<Boolean>): List<Int> = synthetic.indices.filter { !synthetic[it] }

    /**
     * Indices kept by journal retention (in order): every pending entry, plus
     * the newest [maxCount] of the others that are younger than [maxAgeMs].
     * Pending entries are never evicted for age or count; they leave once the
     * server has acknowledged them. Synthetic (test-harness) entries have
     * their own small cap and never count against [maxCount], so seeding them
     * can't evict a real entry.
     */
    fun retained(entries: List<JournalEntry>, now: Long, maxAgeMs: Long, maxCount: Int): List<Int> {
        val pending = entries.indices.filter { entries[it].pending }
        val others = entries.indices
            .filter { !entries[it].pending && !entries[it].synthetic && entries[it].at >= now - maxAgeMs }
            .takeLast(maxCount)
        val synthetic = entries.indices
            .filter { entries[it].synthetic && entries[it].at >= now - maxAgeMs }
            .takeLast(MAX_SYNTHETIC)
        return (pending + others + synthetic).sorted()
    }

    /** Synthetic entries kept at most (one harness run writes 3). */
    const val MAX_SYNTHETIC = 20

    fun categoryOf(type: String): String = when (type) {
        INCOMING_CALL, EMERGENCY_BREAKTHROUGH, URGENT_REPEAT_CALLER, WHATSAPP_CALL -> CATEGORY_CALL
        MESSAGE_RECEIVED, AUTO_REPLY_SENT, AUTO_REPLY_FAILED, AUTO_REPLY_SKIPPED -> CATEGORY_MESSAGE
        else -> CATEGORY_AUTOMATION
    }

    fun ruleStarted(source: RuleSource): String = when (source) {
        RuleSource.ZONE -> ZONE_ENTER
        RuleSource.PLACE -> PLACE_ENTER
        RuleSource.CALENDAR -> CALENDAR_STARTED
        RuleSource.SCHEDULE -> SCHEDULE_STARTED
        RuleSource.MANUAL -> SILENCE_STARTED
    }

    fun ruleEnded(source: RuleSource): String = when (source) {
        RuleSource.ZONE -> ZONE_EXIT
        RuleSource.PLACE -> PLACE_EXIT
        RuleSource.CALENDAR -> CALENDAR_ENDED
        RuleSource.SCHEDULE -> SCHEDULE_ENDED
        RuleSource.MANUAL -> SILENCE_ENDED
    }

    /**
     * Rule occurrences that started/ended between two evaluations, keyed by
     * [ActiveRule.windowKey] (so a new schedule occurrence is a new start).
     */
    fun ruleTransitions(
        before: Map<String, String>,
        now: List<ActiveRule>,
    ): Pair<List<ActiveRule>, List<String>> {
        val nowKeys = now.associateBy { it.windowKey }
        val started = now.filter { it.windowKey !in before }
        val ended = before.keys.filter { it !in nowKeys }
        return started to ended
    }

    /**
     * Whether a device silence change needs its own SILENCE_STARTED/ENDED
     * event. When the rule occurrence that caused it started/ended in the same
     * evaluation, its ZONE_/SCHEDULE_/CALENDAR_ event already records that one
     * action, so a second, generic entry would be a duplicate. Manual changes,
     * DND access returning, a manual OFF over a running rule and logout keep
     * the generic event.
     */
    fun silenceChangeNeedsEvent(
        isStart: Boolean,
        source: RuleSource?,
        previousSource: RuleSource?,
        startedActive: List<ActiveRule>,
        endedSources: List<RuleSource>,
    ): Boolean {
        val cause = if (isStart) source else previousSource
        if (cause == null || cause == RuleSource.MANUAL) return true
        return if (isStart) startedActive.none { it.source == cause } else cause !in endedSources
    }

    /**
     * Whether an evaluation for [reason] may add journal entries. The logout
     * reset's evaluation records nothing: the journal has just been cleared
     * (or handed to its owner's outbox), so an entry written there would
     * belong to no account and be adopted by whoever signs in next. Ending
     * the silence there is still recorded in the session history.
     */
    fun journalsActivity(reason: TriggerReason): Boolean = reason != TriggerReason.LOGOUT

    /** Journal entry written by a logout reset (older versions); never shown to the next account. */
    fun isLogoutArtifact(reason: String?): Boolean = reason == TriggerReason.LOGOUT.name

    /** Ids of [events] (id, reason) written by a logout reset. */
    fun logoutArtifactIds(events: List<Pair<String?, String?>>): Set<String> =
        events.mapNotNull { (id, reason) -> id?.takeIf { isLogoutArtifact(reason) } }.toSet()

    /**
     * Indices of journal entries that survive a "Clear phone activity":
     * everything except the exact ids JS verified ([clearableIds]); null
     * clears all. Entries recorded after the check (or without an id) stay.
     */
    fun keptAfterClear(eventIds: List<String?>, clearableIds: Set<String>?): List<Int> {
        if (clearableIds == null) return emptyList()
        return eventIds.indices.filter { i -> eventIds[i]?.let { it !in clearableIds } ?: true }
    }

    /** "SOURCE:ruleId:windowStart" -> source, ruleId. */
    fun parseWindowKey(key: String): Pair<RuleSource, String>? {
        val parts = key.split(':')
        if (parts.size < 3) return null
        val source = runCatching { RuleSource.valueOf(parts.first()) }.getOrNull() ?: return null
        return source to parts.subList(1, parts.size - 1).joinToString(":")
    }
}
