package com.SilenceFocus.diagnostics

import android.app.Notification
import android.content.ContentProvider
import android.content.ContentValues
import android.content.Context
import android.database.Cursor
import android.net.Uri
import android.os.Build
import android.service.notification.StatusBarNotification
import com.SilenceFocus.BuildConfig
import com.SilenceFocus.automation.EngineStore
import com.SilenceFocus.comms.KeyValue
import com.SilenceFocus.comms.NotificationProbe
import com.SilenceFocus.comms.NotificationProbes
import com.SilenceFocus.comms.PrefsKeyValue

/**
 * Client Issue #9 – DEBUG-ONLY probe (Android adapter). Reads the allowed
 * structural fields of WhatsApp notifications only (see
 * [WhatsAppCallProbeModel]) and stores them app-private, with per-capture
 * pseudonyms instead of any identifier. No logging, no
 * network, no UI. Installed by [WhatsAppCallProbeInstaller] only when the
 * debug build was made with SF_WHATSAPP_CALL_PROBE=true.
 *
 * Read (developer, with the phone connected):
 *   adb shell run-as com.SilenceFocus cat shared_prefs/silent_focus_wa_probe.xml
 */
class WhatsAppCallProbe(private val capture: Int) : NotificationProbe {

    /** In-memory only; replaced on clear so later pseudonyms can't be linked to earlier ones. */
    @Volatile
    private var pseudonyms = WhatsAppCallProbeModel.CapturePseudonyms()

    override fun onPosted(context: Context, sbn: StatusBarNotification) =
        capture(context, sbn, "POSTED", null)

    override fun onRemoved(context: Context, sbn: StatusBarNotification, reason: Int) =
        capture(context, sbn, "REMOVED", reason)

    override fun clear(context: Context) {
        pseudonyms = WhatsAppCallProbeModel.CapturePseudonyms()
        WhatsAppCallProbeStore(context).clear()
    }

    private fun capture(context: Context, sbn: StatusBarNotification, event: String, reason: Int?) {
        // Nothing else is read from other apps' notifications.
        if (!WhatsAppCallProbeModel.isWhatsApp(sbn.packageName)) return
        val ctx = context.applicationContext
        val now = System.currentTimeMillis()
        val record = WhatsAppCallProbeModel.record(
            input(sbn),
            pseudonyms,
            capture,
            event,
            now,
            reason,
            silentFocusActive = runCatching { EngineStore(ctx).owned }.getOrDefault(false),
        ) ?: return
        WhatsAppCallProbeStore(ctx).add(record, now)
    }

    private fun input(sbn: StatusBarNotification): WhatsAppCallProbeModel.Input {
        val n = sbn.notification
        val extras = n?.extras
        return WhatsAppCallProbeModel.Input(
            packageName = sbn.packageName,
            key = sbn.key,
            postTime = sbn.postTime,
            category = n?.category,
            channelId = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) n?.channelId else null,
            template = extras?.getString(Notification.EXTRA_TEMPLATE),
            callType = extras?.takeIf { it.containsKey(EXTRA_CALL_TYPE) }?.getInt(EXTRA_CALL_TYPE),
            flags = n?.flags ?: 0,
            hasFullScreenIntent = n?.fullScreenIntent != null,
            hasContentIntent = n?.contentIntent != null,
            actionSemantics = n?.actions.orEmpty().map {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) it.semanticAction else -1
            },
            isGroupConversation = extras?.takeIf { it.containsKey(Notification.EXTRA_IS_GROUP_CONVERSATION) }
                ?.getBoolean(Notification.EXTRA_IS_GROUP_CONVERSATION),
            extrasKeys = extras?.keySet().orEmpty(),
            // Hashed by the model before anything is stored.
            shortcutId = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) n?.shortcutId else null,
            title = extras?.getCharSequence(Notification.EXTRA_TITLE)?.toString(),
        )
    }

    private companion object {
        /** Notification.EXTRA_CALL_TYPE (API 31); an integer, not personal data. */
        const val EXTRA_CALL_TYPE = "android.callType"
    }
}

/** App-private store ("silent_focus_wa_probe"): records + a capture counter. No salt, no keys. */
class WhatsAppCallProbeStore(private val kv: KeyValue) {

    constructor(context: Context) : this(
        PrefsKeyValue(context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)),
    )

    fun all(): List<WhatsAppCallProbeModel.Record> = WhatsAppCallProbeModel.decode(kv.getString(KEY_RECORDS))

    fun add(record: WhatsAppCallProbeModel.Record, now: Long) = synchronized(LOCK) {
        kv.putString(KEY_RECORDS, WhatsAppCallProbeModel.encode(WhatsAppCallProbeModel.retained(all() + record, now)))
    }

    /** Drops expired / surplus records (and anything in an older format). */
    fun prune(now: Long) = synchronized(LOCK) {
        val kept = WhatsAppCallProbeModel.retained(all(), now)
        if (kept.isEmpty()) kv.remove(listOf(KEY_RECORDS)) else kv.putString(KEY_RECORDS, WhatsAppCallProbeModel.encode(kept))
    }

    /** Number of this capture (process run); pseudonyms are only comparable within one. */
    fun nextCapture(): Int = synchronized(LOCK) {
        (kv.getInt(KEY_CAPTURE, 0) + 1).also { kv.putInt(KEY_CAPTURE, it) }
    }

    fun clear() = synchronized(LOCK) { kv.remove(listOf(KEY_RECORDS, KEY_CAPTURE, LEGACY_KEY_SALT)) }

    companion object {
        const val PREFS = "silent_focus_wa_probe"
        private const val KEY_RECORDS = "records"
        private const val KEY_CAPTURE = "capture"
        /** Written by the first (unhardened) probe version; always removed. */
        private const val LEGACY_KEY_SALT = "salt"
        private val LOCK = Any()
    }
}

/**
 * Debug manifest only (src/debug/AndroidManifest.xml), not exported. At
 * process start: installs the probe if this build enabled it; otherwise wipes
 * anything an earlier probe build left behind.
 */
class WhatsAppCallProbeInstaller : ContentProvider() {

    override fun onCreate(): Boolean {
        val ctx = context ?: return true
        if (shouldInstall(BuildConfig.SF_WHATSAPP_CALL_PROBE)) {
            val store = WhatsAppCallProbeStore(ctx)
            // Expired records go at every start, not only on the next write.
            runCatching { store.prune(System.currentTimeMillis()) }
            NotificationProbes.installed = WhatsAppCallProbe(store.nextCapture())
        } else {
            runCatching { WhatsAppCallProbeStore(ctx).clear() }
        }
        return true
    }

    override fun query(uri: Uri, projection: Array<out String>?, selection: String?, selectionArgs: Array<out String>?, sortOrder: String?): Cursor? = null
    override fun getType(uri: Uri): String? = null
    override fun insert(uri: Uri, values: ContentValues?): Uri? = null
    override fun delete(uri: Uri, selection: String?, selectionArgs: Array<out String>?): Int = 0
    override fun update(uri: Uri, values: ContentValues?, selection: String?, selectionArgs: Array<out String>?): Int = 0

    companion object {
        fun shouldInstall(buildFlag: Boolean): Boolean = buildFlag
    }
}
