import {
    minutesToHHmm,
    normalizeScheduleRow,
    parseTimeToMinutes,
    toEngineSchedules,
    toggleDay,
    toIsoDays,
    validateScheduleTimes,
} from '../src/utils/scheduleRules';

describe('parseTimeToMinutes', () => {
    test.each([
        ['10:00:00', 600],
        ['10:00', 600],
        ['9:05', 545],
        ['00:00', 0],
        ['23:59:59', 1439],
    ])('%p -> %p', (input, expected) => {
        expect(parseTimeToMinutes(input)).toBe(expected);
    });

    test.each(['24:00', '10:60', '10', '', null, undefined, '10:00 PM'])(
        'rejects %p',
        input => {
            expect(parseTimeToMinutes(input)).toBeNull();
        },
    );

    test('round-trips through minutesToHHmm', () => {
        expect(minutesToHHmm(parseTimeToMinutes('07:05:00'))).toBe('07:05');
    });
});

describe('toIsoDays', () => {
    test('maps names to ISO weekdays, deduped and sorted', () => {
        expect(toIsoDays(['Sunday', 'Monday', 'Monday'])).toEqual([1, 7]);
    });

    test('accepts the comma-separated form the create API uses', () => {
        expect(toIsoDays('Monday, Friday')).toEqual([1, 5]);
    });

    test('Everyday / missing / empty mean every day', () => {
        const all = [1, 2, 3, 4, 5, 6, 7];
        expect(toIsoDays('Everyday')).toEqual(all);
        expect(toIsoDays(undefined)).toEqual(all);
        expect(toIsoDays([])).toEqual(all);
    });
});

describe('validateScheduleTimes', () => {
    test('normal range', () => {
        expect(validateScheduleTimes(540, 1020)).toEqual({
            valid: true,
            overnight: false,
            error: null,
        });
    });

    test('overnight is allowed (Fri 22:00 -> Sat 07:00)', () => {
        expect(validateScheduleTimes(1320, 420)).toEqual({
            valid: true,
            overnight: true,
            error: null,
        });
    });

    test('same start and end is rejected', () => {
        expect(validateScheduleTimes(600, 600).valid).toBe(false);
        expect(validateScheduleTimes(null, 600).valid).toBe(false);
    });
});

// Row shape captured from GET get-scheduleTimerData on the dev backend.
const apiRows = [
    {
        schedule_id: 3,
        from_time: '10:00:00',
        to_time: '11:00:00',
        selected_days: ['Tuesday'],
        days: 'Tuesday',
        isTimerEnabled: false,
        active: false,
        event_type: 'custom',
    },
    {
        schedule_id: 4,
        from_time: '13:00:00',
        to_time: '14:00:00',
        selected_days: ['Tuesday'],
        isTimerEnabled: true,
        event_type: 'calendar',
        calendar_event_id: 'evt-1',
    },
];

describe('API rows -> engine rules', () => {
    test('normalizeScheduleRow keeps id, times, days, flag and type', () => {
        expect(normalizeScheduleRow(apiRows[0], 0)).toEqual({
            id: 3,
            // Legacy row without the 2026-10-01 name/timezone columns.
            name: null,
            timezone: null,
            startTime: '10:00:00',
            endTime: '11:00:00',
            days: ['Tuesday'],
            enabled: false,
            eventType: 'custom',
        });
    });

    test('calendar-derived rows are not automated in Phase 2', () => {
        const rules = toEngineSchedules(apiRows.map(normalizeScheduleRow));
        expect(rules).toEqual([
            {
                id: '3',
                startMinute: 600,
                endMinute: 660,
                days: [2],
                enabled: false,
            },
        ]);
    });

    test('overnight rules pass through; broken rows are dropped', () => {
        const rules = toEngineSchedules([
            {id: 1, startTime: '22:00', endTime: '07:00', days: ['Friday'], enabled: true},
            {id: 2, startTime: 'bad', endTime: '07:00', days: 'Everyday', enabled: true},
            {id: 3, startTime: '08:00', endTime: '08:00', days: 'Everyday', enabled: true},
        ]);
        expect(rules).toEqual([
            {id: '1', startMinute: 1320, endMinute: 420, days: [5], enabled: true},
        ]);
    });

    test('non-array input gives no rules', () => {
        expect(toEngineSchedules(null)).toEqual([]);
    });
});

describe('toggleDay', () => {
    test('does not mutate the previous array or its items', () => {
        const before = [{day: 'Monday', status: true}];
        const frozen = JSON.stringify(before);
        const after = toggleDay(before, 'Monday');
        expect(JSON.stringify(before)).toBe(frozen);
        expect(after).not.toBe(before);
        expect(after).toEqual([{day: 'Monday', status: false}]);
    });

    test('adds a new day selected', () => {
        expect(toggleDay([], 'Friday')).toEqual([{day: 'Friday', status: true}]);
    });
});
