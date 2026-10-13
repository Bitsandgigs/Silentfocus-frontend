// Phase 5: learning wrapper, session summary, permission hub, error
// reporting/boundary.

import {
    describeSources,
    eventsInSession,
    formatDuration,
    normalizeSessions,
    startOfDay,
    summarizeDay,
} from '../src/utils/sessionHistory';
import {buildPermissionRows} from '../src/utils/permissionHub';
import {componentNames, scrubErrorText} from '../src/utils/errorReporting';

const H = 60 * 60 * 1000;

describe('session summary', () => {
    const now = new Date(2026, 9, 1, 18, 0, 0).getTime(); // 1 Oct 18:00 local
    const midnight = startOfDay(now);
    const raw = {
        recordingSince: midnight - 5 * 24 * H,
        sessions: [
            // Overnight session: only today's part counts.
            {id: 'a', start: midnight - 2 * H, end: midnight + 1 * H, primarySource: 'SCHEDULE', sources: ['SCHEDULE'], zoneNames: []},
            {
                id: 'b',
                start: midnight + 9 * H,
                end: midnight + 12 * H + 25 * 60 * 1000,
                primarySource: 'ZONE',
                sources: ['ZONE', 'CALENDAR'],
                zoneNames: ['Office'],
                emergencyBreakthroughs: 1,
                urgentBreakthroughs: 1,
                autoRepliesSent: 3,
            },
            // Ongoing.
            {id: 'c', start: now - 2 * H, end: null, primarySource: 'MANUAL', sources: ['MANUAL'], zoneNames: []},
            // Yesterday only: excluded.
            {id: 'd', start: midnight - 10 * H, end: midnight - 9 * H, primarySource: 'MANUAL', autoRepliesSent: 9},
            {start: 'bad'},
        ],
    };

    test('normalizes and sorts newest first, dropping bad rows', () => {
        const h = normalizeSessions(raw);
        expect(h.sessions.map(s => s.id)).toEqual(['c', 'b', 'a', 'd']);
        expect(h.sessions[3].emergencyBreakthroughs).toBe(0);
    });

    test("summarizes today's real sessions only", () => {
        const s = summarizeDay(normalizeSessions(raw), now);
        expect(s.sessionCount).toBe(3);
        expect(s.activeMs).toBe(1 * H + (3 * H + 25 * 60 * 1000) + 2 * H);
        expect(formatDuration(s.activeMs)).toBe('6h 25m');
        expect(s.emergencyBreakthroughs).toBe(1);
        expect(s.urgentBreakthroughs).toBe(1);
        expect(s.autoRepliesSent).toBe(3);
        expect(s.zones).toEqual(['Office']);
        expect(s.ongoing).toBe(true);
        expect(s.covered).toBe(true);
    });

    test('says when history does not cover the whole day, and never invents data', () => {
        const partial = summarizeDay(normalizeSessions({recordingSince: midnight + 8 * H, sessions: []}), now);
        expect(partial.covered).toBe(false);
        expect(partial.sessionCount).toBe(0);
        const none = summarizeDay(normalizeSessions(null), now);
        expect(none.recordingSince).toBeNull();
        expect(none.sessionCount).toBe(0);
    });

    test('details helpers', () => {
        const b = normalizeSessions(raw).sessions[1];
        expect(describeSources(b)).toEqual({primary: 'Silent Zone', others: ['Calendar']});
        const rows = [{at: b.start + 1}, {at: b.start - 1}, {at: b.end}];
        expect(eventsInSession(rows, b, now)).toHaveLength(2);
        expect(formatDuration(5 * 60 * 1000)).toBe('5m');
    });
});

describe('learning wrapper', () => {
    afterEach(() => {
        delete require('react-native').NativeModules.SilentFocus;
    });

    const load = native => {
        jest.resetModules();
        const RN = require('react-native');
        RN.Platform.OS = 'android';
        RN.NativeModules.SilentFocus = native;
        return require('../src/utils/learning');
    };

    test('normalizes state and builds the zone-form prefill (nothing saved)', async () => {
        const native = {
            getLearningState: jest.fn(() =>
                Promise.resolve({
                    enabled: true,
                    optInAnswered: true,
                    placeCount: 2,
                    suggestion: {id: 'p1', latitude: 12.9352, longitude: 77.6245, radius: 150},
                }),
            ),
            dismissLearningSuggestion: jest.fn(() => Promise.resolve({enabled: true})),
            resolveLearnedPlace: jest.fn(() => Promise.resolve({})),
            addListener: jest.fn(),
            removeListeners: jest.fn(),
        };
        const learning = load(native);
        const s = await learning.getLearningState();
        expect(s.suggestion).toEqual({id: 'p1', latitude: 12.9352, longitude: 77.6245, radius: 150});
        expect(learning.zonePrefillFromSuggestion(s.suggestion)).toEqual({
            learnedPlace: {id: 'p1', latitude: 12.9352, longitude: 77.6245, radius: 150},
        });
        await learning.dismissLearningSuggestion('p1');
        expect(native.dismissLearningSuggestion).toHaveBeenCalledWith('p1');
        await learning.resolveLearnedPlace(7);
        expect(native.resolveLearnedPlace).toHaveBeenCalledWith('7');
    });

    test('opt-in is offered once, only after a manual ON, only when off', () => {
        const learning = load({getLearningState: jest.fn()});
        const off = learning.normalizeLearningState({enabled: false, optInAnswered: false});
        expect(learning.shouldOfferOptIn(off, true)).toBe(true);
        expect(learning.shouldOfferOptIn(off, false)).toBe(false);
        expect(learning.shouldOfferOptIn({...off, optInAnswered: true}, true)).toBe(false);
        expect(learning.shouldOfferOptIn({...off, enabled: true}, true)).toBe(false);
    });

    test('invalid suggestions are dropped; unavailable platform is a no-op', async () => {
        const learning = load({getLearningState: jest.fn()});
        expect(learning.normalizeLearningState({suggestion: {id: 'x', latitude: 'a'}}).suggestion).toBeNull();
        jest.resetModules();
        require('react-native').Platform.OS = 'ios';
        const ios = require('../src/utils/learning');
        expect(ios.isLearningAvailable).toBe(false);
        expect((await ios.getLearningState()).enabled).toBe(false);
    });
});

describe('permission hub', () => {
    const base = {
        dndAccess: true,
        exactAlarms: false,
        notificationAccess: true,
        fineLocation: true,
        coarseLocation: true,
        backgroundLocation: false,
        locationServicesOn: true,
        calendar: true,
        contacts: false,
        phoneState: true,
        callScreeningSupported: true,
        callScreening: false,
        callFeaturesInUse: false,
    };

    test('lists only access the app uses, with status', () => {
        const rows = buildPermissionRows(base);
        const keys = rows.map(r => r.key);
        expect(keys).toEqual([
            'dnd',
            'exactAlarms',
            'notificationAccess',
            'location',
            'backgroundLocation',
            'locationServices',
            'calendar',
            'callScreening',
        ]);
        expect(keys).not.toContain('callLog');
        expect(keys).not.toContain('sms');
        expect(rows.find(r => r.key === 'exactAlarms').ok).toBe(false);
        expect(rows.every(r => typeof r.why === 'string' && r.why.length > 10)).toBe(true);
    });

    test('contacts and phone state appear when call features are in use', () => {
        const keys = buildPermissionRows({...base, callFeaturesInUse: true}).map(r => r.key);
        expect(keys).toContain('contacts');
        expect(keys).toContain('phoneState');
        expect(buildPermissionRows({...base, callScreeningSupported: false}).map(r => r.key)).not.toContain(
            'callScreening',
        );
        expect(buildPermissionRows(null)).toEqual([]);
    });
});

describe('error reporting', () => {
    test('scrubs tokens, e-mails, phone numbers and coordinates', () => {
        const t = scrubErrorText(
            'Failed for +91 98765 43210 at 12.935212,77.624512 with Bearer abc.def-123 for a@b.com id 123456',
        );
        expect(t).not.toMatch(/98765|43210|12\.9352|77\.6245|abc\.def|a@b\.com|123456/);
        expect(t).toContain('Bearer [redacted]');
        expect(scrubErrorText('x'.repeat(1000))).toHaveLength(300);
    });

    test('keeps only component names from a component stack', () => {
        expect(componentNames('\n    in Foo (at App.js:12)\n    in Bar\n    at Baz (file.js:1)')).toBe('Foo < Bar < Baz');
    });

});
