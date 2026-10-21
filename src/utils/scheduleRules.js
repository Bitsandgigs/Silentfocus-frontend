// Pure helpers between the schedule API / UI and the native automation
// engine. Times are device-local wall-clock "HH:mm[:ss]" strings; the engine
// works in minutes of the day and ISO weekdays (1 = Monday .. 7 = Sunday).

export const DAY_NAMES = [
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
    'Sunday',
];

const ALL_DAYS = [1, 2, 3, 4, 5, 6, 7];

// "10:00", "10:00:00", "9:05" -> minutes of day; anything else -> null.
export const parseTimeToMinutes = value => {
    if (typeof value !== 'string') {
        return null;
    }
    const match = value.trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (!match) {
        return null;
    }
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours > 23 || minutes > 59) {
        return null;
    }
    return hours * 60 + minutes;
};

// Minutes of day -> "HH:mm".
export const minutesToHHmm = minutes =>
    `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(
        minutes % 60,
    ).padStart(2, '0')}`;

// 'Everyday', a missing value or no days means every day (matches how Home
// has always displayed such schedules). Accepts an array of names or a
// comma-separated string.
export const toIsoDays = days => {
    if (days === 'Everyday' || days === undefined || days === null) {
        return ALL_DAYS;
    }
    const names = Array.isArray(days) ? days : String(days).split(',');
    const iso = names
        .map(name => DAY_NAMES.indexOf(String(name).trim()) + 1)
        .filter(n => n > 0);
    return iso.length > 0 ? [...new Set(iso)].sort() : ALL_DAYS;
};

// A schedule may end the next day (22:00 -> 07:00); only identical start and
// end times are invalid.
export const validateScheduleTimes = (fromMinutes, toMinutes) => {
    if (fromMinutes === null || toMinutes === null) {
        return {valid: false, overnight: false, error: 'missing'};
    }
    if (fromMinutes === toMinutes) {
        return {valid: false, overnight: false, error: 'same'};
    }
    return {valid: true, overnight: toMinutes < fromMinutes, error: null};
};

// Row from GET get-scheduleTimerData -> what Home lists. `name` and
// `timezone` are informational (nullable on the backend); automation always
// runs on the phone's local wall-clock time.
export const normalizeScheduleRow = (item, index) => ({
    id: item?.schedule_id ?? index,
    name: typeof item?.name === 'string' && item.name.trim() ? item.name.trim() : null,
    timezone: firstNonEmpty(item?.timezone, item?.time_zone),
    startTime: item?.from_time || '00:00',
    endTime: item?.to_time || '00:00',
    days: item?.selected_days || 'Everyday',
    enabled: item?.isTimerEnabled === true,
    eventType: item?.event_type || 'custom',
});

function firstNonEmpty(...values) {
    const found = values.find(v => typeof v === 'string' && v.trim() !== '');
    return found ? found.trim() : null;
}

// IANA zone of the phone (e.g. "Asia/Kolkata"), or null if unavailable.
export const deviceTimeZone = () => {
    try {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        return typeof tz === 'string' && tz ? tz : null;
    } catch (e) {
        return null;
    }
};

// Body for POST scheduleTimerData / PUT scheduleTimerData/{id}. The
// timezone records which local time the schedule was written in (the
// backend also accepts the legacy `time_zone`).
export const buildSchedulePayload = ({userId, fromTime, toTime, days, timezone = deviceTimeZone()}) => {
    const payload = {
        userId: userId || '',
        from_time: fromTime || '',
        to_time: toTime || '',
        days: days || '',
    };
    if (timezone) {
        payload.timezone = timezone;
    }
    return payload;
};

// Home's list -> engine rules. Calendar-derived rows are left out: calendar
// automation is a later phase and uses its own rule source.
export const toEngineSchedules = schedules =>
    (Array.isArray(schedules) ? schedules : [])
        .filter(s => s && s.eventType !== 'calendar')
        .map(s => ({
            id: String(s.id),
            startMinute: parseTimeToMinutes(s.startTime),
            endMinute: parseTimeToMinutes(s.endTime),
            days: toIsoDays(s.days),
            enabled: s.enabled === true,
        }))
        .filter(
            r =>
                r.startMinute !== null &&
                r.endMinute !== null &&
                r.startMinute !== r.endMinute,
        );

// Immutable weekday toggle for the schedule screens.
export const toggleDay = (selected, day) => {
    const list = Array.isArray(selected) ? selected : [];
    const existing = list.find(item => item.day === day);
    if (existing) {
        return list.map(item =>
            item.day === day ? {...item, status: !item.status} : item,
        );
    }
    return [...list, {day, status: true}];
};

// ---- One-time ("Once") schedules (client feedback). Stored natively per
// account on this phone (automation/OnceSchedules.kt): the backend has no
// schedule type or date yet, and an empty `days` would read back as every
// day. Times are absolute instants (epoch ms), so they never shift with a
// timezone or DST change.

export const SCHEDULE_TYPE = Object.freeze({ONCE: 'once', WEEKLY: 'weekly'});

export const SCHEDULE_TEXTS = Object.freeze({
    intro: 'Choose whether Silent Focus runs once or repeats every week.',
    once: 'Silent Focus will turn on once at the selected time and turn off when it ends. It won’t repeat.',
    weekly: 'Silent Focus will repeat every week on the days you choose.',
    weeklyNoDays: 'Choose at least one day.',
    onPhoneOnly: 'One-time schedules are saved on this phone.',
});

// Mirrors OnceSchedule in Kotlin.
export const ONCE_LIMITS = Object.freeze({
    START_GRACE_MS: 2 * 60 * 1000,
    MIN_DURATION_MS: 60 * 1000,
    MAX_DURATION_MS: 7 * 24 * 60 * 60 * 1000,
});

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// 15:05 -> "3:05 PM" (device-local).
export const formatClock = ms => {
    const d = new Date(ms);
    const h = d.getHours();
    const m = String(d.getMinutes()).padStart(2, '0');
    return `${h % 12 === 0 ? 12 : h % 12}:${m} ${h < 12 ? 'AM' : 'PM'}`;
};

// "Fri 16 Oct, 3:05 PM" (device-local; the year only when it isn't this year's).
export const formatDateTime = (ms, now = Date.now()) => {
    const d = new Date(ms);
    const year = d.getFullYear() !== new Date(now).getFullYear() ? ` ${d.getFullYear()}` : '';
    return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}${year}, ${formatClock(ms)}`;
};

const sameDay = (a, b) => {
    const x = new Date(a);
    const y = new Date(b);
    return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate();
};

// "1 h 30 min", "45 min", "1 day 2 h".
export const formatDuration = ms => {
    const total = Math.max(0, Math.round(ms / 60000));
    const days = Math.floor(total / 1440);
    const hours = Math.floor((total % 1440) / 60);
    const mins = total % 60;
    const parts = [];
    if (days) {parts.push(`${days} day${days > 1 ? 's' : ''}`);}
    if (hours) {parts.push(`${hours} h`);}
    if (mins || parts.length === 0) {parts.push(`${mins} min`);}
    return parts.join(' ');
};

// "Fri 16 Oct, 10:00 PM – Sat 17 Oct, 6:00 AM" (end date omitted on the same day).
export const formatOnceRange = (startAt, endAt, now = Date.now()) =>
    `${formatDateTime(startAt, now)} – ${sameDay(startAt, endAt) ? formatClock(endAt) : formatDateTime(endAt, now)}`;

// Matches the native validation; null = valid.
export const validateOnce = (startAt, endAt, now = Date.now()) => {
    if (!Number.isFinite(startAt) || !Number.isFinite(endAt) || startAt <= 0 || endAt <= 0) {return 'MISSING';}
    if (endAt <= startAt) {return 'END_BEFORE_START';}
    if (endAt - startAt < ONCE_LIMITS.MIN_DURATION_MS) {return 'TOO_SHORT';}
    if (endAt - startAt > ONCE_LIMITS.MAX_DURATION_MS) {return 'TOO_LONG';}
    if (startAt < now - ONCE_LIMITS.START_GRACE_MS) {return 'START_PASSED';}
    return null;
};

export const ONCE_ERROR_TEXT = Object.freeze({
    MISSING: 'Choose a start and an end.',
    END_BEFORE_START: 'The end must be after the start.',
    TOO_SHORT: 'A schedule must last at least 1 minute.',
    TOO_LONG: 'A one-time schedule can last at most 7 days.',
    START_PASSED: 'The start time has already passed. Choose a later start.',
    NOT_EDITABLE: 'This schedule has already started or finished, so it can’t be changed.',
    NOT_FOUND: 'This schedule no longer exists.',
    NO_ACCOUNT: 'Please sign in again to save schedules.',
});

// The exact sentence shown before saving.
export const describeOncePlan = (startAt, endAt, now = Date.now()) =>
    `Silent Focus will turn on once on ${formatDateTime(startAt, now)} and turn off on ${
        sameDay(startAt, endAt) ? `the same day at ${formatClock(endAt)}` : formatDateTime(endAt, now)
    } (${formatDuration(endAt - startAt)}). It won’t repeat.`;

/**
 * A start the user picked that is already in the past (e.g. 9:00 when it is
 * 14:00): never saved as is and never moved silently. Returns the same clock
 * time on the next day for the screen to PROPOSE (with the exact date), or
 * null when the start is fine.
 */
export const proposeNextDayStart = (startAt, now = Date.now()) => {
    if (!Number.isFinite(startAt) || startAt >= now - ONCE_LIMITS.START_GRACE_MS) {return null;}
    const d = new Date(startAt);
    const n = new Date(now);
    // Same wall-clock time, first day on which it lies ahead.
    const next = new Date(n.getFullYear(), n.getMonth(), n.getDate(), d.getHours(), d.getMinutes(), 0, 0);
    while (next.getTime() < now - ONCE_LIMITS.START_GRACE_MS) {next.setDate(next.getDate() + 1);}
    return next.getTime();
};

// Default for a new one-time schedule: the next full hour, for one hour.
export const defaultOnceWindow = (now = Date.now()) => {
    const d = new Date(now);
    d.setMinutes(0, 0, 0);
    d.setHours(d.getHours() + 1);
    return {startAt: d.getTime(), endAt: d.getTime() + 60 * 60 * 1000};
};

const ONCE_STATUS_TEXT = {
    PENDING: 'Once',
    ACTIVE: 'Once · On now',
    COMPLETED: 'Once · Finished',
    CANCELLED: 'Once · Cancelled',
};

// Native row -> what Home lists.
export const normalizeOnceRow = row => ({
    id: String(row?.id || ''),
    kind: SCHEDULE_TYPE.ONCE,
    startAt: Number(row?.startAt) || 0,
    endAt: Number(row?.endAt) || 0,
    status: ['PENDING', 'ACTIVE', 'COMPLETED', 'CANCELLED'].includes(row?.status) ? row.status : 'COMPLETED',
});

export const onceStatusLabel = status => ONCE_STATUS_TEXT[status] || ONCE_STATUS_TEXT.COMPLETED;

// "Every week · Mon, Wed" (weekly rows keep their existing days).
export const weeklyDaysLabel = days => {
    const iso = toIsoDays(days);
    if (iso.length === 7) {return 'Every week · Every day';}
    return `Every week · ${iso.map(n => DAY_NAMES[n - 1].slice(0, 3)).join(', ')}`;
};
