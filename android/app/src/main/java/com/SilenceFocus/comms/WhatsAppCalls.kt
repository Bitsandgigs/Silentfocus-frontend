package com.SilenceFocus.comms

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log
import androidx.core.app.NotificationCompat
import com.SilenceFocus.R
import com.SilenceFocus.automation.ActivityEvents
import com.SilenceFocus.automation.EngineStore
import org.json.JSONObject
import java.security.MessageDigest

/**
 * Client Issues #9 / #6 – WhatsApp call rows in the Activity Center, and the
 * repeated-WhatsApp-caller notice. Android has no public WhatsApp call API:
 * everything here is read from the structure of WhatsApp's own
 * notifications (category, CallStyle template/type, full-screen intent),
 * never from their text. Only these states are claimed:
 * - INCOMING: a ringing call notification (CallStyle "incoming", or a `call`
 *   notification with a full-screen intent);
 * - MISSED: a notification in Android's `missed_call` category.
 * Answered / declined / duration / which device answered are NOT detectable
 * and are never recorded. Ongoing-call notifications are ignored.
 *
 * Privacy: for the repeat rule the caller is kept only as a salted hash
 * (per-install salt, `wa:` namespace). Round 3 (#1): the row also carries
 * the caller's display name exactly as WhatsApp shows it (CallStyle person
 * or title, see [NotificationNames]; a bare number only redacted), so the
 * Activity Center can say who called. That name lives only in this
 * account's local journal: WHATSAPP_CALL rows are never uploaded (not in
 * ActivityEvents.UPLOADED_TYPES), names are stripped from logout outboxes,
 * cleared with the rows and never logged. No number, text or key is stored.
 *
 * Structure assumptions are unverified on real WhatsApp builds – see
 * docs/WHATSAPP_CALLS.md for the device checks still required.
 */
object WhatsAppCalls {

    val APPS = mapOf("com.whatsapp" to "WhatsApp", "com.whatsapp.w4b" to "WhatsApp Business")

    const val CATEGORY_MISSED_CALL = "missed_call"
    /** Notification.CallStyle.CALL_TYPE_INCOMING (API 31). */
    const val CALL_TYPE_INCOMING = 1
    const val EXTRA_CALL_TYPE = "android.callType"
    const val CALL_STYLE_SUFFIX = "\$CallStyle"
    /**
     * Notification.FLAG_FSI_REQUESTED_BUT_DENIED (hidden, Android 14+): the app
     * asked for a full-screen intent but may not use one, so Android REMOVED
     * `fullScreenIntent` before listeners see it. A ringing WhatsApp call on a
     * phone where WhatsApp lacks the "full screen notifications" permission
     * looks like this.
     */
    const val FLAG_FSI_REQUESTED_BUT_DENIED = 0x00004000
    /** NotificationManager.IMPORTANCE_HIGH (heads-up channel). */
    const val IMPORTANCE_HIGH = 4

    /** Missed-call notifications are recorded once per state while posted (or this long). */
    const val DEDUPE_MS = 10 * 60_000L
    /** A ringing notification not updated for this long is stale (WhatsApp rings well under a minute). */
    const val RING_MAX_MS = 2 * 60_000L
    /** A call notification removed and re-posted within this gap is the same call (not a new one). */
    const val REPOST_GAP_MS = 4_000L
    const val MAX_TRACKED = 50

    enum class State { INCOMING, MISSED }

    /** Structural signals of one notification (no text). */
    data class Signals(
        val packageName: String,
        val category: String?,
        val template: String?,
        val callType: Int?,
        val ongoing: Boolean,
        val hasFullScreenIntent: Boolean,
        val isGroupConversation: Boolean,
        val isGroupSummary: Boolean,
        /** Android 14+: full-screen intent requested but removed by the system. */
        val fsiDenied: Boolean = false,
        /** FLAG_INSISTENT: the notification sound repeats until handled (ringing). */
        val insistent: Boolean = false,
        /** The notification's effective channel importance (listener ranking), when known. */
        val importance: Int? = null,
        /** A running call timer (answered / outgoing call in progress). */
        val chronometer: Boolean = false,
        /** Number of actions (an incoming call offers Decline + Answer). */
        val actionCount: Int = 0,
        /** The posting channel id, only when it is a plain app channel name (see [safeChannel]). */
        val channel: String? = null,
    )

    fun isWhatsApp(packageName: String?) = packageName in APPS

    /**
     * INCOMING / MISSED, or null for anything else (messages, ongoing calls,
     * groups, other apps). Round 4: WhatsApp builds differ, so a ringing call
     * is recognised from any of these structures, strongest first:
     *  1. CallStyle with call type "incoming" (a CallStyle of another type -
     *     ongoing / screening - is never a ringing call);
     *  2. a `call` notification with a full-screen intent, or one whose
     *     full-screen intent Android removed (Android 14+ permission denied);
     *  3. a `call` notification that repeats its sound (insistent);
     *  4. a heads-up (`IMPORTANCE_HIGH`) `call` notification offering at least
     *     two actions (Decline / Answer) and no running call timer.
     * A running chronometer always means an answered or outgoing call.
     */
    fun classify(s: Signals): State? {
        if (!isWhatsApp(s.packageName) || s.isGroupSummary || s.isGroupConversation) return null
        if (s.category == CATEGORY_MISSED_CALL) return State.MISSED
        val callStyle = s.template?.endsWith(CALL_STYLE_SUFFIX) == true
        if (callStyle && s.callType != null && s.callType != 0) {
            return if (s.callType == CALL_TYPE_INCOMING) State.INCOMING else null
        }
        if (s.category != Notification.CATEGORY_CALL && !callStyle) return null
        if (s.hasFullScreenIntent || s.fsiDenied) return State.INCOMING
        if (s.chronometer) return null
        if (s.insistent) return State.INCOMING
        if ((s.importance ?: 0) >= IMPORTANCE_HIGH && s.actionCount >= 2) return State.INCOMING
        return null
    }

    /** Category `call` / `missed_call`, a CallStyle or a call type: worth a look in the diagnostic. */
    fun isCallLike(s: Signals): Boolean = isWhatsApp(s.packageName) && (
        s.category == Notification.CATEGORY_CALL || s.category == CATEGORY_MISSED_CALL ||
            s.template?.endsWith(CALL_STYLE_SUFFIX) == true || s.callType != null
        )

    private val SAFE_CHANNEL = Regex("^[A-Za-z_]{1,40}(_\\d{1,3})?$")

    /** A channel id kept only when it can't carry an identity (no long digit runs, no '@'). */
    fun safeChannel(id: String?): String? = id?.takeIf { SAFE_CHANNEL.matches(it) }

    /**
     * Structure of one notification for the "Check WhatsApp Call Alerts"
     * result (support detail). Flags and types only: never text, names,
     * numbers, ids or keys.
     */
    fun shape(s: Signals): String = listOf(
        "cat=${s.category?.takeIf { it.matches(Regex("^[a-z_]{1,20}$")) } ?: "-"}",
        "style=${s.template?.substringAfterLast('$')?.takeIf { it.matches(Regex("^[A-Za-z]{1,30}$")) } ?: "-"}",
        "type=${s.callType ?: "-"}",
        "fsi=${if (s.hasFullScreenIntent) 1 else 0}${if (s.fsiDenied) "d" else ""}",
        "ins=${if (s.insistent) 1 else 0}",
        "imp=${s.importance ?: "-"}",
        "chr=${if (s.chronometer) 1 else 0}",
        "act=${s.actionCount}",
        "ong=${if (s.ongoing) 1 else 0}",
        "ch=${s.channel ?: "-"}",
    ).joinToString(" ")

    // ---- call episodes (one real call = one count, one alert)

    /**
     * One tracked call notification. [caller] is the salted caller key ("" if
     * unknown); [alertRef] is the notification ref the call's alert is tagged
     * with (the first notification of that call); [endedAt] 0 while posted.
     */
    data class Episode(
        val ref: String,
        val state: State,
        val caller: String,
        val alertRef: String,
        val firstSeen: Long,
        val lastSeen: Long,
        val endedAt: Long = 0L,
    ) {
        fun ringing(now: Long) = state == State.INCOMING && endedAt == 0L && now - lastSeen in 0..RING_MAX_MS
        fun justEnded(now: Long) = endedAt != 0L && now - endedAt in 0..REPOST_GAP_MS
    }

    /** [isNew]: a new real call (count it, maybe alert); else an update of a call already handled. */
    data class Post(val isNew: Boolean, val alertRef: String, val episodes: List<Episode>)

    private fun prune(episodes: List<Episode>, now: Long) =
        episodes.filter { it.lastSeen in (now - DEDUPE_MS)..now }

    /**
     * A WhatsApp call notification [ref] in [state] was posted. Same call:
     * - the same notification updated while it is still ringing (or, for a
     *   missed call, still posted);
     * - the same notification, or another one for the same [caller], posted
     *   while that caller's call is still ringing or within [REPOST_GAP_MS]
     *   of it being removed (WhatsApp replacing its own notification).
     * Anything else is a new call - including the same notification key
     * reused by WhatsApp for a later call after the first one ended.
     */
    fun onPost(episodes: List<Episode>, state: State, ref: String, caller: String?, now: Long): Post {
        val live = prune(episodes, now)
        val same = live.firstOrNull { it.ref == ref && it.state == state }
        if (same != null && same.endedAt == 0L &&
            (if (state == State.INCOMING) same.ringing(now) else true)
        ) {
            return Post(false, same.alertRef, live.map { if (it === same) it.copy(lastSeen = now) else it })
        }
        val others = live.filterNot { it === same }
        if (state == State.INCOMING) {
            val alias = same?.takeIf { it.justEnded(now) }
                ?: caller?.let { c -> others.firstOrNull { it.state == State.INCOMING && it.caller == c && (it.ringing(now) || it.justEnded(now)) } }
            if (alias != null) {
                return Post(false, alias.alertRef, others + Episode(ref, state, caller.orEmpty(), alias.alertRef, alias.firstSeen, now))
            }
        }
        val next = (others + Episode(ref, state, caller.orEmpty(), ref, now, now)).sortedBy { it.lastSeen }.takeLast(MAX_TRACKED)
        return Post(true, ref, next)
    }

    /**
     * Notification [ref] was removed ([state] null) or stopped being a ringing
     * call ([state] = INCOMING: it turned into a missed / answered call).
     */
    fun end(episodes: List<Episode>, ref: String, now: Long, state: State? = null): List<Episode> =
        episodes.map { if (it.ref == ref && it.endedAt == 0L && (state == null || it.state == state)) it.copy(endedAt = now) else it }

    /** Alert refs of [ref]'s ringing episodes (to re-check after [end]). */
    fun alertRefsOf(episodes: List<Episode>, ref: String): Set<String> =
        episodes.filter { it.ref == ref && it.state == State.INCOMING }.map { it.alertRef }.toSet()

    /** Whether any notification of the call behind [alertRef] is still ringing. */
    fun stillRinging(episodes: List<Episode>, alertRef: String, now: Long): Boolean =
        episodes.any { it.alertRef == alertRef && it.ringing(now) }

    /**
     * Salted caller hash for the repeat rule, from the most stable identity
     * WhatsApp exposes: shortcut id (conversation), else a Person key, else
     * the title. Never stored in clear. Null when nothing identifies the caller.
     */
    fun callerKey(salt: String, packageName: String, shortcutId: String?, personKey: String?, title: String?): String? {
        val raw = shortcutId?.takeIf { it.isNotBlank() }
            ?: personKey?.takeIf { it.isNotBlank() }
            ?: title?.takeIf { NotificationNames.clean(it, APPS.values) != null }
            ?: return null
        val md = MessageDigest.getInstance("SHA-256")
        md.update("wa-caller|".toByteArray())
        md.update(salt.toByteArray())
        md.update(packageName.toByteArray())
        md.update(raw.toByteArray())
        return "wa:" + md.digest().take(12).joinToString("") { "%02x".format(it) }
    }

    /** Result of the repeat rule for one INCOMING call. */
    data class Repeat(val repeated: Boolean, val count: Int, val state: RepeatCallState)

    /**
     * #6: the existing urgent-caller policy (threshold 2–10, window ≤ 60 min,
     * cooldown) applied to WhatsApp calls with their own state, so cellular
     * and WhatsApp counts never mix. Called once per real call ([onPost] isNew).
     */
    fun repeat(settings: CallSettings, callerKey: String?, now: Long, state: RepeatCallState): Repeat {
        if (callerKey == null) return Repeat(false, 0, state.pruned(now, settings.sanitized().urgentWindowMinutes * 60_000L))
        val r = UrgentRepeatCallerException(settings).onCall(callerKey, now, state)
        return Repeat(r.urgent, r.countInWindow, r.state)
    }
}

/** Listener side: reads the signals, applies [WhatsAppCalls], writes the journal. */
object WhatsAppCallRecorder {

    private const val TAG = "SilentFocusWaCall"
    const val CHANNEL_ID = "silent_focus_wa_repeat"
    private const val NOTIFICATION_ID = 7302

    private val main by lazy { Handler(Looper.getMainLooper()) }

    /**
     * Everything the recorder reads from one WhatsApp notification. Built from
     * the posted notification ([inputOf]) or, in debug builds only, by the
     * synthetic test harness ([synthetic] rows are never uploaded).
     */
    data class CallInput(
        val packageName: String,
        val notificationKey: String,
        val signals: WhatsAppCalls.Signals,
        val title: String?,
        val personName: CharSequence?,
        val ids: WhatsAppEmergency.CallerIds,
        /** A contacts URI to resolve to numbers (only with Contacts permission). */
        val contactUri: String?,
        /** WhatsApp's own tap action for this call. */
        val open: PendingIntent?,
        val synthetic: Boolean = false,
        /** Debug harness only: a fixed journal id so its cleanup can find the row. */
        val eventId: String? = null,
    )

    /** Outcome of [handle] (for tests, the debug harness and the diagnostic; no caller data). */
    data class Handled(
        val state: WhatsAppCalls.State,
        val kind: WhatsAppEmergency.Kind?,
        val alert: String?,
        val matchedBy: String?,
        val identity: WhatsAppEmergency.Identity? = null,
        val repeatCount: Int = 0,
        /** Something identified the caller (a conversation id, person or name) - the urgent rule can count them. */
        val callerKnown: Boolean = false,
    )

    @Synchronized
    fun onPosted(context: Context, sbn: StatusBarNotification, ranking: NotificationListenerService.Ranking? = null, now: Long = System.currentTimeMillis()) {
        if (!WhatsAppCalls.isWhatsApp(sbn.packageName)) return
        val n = sbn.notification ?: return
        val ctx = context.applicationContext
        val signals = signals(sbn, n, ranking)
        val state = WhatsAppCalls.classify(signals)
        val check = WhatsAppCallCheck.store(ctx)
        val checking = WhatsAppCallCheck.running(check, now)
        if (checking) WhatsAppCallCheck.sawNotification(check, signals, state, now)
        val ref = NotificationSource.ref(CommsStore(ctx).salt, sbn.key)
        if (state != WhatsAppCalls.State.INCOMING) endRinging(ctx, ref, now)
        if (state == null) return
        val input = inputOf(sbn, n, signals)
        val handled = handle(ctx, input, now)
        if (checking && state == WhatsAppCalls.State.INCOMING) {
            val owned = EngineStore(ctx).owned
            // Silent Focus on: only a new call is reported (updates return null).
            val h = handled ?: if (!owned) dryRun(ctx, input) else null
            if (h != null) WhatsAppCallCheck.sawCall(check, input.packageName, h, owned, ref, now)
        }
    }

    /**
     * Records one WhatsApp call notification and, for a ringing call while
     * Silent Focus is active, checks Emergency Contacts first, then the
     * urgent repeat-caller rule, and sounds Silent Focus's own alert.
     * Returns null when Silent Focus is off or the notification only updates
     * a call already handled.
     */
    @Synchronized
    fun handle(context: Context, input: CallInput, now: Long = System.currentTimeMillis()): Handled? {
        val state = WhatsAppCalls.classify(input.signals) ?: return null
        val ctx = context.applicationContext
        val engine = EngineStore(ctx)
        // Like messages: only while Silent Focus is active (otherwise WhatsApp rings normally).
        if (!engine.owned) return null

        val comms = CommsStore(ctx)
        val salt = comms.salt
        val ref = NotificationSource.ref(salt, input.notificationKey)
        val callerKey = callerKeyOf(salt, input)
        val post = WhatsAppCalls.onPost(comms.waCallEpisodes, state, ref, callerKey, now)
        comms.waCallEpisodes = post.episodes
        // The same call updated or re-posted: already handled (no second count or alert).
        if (!post.isNew) return null

        val settings = comms.callSettings.sanitized()
        var identity: WhatsAppEmergency.Identity? = null
        var match: WhatsAppEmergency.Match? = null
        var repeat: WhatsAppCalls.Repeat? = null
        if (state == WhatsAppCalls.State.INCOMING) {
            identity = identify(ctx, comms, input, settings)
            match = identity.match
            // Emergency contacts never count toward the urgent rule (same as cellular).
            if (match == null) {
                repeat = WhatsAppCalls.repeat(settings, callerKey, now, comms.waRepeatState).also { comms.waRepeatState = it.state }
            }
        }
        val app = WhatsAppCalls.APPS[input.packageName] ?: input.packageName
        val name = NotificationNames.callerName(input.personName, input.title, WhatsAppCalls.APPS.values)
        val kind = when {
            match != null -> WhatsAppEmergency.Kind.EMERGENCY
            repeat?.repeated == true -> WhatsAppEmergency.Kind.URGENT
            else -> null
        }
        var alert: String? = null
        if (kind != null) {
            alert = if (!settings.whatsAppAlertsEnabled) {
                if (kind == WhatsAppEmergency.Kind.URGENT) notifyRepeat(ctx, app, repeat!!.count)
                WhatsAppEmergency.REASON_DISABLED
            } else {
                val key = WhatsAppEmergency.alertKey(match, callerKey) ?: "ref:$ref"
                val limit = WhatsAppEmergency.limit(comms.waAlertsSent, key, now)
                if (!limit.allowed) {
                    limit.reason
                } else {
                    comms.waAlertsSent = limit.history
                    val who = if (kind == WhatsAppEmergency.Kind.EMERGENCY) match?.contact?.name ?: name else name
                    EmergencyCallAlert.show(ctx, kind, app, input.packageName, who, repeat?.count ?: 0, post.alertRef, input.open)
                        .also { if (it == EmergencyCallAlert.SENT || it == EmergencyCallAlert.SENT_SILENCED) comms.waAlertPostedAt = now }
                }
            }
        }
        engine.appendEvent(JSONObject().apply {
            input.eventId?.let { put("id", it) }
            put("type", ActivityEvents.WHATSAPP_CALL)
            put("callState", state.name)
            name?.let { put(NotificationNames.FIELD_NAME, it) }
            put("app", app)
            put("appPackage", input.packageName)
            put("notificationRef", ref)
            if (match != null) {
                put("emergency", true)
                // The user's own label for their emergency contact (already stored locally).
                match.contact.name?.let { put("contactName", it) }
                put("matchedBy", match.method.name)
            }
            if (repeat?.repeated == true) {
                put("repeat", true)
                put("repeatCount", repeat.count)
            }
            alert?.let { put("alert", it) }
            if (input.synthetic) put(ActivityEvents.SYNTHETIC_FIELD, true)
            put("at", now)
        })
        Log.i(TAG, "${input.packageName}: $state${kind?.let { " $it alert=$alert" } ?: ""}")
        return Handled(state, kind, alert, match?.method?.name, identity, repeat?.count ?: 0, callerKey != null)
    }

    private fun callerKeyOf(salt: String, input: CallInput) =
        WhatsAppCalls.callerKey(salt, input.packageName, input.ids.shortcutId, input.ids.personKey ?: input.ids.personUri, input.title ?: input.personName?.toString())

    /** Emergency-contact matching, with the contacts-URI lookup when WhatsApp exposed no number. */
    private fun identify(ctx: Context, comms: CommsStore, input: CallInput, settings: CallSettings): WhatsAppEmergency.Identity {
        val contacts = comms.emergencyContacts
        var ids = input.ids
        if (settings.emergencyEnabled && contacts.isNotEmpty() && input.contactUri != null &&
            WhatsAppEmergency.exposedNumbers(ids).isEmpty() &&
            WhatsAppEmergency.match(contacts, ids, true, false) == null
        ) {
            val resolved = ContactNumbers.resolve(ctx, input.contactUri)
            if (resolved.isNotEmpty()) ids = ids.copy(contactNumbers = resolved)
        }
        return WhatsAppEmergency.identify(contacts, ids, settings.emergencyEnabled, settings.whatsAppNameMatch)
    }

    /**
     * Diagnostic only, while Silent Focus is off (nothing would be alerted):
     * what WOULD be recognised. Changes no state.
     */
    private fun dryRun(ctx: Context, input: CallInput): Handled {
        val comms = CommsStore(ctx)
        val settings = comms.callSettings.sanitized()
        val identity = identify(ctx, comms, input, settings)
        return Handled(WhatsAppCalls.State.INCOMING, null, null, identity.match?.method?.name, identity, 0, callerKeyOf(comms.salt, input) != null)
    }

    fun onRemoved(context: Context, sbn: StatusBarNotification, now: Long = System.currentTimeMillis()) {
        if (!WhatsAppCalls.isWhatsApp(sbn.packageName)) return
        runCatching {
            val ctx = context.applicationContext
            endRinging(ctx, NotificationSource.ref(CommsStore(ctx).salt, sbn.key), now, removed = true)
        }
    }

    /**
     * Notification [ref] stopped ringing (removed, or turned into a missed /
     * answered call). The alert stops only if no notification of that call
     * is still ringing after [WhatsAppCalls.REPOST_GAP_MS]: WhatsApp may
     * replace its call notification while the phone keeps ringing, and
     * cancelling then would cut the alert off after a moment.
     */
    @Synchronized
    private fun endRinging(ctx: Context, ref: String, now: Long, removed: Boolean = false) {
        val comms = CommsStore(ctx)
        val episodes = comms.waCallEpisodes
        if (episodes.none { it.ref == ref }) return
        val alertRefs = WhatsAppCalls.alertRefsOf(episodes, ref)
        comms.waCallEpisodes = WhatsAppCalls.end(episodes, ref, now, if (removed) null else WhatsAppCalls.State.INCOMING)
        alertRefs.forEach { alertRef ->
            main.postDelayed({ stopIfEnded(ctx, alertRef) }, WhatsAppCalls.REPOST_GAP_MS + 250)
        }
    }

    @Synchronized
    private fun stopIfEnded(ctx: Context, alertRef: String, now: Long = System.currentTimeMillis()) {
        runCatching {
            val comms = CommsStore(ctx)
            if (WhatsAppCalls.stillRinging(comms.waCallEpisodes, alertRef, now)) return
            if (EmergencyCallAlert.cancel(ctx, alertRef)) {
                val check = WhatsAppCallCheck.store(ctx)
                if (WhatsAppCallCheck.running(check, now)) {
                    comms.waAlertPostedAt.takeIf { it > 0 }?.let { WhatsAppCallCheck.alertStopped(check, now - it, now) }
                }
            }
        }
    }

    private fun inputOf(sbn: StatusBarNotification, n: Notification, signals: WhatsAppCalls.Signals): CallInput {
        // Round 4: a non-CallStyle call notification carries its caller in the people list.
        val person = callPerson(n) ?: listPerson(n)
        val uri = person?.uri ?: peopleUri(n)
        val title = n.extras?.getCharSequence(Notification.EXTRA_TITLE)?.toString()
        return CallInput(
            packageName = sbn.packageName,
            notificationKey = sbn.key,
            signals = signals,
            title = title,
            personName = person?.name,
            ids = WhatsAppEmergency.CallerIds(
                personUri = uri,
                personKey = person?.key,
                shortcutId = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) n.shortcutId else null,
                tag = sbn.tag,
                title = title,
                personName = person?.name?.toString(),
            ),
            contactUri = uri?.takeIf { it.startsWith("content://com.android.contacts", ignoreCase = true) },
            open = n.contentIntent ?: n.fullScreenIntent,
        )
    }

    /** First Person of android.people.list (Android 9+). */
    private fun listPerson(n: Notification): android.app.Person? = runCatching {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            @Suppress("DEPRECATION")
            n.extras?.getParcelableArrayList<android.app.Person>(Notification.EXTRA_PEOPLE_LIST)?.firstOrNull()
        } else {
            null
        }
    }.getOrNull()

    /** First person URI of a non-CallStyle notification (android.people.list / android.people). */
    private fun peopleUri(n: Notification): String? = runCatching {
        val extras = n.extras ?: return@runCatching null
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            @Suppress("DEPRECATION")
            extras.getParcelableArrayList<android.app.Person>(Notification.EXTRA_PEOPLE_LIST)?.firstOrNull()?.uri?.let { return@runCatching it }
        }
        @Suppress("DEPRECATION")
        extras.getStringArray(Notification.EXTRA_PEOPLE)?.firstOrNull()
    }.getOrNull()

    fun signals(sbn: StatusBarNotification, n: Notification, ranking: NotificationListenerService.Ranking? = null) = WhatsAppCalls.Signals(
        packageName = sbn.packageName,
        category = n.category,
        template = n.extras?.getString(Notification.EXTRA_TEMPLATE),
        callType = n.extras?.takeIf { it.containsKey(WhatsAppCalls.EXTRA_CALL_TYPE) }?.getInt(WhatsAppCalls.EXTRA_CALL_TYPE),
        ongoing = n.flags and Notification.FLAG_ONGOING_EVENT != 0,
        hasFullScreenIntent = n.fullScreenIntent != null,
        isGroupConversation = n.extras?.getBoolean(NotificationCompat.EXTRA_IS_GROUP_CONVERSATION, false) == true,
        isGroupSummary = n.flags and Notification.FLAG_GROUP_SUMMARY != 0,
        fsiDenied = n.flags and WhatsAppCalls.FLAG_FSI_REQUESTED_BUT_DENIED != 0,
        insistent = n.flags and Notification.FLAG_INSISTENT != 0,
        importance = ranking?.importance?.takeIf { it >= 0 } ?: channelImportance(sbn, ranking),
        chronometer = n.extras?.getBoolean(Notification.EXTRA_SHOW_CHRONOMETER, false) == true,
        actionCount = n.actions?.size ?: 0,
        channel = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) WhatsAppCalls.safeChannel(n.channelId) else null,
    )

    private fun channelImportance(sbn: StatusBarNotification, ranking: NotificationListenerService.Ranking?): Int? =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) ranking?.channel?.importance else null

    /** The listener's ranking for [sbn] (effective channel importance), when bound. */
    fun rankingOf(listener: NotificationListenerService, sbn: StatusBarNotification): NotificationListenerService.Ranking? = runCatching {
        val r = NotificationListenerService.Ranking()
        if (listener.currentRanking?.getRanking(sbn.key, r) == true) r else null
    }.getOrNull()

    private fun callPerson(n: Notification): android.app.Person? = runCatching {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            @Suppress("DEPRECATION")
            n.extras?.getParcelable<android.app.Person>(Notification.EXTRA_CALL_PERSON)
        } else {
            null
        }
    }.getOrNull()

    /**
     * #6 notice (only when WhatsApp alerts are switched off): an ordinary
     * notification from Silent Focus (default importance, no sound override,
     * no full-screen intent, no DND bypass). Shown silently under DND.
     */
    private fun notifyRepeat(ctx: Context, app: String, count: Int) = runCatching {
        val nm = ctx.getSystemService(NotificationManager::class.java) ?: return@runCatching
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            nm.createNotificationChannel(
                NotificationChannel(CHANNEL_ID, "Repeated WhatsApp calls", NotificationManager.IMPORTANCE_DEFAULT).apply {
                    description = "Someone called you on WhatsApp several times while Silent Focus was on."
                },
            )
        }
        val open = ctx.packageManager.getLaunchIntentForPackage(ctx.packageName)?.let {
            PendingIntent.getActivity(ctx, NOTIFICATION_ID, it, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        }
        val (title, text) = WhatsAppEmergency.repeatNoticeText(app, count)
        val n = NotificationCompat.Builder(ctx, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_silent_focus)
            .setContentTitle(title)
            .setContentText(text)
            .setCategory(NotificationCompat.CATEGORY_STATUS)
            .setAutoCancel(true)
            .apply { open?.let(::setContentIntent) }
            .build()
        nm.notify(NOTIFICATION_ID, n)
    }
}
