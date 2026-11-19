import {entitlementsFrom} from '../src/utils/entitlements';
import {statusBadge, trialSummary} from '../src/utils/subscription';

const limits = (over = {}) => ({calendars: null, zones: null, automation_rules: null, connected_apps: null, zone_suggestions: null, ...over});

describe('entitlementsFrom (plan snapshot -> what the phone may run)', () => {
    test('a missing snapshot gives nothing to push', () => {
        expect(entitlementsFrom(null)).toBeNull();
        expect(entitlementsFrom({})).toBeNull();
    });
    test('an active trial is unlimited and lapses exactly when the trial ends', () => {
        const e = entitlementsFrom({limits: limits(), trial: {active: true, ends_at: '2026-11-26T10:00:00+00:00'}});
        expect(e.limits).toEqual({calendars: null, zones: null, replies: null, apps: null, suggestions: null});
        expect(e.until).toBe(Date.parse('2026-11-26T10:00:00Z'));
    });
    test('Free after the trial locks calendars, zones and replies and never lapses (already the floor)', () => {
        const e = entitlementsFrom({limits: limits({calendars: 0, zones: 0, automation_rules: 0, connected_apps: 0, zone_suggestions: 0}), trial: {active: false, ended: true}});
        expect(e.limits).toEqual({calendars: 0, zones: 0, replies: 0, apps: 0, suggestions: 0});
        expect(e.until).toBe(0);
    });
    test('Pro keeps the server limits and lapses 24h after the paid period ends', () => {
        const e = entitlementsFrom({subscribed_plan: 'pro', current_period_end: '2026-12-01 10:00:00', limits: limits({calendars: 1, zones: 3, automation_rules: 4, connected_apps: 1, zone_suggestions: 3})});
        expect(e.limits).toEqual({calendars: 1, zones: 3, replies: 4, apps: 1, suggestions: 3});
        expect(e.until).toBe(Date.parse('2026-12-02T10:00:00Z'));
    });
    test('a lifetime plan never lapses', () => {
        const e = entitlementsFrom({subscribed_plan: 'premium', is_lifetime: true, current_period_end: null, limits: limits()});
        expect(e.until).toBe(0);
    });
});

describe('trial wording', () => {
    test('days left while the trial runs', () => {
        expect(trialSummary({trial: {active: true, days_left: 5}})).toMatch(/5 days left/);
        expect(trialSummary({trial: {active: true, days_left: 1}})).toMatch(/last day/);
        expect(statusBadge({trial: {active: true}, status: 'trialing'})).toBe('Free trial');
    });
    test('after the trial it says what is locked and that manual mode stays free', () => {
        const t = trialSummary({trial: {active: false, ended: true}, subscribed_plan: null});
        expect(t).toMatch(/ended/);
        expect(t).toMatch(/Manual silent mode stays free/);
        expect(t).toMatch(/Calendars, Silent Zones and automatic replies/);
        expect(statusBadge({trial: {ended: true}, subscribed_plan: null, status: 'expired'})).toBe('Trial ended');
    });
    test('nothing for a paying user', () => {
        expect(trialSummary({trial: {started: false, active: false, ended: false}, subscribed_plan: 'pro'})).toBe('');
    });
});
