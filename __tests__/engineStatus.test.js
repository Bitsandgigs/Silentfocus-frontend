import {
    describeEngineState,
    formatCountdown,
    silenceEndsAt,
} from '../src/utils/engineStatus';

const base = {
    silentActive: false,
    desiredSilent: false,
    source: null,
    activeRules: [],
    suppressedRules: [],
    manualOverride: {mode: 'NONE', until: null},
    nextTransition: null,
    dndAccess: true,
    exactAlarmAccess: true,
    blockedReason: null,
    scheduleCount: 0,
};

const now = new Date(2026, 8, 28, 10, 0, 0).getTime(); // Mon 10:00 local
const today = (h, m = 0) => new Date(2026, 8, 28, h, m, 0).getTime();

test('no engine (iOS / not ready) shows Normal', () => {
    expect(describeEngineState(null).title).toBe('Normal Mode');
});

test('normal with an upcoming schedule shows when it starts', () => {
    const s = describeEngineState(
        {...base, scheduleCount: 1, nextTransition: {at: today(11), kind: 'START'}},
        now,
    );
    expect(s.title).toBe('Normal Mode');
    expect(s.next).toBe('Next automatic silence 11:00 AM');
    expect(s.warning).toBeNull();
});

test('manual silence has no end time', () => {
    const state = {...base, silentActive: true, desiredSilent: true, source: 'MANUAL'};
    expect(describeEngineState(state, now)).toMatchObject({
        title: 'Silent Focus active',
        detail: 'Turned on manually',
    });
    expect(silenceEndsAt(state)).toBeNull();
});

test('schedule silence ends at the latest overlapping window', () => {
    const state = {
        ...base,
        silentActive: true,
        desiredSilent: true,
        source: 'SCHEDULE',
        activeRules: [
            {source: 'SCHEDULE', ruleId: 'a', windowStart: today(9), windowEnd: today(12)},
            {source: 'SCHEDULE', ruleId: 'b', windowStart: today(11), windowEnd: today(14)},
        ],
    };
    expect(silenceEndsAt(state)).toBe(today(14));
    expect(describeEngineState(state, now).detail).toBe(
        'By schedule until 2:00 PM',
    );
});

test('missing DND access is reported, not faked', () => {
    const s = describeEngineState(
        {...base, dndAccess: false, desiredSilent: true, blockedReason: 'DND_ACCESS_MISSING'},
        now,
    );
    expect(s.title).toBe('Silent Focus cannot run');
    expect(s.warning).toBe('DND_ACCESS_MISSING');
});

test('missing exact alarm access only matters with schedules', () => {
    expect(describeEngineState({...base, exactAlarmAccess: false}, now).warning).toBeNull();
    expect(
        describeEngineState({...base, exactAlarmAccess: false, scheduleCount: 2}, now).warning,
    ).toBe('EXACT_ALARM_MISSING');
});

test('manual OFF during a schedule shows it paused', () => {
    const s = describeEngineState(
        {
            ...base,
            suppressedRules: [{ruleId: 'a'}],
            manualOverride: {mode: 'FORCE_OFF', until: today(17)},
        },
        now,
    );
    expect(s.detail).toBe('Schedule paused until 5:00 PM');
});

test('formatCountdown', () => {
    expect(formatCountdown(3725)).toBe('01:02:05');
    expect(formatCountdown(-5)).toBe('00:00:00');
});

test('the same weekday next week includes the date', () => {
    const nextWeek = new Date(2026, 9, 5, 9, 26, 0).getTime(); // Mon 5 Oct
    const s = describeEngineState(
        {...base, scheduleCount: 1, nextTransition: {at: nextWeek, kind: 'START'}},
        now,
    );
    expect(s.next).toBe('Next automatic silence Mon 5 Oct 9:26 AM');
    const thursday = new Date(2026, 9, 1, 9, 0, 0).getTime();
    expect(
        describeEngineState(
            {...base, scheduleCount: 1, nextTransition: {at: thursday, kind: 'START'}},
            now,
        ).next,
    ).toBe('Next automatic silence Thu 9:00 AM');
});
