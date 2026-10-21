// Turns the native engine state into the text Home shows. Pure, so the
// wording rules are tested without a device.

import moment from 'moment';

const formatWhen = (millis, now) => {
    const m = moment(millis);
    const today = moment(now);
    if (m.isSame(today, 'day')) {
        return m.format('h:mm A');
    }
    if (m.isSame(today.clone().add(1, 'day'), 'day')) {
        return `tomorrow ${m.format('h:mm A')}`;
    }
    // Within the coming week the weekday is unambiguous; beyond that (e.g.
    // the same weekday next week) include the date.
    if (m.diff(today.clone().startOf('day'), 'days') < 6) {
        return m.format('ddd h:mm A');
    }
    return m.format('ddd D MMM h:mm A');
};

export const formatCountdown = seconds => {
    const s = Math.max(0, Math.floor(seconds));
    const h = String(Math.floor(s / 3600)).padStart(2, '0');
    const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
    const sec = String(s % 60).padStart(2, '0');
    return `${h}:${m}:${sec}`;
};

// The start anchor is owned and persisted by the Android engine. JS only
// redraws this derived value while the Home tab is visible.
export const manualElapsedSeconds = (state, now = Date.now()) => {
    if (!state?.silentActive || state.source !== 'MANUAL') return null;
    const started = Number(state.manualSessionStartedAt);
    return Number.isFinite(started) && started > 0
        ? Math.max(0, Math.floor((now - started) / 1000)) : null;
};

// When the current silence is expected to end, if known: the latest end of
// the timed windows (schedule/calendar) running now. Manual ON and zone
// visits have no known end.
export const silenceEndsAt = state => {
    if (
        !state?.silentActive ||
        (state.source !== 'SCHEDULE' && state.source !== 'CALENDAR')
    ) {
        return null;
    }
    const rules = state.activeRules || [];
    if (rules.length === 0 || rules.some(r => !r.windowEnd)) {
        return null;
    }
    return Math.max(...rules.map(r => r.windowEnd));
};

const LOCATION_ISSUES = {
    LOCATION_PERMISSION_MISSING:
        'Silent Zones need location access. Tap to allow it.',
    PRECISE_LOCATION_MISSING:
        'Silent Zones need precise location. Tap to allow it.',
    BACKGROUND_LOCATION_MISSING:
        'Silent Zones only work with location allowed "all the time". Tap to allow it.',
    LOCATION_OFF: 'Location is turned off, so Silent Zones are paused.',
    FAILED: 'Silent Zones could not be set up. They will retry when you reopen the app.',
};

// Why zone automation isn't working, if it is meant to be on.
export const locationIssue = state => {
    const loc = state?.location;
    if (!loc?.enabled || !loc.zoneCount) {
        return null;
    }
    const message = LOCATION_ISSUES[loc.status];
    return message ? {status: loc.status, message} : null;
};

export const calendarIssue = state => {
    const cal = state?.calendar;
    if (!cal?.enabled || cal.status !== 'CALENDAR_PERMISSION_MISSING') {
        return null;
    }
    return {
        status: cal.status,
        message:
            'Calendar automation needs calendar access. Tap to allow it.',
    };
};

const PAUSED_LABELS = {
    SCHEDULE: 'Schedule',
    CALENDAR: 'Calendar event',
    ZONE: 'Silent Zone',
    PLACE: 'Public place',
};

// What the user's manual OFF paused, named by its real source.
const pausedDetail = (state, now) => {
    const sources = [
        ...new Set((state.suppressedRules || []).map(r => r.source)),
    ];
    const label =
        sources.length === 1 && PAUSED_LABELS[sources[0]]
            ? PAUSED_LABELS[sources[0]]
            : 'Automatic silence';
    const until = state.manualOverride?.until;
    if (until) {
        return `${label} paused until ${formatWhen(until, now)}`;
    }
    if (sources.length === 1 && sources[0] === 'ZONE') {
        return 'Silent Zone paused until you leave it';
    }
    if (sources.length === 1 && sources[0] === 'PLACE') {
        return 'Public place paused until you leave it';
    }
    return `${label} paused`;
};

export const describeEngineState = (state, now = Date.now()) => {
    if (!state) {
        return {
            title: 'Normal Mode',
            detail: null,
            next: null,
            warning: null,
        };
    }

    let warning = null;
    if (!state.dndAccess) {
        warning = 'DND_ACCESS_MISSING';
    } else if (state.blockedReason) {
        warning = state.blockedReason;
    } else if (!state.exactAlarmAccess && state.scheduleCount > 0) {
        warning = 'EXACT_ALARM_MISSING';
    }

    let title = 'Normal Mode';
    let detail = null;
    if (state.silentActive) {
        title = 'Silent Focus active';
        if (state.source === 'MANUAL') {
            detail = 'Turned on manually';
        } else if (state.source === 'ZONE') {
            const zone = (state.activeRules || []).find(
                r => r.source === 'ZONE',
            );
            detail = zone?.name ? `Silent Zone: ${zone.name}` : 'Silent Zone';
        } else if (state.source === 'PLACE') {
            const place = (state.activeRules || []).find(
                r => r.source === 'PLACE',
            );
            detail = place?.name ? `Public place: ${place.name}` : 'Public place';
        } else if (state.source === 'SCHEDULE' || state.source === 'CALENDAR') {
            const end = silenceEndsAt(state);
            const calendarRule = state.source === 'CALENDAR'
                ? (state.activeRules || [])
                    .filter(r => r.source === 'CALENDAR')
                    .sort((a, b) => (b.windowStart || 0) - (a.windowStart || 0))[0]
                : null;
            const label = state.source === 'CALENDAR'
                ? (calendarRule?.name || 'Calendar event')
                : 'By schedule';
            detail = end ? `${label} until ${formatWhen(end, now)}` : label;
        }
    } else if (state.desiredSilent) {
        title = 'Silent Focus cannot run';
        detail = 'Do Not Disturb access is needed';
    } else if ((state.suppressedRules || []).length > 0) {
        detail = pausedDetail(state, now);
    }

    // The next window start, even when the very next engine boundary is the
    // end of a paused/running window (older engines only sent nextTransition).
    let next = null;
    const nt = state.nextTransition;
    const nextAt =
        state.nextSilenceStart?.at ||
        (nt?.kind === 'START' ? nt.at : null);
    if (nextAt && nextAt > now && !state.silentActive) {
        next = `Next automatic silence ${formatWhen(nextAt, now)}`;
    }

    return {
        title,
        detail,
        next,
        warning,
        locationIssue: locationIssue(state),
        calendarIssue: calendarIssue(state),
        manualElapsed: manualElapsedSeconds(state, now),
    };
};
