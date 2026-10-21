package com.SilenceFocus.comms

import android.content.Context
import android.content.SharedPreferences
import java.util.UUID

/** Minimal key-value access, so persistence is testable without Android. */
interface KeyValue {
    fun getString(key: String): String?
    fun putString(key: String, value: String?)
    fun getBoolean(key: String, def: Boolean): Boolean
    fun putBoolean(key: String, value: Boolean)
    fun getInt(key: String, def: Int): Int
    fun putInt(key: String, value: Int)
    fun remove(keys: List<String>)

    /** Synchronous, durable write; true only if it reached storage. */
    fun commitString(key: String, value: String?): Boolean {
        putString(key, value)
        return getString(key) == value
    }
}

class PrefsKeyValue(private val prefs: SharedPreferences) : KeyValue {
    override fun getString(key: String) = prefs.getString(key, null)
    override fun putString(key: String, value: String?) = prefs.edit().putString(key, value).apply()
    override fun getBoolean(key: String, def: Boolean) = prefs.getBoolean(key, def)
    override fun putBoolean(key: String, value: Boolean) = prefs.edit().putBoolean(key, value).apply()
    override fun getInt(key: String, def: Int) = prefs.getInt(key, def)
    override fun putInt(key: String, value: Int) = prefs.edit().putInt(key, value).apply()
    override fun remove(keys: List<String>) = prefs.edit().apply { keys.forEach { remove(it) } }.apply()
    override fun commitString(key: String, value: String?) = prefs.edit().putString(key, value).commit()
}

/**
 * Records of string fields in one preference string, without org.json (so
 * it runs in JVM unit tests). Separator characters are stripped from values.
 */
object FieldCodec {
    private const val FIELD = '\u001F'
    private const val RECORD = '\u001E'

    private fun clean(v: String) = v.filter { it != FIELD && it != RECORD }

    fun encode(records: List<List<String>>): String =
        records.joinToString(RECORD.toString()) { r -> r.joinToString(FIELD.toString()) { clean(it) } }

    fun decode(raw: String?): List<List<String>> =
        if (raw.isNullOrEmpty()) emptyList() else raw.split(RECORD).map { it.split(FIELD) }
}

/**
 * Phase 4 local state (app-private SharedPreferences "silent_focus_comms"):
 *  - call-exception settings and emergency contacts (id, display name,
 *    normalised number - picked by the user; nothing is uploaded);
 *  - urgent-caller history: hashed caller keys + times only, pruned to the
 *    window, cleared on reboot and logout;
 *  - auto-reply settings/templates, per-sender reply marks (hashed keys)
 *    and recent reply times for rate limiting.
 * No message text, notification content or contact list is stored.
 */
class CommsStore(private val kv: KeyValue) {

    constructor(context: Context) : this(
        PrefsKeyValue(context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)),
    )

    /** Per-install salt for hashing caller/sender identities. */
    val salt: String
        get() = kv.getString(KEY_SALT) ?: UUID.randomUUID().toString().also { kv.putString(KEY_SALT, it) }

    var callSettings: CallSettings
        get() = CallSettings(
            emergencyEnabled = kv.getBoolean(KEY_EMERGENCY_ENABLED, true),
            urgentEnabled = kv.getBoolean(KEY_URGENT_ENABLED, true),
            urgentThreshold = migrateUrgentThreshold(),
            urgentWindowMinutes = kv.getInt(KEY_URGENT_WINDOW, CallSettings.DEFAULT_WINDOW_MINUTES),
            urgentCooldownMinutes = kv.getInt(KEY_URGENT_COOLDOWN, CallSettings.DEFAULT_COOLDOWN_MINUTES),
            whatsAppAlertsEnabled = kv.getBoolean(KEY_WA_ALERTS, true),
            whatsAppNameMatch = kv.getBoolean(KEY_WA_NAME_MATCH, false),
            simCallMode = SimCallMode.fromId(kv.getString(KEY_SIM_CALL_MODE)),
        ).sanitized()
        set(value) {
            val v = value.sanitized()
            kv.putBoolean(KEY_EMERGENCY_ENABLED, v.emergencyEnabled)
            kv.putBoolean(KEY_URGENT_ENABLED, v.urgentEnabled)
            kv.putInt(KEY_URGENT_THRESHOLD, v.urgentThreshold)
            kv.putInt(KEY_URGENT_WINDOW, v.urgentWindowMinutes)
            kv.putInt(KEY_URGENT_COOLDOWN, v.urgentCooldownMinutes)
            kv.putBoolean(KEY_WA_ALERTS, v.whatsAppAlertsEnabled)
            kv.putBoolean(KEY_WA_NAME_MATCH, v.whatsAppNameMatch)
            kv.putString(KEY_SIM_CALL_MODE, v.simCallMode.id)
        }

    var emergencyContacts: List<EmergencyContact>
        get() = FieldCodec.decode(kv.getString(KEY_CONTACTS)).mapNotNull { f ->
            if (f.size < 3 || f[2].isEmpty()) null
            else EmergencyContact(id = f[0], name = f[1].ifEmpty { null }, number = f[2])
        }
        set(value) = kv.putString(KEY_CONTACTS, FieldCodec.encode(value.map { listOf(it.id, it.name.orEmpty(), it.number) }))

    /**
     * Adds a picked contact; the same number (in any format) is kept once,
     * with the newest name. Returns the stored entry, or null for an unusable number.
     */
    fun addEmergencyContact(id: String, name: String?, rawNumber: String?): EmergencyContact? {
        val number = PhoneNumbers.normalize(rawNumber) ?: return null
        val existing = emergencyContacts
        val dup = existing.firstOrNull { PhoneNumbers.sameNumber(it.number, number) }
        val entry = EmergencyContact(dup?.id ?: id, name?.trim()?.take(80)?.ifEmpty { null } ?: dup?.name, number)
        emergencyContacts = existing.filterNot { it === dup } + entry
        return entry
    }

    fun removeEmergencyContact(id: String) {
        emergencyContacts = emergencyContacts.filterNot { it.id == id }
    }

    /** The stored urgent threshold after the one-time 3 -> 2 move ([CallSettings.migratedThreshold]). */
    private fun migrateUrgentThreshold(): Int {
        if (!kv.getBoolean(KEY_THRESHOLD_MIGRATED, false)) {
            val stored = kv.getInt(KEY_URGENT_THRESHOLD, -1).takeIf { it >= 0 }
            CallSettings.migratedThreshold(stored)?.takeIf { it != stored }?.let { kv.putInt(KEY_URGENT_THRESHOLD, it) }
            kv.putBoolean(KEY_THRESHOLD_MIGRATED, true)
        }
        return kv.getInt(KEY_URGENT_THRESHOLD, CallSettings.DEFAULT_THRESHOLD)
    }

    /** The SIM alert currently showing (Alert Only), for dedupe and cleanup; null when none. */
    var simAlert: SimCallAlerts.Record?
        get() = SimCallAlerts.Record.decode(kv.getString(KEY_SIM_ALERT))
        set(value) = kv.putString(KEY_SIM_ALERT, value?.encode())

    /** #5: the cellular call whose Activity row is being completed (answered / missed). */
    var cellularCall: CellularCallLog.Ringing?
        get() = CellularCallLog.Ringing.decode(kv.getString(KEY_CELL_CALL))
        set(value) = kv.putString(KEY_CELL_CALL, value?.encode())

    var repeatCallState: RepeatCallState
        get() {
            val calls = FieldCodec.decode(kv.getString(KEY_CALLS)).mapNotNull { f ->
                f.getOrNull(1)?.toLongOrNull()?.let { CallRecord(f[0], it) }
            }
            val cooldowns = FieldCodec.decode(kv.getString(KEY_COOLDOWNS)).mapNotNull { f ->
                f.getOrNull(1)?.toLongOrNull()?.let { f[0] to it }
            }.toMap()
            return RepeatCallState(calls, cooldowns)
        }
        set(value) {
            kv.putString(KEY_CALLS, FieldCodec.encode(value.calls.map { listOf(it.key, it.at.toString()) }))
            kv.putString(KEY_COOLDOWNS, FieldCodec.encode(value.cooldowns.map { listOf(it.key, it.value.toString()) }))
        }

    fun clearRecentCalls() = kv.remove(listOf(KEY_CALLS, KEY_COOLDOWNS, KEY_WA_CALLS, KEY_WA_COOLDOWNS, KEY_WA_TRACKED, KEY_WA_EPISODES, KEY_WA_ALERTS_SENT, KEY_WA_ALERT_AT, KEY_SIM_ALERT, KEY_CELL_CALL))

    /** #6: WhatsApp repeat-caller state (hashed `wa:` keys + times), separate from cellular. */
    var waRepeatState: RepeatCallState
        get() = RepeatCallState(
            FieldCodec.decode(kv.getString(KEY_WA_CALLS)).mapNotNull { f -> f.getOrNull(1)?.toLongOrNull()?.let { CallRecord(f[0], it) } },
            FieldCodec.decode(kv.getString(KEY_WA_COOLDOWNS)).mapNotNull { f -> f.getOrNull(1)?.toLongOrNull()?.let { f[0] to it } }.toMap(),
        )
        set(value) {
            kv.putString(KEY_WA_CALLS, FieldCodec.encode(value.calls.map { listOf(it.key, it.at.toString()) }))
            kv.putString(KEY_WA_COOLDOWNS, FieldCodec.encode(value.cooldowns.map { listOf(it.key, it.value.toString()) }))
        }

    /** WhatsApp call notifications seen recently (salted refs, hashed callers, times), for one count/alert per real call. */
    var waCallEpisodes: List<WhatsAppCalls.Episode>
        get() = FieldCodec.decode(kv.getString(KEY_WA_EPISODES)).mapNotNull { f ->
            if (f.size < 7) return@mapNotNull null
            val state = runCatching { WhatsAppCalls.State.valueOf(f[1]) }.getOrNull() ?: return@mapNotNull null
            val first = f[4].toLongOrNull() ?: return@mapNotNull null
            val last = f[5].toLongOrNull() ?: return@mapNotNull null
            WhatsAppCalls.Episode(f[0], state, f[2], f[3], first, last, f[6].toLongOrNull() ?: 0L, f.getOrNull(7)?.toLongOrNull() ?: 0L)
        }
        set(value) = kv.putString(
            KEY_WA_EPISODES,
            FieldCodec.encode(value.map { listOf(it.ref, it.state.name, it.caller, it.alertRef, it.firstSeen.toString(), it.lastSeen.toString(), it.endedAt.toString(), it.stamp.toString()) }),
        )

    /** When the last emergency/urgent WhatsApp alert was posted (0 = none); diagnostic only. */
    var waAlertPostedAt: Long
        get() = kv.getString(KEY_WA_ALERT_AT)?.toLongOrNull() ?: 0L
        set(value) = kv.putString(KEY_WA_ALERT_AT, value.toString())

    /** Temporary "Check WhatsApp Call Alerts" state ([WhatsAppCallCheck]); no caller data. */
    val callCheck: KeyValue get() = kv

    var autoReplySettings: AutoReplySettings
        get() = AutoReplySettings(
            enabled = kv.getBoolean(KEY_AR_ENABLED, false),
            messagingEnabled = kv.getBoolean(KEY_AR_MESSAGING, true),
            defaultTemplate = kv.getString(KEY_AR_DEFAULT) ?: AutoReplySettings.DEFAULT_TEMPLATE,
            cooldownMinutes = kv.getInt(KEY_AR_COOLDOWN, AutoReplySettings.DEFAULT_COOLDOWN_MINUTES),
            zoneTemplates = FieldCodec.decode(kv.getString(KEY_AR_ZONES))
                .mapNotNull { f -> if (f.size >= 2) f[0] to f[1] else null }.toMap(),
        ).sanitized()
        set(value) {
            val v = value.sanitized()
            kv.putBoolean(KEY_AR_ENABLED, v.enabled)
            kv.putBoolean(KEY_AR_MESSAGING, v.messagingEnabled)
            kv.putString(KEY_AR_DEFAULT, v.defaultTemplate)
            kv.putInt(KEY_AR_COOLDOWN, v.cooldownMinutes)
            kv.putString(KEY_AR_ZONES, FieldCodec.encode(v.zoneTemplates.map { listOf(it.key, it.value) }))
        }

    var replyMarks: Map<String, ReplyMark>
        get() = FieldCodec.decode(kv.getString(KEY_AR_MARKS)).mapNotNull { f ->
            val at = f.getOrNull(1)?.toLongOrNull() ?: return@mapNotNull null
            val session = f.getOrNull(2)?.toLongOrNull() ?: return@mapNotNull null
            f[0] to ReplyMark(at, session)
        }.toMap()
        set(value) = kv.putString(
            KEY_AR_MARKS,
            FieldCodec.encode(value.map { listOf(it.key, it.value.at.toString(), it.value.sessionId.toString()) }),
        )

    /** Times of replies actually sent (for the hourly cap), newest last. */
    var replyTimes: List<Long>
        get() = FieldCodec.decode(kv.getString(KEY_AR_TIMES)).mapNotNull { it.firstOrNull()?.toLongOrNull() }
        set(value) = kv.putString(KEY_AR_TIMES, FieldCodec.encode(value.takeLast(50).map { listOf(it.toString()) }))

    /** Emergency/urgent WhatsApp alerts sent recently (hashed keys + times) for duplicate and rate limits. */
    var waAlertsSent: List<WhatsAppEmergency.Sent>
        get() = FieldCodec.decode(kv.getString(KEY_WA_ALERTS_SENT)).mapNotNull { f ->
            f.getOrNull(1)?.toLongOrNull()?.let { WhatsAppEmergency.Sent(f[0], it) }
        }
        set(value) = kv.putString(KEY_WA_ALERTS_SENT, FieldCodec.encode(value.map { listOf(it.key, it.at.toString()) }))

    /** Recently journaled notifications (key|postTime), to skip re-posts. */
    var seenNotifications: List<String>
        get() = FieldCodec.decode(kv.getString(KEY_SEEN)).mapNotNull { it.firstOrNull()?.takeIf(String::isNotEmpty) }
        set(value) = kv.putString(KEY_SEEN, FieldCodec.encode(value.takeLast(100).map { listOf(it) }))

    /** Logout: forget contacts, templates and all communication history. */
    fun clearUserData() = kv.remove(
        listOf(
            KEY_EMERGENCY_ENABLED, KEY_URGENT_ENABLED, KEY_URGENT_THRESHOLD, KEY_URGENT_WINDOW,
            KEY_URGENT_COOLDOWN, KEY_CONTACTS, KEY_CALLS, KEY_COOLDOWNS, KEY_AR_ENABLED,
            KEY_AR_MESSAGING, KEY_AR_DEFAULT, KEY_AR_COOLDOWN, KEY_AR_ZONES, KEY_AR_MARKS,
            KEY_AR_TIMES, KEY_SEEN, KEY_WA_CALLS, KEY_WA_COOLDOWNS, KEY_WA_TRACKED,
            KEY_WA_ALERTS, KEY_WA_NAME_MATCH, KEY_WA_ALERTS_SENT, KEY_WA_EPISODES, KEY_WA_ALERT_AT,
            KEY_SIM_CALL_MODE, KEY_SIM_ALERT, KEY_CELL_CALL,
            WhatsAppCallCheck.KEY,
        ),
    )

    companion object {
        private const val PREFS = "silent_focus_comms"
        private const val KEY_SALT = "salt"
        private const val KEY_EMERGENCY_ENABLED = "emergency_enabled"
        private const val KEY_URGENT_ENABLED = "urgent_enabled"
        private const val KEY_URGENT_THRESHOLD = "urgent_threshold"
        private const val KEY_URGENT_WINDOW = "urgent_window_min"
        private const val KEY_URGENT_COOLDOWN = "urgent_cooldown_min"
        private const val KEY_CONTACTS = "emergency_contacts"
        private const val KEY_CALLS = "recent_calls"
        private const val KEY_COOLDOWNS = "urgent_cooldowns"
        private const val KEY_AR_ENABLED = "auto_reply_enabled"
        private const val KEY_AR_MESSAGING = "auto_reply_messaging"
        private const val KEY_AR_DEFAULT = "auto_reply_default"
        private const val KEY_AR_COOLDOWN = "auto_reply_cooldown_min"
        private const val KEY_AR_ZONES = "auto_reply_zone_templates"
        private const val KEY_AR_MARKS = "auto_reply_marks"
        private const val KEY_AR_TIMES = "auto_reply_times"
        private const val KEY_SEEN = "seen_notifications"
        private const val KEY_WA_CALLS = "wa_recent_calls"
        private const val KEY_WA_COOLDOWNS = "wa_cooldowns"
        /** Round 3 format, replaced by [KEY_WA_EPISODES]; still cleared. */
        private const val KEY_WA_TRACKED = "wa_tracked_calls"
        private const val KEY_WA_EPISODES = "wa_call_episodes"
        private const val KEY_WA_ALERT_AT = "wa_alert_posted_at"
        private const val KEY_WA_ALERTS = "wa_alerts_enabled"
        private const val KEY_WA_NAME_MATCH = "wa_name_match"
        private const val KEY_SIM_CALL_MODE = "sim_call_mode"
        private const val KEY_SIM_ALERT = "sim_alert"
        private const val KEY_CELL_CALL = "cellular_call"
        private const val KEY_THRESHOLD_MIGRATED = "urgent_threshold_v2"
        private const val KEY_WA_ALERTS_SENT = "wa_alerts_sent"
    }
}
