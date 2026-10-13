// Silent Focus session history and the "Today" summary. Sessions are
// recorded natively (android/.../automation/SessionHistory.kt) from what the
// engine actually did; nothing here invents values. When history doesn't
// cover a period, the summary says so instead of showing zeros.

import {NativeModules, Platform} from 'react-native';

const Native = Platform.OS === 'android' ? NativeModules.SilentFocus : null;

export const SOURCE_LABELS = {
    MANUAL: 'Manual',
    ZONE: 'Silent Zone',
    SCHEDULE: 'Schedule',
    CALENDAR: 'Calendar',
};

const num = v => (Number.isFinite(Number(v)) ? Number(v) : 0);

export const normalizeSessions = raw => {
    const list = Array.isArray(raw?.sessions) ? raw.sessions : [];
    const sessions = list
        .filter(s => s && Number.isFinite(Number(s.start)))
        .map(s => ({
            id: String(s.id ?? s.start),
            start: Number(s.start),
            end: s.end == null ? null : Number(s.end),
            primarySource: s.primarySource || null,
            sources: Array.isArray(s.sources) ? s.sources : [],
            zoneNames: Array.isArray(s.zoneNames) ? s.zoneNames : [],
            emergencyBreakthroughs: num(s.emergencyBreakthroughs),
            urgentBreakthroughs: num(s.urgentBreakthroughs),
            callsSilenced: num(s.callsSilenced),
            messagesReceived: num(s.messagesReceived),
            autoRepliesSent: num(s.autoRepliesSent),
            // End the server acknowledged (read back); null = not yet.
            ackedEnd: s.ackedEnd == null ? null : Number(s.ackedEnd),
        }))
        .sort((a, b) => b.start - a.start);
    const since = Number(raw?.recordingSince);
    return {sessions, recordingSince: Number.isFinite(since) && since > 0 ? since : null};
};

export const sessionDuration = (s, now = Date.now()) => Math.max(0, (s.end ?? now) - s.start);

export const startOfDay = (t = Date.now()) => {
    const d = new Date(t);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
};

/**
 * Today's summary from sessions overlapping [start of today, now]. Time is
 * clipped to today; counters belong to the sessions that overlap today.
 * `covered` is false when recording started after midnight (earlier
 * activity today is unknown), so the UI can say so.
 */
export const summarizeDay = (history, now = Date.now()) => {
    const dayStart = startOfDay(now);
    const today = history.sessions.filter(s => (s.end ?? now) > dayStart && s.start <= now);
    const sum = key => today.reduce((t, s) => t + s[key], 0);
    const zones = [...new Set(today.flatMap(s => s.zoneNames))];
    return {
        dayStart,
        covered: history.recordingSince != null && history.recordingSince <= dayStart,
        recordingSince: history.recordingSince,
        sessionCount: today.length,
        activeMs: today.reduce(
            (t, s) => t + Math.max(0, Math.min(s.end ?? now, now) - Math.max(s.start, dayStart)),
            0,
        ),
        emergencyBreakthroughs: sum('emergencyBreakthroughs'),
        urgentBreakthroughs: sum('urgentBreakthroughs'),
        autoRepliesSent: sum('autoRepliesSent'),
        callsSilenced: sum('callsSilenced'),
        messagesReceived: sum('messagesReceived'),
        zones,
        ongoing: today.some(s => s.end == null),
    };
};

export const formatDuration = ms => {
    const totalMin = Math.floor(ms / 60000);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    if (h === 0) return `${m}m`;
    return `${h}h ${m}m`;
};

export const describeSources = s => {
    const others = s.sources.filter(x => x !== s.primarySource);
    return {
        primary: SOURCE_LABELS[s.primarySource] || 'Unknown',
        others: others.map(x => SOURCE_LABELS[x] || x),
    };
};

/** Local activity events that happened during a session (for details). */
export const eventsInSession = (rows, s, now = Date.now()) =>
    (Array.isArray(rows) ? rows : []).filter(r => r.at >= s.start && r.at <= (s.end ?? now));

export const getSessionHistory = () =>
    Native?.getSessionHistory
        ? Native.getSessionHistory().then(normalizeSessions)
        : Promise.resolve(normalizeSessions(null));
