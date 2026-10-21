package com.SilenceFocus.diagnostics

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.ContentProvider
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.database.Cursor
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.app.NotificationCompat
import androidx.core.app.Person
import com.SilenceFocus.BuildConfig
import com.SilenceFocus.R
import com.SilenceFocus.automation.ActivityEvents
import com.SilenceFocus.automation.EngineStore
import com.SilenceFocus.comms.CommsStore
import com.SilenceFocus.comms.NotificationSource
import org.json.JSONObject
import java.security.SecureRandom
import com.SilenceFocus.diagnostics.ActivityTestHarnessModel as H

/**
 * Client Issues #10/#11 – DEBUG-ONLY synthetic Activity test harness.
 *
 * Reachable only through local ADB: the receiver is declared only in the
 * debug manifest, protected by android.permission.DUMP (held by `adb shell`,
 * not grantable to third-party apps), and needs an explicit component.
 *
 *   adb shell am broadcast -n com.SilenceFocus/com.SilenceFocus.diagnostics.ActivityTestHarnessReceiver \
 *       --es op seed|repost-message|cancel-message|cancel-call|cleanup|status [--es run <runId>]
 *
 * Seeding works only in a debug build made with SF_ACTIVITY_TEST_HARNESS=true
 * AND an empty SF_DEBUG_SERVER_WRITES_ACCOUNT_ID (no server writes). It posts
 * this app's own notifications (never another app's identity) and writes
 * tagged rows through the production journal (EngineStore.appendEvent) with
 * production refs (NotificationSource.ref), so the real Activity preview and
 * row navigation code is what gets exercised.
 */
class ActivityTestHarnessReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        val ctx = context.applicationContext
        resultData = try {
            when (intent.getStringExtra("op")) {
                "seed" -> seed(ctx)
                "repost-message" -> repostMessage(ctx)
                "cancel-message" -> cancel(ctx, H.MESSAGE_NOTIFICATION_ID)
                "cancel-call" -> cancel(ctx, H.CALL_NOTIFICATION_ID)
                "cleanup" -> cleanup(ctx, intent.getStringExtra("run"))
                "status" -> status(ctx)
                "wa-call" -> waCall(ctx, intent.getStringExtra("variant") ?: "number")
                "wa-test-alert" -> com.SilenceFocus.comms.EmergencyCallAlert.showTest(ctx)
                // Round 4: real-listener tests on an isolated, signed-out emulator.
                "wa-silent" -> waSilent(ctx, intent.getBooleanExtra("on", false))
                "wa-ec-add" -> waEcAdd(ctx)
                "sim-mode" -> simMode(ctx, intent.getStringExtra("mode"))
                "sim-state" -> simState(ctx)
                "sim-alert-test" -> gated { "SIM_ALERT " + com.SilenceFocus.comms.EmergencyCallAlert.showSimCall(ctx, com.SilenceFocus.comms.BreakthroughKind.EMERGENCY_CONTACT, 0) }
                "sim-alert-clear" -> gated { CommsStore(ctx).simAlert?.let { com.SilenceFocus.comms.EmergencyCallAlert.endSimCall(ctx, it, notice = false) }; (ctx.getSystemService(NotificationManager::class.java)).cancel("sim-call", 7311); CommsStore(ctx).simAlert = null; "SIM_ALERT_CLEARED" }
                "public-place-upgrade" -> publicPlaceUpgrade(ctx, intent.getBooleanExtra("manual", false))
                "public-place-manual-off" -> {
                    com.SilenceFocus.automation.AutomationEngine.setManual(ctx, false)
                    "MANUAL_OFF"
                }
                "zone-fixture" -> zoneFixture(ctx, intent.getBooleanExtra("on", false))
                "wa-reset" -> waReset(ctx)
                "wa-check-start" -> gated { com.SilenceFocus.comms.WhatsAppCallCheck.start(com.SilenceFocus.comms.WhatsAppCallCheck.store(ctx), System.currentTimeMillis()); "CHECK_STARTED" }
                "wa-check-read" -> waCheckRead(ctx)
                "wa-check-clear" -> { com.SilenceFocus.comms.WhatsAppCallCheck.clear(com.SilenceFocus.comms.WhatsAppCallCheck.store(ctx)); "CHECK_CLEARED" }
                "wa-state" -> waState(ctx)
                else -> "UNKNOWN_OP"
            }
        } catch (e: RuntimeException) {
            "ERROR ${e.javaClass.simpleName}"
        }
    }

    /**
     * Debug/DUMP-only upgrade fixture for the removed Public Places feature.
     * It writes the exact legacy private keys, then enters the production
     * engine. No network or fake external package is involved.
     */
    private fun publicPlaceUpgrade(ctx: Context, manual: Boolean): String {
        if (manual) com.SilenceFocus.automation.AutomationEngine.setManual(ctx, true)
        val prefs = ctx.getSharedPreferences("silent_focus_engine", Context.MODE_PRIVATE)
        prefs.edit()
            .putBoolean("set_public_places_enabled", true)
            .putString("public_places", """[{"id":"al-huda","name":"Al-Huda Academy","latitude":12.97,"longitude":77.59}]""")
            .putString("public_place_presence", """{"al-huda":${System.currentTimeMillis() - 600_000}}""")
            .putString("public_place_status", "READY")
            .apply()
        val state = com.SilenceFocus.automation.AutomationEngine.evaluate(
            ctx,
            com.SilenceFocus.automation.TriggerReason.APP_UPDATED,
        )
        val stale = listOf(
            "set_public_places_enabled", "public_places", "public_place_presence", "public_place_status",
        ).filter(prefs::contains)
        return JSONObject()
            .put("silent", state.optBoolean("silentActive"))
            .put("source", state.optString("source"))
            .put("staleKeys", stale)
            .put("publicPlaces", state.optJSONObject("publicPlaces"))
            .toString()
    }

    /** Debug-only presence callback equivalent for an already saved zone. */
    private fun zoneFixture(ctx: Context, on: Boolean): String {
        val store = EngineStore(ctx)
        val id = store.zones.firstOrNull { it.enabled }?.id ?: return "NO_ENABLED_ZONE"
        store.zonePresence = if (on) mapOf(id to System.currentTimeMillis()) else emptyMap()
        val state = com.SilenceFocus.automation.AutomationEngine.evaluate(
            ctx,
            if (on) com.SilenceFocus.automation.TriggerReason.ZONE_ENTER else com.SilenceFocus.automation.TriggerReason.ZONE_EXIT,
        )
        return JSONObject().put("silent", state.optBoolean("silentActive"))
            .put("source", state.optString("source")).put("zone", id).toString()
    }

    private fun seed(ctx: Context): String {
        val state = HarnessState(ctx)
        H.seedRefusal(BuildConfig.SF_ACTIVITY_TEST_HARNESS, BuildConfig.DEBUG_SERVER_WRITES_ACCOUNT_ID, state.run)
            ?.let { return "REFUSED $it" }
        if (H.evictsRealEntries(HarnessJournal.journalEntries(ctx), System.currentTimeMillis(), EngineStore.MAX_EVENT_AGE_MS, EngineStore.MAX_EVENTS)) {
            return "REFUSED WOULD_TRIM_REAL_ENTRIES"
        }
        val run = ByteArray(4).also { SecureRandom().nextBytes(it) }.joinToString("") { "%02x".format(it) }
        // Remembered first, so cleanup works even if a later step fails.
        state.start(run, System.currentTimeMillis())
        val (earlierAt, messageAt) = HarnessNotifications.postMessage(ctx, run)
        HarnessNotifications.postCall(ctx, run)
        val messageKey = HarnessNotifications.activeKey(ctx, run, H.MESSAGE_NOTIFICATION_ID)
        val callKey = HarnessNotifications.activeKey(ctx, run, H.CALL_NOTIFICATION_ID)
        if (messageKey == null || callKey == null) {
            cleanup(ctx, run)
            return "ERROR NOTIFICATION_NOT_POSTED (notification permission?)"
        }
        val salt = CommsStore(ctx).salt
        val store = EngineStore(ctx)
        H.rows(
            run, ctx.packageName, NotificationSource.ref(salt, messageKey), NotificationSource.ref(salt, callKey),
            System.currentTimeMillis(), messageAt, earlierAt,
        )
            .forEach { row ->
                store.appendEvent(JSONObject().apply {
                    put("id", row.id)
                    put("type", row.type)
                    row.fields.forEach { (k, v) -> put(k, v) }
                })
            }
        return "SEEDED run=$run rows=${H.ROWS_PER_RUN}"
    }

    /**
     * Urgent WhatsApp issue: drives the PRODUCTION WhatsApp call path
     * (WhatsAppCallRecorder.handle) with a synthetic WhatsApp-shaped input and
     * a synthetic emergency contact (+15550100, "SF Test Emergency"). Rows are
     * synthetic + run-tagged; cleanup removes them and the contact. Variants:
     * number (WhatsApp id in the shortcut), name (title only), unknown (no
     * id, generic title), other (a non-emergency number; call 3x = urgent).
     */
    private fun waCall(ctx: Context, variant: String): String {
        val state = HarnessState(ctx)
        val run = state.run ?: return "NO_ACTIVE_RUN (seed first)"
        H.seedRefusal(BuildConfig.SF_ACTIVITY_TEST_HARNESS, BuildConfig.DEBUG_SERVER_WRITES_ACCOUNT_ID, null)
            ?.let { return "REFUSED $it" }
        val comms = CommsStore(ctx)
        if (comms.emergencyContacts.none { it.id == H.EMERGENCY_CONTACT_ID }) {
            comms.emergencyContacts = comms.emergencyContacts +
                com.SilenceFocus.comms.EmergencyContact(H.EMERGENCY_CONTACT_ID, H.EMERGENCY_CONTACT_NAME, H.EMERGENCY_CONTACT_NUMBER)
        }
        val n = state.nextCall()
        val ids = when (variant) {
            "number" -> com.SilenceFocus.comms.WhatsAppEmergency.CallerIds(shortcutId = "15550100@s.whatsapp.net", title = "SF Test Emergency")
            "name" -> com.SilenceFocus.comms.WhatsAppEmergency.CallerIds(title = H.EMERGENCY_CONTACT_NAME)
            "unknown" -> com.SilenceFocus.comms.WhatsAppEmergency.CallerIds(title = "WhatsApp")
            else -> com.SilenceFocus.comms.WhatsAppEmergency.CallerIds(shortcutId = "15550199@s.whatsapp.net", title = "SF Test Other")
        }
        val input = com.SilenceFocus.comms.WhatsAppCallRecorder.CallInput(
            packageName = "com.whatsapp",
            notificationKey = "${H.tag(run)}|wa|$n",
            signals = com.SilenceFocus.comms.WhatsAppCalls.Signals("com.whatsapp", "call", "android.app.Notification\$CallStyle", 1, false, true, false, false),
            title = ids.title,
            personName = null,
            ids = ids,
            contactUri = null,
            open = null,
            synthetic = true,
            eventId = "${H.idPrefix(run)}w$n",
        )
        val r = com.SilenceFocus.comms.WhatsAppCallRecorder.handle(ctx, input) ?: return "NOT_HANDLED (Silent Focus off?)"
        return "HANDLED variant=$variant state=${r.state} kind=${r.kind ?: "-"} alert=${r.alert ?: "-"} matchedBy=${r.matchedBy ?: "-"}"
    }

    private inline fun gated(block: () -> String): String =
        H.seedRefusal(BuildConfig.SF_ACTIVITY_TEST_HARNESS, BuildConfig.DEBUG_SERVER_WRITES_ACCOUNT_ID, null)?.let { "REFUSED $it" } ?: block()

    /** Manual Silent Focus on/off (production engine path), so WhatsApp handling runs while signed out. */
    private fun waSilent(ctx: Context, on: Boolean): String = gated {
        val s = com.SilenceFocus.automation.AutomationEngine.setManual(ctx, on)
        "SILENT on=$on owned=${EngineStore(ctx).owned} source=${s.optString("source")}"
    }

    /** Emergency Call Handling: sets the SIM call mode by id (unknown ids are refused, the mode is unchanged). */
    private fun simMode(ctx: Context, id: String?): String = gated {
        val mode = com.SilenceFocus.comms.SimCallMode.values().firstOrNull { it.id == id } ?: return@gated "UNKNOWN_MODE"
        val comms = CommsStore(ctx)
        comms.callSettings = comms.callSettings.copy(simCallMode = mode)
        "SIM_MODE ${comms.callSettings.simCallMode.id} threshold=${comms.callSettings.urgentThreshold}"
    }

    /** Counts/flags only: SIM call mode, pending SIM alert, DND pause, break-through, phone-call rows by type. */
    private fun simState(ctx: Context): String {
        val comms = CommsStore(ctx)
        val engine = EngineStore(ctx)
        val all = engine.recentEvents()
        val rows = (0 until all.length()).mapNotNull { all.optJSONObject(it) }
            .filter { it.optString("type") in setOf("INCOMING_CALL", "EMERGENCY_BREAKTHROUGH", "URGENT_REPEAT_CALLER") }
            .takeLast(6)
            .joinToString(" ") { "${it.optString("type")}/${it.optString("handling", "-")}/${it.optString("alert", "-")}/${it.optInt("repeatCount")}" }
        return "mode=${comms.callSettings.simCallMode.id} threshold=${comms.callSettings.urgentThreshold} simAlert=${comms.simAlert != null} " +
            "owned=${engine.owned} dndPaused=${engine.dndPaused} breakthrough=${engine.breakthrough != null} rows=[$rows]"
    }

    private fun waEcAdd(ctx: Context): String = gated {
        val comms = CommsStore(ctx)
        if (comms.emergencyContacts.none { it.id == H.EMERGENCY_CONTACT_ID }) {
            comms.emergencyContacts = comms.emergencyContacts +
                com.SilenceFocus.comms.EmergencyContact(H.EMERGENCY_CONTACT_ID, H.EMERGENCY_CONTACT_NAME, H.EMERGENCY_CONTACT_NUMBER)
        }
        "EC_ADDED count=${comms.emergencyContacts.size}"
    }

    /** Removes the synthetic contact, WhatsApp call state and alert history; Silent Focus off. */
    private fun waReset(ctx: Context): String = gated {
        val comms = CommsStore(ctx)
        comms.emergencyContacts = comms.emergencyContacts.filterNot { it.id == H.EMERGENCY_CONTACT_ID }
        comms.clearRecentCalls()
        com.SilenceFocus.comms.WhatsAppCallCheck.clear(com.SilenceFocus.comms.WhatsAppCallCheck.store(ctx))
        com.SilenceFocus.automation.AutomationEngine.setManual(ctx, false)
        "RESET owned=${EngineStore(ctx).owned} contacts=${comms.emergencyContacts.size}"
    }

    /** Counts only (no names): WhatsApp rows by kind and alert outcome. */
    private fun waState(ctx: Context): String {
        val all = EngineStore(ctx).recentEvents()
        val rows = (0 until all.length()).mapNotNull { all.optJSONObject(it) }
            .filter { it.optString("type") == com.SilenceFocus.automation.ActivityEvents.WHATSAPP_CALL }
        val comms = CommsStore(ctx)
        return "rows=${rows.size} " + rows.joinToString(" ") {
            "${it.optString("callState")}/${if (it.optBoolean("emergency")) "EC" else if (it.optBoolean("repeat")) "URG${it.optInt("repeatCount")}" else "-"}/${it.optString("alert", "-")}/${it.optString("matchedBy", "-")}"
        } + " episodes=${comms.waCallEpisodes.size} owned=${EngineStore(ctx).owned}"
    }

    private fun waCheckRead(ctx: Context): String {
        val r = com.SilenceFocus.comms.WhatsAppCallCheck.read(com.SilenceFocus.comms.WhatsAppCallCheck.store(ctx), System.currentTimeMillis())
            ?: return "CHECK none"
        return "CHECK running=${r.running(System.currentTimeMillis())} waSeen=${r.waSeen} callLike=${r.callLikeSeen} ringing=${r.ringing} " +
            "calls=${r.calls} app=${r.app} sfOn=${r.silentFocusOn} callerId=${r.callerIdentified} number=${r.numberShown} name=${r.nameShown} " +
            "ec=${r.emergencyMatched}/${r.matchedBy} nameWould=${r.nameWouldMatch} repeat=${r.repeatCount} urgent=${r.urgentReached} " +
            "attempted=${r.alertAttempted} outcome=${r.alertOutcome} stoppedMs=${r.alertStoppedAfterMs} shape=[${r.shape}]"
    }

    private fun repostMessage(ctx: Context): String {
        val run = HarnessState(ctx).run ?: return "NO_ACTIVE_RUN"
        HarnessNotifications.postMessage(ctx, run)
        return "REPOSTED run=$run"
    }

    private fun cancel(ctx: Context, id: Int): String {
        val run = HarnessState(ctx).run ?: return "NO_ACTIVE_RUN"
        HarnessNotifications.cancel(ctx, run, id)
        return "CANCELLED run=$run id=$id"
    }

    private fun status(ctx: Context): String {
        val entries = HarnessJournal.entries(ctx)
        return "run=${HarnessState(ctx).run ?: "-"} harness=${BuildConfig.SF_ACTIVITY_TEST_HARNESS} " +
            "writesDisabled=${BuildConfig.DEBUG_SERVER_WRITES_ACCOUNT_ID.isEmpty()} " +
            "syntheticRows=${entries.count { it.synthetic }} totalRows=${entries.size}"
    }

    companion object {
        /** Removes only [runId]'s rows and notifications. Allowed even when seeding is disabled. */
        fun cleanup(ctx: Context, runParam: String?): String {
            val state = HarnessState(ctx)
            val run = runParam ?: state.run ?: return "NO_ACTIVE_RUN"
            if (!H.isValidRunId(run)) return "INVALID_RUN"
            val ids = H.cleanupIds(HarnessJournal.entries(ctx), run)
            if (ids.isNotEmpty()) EngineStore(ctx).clearEvents(ids)
            HarnessNotifications.cancel(ctx, run, H.MESSAGE_NOTIFICATION_ID)
            HarnessNotifications.cancel(ctx, run, H.CALL_NOTIFICATION_ID)
            // Synthetic emergency contact and the alerts it raised.
            val comms = CommsStore(ctx)
            comms.emergencyContacts = comms.emergencyContacts.filterNot { it.id == H.EMERGENCY_CONTACT_ID }
            comms.waAlertsSent = comms.waAlertsSent.filterNot { it.key == "ec:${H.EMERGENCY_CONTACT_ID}" }
            (1..state.calls).forEach { com.SilenceFocus.comms.EmergencyCallAlert.cancel(ctx, NotificationSource.ref(comms.salt, "${H.tag(run)}|wa|$it")) }
            com.SilenceFocus.comms.EmergencyCallAlert.cancel(ctx, com.SilenceFocus.comms.EmergencyCallAlert.TEST_TAG)
            if (state.run == run) state.clear()
            return "CLEANED run=$run removed=${ids.size}"
        }
    }
}

/** Debug manifest only, not exported: expires leftovers of any run at process start (flag on or off). */
class ActivityTestHarnessJanitor : ContentProvider() {

    override fun onCreate(): Boolean {
        val ctx = context?.applicationContext ?: return true
        runCatching {
            val now = System.currentTimeMillis()
            val expired = H.expiredIds(HarnessJournal.entries(ctx), now)
            if (expired.isNotEmpty()) EngineStore(ctx).clearEvents(expired)
            val state = HarnessState(ctx)
            if (state.run != null && state.startedAt <= now - H.EXPIRY_MS) {
                ActivityTestHarnessReceiver.cleanup(ctx, state.run)
            }
        }
        return true
    }

    override fun query(uri: Uri, projection: Array<out String>?, selection: String?, selectionArgs: Array<out String>?, sortOrder: String?): Cursor? = null
    override fun getType(uri: Uri): String? = null
    override fun insert(uri: Uri, values: ContentValues?): Uri? = null
    override fun delete(uri: Uri, selection: String?, selectionArgs: Array<out String>?): Int = 0
    override fun update(uri: Uri, values: ContentValues?, selection: String?, selectionArgs: Array<out String>?): Int = 0
}

/** The active run (id + start); app-private "silent_focus_test_harness". */
private class HarnessState(ctx: Context) {
    private val prefs = ctx.getSharedPreferences("silent_focus_test_harness", Context.MODE_PRIVATE)
    val run: String? get() = prefs.getString("run", null)?.takeIf { H.isValidRunId(it) }
    val startedAt: Long get() = prefs.getLong("startedAt", 0L)
    fun start(run: String, at: Long) = prefs.edit().putString("run", run).putLong("startedAt", at).commit()
    fun clear() = prefs.edit().clear().commit()
    val calls: Int get() = prefs.getInt("calls", 0)
    fun nextCall(): Int = (calls + 1).also { prefs.edit().putInt("calls", it).commit() }
}

private object HarnessJournal {
    /** The journal as retention sees it (same parsing as EngineStore.appendEvent). */
    fun journalEntries(ctx: Context): List<ActivityEvents.JournalEntry> {
        val events = EngineStore(ctx).recentEvents()
        val now = System.currentTimeMillis()
        return (0 until events.length()).mapNotNull { i ->
            events.optJSONObject(i)?.let {
                ActivityEvents.JournalEntry(
                    it.optString("type"), it.optLong("at", now), it.optBoolean("acked", false),
                    it.optBoolean(ActivityEvents.SYNTHETIC_FIELD, false),
                )
            }
        }
    }

    fun entries(ctx: Context): List<H.Entry> {
        val events = EngineStore(ctx).recentEvents()
        return (0 until events.length()).mapNotNull { i ->
            events.optJSONObject(i)?.let {
                H.Entry(it.optString("id").ifEmpty { null }, it.optBoolean(ActivityEvents.SYNTHETIC_FIELD, false), it.optLong("at"))
            }
        }
    }
}

/** This app's own synthetic notifications (no other app's identity). */
private object HarnessNotifications {

    private fun nm(ctx: Context) = ctx.getSystemService(NotificationManager::class.java)

    private fun channel(ctx: Context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            nm(ctx).createNotificationChannel(
                NotificationChannel(H.CHANNEL_ID, "Test harness (debug)", NotificationManager.IMPORTANCE_LOW),
            )
        }
    }

    /**
     * Tap targets that differ from the "open the app" fallback, so a test can
     * see which path the production code took: the message notification
     * opens this channel's settings, the call notification this app's
     * notification settings. Both are plain system screens of this app.
     */
    private fun settings(ctx: Context, requestCode: Int, channel: Boolean): PendingIntent {
        val intent = if (channel && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Intent(Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_CHANNEL_ID, H.CHANNEL_ID)
        } else {
            Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
        }.putExtra(Settings.EXTRA_APP_PACKAGE, ctx.packageName).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        return PendingIntent.getActivity(ctx, requestCode, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    /** Posts a two-message conversation; returns (earlier, newest) message timestamps. */
    fun postMessage(ctx: Context, run: String): Pair<Long, Long> {
        channel(ctx)
        val sender = Person.Builder().setName(H.SENDER_NAME).setKey("sftest-sender").build()
        val me = Person.Builder().setName("Me").build()
        val newest = System.currentTimeMillis()
        val earlier = newest - 60_000L
        val n = NotificationCompat.Builder(ctx, H.CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_silent_focus)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setStyle(
                NotificationCompat.MessagingStyle(me)
                    .addMessage(H.earlierMessageText(run), earlier, sender)
                    .addMessage(H.messageText(run), newest, sender),
            )
            .setContentIntent(settings(ctx, 7401, channel = true))
            .build()
        nm(ctx).notify(H.tag(run), H.MESSAGE_NOTIFICATION_ID, n)
        return earlier to newest
    }

    fun postCall(ctx: Context, run: String) {
        channel(ctx)
        val n = NotificationCompat.Builder(ctx, H.CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_silent_focus)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setContentTitle("${H.APP_LABEL} call")
            .setContentText("Synthetic call row $run")
            .setContentIntent(settings(ctx, 7402, channel = false))
            .build()
        nm(ctx).notify(H.tag(run), H.CALL_NOTIFICATION_ID, n)
    }

    fun activeKey(ctx: Context, run: String, id: Int): String? =
        nm(ctx).activeNotifications.firstOrNull { it.tag == H.tag(run) && it.id == id }?.key

    fun cancel(ctx: Context, run: String, id: Int) = nm(ctx).cancel(H.tag(run), id)
}
