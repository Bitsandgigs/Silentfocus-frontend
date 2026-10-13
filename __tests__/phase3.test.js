import {RESULTS} from 'react-native-permissions';

import {buildAutomationSettings} from '../src/utils/automationSync';
import {summarizeLocation} from '../src/utils/locationPermissions';
import {assessLocationFix, validateZoneForm} from '../src/utils/zoneForm';
import {
    calendarIssue,
    describeEngineState,
    locationIssue,
    silenceEndsAt,
} from '../src/utils/engineStatus';

describe('buildAutomationSettings', () => {
    // Settings row captured from GET /settings on the dev backend.
    const settings = {
        location_mode: 1,
        calendar_mode: 1,
        ignore_all_day_events: 1,
        meeting_start_before_minutes: 0,
        meeting_end_after_minutes: 0,
    };

    test('maps Control Center modes + backend offsets', () => {
        expect(
            buildAutomationSettings({
                controlModes: {locationMode: true, calendarMode: true},
                settings: {...settings, meeting_start_before_minutes: 10, meeting_end_after_minutes: '5'},
                calendarConnected: true,
            }),
        ).toEqual({
            locationEnabled: true,
            calendarEnabled: true,
            calendarBeforeMinutes: 10,
            calendarAfterMinutes: 5,
            ignoreAllDayEvents: true,
        });
    });

    test('calendar automation needs a connected calendar', () => {
        const s = buildAutomationSettings({
            controlModes: {locationMode: false, calendarMode: true},
            settings,
            calendarConnected: false,
        });
        expect(s.calendarEnabled).toBe(false);
        expect(s.locationEnabled).toBe(false);
    });

    test('offsets are clamped and bad values ignored', () => {
        const s = buildAutomationSettings({
            controlModes: {},
            settings: {meeting_start_before_minutes: -3, meeting_end_after_minutes: 9999},
            calendarConnected: true,
        });
        expect(s.calendarBeforeMinutes).toBe(0);
        expect(s.calendarAfterMinutes).toBe(240);
        expect(s.ignoreAllDayEvents).toBe(true);
        expect(
            buildAutomationSettings({controlModes: {}, settings: {ignore_all_day_events: 0}}).ignoreAllDayEvents,
        ).toBe(false);
    });
});

describe('summarizeLocation', () => {
    const G = RESULTS.GRANTED;
    const D = RESULTS.DENIED;
    const B = RESULTS.BLOCKED;

    test('precise + all the time = automation ready', () => {
        expect(summarizeLocation({fine: G, coarse: G, background: G})).toEqual({
            foreground: 'granted',
            background: 'granted',
            automationReady: true,
            mapReady: true,
        });
    });

    test('foreground only: map works, geofencing does not', () => {
        const s = summarizeLocation({fine: G, coarse: G, background: D});
        expect(s.mapReady).toBe(true);
        expect(s.automationReady).toBe(false);
    });

    test('approximate only is not enough for zones', () => {
        const s = summarizeLocation({fine: D, coarse: G, background: G});
        expect(s.foreground).toBe('approximate');
        expect(s.automationReady).toBe(false);
    });

    test('permanently denied is reported as blocked', () => {
        expect(summarizeLocation({fine: B, coarse: B, background: B})).toMatchObject({
            foreground: 'blocked',
            background: 'blocked',
            mapReady: false,
        });
    });
});

describe('zone form', () => {
    test('fix accuracy thresholds', () => {
        expect(assessLocationFix(12)).toMatchObject({usable: true, level: 'good'});
        expect(assessLocationFix(120)).toMatchObject({usable: true, level: 'fair'});
        expect(assessLocationFix(900)).toMatchObject({usable: false, level: 'poor'});
    });

    test('validation', () => {
        const ok = {name: 'Office', latitude: 12.9, longitude: 77.5, radius: 150};
        expect(validateZoneForm(ok)).toBeNull();
        expect(validateZoneForm({...ok, latitude: null})).toMatch(/Choose a location/);
        expect(validateZoneForm({...ok, name: '  '})).toMatch(/name/);
        expect(validateZoneForm({...ok, radius: 50})).toMatch(/Radius/);
    });
});

describe('Home labels for new sources', () => {
    const base = {
        silentActive: true,
        desiredSilent: true,
        dndAccess: true,
        exactAlarmAccess: true,
        suppressedRules: [],
        manualOverride: {mode: 'NONE'},
        scheduleCount: 0,
    };
    const now = new Date(2026, 8, 28, 10, 0).getTime();

    test('zone shows its name, no end time', () => {
        const state = {
            ...base,
            source: 'ZONE',
            activeRules: [
                {source: 'ZONE', ruleId: '3', name: 'Office', windowStart: 1, windowEnd: null},
                {source: 'SCHEDULE', ruleId: 's', windowStart: 1, windowEnd: now + 3600e3},
            ],
        };
        expect(describeEngineState(state, now).detail).toBe('Silent Zone: Office');
        expect(silenceEndsAt(state)).toBeNull();
    });

    test('calendar shows an end time but no event details', () => {
        const end = new Date(2026, 8, 28, 11, 5).getTime();
        const state = {
            ...base,
            source: 'CALENDAR',
            activeRules: [{source: 'CALENDAR', ruleId: '1:2:3', name: null, windowStart: 1, windowEnd: end}],
        };
        expect(describeEngineState(state, now).detail).toBe('Calendar event until 11:05 AM');
    });

    test('location issue only when zones are meant to work', () => {
        const loc = status => ({location: {enabled: true, zoneCount: 1, status}});
        expect(locationIssue(loc('BACKGROUND_LOCATION_MISSING')).status).toBe('BACKGROUND_LOCATION_MISSING');
        expect(locationIssue(loc('REGISTERED'))).toBeNull();
        expect(locationIssue({location: {enabled: false, zoneCount: 1, status: 'LOCATION_PERMISSION_MISSING'}})).toBeNull();
        expect(locationIssue({location: {enabled: true, zoneCount: 0, status: 'LOCATION_PERMISSION_MISSING'}})).toBeNull();
    });

    test('calendar issue only when calendar automation is on', () => {
        expect(calendarIssue({calendar: {enabled: true, status: 'CALENDAR_PERMISSION_MISSING'}})).not.toBeNull();
        expect(calendarIssue({calendar: {enabled: false, status: 'CALENDAR_PERMISSION_MISSING'}})).toBeNull();
        expect(calendarIssue({calendar: {enabled: true, status: 'SYNCED'}})).toBeNull();
    });
});
