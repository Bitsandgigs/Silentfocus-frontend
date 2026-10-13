package com.SilenceFocus.diagnostics

import android.app.Notification
import com.SilenceFocus.comms.FieldCodec
import java.security.SecureRandom
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

/**
 * Client Issue #9 – DEBUG-ONLY WhatsApp call notification probe (pure part).
 *
 * Records the *structure* of WhatsApp notifications so call notifications can
 * later be recognised without reading their content.
 *
 * Privacy (hardened 2026-10-10):
 * - No hashes, salts or raw identifiers are stored. Callers and notifications
 *   get per-capture pseudonyms ("c1", "n1", …) from [CapturePseudonyms]: an
 *   HMAC with a random key that exists only in memory, mapped to ordinals in
 *   memory. A reader of the stored file learns only "same / different within
 *   one capture", nothing that can be brute-forced back to a number or name.
 * - A caller pseudonym is assigned only to call-like notifications
 *   ([isCallLike]); message notifications keep their structure only.
 * - Never read into a record: titles, text, people, numbers, intents, icons,
 *   app-defined extras.
 *
 * Exists only in debug builds (src/debug); see WhatsAppCallProbe.kt.
 */
object WhatsAppCallProbeModel {

    val PACKAGES = setOf("com.whatsapp", "com.whatsapp.w4b")

    const val FORMAT = "v2"
    const val MAX_RECORDS = 200
    const val MAX_AGE_MS = 24 * 60 * 60_000L

    /** Flags worth knowing for a call notification; everything else is dropped. */
    const val FLAG_MASK = Notification.FLAG_ONGOING_EVENT or Notification.FLAG_INSISTENT or
        Notification.FLAG_NO_CLEAR or Notification.FLAG_AUTO_CANCEL or
        Notification.FLAG_FOREGROUND_SERVICE or Notification.FLAG_GROUP_SUMMARY

    /** What the adapter reads from a StatusBarNotification (raw values live only in memory). */
    data class Input(
        val packageName: String,
        val key: String,
        val postTime: Long,
        val category: String?,
        val channelId: String?,
        val template: String?,
        val callType: Int?,
        val flags: Int,
        val hasFullScreenIntent: Boolean,
        val hasContentIntent: Boolean,
        val actionSemantics: List<Int>,
        val isGroupConversation: Boolean?,
        val extrasKeys: Set<String>,
        val shortcutId: String?,
        val title: String?,
    )

    /** What is stored. No field holds a name, number, text, hash or raw identifier. */
    data class Record(
        val event: String, // POSTED | REMOVED
        val at: Long,
        val postTime: Long,
        val pkg: String,
        val capture: Int, // which capture (process run) the pseudonyms belong to
        val notification: String, // "n<k>" within the capture
        val callLike: Boolean,
        val caller: String, // "c<k>" within the capture, only when callLike; else ""
        val category: String,
        val channel: String,
        val template: String,
        val callType: Int?,
        val flags: Int,
        val fullScreen: Boolean,
        val contentIntent: Boolean,
        val actions: List<Int>,
        val group: Boolean?,
        val extrasKeys: List<String>,
        val removalReason: Int?,
        val silentFocusActive: Boolean,
    )

    /**
     * Per-capture pseudonyms. The HMAC key is random, held only in this
     * object, never persisted; the maps hold HMAC digests (not raw values) ->
     * ordinals. A new instance (new process, or after clear) starts again at 1
     * and can't be linked to an earlier one.
     */
    class CapturePseudonyms(key: ByteArray = randomKey()) {
        private val mac = Mac.getInstance("HmacSHA256").apply { init(SecretKeySpec(key, "HmacSHA256")) }
        private val callers = HashMap<String, Int>()
        private val notifications = HashMap<String, Int>()

        @Synchronized
        fun caller(pkg: String, id: String?): String = ordinal(callers, "c", "caller", pkg, id)

        @Synchronized
        fun notification(pkg: String, key: String?): String = ordinal(notifications, "n", "notification", pkg, key)

        private fun ordinal(map: HashMap<String, Int>, prefix: String, domain: String, pkg: String, value: String?): String {
            if (value.isNullOrBlank()) return ""
            val digest = mac.doFinal("$domain\u0000$pkg\u0000$value".toByteArray()).joinToString("") { "%02x".format(it) }
            return prefix + map.getOrPut(digest) { map.size + 1 }
        }

        private companion object {
            fun randomKey() = ByteArray(32).also { SecureRandom().nextBytes(it) }
        }
    }

    fun isWhatsApp(packageName: String?) = packageName in PACKAGES

    /**
     * Call-like by structure only (no text): call / missed-call category,
     * CallStyle template, a call type, or a full-screen (ringing) intent.
     */
    fun isCallLike(input: Input): Boolean =
        input.category == Notification.CATEGORY_CALL || input.category == CATEGORY_MISSED_CALL ||
            input.template?.endsWith("\$CallStyle") == true || input.callType != null || input.hasFullScreenIntent

    private const val CATEGORY_MISSED_CALL = "missed_call"

    private val SAFE_CHANNEL = Regex("^[A-Za-z0-9_.\\-]{1,64}$")
    private val LONG_DIGITS = Regex("[0-9]{5,}")

    /**
     * App channel ids like "voip_notification_11" are kept; anything that could
     * carry a conversation/phone id (":", "@", 5+ digits, odd characters) is
     * replaced by "redacted" (no hash).
     */
    fun channel(channelId: String?): String = when {
        channelId.isNullOrEmpty() -> ""
        SAFE_CHANNEL.matches(channelId) && !LONG_DIGITS.containsMatchIn(channelId) -> channelId
        else -> "redacted"
    }

    private val SAFE_TEMPLATE = Regex("^[A-Za-z0-9_$]{1,64}$")

    /** "android.app.Notification$CallStyle" -> "Notification$CallStyle". */
    fun template(raw: String?): String =
        raw?.substringAfterLast('.')?.takeIf { SAFE_TEMPLATE.matches(it) }.orEmpty()

    private val SAFE_EXTRA_KEY = Regex("^android\\.[A-Za-z0-9_.]{1,48}$")

    /** Names (never values) of the platform extras present; app-defined keys are dropped. */
    fun extrasKeys(keys: Set<String>): List<String> = keys.filter { SAFE_EXTRA_KEY.matches(it) }.sorted()

    fun record(
        input: Input,
        pseudonyms: CapturePseudonyms,
        capture: Int,
        event: String,
        now: Long,
        removalReason: Int?,
        silentFocusActive: Boolean,
    ): Record? {
        if (!isWhatsApp(input.packageName)) return null
        val pkg = input.packageName
        val callLike = isCallLike(input)
        return Record(
            event = event,
            at = now,
            postTime = input.postTime,
            pkg = pkg,
            capture = capture,
            notification = pseudonyms.notification(pkg, input.key),
            callLike = callLike,
            // Shortcut id (conversation) is the stable caller identity; title only as fallback.
            caller = if (callLike) pseudonyms.caller(pkg, input.shortcutId ?: input.title) else "",
            category = input.category?.takeIf { SAFE_CHANNEL.matches(it) }.orEmpty(),
            channel = channel(input.channelId),
            template = template(input.template),
            callType = input.callType,
            flags = input.flags and FLAG_MASK,
            fullScreen = input.hasFullScreenIntent,
            contentIntent = input.hasContentIntent,
            actions = input.actionSemantics,
            group = input.isGroupConversation,
            extrasKeys = extrasKeys(input.extrasKeys),
            removalReason = removalReason,
            silentFocusActive = silentFocusActive,
        )
    }

    /** Newest [MAX_RECORDS] that are younger than [MAX_AGE_MS]. */
    fun retained(records: List<Record>, now: Long): List<Record> =
        records.filter { it.at > now - MAX_AGE_MS && it.at <= now }.takeLast(MAX_RECORDS)

    fun encode(records: List<Record>): String = FieldCodec.encode(
        records.map {
            listOf(
                FORMAT, it.event, it.at.toString(), it.postTime.toString(), it.pkg, it.capture.toString(),
                it.notification, if (it.callLike) "1" else "0", it.caller, it.category, it.channel, it.template,
                it.callType?.toString().orEmpty(), it.flags.toString(),
                if (it.fullScreen) "1" else "0", if (it.contentIntent) "1" else "0",
                it.actions.joinToString(","), it.group?.let { g -> if (g) "1" else "0" }.orEmpty(),
                it.extrasKeys.joinToString(","), it.removalReason?.toString().orEmpty(),
                if (it.silentFocusActive) "1" else "0",
            )
        },
    )

    /** Records of this format only; anything older (e.g. v1 with hashes) is dropped. */
    fun decode(raw: String?): List<Record> = FieldCodec.decode(raw).mapNotNull { f ->
        if (f.size < 21 || f[0] != FORMAT) return@mapNotNull null
        runCatching {
            Record(
                event = f[1], at = f[2].toLong(), postTime = f[3].toLong(), pkg = f[4], capture = f[5].toInt(),
                notification = f[6], callLike = f[7] == "1", caller = f[8], category = f[9], channel = f[10],
                template = f[11], callType = f[12].toIntOrNull(), flags = f[13].toInt(),
                fullScreen = f[14] == "1", contentIntent = f[15] == "1",
                actions = f[16].split(',').mapNotNull { it.toIntOrNull() },
                group = when (f[17]) { "1" -> true; "0" -> false; else -> null },
                extrasKeys = f[18].split(',').filter { it.isNotEmpty() },
                removalReason = f[19].toIntOrNull(), silentFocusActive = f[20] == "1",
            )
        }.getOrNull()
    }
}
