// Phase 4 communication features: emergency contacts, urgent repeat callers
// and automated replies. Everything is stored and enforced natively
// (android/.../comms) so it works with the app closed; JS only edits
// settings and renders state. Phone numbers reaching JS are redacted.

import {NativeEventEmitter, NativeModules, Platform} from 'react-native';

const Native = Platform.OS === 'android' ? NativeModules.SilentFocus : null;

export const isCommsAvailable = !!Native?.getCommsState;

export const DEFAULT_REPLY =
    "I'm currently unavailable and will get back to you soon.";
export const MAX_TEMPLATE_LENGTH = 500;

// Cooldown choices for auto reply; 0 = once per sender per Silent Focus session.
export const REPLY_COOLDOWN_OPTIONS = [
    {minutes: 0, label: 'Once per session'},
    {minutes: 15, label: '15 min'},
    {minutes: 30, label: '30 min'},
    {minutes: 60, label: '1 hour'},
];

export const DEFAULT_COMMS_STATE = {
    callSettings: {
        emergencyEnabled: true,
        urgentEnabled: true,
        urgentThreshold: 3,
        urgentWindowMinutes: 15,
        urgentCooldownMinutes: 15,
        // WhatsApp / WhatsApp Business: Silent Focus's own alert (emergency + urgent).
        whatsAppAlertsEnabled: true,
        // Opt-in: match by name when WhatsApp exposes no number (less reliable).
        whatsAppNameMatch: false,
    },
    // Status of the "Emergency & urgent WhatsApp calls" alert channel.
    whatsAppAlert: {
        notificationsAllowed: false,
        dndAccess: false,
        channelExists: false,
        channelEnabled: false,
        overridesDnd: false,
        sound: false,
        outcome: null,
        // READY | VIBRATE | SILENT_MODE | NO_SOUND | BLOCKED | UNKNOWN (never proof the alert was heard).
        soundReady: null,
        dndOn: false,
        silentFocusOn: false,
    },
    emergencyContacts: [],
    autoReply: {
        enabled: false,
        messagingEnabled: true,
        defaultTemplate: DEFAULT_REPLY,
        cooldownMinutes: 60,
        zoneTemplates: {},
    },
    zones: [],
    callScreening: {supported: false, held: false},
    notificationAccess: false,
    phoneStatePermission: false,
    contactsPermission: false,
    dndAccess: false,
};

/** Fills gaps so screens can render any (partial/older) native state. */
export const normalizeCommsState = raw => {
    const s = raw || {};
    return {
        ...DEFAULT_COMMS_STATE,
        ...s,
        callSettings: {...DEFAULT_COMMS_STATE.callSettings, ...(s.callSettings || {})},
        autoReply: {
            ...DEFAULT_COMMS_STATE.autoReply,
            ...(s.autoReply || {}),
            zoneTemplates: {...((s.autoReply || {}).zoneTemplates || {})},
        },
        emergencyContacts: Array.isArray(s.emergencyContacts) ? s.emergencyContacts : [],
        zones: Array.isArray(s.zones) ? s.zones : [],
        callScreening: {...DEFAULT_COMMS_STATE.callScreening, ...(s.callScreening || {})},
        whatsAppAlert: {...DEFAULT_COMMS_STATE.whatsAppAlert, ...(s.whatsAppAlert || {})},
    };
};

/**
 * What stops the WhatsApp emergency / urgent alert from sounding, most
 * important first. Empty = it can sound through Silent Focus's silence.
 * (Detection itself needs notification access.)
 */
export const whatsAppAlertBlockers = state => {
    const s = normalizeCommsState(state);
    if (!s.callSettings.whatsAppAlertsEnabled) return [];
    const a = s.whatsAppAlert;
    const out = [];
    if (!s.notificationAccess) out.push('NOTIFICATION_ACCESS');
    if (!a.notificationsAllowed) out.push('NOTIFICATIONS_OFF');
    if (!a.dndAccess && !a.channelExists) out.push('DND_ACCESS');
    else if (!a.channelEnabled) out.push('CHANNEL_OFF');
    else if (!a.overridesDnd) out.push('NO_DND_OVERRIDE');
    return out;
};

/**
 * Message after "Try an Alert" (native outcome). Plain words; never claims
 * the alert was heard - only that it was shown. [status] is the
 * whatsAppAlert state read right after (silentFocusOn / soundReady).
 */
export const testAlertMessage = (outcome, status = {}) => {
    switch (outcome) {
        case 'SENT': {
            const sound = {
                SILENT_MODE: 'Your phone is on Silent, so the alert has no sound. Set it to Ring to hear it.',
                VIBRATE: 'Your phone is on Vibrate, so you should feel the alert. Set it to Ring to hear it.',
                BLOCKED: 'Your phone settings may keep the alert silent. Tap Check Settings.',
                UNKNOWN: 'Another Do Not Disturb mode is on, which may keep the alert silent.',
            }[status.soundReady] || 'If your phone is set to Ring you should hear it. In Vibrate mode you should feel it.';
            const tip = status.silentFocusOn
                ? ''
                : '\n\nTip: turn on Silent Focus, then try again to check the alert while your phone is silenced.';
            return `Alert sent. ${sound}${tip}`;
        }
        case 'SENT_SILENCED':
            return 'The alert appeared, but your phone may keep it silent. Tap Check Settings.';
        case 'NOTIFICATIONS_OFF':
        case 'CHANNEL_OFF':
            return 'Alerts are turned off for Silent Focus, so nothing can be shown. Tap Check Settings.';
        default:
            return 'The alert could not be shown. Please try again.';
    }
};

// ---- Round 4: "Check WhatsApp Call Alerts" (user-started, privacy-safe)

export const startWhatsAppCallCheck = () =>
    Native?.startWhatsAppCallCheck ? Native.startWhatsAppCallCheck() : Promise.reject(new Error('unavailable'));

export const getWhatsAppCallCheck = () =>
    Native?.getWhatsAppCallCheck ? Native.getWhatsAppCallCheck() : Promise.resolve({exists: false});

/** [clear] = also delete the result (closing it). */
export const stopWhatsAppCallCheck = (clear = false) =>
    Native?.stopWhatsAppCallCheck
        ? Native.stopWhatsAppCallCheck(clear)
        : Promise.resolve({exists: false});

const SOUND_READY_LABEL = {
    READY: 'Yes',
    VIBRATE: 'Vibrate only',
    SILENT_MODE: 'No – phone is on Silent',
    NO_SOUND: 'No – alert sound is off',
    BLOCKED: 'No',
    UNKNOWN: 'Cannot determine',
};

const yesNo = v => (v ? 'Yes' : 'No');

const ALERT_NOT_ATTEMPTED = {
    ALERTS_OFF: 'Important WhatsApp call alerts are switched off in Silent Focus.',
    DUPLICATE: 'An alert was already played for this caller a moment ago, so it was not repeated.',
    RATE_LIMIT: 'Several alerts were played in the last few minutes, so this one was skipped.',
    NOTIFICATIONS_OFF: 'Notifications for Silent Focus are turned off. Tap Check Settings.',
    CHANNEL_OFF: 'Important call alerts are turned off for Silent Focus. Tap Check Settings.',
};

/**
 * The check result as six plain rows and one sentence. Only yes/no facts
 * reach JS - never a caller's name or number.
 */
export const describeCallCheck = (r, settings = {}) => {
    const c = r || {};
    const threshold = settings.urgentThreshold || 3;
    const recognised = c.emergencyMatched || c.urgentReached;
    let urgent;
    if (!c.ringing || c.emergencyMatched) urgent = 'Not applicable';
    else if (c.urgentReached) urgent = 'Yes';
    else if (c.repeatCount > 0) urgent = `No – call ${Math.min(c.repeatCount, threshold)} of ${threshold}`;
    else urgent = 'No';
    const rows = [
        {key: 'detected', label: 'WhatsApp call detected', value: yesNo(c.ringing)},
        {key: 'caller', label: 'Caller recognised', value: c.ringing ? yesNo(c.callerIdentified) : 'No'},
        {key: 'emergency', label: 'Emergency contact matched', value: yesNo(c.emergencyMatched)},
        {key: 'urgent', label: 'Urgent repeat-call rule reached', value: urgent},
        {key: 'alert', label: 'Alert attempted', value: yesNo(c.alertAttempted)},
        {key: 'sound', label: 'Sound settings appear ready', value: SOUND_READY_LABEL[c.soundReady] || 'Cannot determine'},
    ];
    const who = c.emergencyMatched ? 'your emergency contact' : 'a repeat caller';
    let summary;
    let action = null;
    if (!c.ringing) {
        if (!c.notificationAccess) {
            summary = 'No WhatsApp call was detected. Please check notification access.';
            action = 'NOTIFICATION_ACCESS';
        } else if (c.callLikeSeen) {
            summary = 'A WhatsApp call notification arrived, but we could not tell that it was ringing. Please send us a screenshot of this result.';
        } else if (c.running) {
            summary = 'Ask someone to call you on WhatsApp while this check is running.';
        } else if (c.waSeen) {
            summary = 'WhatsApp notifications arrived, but no call. Please try again and ask someone to call you on WhatsApp.';
        } else {
            summary = 'No WhatsApp call was detected. Make sure WhatsApp call notifications are turned on, then try again.';
        }
    } else if (c.silentFocusOn === 0) {
        summary = 'We detected the call. Silent Focus was off, so no alert was needed. Turn on Silent Focus and run the check again.';
    } else if (!c.callerIdentified && !c.emergencyMatched) {
        summary = "We detected the call, but couldn't identify who was calling.";
    } else if (!recognised && c.nameWouldMatch) {
        summary = 'We detected the call, but WhatsApp only showed the caller’s name. Turn on “Recognise by name” to use it.';
        action = 'NAME_MATCH';
    } else if (!recognised) {
        summary = c.repeatCount > 0 && settings.urgentEnabled !== false
            ? `We detected the call. This caller is not on your emergency contacts list. Calls from them so far: ${Math.min(c.repeatCount, threshold)} of ${threshold}.`
            : 'We detected the call, but this caller is not on your emergency contacts list.';
    } else if (!c.alertAttempted) {
        summary = `We recognised ${who}, but no alert was played. ${ALERT_NOT_ATTEMPTED[c.alertOutcome] || ''}`.trim();
        if (c.alertOutcome === 'NOTIFICATIONS_OFF' || c.alertOutcome === 'CHANNEL_OFF') action = 'SETTINGS';
    } else if (c.alertOutcome === 'FAILED') {
        summary = `We recognised ${who}, but the alert could not be shown.`;
    } else if (c.alertStoppedAfterMs >= 0 && c.alertStoppedAfterMs < 5000) {
        summary = `We recognised ${who} and started the alert, but WhatsApp stopped ringing after ${Math.max(1, Math.round(c.alertStoppedAfterMs / 1000))} second(s), so the alert stopped too.`;
    } else if (c.alertOutcome === 'SENT' && c.soundReady === 'VIBRATE') {
        summary = `We recognised ${who} and played the alert. Your phone is on Vibrate, so it vibrates instead of ringing.`;
    } else if (c.alertOutcome === 'SENT_SILENCED' || (c.soundReady && c.soundReady !== 'READY')) {
        summary = `We recognised ${who}, but your phone settings may have silenced the alert.`;
        action = 'SETTINGS';
    } else {
        summary = `We recognised ${who} and played the alert. Did you hear it?`;
    }
    return {rows, summary, action};
};

export const openWhatsAppAlertSettings = () =>
    Native?.openWhatsAppAlertSettings ? Native.openWhatsAppAlertSettings().catch(() => false) : Promise.resolve(false);

export const sendTestWhatsAppAlert = () =>
    Native?.sendTestWhatsAppAlert ? Native.sendTestWhatsAppAlert().catch(() => 'FAILED') : Promise.resolve('FAILED');

/** Trimmed, length-limited template; empty means "use the default". */
export const cleanTemplate = text =>
    String(text ?? '')
        .trim()
        .slice(0, MAX_TEMPLATE_LENGTH);

/** Mirrors native AutoReplyPolicy.templateFor. */
export const templateForZone = (autoReply, zoneId) => {
    const zone = zoneId != null ? cleanTemplate(autoReply?.zoneTemplates?.[zoneId]) : '';
    return zone || cleanTemplate(autoReply?.defaultTemplate) || DEFAULT_REPLY;
};

/**
 * What stops emergency/urgent calls from working right now, most important
 * first. Empty = ready.
 */
export const callExceptionBlockers = state => {
    const s = normalizeCommsState(state);
    const out = [];
    if (!s.callScreening.supported) {
        out.push('UNSUPPORTED');
        return out;
    }
    if (!s.callScreening.held) out.push('SCREENING_ROLE');
    if (!s.contactsPermission) out.push('CONTACTS_PERMISSION');
    if (!s.dndAccess) out.push('DND_ACCESS');
    if (!s.phoneStatePermission) out.push('PHONE_STATE');
    return out;
};

export const describeUrgentRule = cs => {
    const c = {...DEFAULT_COMMS_STATE.callSettings, ...(cs || {})};
    return `If the same number calls ${c.urgentThreshold} times within ${c.urgentWindowMinutes} minutes while Silent Focus is on, the ${ordinal(c.urgentThreshold)} call rings.`;
};

const ordinal = n => {
    const v = n % 100;
    if (v >= 11 && v <= 13) return `${n}th`;
    return `${n}${{1: 'st', 2: 'nd', 3: 'rd'}[n % 10] || 'th'}`;
};

const unavailable = () => Promise.resolve(normalizeCommsState(null));

export const getCommsState = () =>
    isCommsAvailable ? Native.getCommsState().then(normalizeCommsState) : unavailable();

export const setCallSettings = settings =>
    isCommsAvailable ? Native.setCallSettings(settings).then(normalizeCommsState) : unavailable();

export const setAutoReplySettings = settings => {
    if (!isCommsAvailable) return unavailable();
    const payload = {...settings};
    if ('defaultTemplate' in payload) {
        payload.defaultTemplate = cleanTemplate(payload.defaultTemplate) || DEFAULT_REPLY;
    }
    if (payload.zoneTemplates) {
        const zones = {};
        Object.entries(payload.zoneTemplates).forEach(([id, text]) => {
            const t = cleanTemplate(text);
            if (t) zones[String(id)] = t;
        });
        payload.zoneTemplates = zones;
    }
    return Native.setAutoReplySettings(payload).then(normalizeCommsState);
};

/** Resolves {id, name, number (redacted)}, {error}, or null when cancelled. */
export const pickEmergencyContact = () =>
    isCommsAvailable ? Native.pickEmergencyContact() : Promise.resolve(null);

export const removeEmergencyContact = id =>
    isCommsAvailable ? Native.removeEmergencyContact(String(id)).then(normalizeCommsState) : unavailable();

export const requestCallScreeningRole = () =>
    isCommsAvailable ? Native.requestCallScreeningRole() : Promise.resolve(false);

export const openCallScreeningSettings = () => Native?.openCallScreeningSettings?.();

export const openNotificationAccessSettings = () => Native?.openNotificationAccessSettings?.();

export const hasNotificationAccess = () =>
    Native?.hasNotificationAccess ? Native.hasNotificationAccess() : Promise.resolve(false);

export const getLocalActivity = () =>
    Native?.getRecentEvents ? Native.getRecentEvents() : Promise.resolve([]);

/** Debug test-harness rows (`synthetic: true`) – never synced, uploaded or outboxed. */
export const isSyntheticEvent = e => e?.synthetic === true;

/**
 * The journal as server sync may see it: synthetic entries are removed
 * natively (getSyncableEvents) and again here for older native code.
 */
export const getSyncableActivity = () =>
    (Native?.getSyncableEvents ? Native.getSyncableEvents() : getLocalActivity()).then(events =>
        (Array.isArray(events) ? events : []).filter(e => !isSyntheticEvent(e)),
    );

/**
 * Opens the notification behind an Activity row if it is still posted,
 * otherwise the app that posted it. Resolves 'NOTIFICATION' | 'APP' | 'UNAVAILABLE'.
 */
export const openActivitySource = (appPackage, notificationRef) =>
    Native?.openActivitySource && appPackage
        ? Native.openActivitySource(appPackage, notificationRef || null).catch(() => 'UNAVAILABLE')
        : Promise.resolve('UNAVAILABLE');

/**
 * #11: phone call rows open the Phone app's call history (else the dialer).
 * Resolves 'CALL_LOG' | 'DIALER' | 'UNAVAILABLE'; a specific call can't be opened.
 */
export const openPhoneApp = () =>
    Native?.openPhoneApp ? Native.openPhoneApp().catch(() => 'UNAVAILABLE') : Promise.resolve('UNAVAILABLE');

/**
 * #10: ephemeral previews for message rows, read from their still-posted
 * notifications: {[notificationRef]: {status, text?}}. The text lives only in
 * screen state - never store, log, upload or report it.
 */
export const getActivityPreviews = items =>
    Native?.getActivityPreviews && Array.isArray(items) && items.length
        ? Native.getActivityPreviews(items).catch(() => ({}))
        : Promise.resolve({});

// No payload: something was posted/removed; previews are re-read on demand.
export const NOTIFICATIONS_CHANGED_EVENT = 'SilentFocusNotificationsChanged';

export const subscribeNotificationsChanged = callback => {
    if (!Native?.getActivityPreviews) return () => {};
    const subscription = new NativeEventEmitter(Native).addListener(NOTIFICATIONS_CHANGED_EVENT, callback);
    return () => subscription.remove();
};

/**
 * The server holds these journal entries / sessions ({start, end}), read
 * back: native retention may drop them from now on.
 */
export const markActivityAcknowledged = (eventIds, sessions) =>
    Native?.markAcknowledged ? Native.markAcknowledged(eventIds || [], sessions || []) : Promise.resolve(false);

/**
 * Clears the local journal and finished sessions. `clearableStarts` /
 * `clearableEventIds`: only these may go (null = all). Use
 * clearLocalActivitySafely (serverSync.js) from screens.
 */
export const clearLocalActivity = (clearableStarts = null, clearableEventIds = null) =>
    Native?.clearRecentEvents
        ? Native.clearRecentEvents(
              Array.isArray(clearableStarts) ? clearableStarts : null,
              Array.isArray(clearableEventIds) ? clearableEventIds : null,
          )
        : Promise.resolve(true);
