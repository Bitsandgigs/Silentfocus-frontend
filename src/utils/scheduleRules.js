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
