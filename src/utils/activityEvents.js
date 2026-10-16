// Unified activity model for the Activity screen. Local events come from the
// native journal (android/.../automation/ActivityEvents.kt) and are the
// source of truth for calls, messages, replies and automation. Server rows
// (the backend `logs` history) are shown separately-labelled and are never
// merged into or presented as local events.

import {activityTypeLabel} from './api/normalizers';

export const CATEGORY = {
    CALL: 'CALL',
    MESSAGE: 'MESSAGE',
    AUTOMATION: 'AUTOMATION',
};

// Round 3 (#3): no Automation tab. Silent Focus starts/ends, zones,
// schedules and calendar events are shown in Session History (still
// recorded in the journal, which Session History reads); the Activity feed
// is calls and messages. "All" = Calls + Messages (+ the rare automation
// error, which Session History doesn't show).
export const TABS = [
    {key: 'ALL', label: 'All'},
    {key: CATEGORY.CALL, label: 'Calls'},
    {key: CATEGORY.MESSAGE, label: 'Messages'},
];

/** Whether a row belongs in the Activity feed (automation rows live in Session History). */
export const isActivityFeedRow = row =>
    !!row && (row.category !== CATEGORY.AUTOMATION || row.type === 'AUTOMATION_ERROR');

// Cellular calls (Telecom call screening): opened in the Phone app (#11).
const PHONE_CALL_TYPES = ['INCOMING_CALL', 'EMERGENCY_BREAKTHROUGH', 'URGENT_REPEAT_CALLER'];
// #9: WhatsApp / WhatsApp Business calls, opened in WhatsApp (local only).
const APP_CALL_TYPES = ['WHATSAPP_CALL'];
const CALL_TYPES = [...PHONE_CALL_TYPES, ...APP_CALL_TYPES];
const MESSAGE_TYPES = ['MESSAGE_RECEIVED', 'AUTO_REPLY_SENT', 'AUTO_REPLY_FAILED', 'AUTO_REPLY_SKIPPED'];

export const categoryOf = type => {
    if (CALL_TYPES.includes(type)) return CATEGORY.CALL;
    if (MESSAGE_TYPES.includes(type)) return CATEGORY.MESSAGE;
    return CATEGORY.AUTOMATION;
};

const SOURCE_LABEL = {
    MANUAL: 'manual',
    ZONE: 'Silent Zone',
    PLACE: 'public place',
    SCHEDULE: 'schedule',
    CALENDAR: 'calendar event',
};

const REPLY_REASON = {
    NO_REPLY_ACTION: "This app's notifications have no reply action",
    POSSIBLE_AUTO_REPLY_LOOP: 'Looked like another automatic reply',
    RATE_LIMIT: 'Hourly auto-reply limit reached',
    COOLDOWN: 'Already replied to this sender recently',
    DISABLED: 'Auto reply is off',
    GROUP_CONVERSATION: 'Group chats are never auto-replied',
    UNKNOWN_SENDER: 'Sender could not be identified',
};

const CALL_REASON = {
    UNKNOWN_CALLER: 'Private or unknown number',
    BELOW_THRESHOLD: 'Silenced',
    COOLDOWN: 'Silenced (urgent call already allowed recently)',
    DISABLED: 'Silenced',
};

const replyOutcome = e => {
    switch (e.replyStatus) {
        case 'SENT':
            return 'Auto reply sent';
        case 'FAILED':
            return 'Auto reply failed';
        case 'UNSUPPORTED':
            return 'Auto reply not supported by this app';
        case 'SKIPPED':
            return e.detail === 'DISABLED' ? null : REPLY_REASON[e.detail] || 'No auto reply';
        default:
            return null;
    }
};

const named = (prefix, name) => (name ? `${prefix}: ${name}` : prefix);

// Round 3 (#1/#2): the caller / sender name the app showed in its own
// notification (recorded natively, local only). Placeholders when it wasn't
// available - never the app name, a hash or a generic heading.
export const UNKNOWN_CALLER = 'Unknown caller';
export const UNKNOWN_SENDER = 'Unknown sender';

// Emergency / urgent WhatsApp call alert outcome (native EmergencyCallAlert).
const WHATSAPP_ALERT = {
    SENT: 'Alert sounded',
    SENT_SILENCED: "Alert shown silently (can't override Do Not Disturb)",
    NOTIFICATIONS_OFF: 'No alert: notifications are off',
    CHANNEL_OFF: 'No alert: WhatsApp call alerts are off',
    ALERTS_OFF: 'No alert: WhatsApp alerts are off',
    DUPLICATE: 'Alert already sent for this caller',
    RATE_LIMIT: 'No alert: too many alerts recently',
    FAILED: 'Alert failed',
};

const nameOf = e => (typeof e?.displayName === 'string' && e.displayName.trim() ? e.displayName.trim() : null);
const groupOf = e => (typeof e?.groupName === 'string' && e.groupName.trim() ? e.groupName.trim() : null);

/** "WhatsApp" / "WhatsApp group · Family" - where a message came from. */
const messageSource = e => {
    const group = groupOf(e);
    const app = e?.app || null;
    if (group) return `${app ? `${app} group` : 'Group'} · ${group}`;
    return app;
};

const join = parts => parts.filter(Boolean).join(' · ') || null;

/**
 * Title/subtitle for one local event; never shows message content.
 * `summary`: one line for places without a subtitle (Session History).
 */
export const describeEvent = e => {
    const d = describeEventParts(e);
    return {...d, summary: d.summary || d.title};
};

const describeEventParts = e => {
    const type = e?.type;
    switch (type) {
        case 'SILENCE_STARTED':
            return {
                title: 'Silent Focus started',
                subtitle:
                    e.source === 'MANUAL'
                        ? 'Turned on manually'
                        : e.source
                        ? `By ${SOURCE_LABEL[e.source] || e.source}`
                        : null,
            };
        case 'SILENCE_ENDED':
            return {title: 'Silent Focus ended', subtitle: null};
        case 'ZONE_ENTER':
            return {title: named('Silent Zone activated', e.name), subtitle: null};
        case 'ZONE_EXIT':
            return {title: named('Silent Zone ended', e.name), subtitle: null};
        case 'PLACE_ENTER':
            return {title: named('Public place silence started', e.name), subtitle: null};
        case 'PLACE_EXIT':
            return {title: named('Public place silence ended', e.name), subtitle: null};
        case 'SCHEDULE_STARTED':
            return {title: 'Schedule silence started', subtitle: e.name || null};
        case 'SCHEDULE_ENDED':
            return {title: 'Schedule silence ended', subtitle: e.name || null};
        case 'CALENDAR_STARTED':
            return {title: 'Calendar silence started', subtitle: null};
        case 'CALENDAR_ENDED':
            return {title: 'Calendar silence ended', subtitle: null};
        case 'INCOMING_CALL':
            return {title: `Call from ${e.caller || 'Unknown'}`, subtitle: CALL_REASON[e.detail] || 'Silenced'};
        // handling 'alert_only': Emergency Call Handling kept Do Not Disturb on
        // and showed Silent Focus's own alert instead of letting the call ring.
        case 'EMERGENCY_BREAKTHROUGH':
            return {
                title: e.handling === 'alert_only' ? 'Emergency call alert' : 'Emergency contact allowed',
                subtitle: [e.contactName, e.caller].filter(Boolean).join(' · ') || null,
            };
        case 'URGENT_REPEAT_CALLER': {
            const after = e.repeatCount ? ` after ${e.repeatCount} calls` : '';
            return {
                title: e.handling === 'alert_only' ? `Urgent call alert${after}` : `Urgent caller allowed${after}`,
                subtitle: e.caller || null,
            };
        }
        case 'WHATSAPP_CALL': {
            const app = e.app || 'WhatsApp';
            const who = nameOf(e) || (e.emergency && e.contactName) || UNKNOWN_CALLER;
            const alert = WHATSAPP_ALERT[e.alert] || null;
            let label;
            let subtitle;
            if (e.emergency) {
                // silenced: WhatsApp marked it missed without ringing (Do Not Disturb).
                label = `Emergency contact · ${e.silenced ? 'missed ' : ''}${app} call`;
                const contact = e.contactName && e.contactName !== who ? `Your contact “${e.contactName}”` : null;
                subtitle = join([label, contact, alert]);
            } else if (e.repeat) {
                label = `Repeated ${app} caller · ${e.repeatCount || 3} calls`;
                subtitle = alert ? `${label} · ${alert}` : `${label} · Silenced · call back from ${app}`;
            } else if (e.callState === 'MISSED') {
                label = `Missed ${app} call`;
                subtitle = label;
            } else {
                label = `Incoming ${app} call`;
                subtitle = `${label} · Silenced`;
            }
            return {title: who, subtitle, summary: `${label} · ${who}`};
        }
        case 'MESSAGE_RECEIVED': {
            const who = nameOf(e) || UNKNOWN_SENDER;
            return {
                title: who,
                subtitle: join([messageSource(e) || 'Message', replyOutcome(e)]),
                summary: join(['Message', who, messageSource(e)]),
            };
        }
        case 'AUTO_REPLY_SENT':
        case 'AUTO_REPLY_FAILED': {
            const title = type === 'AUTO_REPLY_SENT' ? 'Auto reply sent' : 'Auto reply failed';
            const who = nameOf(e);
            return {title, subtitle: join([who ? `To ${who}` : null, messageSource(e)])};
        }
        case 'AUTO_REPLY_SKIPPED': {
            const who = nameOf(e);
            return {
                title: e.replyStatus === 'UNSUPPORTED' ? 'Auto reply not supported' : 'Auto reply skipped',
                subtitle: join([who ? `To ${who}` : null, messageSource(e), REPLY_REASON[e.detail]]),
            };
        }
        case 'AUTOMATION_ERROR':
        case 'AUTOMATION_FAILED': // journal entries written before Phase 4
            return {
                title: 'Silent Focus could not change sound settings',
                subtitle: e.detail === 'DND_ACCESS_MISSING' ? 'Do Not Disturb access is missing' : null,
            };
        default:
            return {title: type ? type.replace(/_/g, ' ').toLowerCase() : 'Activity', subtitle: null};
    }
};

/** Native journal (oldest first) -> display rows, newest first. */
export const normalizeLocalEvents = events =>
    assignPreviewKeys(
        (Array.isArray(events) ? events : [])
            .filter(e => e && typeof e.type === 'string' && Number.isFinite(Number(e.at)))
            .map(toLocalRow)
            .sort((a, b) => b.at - a.at),
    );

const toLocalRow = (e, i) => {
    const {title, subtitle, summary} = describeEvent(e);
    const at = Number(e.at);
    const messageAt = Number(e.messageAt);
    return {
        id: `local-${e.id || `${at}-${i}`}`,
        origin: 'local',
        type: e.type === 'AUTOMATION_FAILED' ? 'AUTOMATION_ERROR' : e.type,
        category: e.category || categoryOf(e.type),
        title,
        subtitle,
        summary,
        // Local only (never uploaded): who called / wrote, as the app showed it.
        displayName: nameOf(e),
        groupName: groupOf(e),
        messageAt: Number.isFinite(messageAt) && messageAt > 0 ? messageAt : null,
        at,
        status: e.replyStatus || null,
        // Message rows (and app call rows that carry a package, e.g.
        // WhatsApp later) open the posting app / its notification.
        appPackage:
            (categoryOf(e.type) === CATEGORY.MESSAGE || categoryOf(e.type) === CATEGORY.CALL) && e.appPackage
                ? e.appPackage
                : null,
        // Phone call rows open the Phone app (#11).
        opensPhone: PHONE_CALL_TYPES.includes(e.type) && !e.appPackage,
        appName: e.app || null,
        notificationRef: e.notificationRef || null,
    };
};

/**
 * Which message rows may show a preview, and under which key. A row that
 * knows its message's time asks for exactly that message; an older-format
 * row (no time) only for the newest row of its notification, so an older
 * row never shows a newer message's text. Rows must be newest first.
 */
const assignPreviewKeys = rows => {
    const newestSeen = new Set();
    return rows.map(r => {
        if (r.origin !== 'local' || r.type !== 'MESSAGE_RECEIVED' || !r.appPackage || !r.notificationRef) {
            return {...r, previewKey: null};
        }
        if (r.messageAt) return {...r, previewKey: `${r.notificationRef}|${r.messageAt}`};
        if (newestSeen.has(r.notificationRef)) return {...r, previewKey: null};
        newestSeen.add(r.notificationRef);
        return {...r, previewKey: `${r.notificationRef}|`};
    });
};

/**
 * Backend history rows (normalizeActivityLogs output) -> display rows. Only
 * what the server returned; flagged origin 'server'.
 */
export const normalizeServerLogs = rows =>
    (Array.isArray(rows) ? rows : [])
        .map((r, i) => {
            const at = parseServerTime(r?.timestamp);
            if (at == null) return null;
            const raw = String(r?.rawType || '').toLowerCase();
            const category = raw.includes('call') ? CATEGORY.CALL : raw ? CATEGORY.MESSAGE : CATEGORY.AUTOMATION;
            return {
                id: `server-${r?.id ?? i}`,
                origin: 'server',
                type: 'SERVER_LOG',
                category,
                title: r?.name || 'Server activity',
                // Message content is never shown in the list.
                subtitle: activityTypeLabel(r?.rawType),
                at,
                status: null,
            };
        })
        .filter(Boolean)
        .sort((a, b) => b.at - a.at);

const parseServerTime = ts => {
    if (ts == null || ts === '') return null;
    if (typeof ts === 'number') return Number.isFinite(ts) ? ts : null;
    // Backend uses "YYYY-MM-DD HH:mm:ss" (server time, no zone).
    const iso = String(ts).trim().replace(' ', 'T');
    const t = Date.parse(iso);
    return Number.isNaN(t) ? null : t;
};

/** Whether tapping the row can open something (local message and call rows). */
export const isOpenable = row => row?.origin === 'local' && (!!row?.appPackage || !!row?.opensPhone);

/** Accessibility hint for an openable row. */
export const openHint = row =>
    row?.opensPhone ? "Opens the Phone app's call history" : `Opens ${row?.appName || 'the app'}`;

/**
 * #10: rows that may have an ephemeral preview -> unique bridge requests
 * [{appPackage, notificationRef, messageAt?, key}].
 */
export const previewRequests = rows => {
    const seen = new Set();
    return (Array.isArray(rows) ? rows : []).flatMap(r => {
        if (!r?.previewKey || seen.has(r.previewKey)) return [];
        seen.add(r.previewKey);
        return [
            {
                appPackage: r.appPackage,
                notificationRef: r.notificationRef,
                ...(r.messageAt ? {messageAt: r.messageAt} : {}),
                key: r.previewKey,
            },
        ];
    });
};

/** Only message rows whose notification (and message) is still posted get a preview text. */
export const previewTextFor = (row, previews) => {
    if (!row?.previewKey) return null;
    const p = previews?.[row.previewKey];
    return p?.status === 'TEXT' && typeof p.text === 'string' && p.text ? p.text : null;
};

export const PREVIEW_PLACEHOLDER = {
    GONE: 'Preview unavailable · notification cleared',
    NONE: 'No preview available',
    LOCKED: 'Preview hidden while the phone is locked',
};

/**
 * Round 3 (#2): the one preview line of a "Message received" row once
 * previews were read: {text, placeholder: false} with the message, or an
 * honest placeholder ({text, placeholder: true}) - never invented content.
 * null for other rows, or before previews were read.
 */
export const previewLineFor = (row, previews, loaded) => {
    if (row?.origin !== 'local' || row?.type !== 'MESSAGE_RECEIVED' || !loaded) return null;
    const text = previewTextFor(row, previews);
    if (text) return {text, placeholder: false};
    const status = row.previewKey ? previews?.[row.previewKey]?.status : null;
    return {text: PREVIEW_PLACEHOLDER[status] || PREVIEW_PLACEHOLDER.GONE, placeholder: true};
};

export const filterByTab = (rows, tab) => {
    const feed = (Array.isArray(rows) ? rows : []).filter(isActivityFeedRow);
    return !tab || tab === 'ALL' ? feed : feed.filter(r => r.category === tab);
};

export const formatRelativeTime = (at, now = Date.now()) => {
    const diff = Math.max(0, Math.floor((now - at) / 1000));
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} hr ago`;
    if (diff < 172800) return 'Yesterday';
    return `${Math.floor(diff / 86400)} days ago`;
};
