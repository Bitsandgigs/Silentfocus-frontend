// Final client-feedback round: one-time schedules, hidden Location Mode,
// call log completeness, status / emergency notification wording.
import fs from 'fs';
import path from 'path';

import {
    SCHEDULE_TEXTS,
    SCHEDULE_TYPE,
    defaultOnceWindow,
    describeOncePlan,
    formatDuration,
    formatOnceRange,
    normalizeOnceRow,
    onceStatusLabel,
    proposeNextDayStart,
    toEngineSchedules,
    toIsoDays,
    validateOnce,
    weeklyDaysLabel,
} from '../src/utils/scheduleRules';
import {FEATURES} from '../src/config/features';
import {buildAutomationSettings, describeControlModes} from '../src/utils/automationSync';
import {describeEvent} from '../src/utils/activityEvents';

const read = rel => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
const MIN = 60 * 1000;
const HOUR = 60 * MIN;
// Local wall-clock dates (Jest runs in the machine's zone, like the phone).
const local = (y, mo, d, h, mi = 0) => new Date(y, mo - 1, d, h, mi, 0, 0).getTime();

describe('Weekly schedule destructive actions', () => {
    test('deletion has a cancel path and warns when the rule is active', () => {
        const home = read('src/screens/HomeScreen.js');
        expect(home).toMatch(/isRunning \? 'End and delete this schedule\?' : 'Delete this schedule\?'/);
        expect(home).toMatch(/\{text: 'Cancel', style: 'cancel'\}/);
        expect(home).toMatch(/Silent Focus will stay on if another mode is still active/);
        expect(home).toMatch(/onPressDelete\(item, isRunning\)/);
    });
});

describe('Issue 1 - one-time schedules', () => {
    const now = local(2026, 10, 16, 14, 0); // Fri 16 Oct, 2:00 PM

    test('later today, tomorrow and overnight are valid; exact wording shown', () => {
        expect(validateOnce(now + HOUR, now + 2 * HOUR, now)).toBeNull();
        expect(validateOnce(now + 24 * HOUR, now + 25 * HOUR, now)).toBeNull();
        const start = local(2026, 10, 16, 22, 0);
        const end = local(2026, 10, 17, 6, 0);
        expect(validateOnce(start, end, now)).toBeNull();
        expect(formatOnceRange(start, end, now)).toBe('Fri 16 Oct, 10:00 PM – Sat 17 Oct, 6:00 AM');
        expect(describeOncePlan(start, end, now)).toBe(
            'Silent Focus will turn on once on Fri 16 Oct, 10:00 PM and turn off on Sat 17 Oct, 6:00 AM (8 h). It won’t repeat.',
        );
        expect(describeOncePlan(now + HOUR, now + 90 * MIN, now)).toBe(
            'Silent Focus will turn on once on Fri 16 Oct, 3:00 PM and turn off on the same day at 3:30 PM (30 min). It won’t repeat.',
        );
    });

    test('past start, zero/negative duration and >7 days are rejected', () => {
        expect(validateOnce(now - 10 * MIN, now + HOUR, now)).toBe('START_PASSED');
        expect(validateOnce(now + HOUR, now + HOUR, now)).toBe('END_BEFORE_START');
        expect(validateOnce(now + 2 * HOUR, now + HOUR, now)).toBe('END_BEFORE_START');
        expect(validateOnce(now + HOUR, now + HOUR + 30000, now)).toBe('TOO_SHORT');
        expect(validateOnce(now, now + 8 * 24 * HOUR, now)).toBe('TOO_LONG');
        expect(validateOnce(NaN, now, now)).toBe('MISSING');
    });

    test('a start that already passed is only PROPOSED for the next day, never moved silently', () => {
        const nineAm = local(2026, 10, 16, 9, 0);
        expect(proposeNextDayStart(nineAm, now)).toBe(local(2026, 10, 17, 9, 0));
        // Later today: nothing to propose.
        expect(proposeNextDayStart(now + HOUR, now)).toBeNull();
        // Picked last week by mistake: the next time that clock time lies ahead.
        expect(proposeNextDayStart(local(2026, 10, 9, 16, 0), now)).toBe(local(2026, 10, 16, 16, 0));
    });

    test('default window is the next full hour, one hour long, in the future', () => {
        const w = defaultOnceWindow(local(2026, 10, 16, 14, 25));
        expect(w.startAt).toBe(local(2026, 10, 16, 15, 0));
        expect(w.endAt - w.startAt).toBe(HOUR);
        expect(validateOnce(w.startAt, w.endAt, local(2026, 10, 16, 14, 25))).toBeNull();
    });

    test('durations and status labels', () => {
        expect(formatDuration(90 * MIN)).toBe('1 h 30 min');
        expect(formatDuration(26 * HOUR)).toBe('1 day 2 h');
        expect(formatDuration(45 * MIN)).toBe('45 min');
        expect(onceStatusLabel('PENDING')).toBe('Once');
        expect(onceStatusLabel('ACTIVE')).toBe('Once · On now');
        expect(onceStatusLabel('COMPLETED')).toBe('Once · Finished');
        expect(onceStatusLabel('CANCELLED')).toBe('Once · Cancelled');
        expect(normalizeOnceRow({id: 'once-1', startAt: 5, endAt: 9, status: 'BOGUS'})).toEqual({
            id: 'once-1',
            kind: SCHEDULE_TYPE.ONCE,
            startAt: 5,
            endAt: 9,
            status: 'COMPLETED',
        });
    });

    test('explanations for both types', () => {
        expect(SCHEDULE_TEXTS.intro).toBe('Choose whether Silent Focus runs once or repeats every week.');
        expect(SCHEDULE_TEXTS.once).toMatch(/turn on once .* It won’t repeat\./);
        expect(SCHEDULE_TEXTS.weekly).toBe('Silent Focus will repeat every week on the days you choose.');
    });

    test('existing weekly schedules keep their meaning and are labelled as weekly', () => {
        expect(weeklyDaysLabel(['Monday', 'Friday'])).toBe('Every week · Mon, Fri');
        expect(weeklyDaysLabel('Everyday')).toBe('Every week · Every day');
        // Unchanged legacy behaviour: missing days still mean every day for SERVER rows.
        expect(toIsoDays(undefined)).toEqual([1, 2, 3, 4, 5, 6, 7]);
        // One-time rows are never pushed to the weekly engine (they would become daily).
        const rules = toEngineSchedules([
            {id: 8, startTime: '22:00:00', endTime: '06:00:00', days: ['Friday'], enabled: true},
            {id: 'once-x', kind: 'once', startAt: 1, endAt: 2, status: 'PENDING'},
        ]);
        expect(rules).toEqual([{id: '8', startMinute: 1320, endMinute: 360, days: [5], enabled: true}]);
    });

    test('screens: weekly needs days, once needs none; edit never changes the type', () => {
        const create = read('src/screens/ScheduleTimeScreen.js');
        expect(create).toMatch(/scheduleType === SCHEDULE_TYPE\.WEEKLY &&\s*\(fromTimeString === ''/);
        expect(create).toContain('confirmAndSaveOnce');
        const edit = read('src/screens/EditScheduleTimeScreen.js');
        expect(edit).toMatch(/<ScheduleTypeSelector[\s\S]*?locked/);
        // Weekly edits still go to the server's PUT; one-time edits stay native.
        expect(edit).toContain("APICall('put', payload, url)");
        expect(edit).toMatch(/if \(isOnce\) \{\s*const saved = await confirmAndSaveOnce\(\{[\s\S]*?id: scheduleData\.id/);
        expect(edit).toMatch(/toIsoDays\(scheduleData\.days\)\.map/);
        // One-time schedules are never sent to the schedule API.
        const form = read('src/componentes/OnceScheduleForm.js');
        expect(form).not.toMatch(/APICall|EndPoints/);
    });
});

describe('Issue 4 - Location Mode hidden and disabled', () => {
    test('gate is off in JS and native', () => {
        expect(FEATURES.LOCATION_MODE_PUBLIC_PLACES).toBe(false);
        expect(read('android/app/src/main/java/com/SilenceFocus/automation/Features.kt')).toMatch(
            /const val PUBLIC_PLACES_LOCATION_MODE = false/,
        );
    });

    test('Control Center hides the card and legacy backend preference is discarded', () => {
        const screen = read('src/screens/SettingScreen.js');
        expect(screen).toMatch(/\{FEATURES\.LOCATION_MODE_PUBLIC_PLACES && \(\s*<View style=\{styles\.containerView\}>[\s\S]*?\{'Location Mode'\}/);
        // Calendar / Custom toggles keep posting the stored locationMode value.
        expect(screen).toMatch(/\{locationMode, calendarMode: !calendarMode, customMode\}/);
        expect(screen).toMatch(/\{locationMode, calendarMode, customMode: !customMode\}/);
        expect(buildAutomationSettings({controlModes: {locationMode: true}}).publicPlacesEnabled).toBe(false);
    });

    test('paused-zones hint no longer points at a hidden mode', () => {
        const legacy = {locationMode: false, customMode: true, customModeConfirmed: false};
        expect(describeControlModes(legacy, false, false).customStatus).toBe(
            'Your Silent Zones are paused. Turn Custom off and on again to start them.',
        );
        expect(describeControlModes(legacy, false, true).customStatus).toMatch(/need Location Mode on/);
        // Zones still work exactly as before for every other account.
        expect(describeControlModes({locationMode: false, customMode: true, customModeConfirmed: true}).zonesActive).toBe(true);
    });

    test('native: provider is absent and every legacy path cleans state', () => {
        const dir = 'android/app/src/main/java/com/SilenceFocus/automation/';
        const engine = read(dir + 'AutomationEngine.kt');
        expect(engine).not.toMatch(/PublicPlaceRuleProvider\(/);
        expect(engine).toContain('PublicPlaces.disablePermanently(context)');
        const reg = read(dir + 'GeofenceRegistrar.kt');
        expect(reg).toContain('store.placeSearch.takeIf { settings.publicPlacesActive }');
        expect(reg).not.toMatch(/settings\.publicPlacesEnabled/);
        expect(read(dir + 'PublicPlaces.kt')).toMatch(/fun scheduleRefresh\(context: Context\) \{[\s\S]*?disablePermanently\(context\)/);
        expect(read(dir + 'PublicPlaces.kt')).toMatch(/fun refresh\(context: Context\): Boolean \{[\s\S]*?return false/);
        expect(read(dir + 'GeofenceEventReceiver.kt')).toContain('PublicPlaces.disablePermanently(context)');
        const store = read(dir + 'EngineStore.kt');
        expect(store).toContain('fun clearPublicPlacesState()');
        expect(store).toMatch(/publicPlacesEnabled = false/);
        expect(store).toMatch(/\.remove\(KEY_SET_PUBLIC_PLACES\)/);
    });

    test('onboarding no longer promises automatic muting at religious places', () => {
        expect(read('src/screens/OnboardingScreen.js')).not.toMatch(/religious places/);
        // (A commented-out copy of the old text remains in that file.)
        expect(read('src/screens/Welcome1Screen.js')).toMatch(/in Custom Silent Zones you create,\s*such as your office, and during meetings\./);
    });
});

describe('Issue 5 - call log rows', () => {
    test('a call screening could not see is still listed (no caller), with its outcome', () => {
        const row = describeEvent({type: 'INCOMING_CALL', detail: 'NOT_SCREENED', callState: 'MISSED'});
        expect(row.title).toBe('Incoming call');
        expect(row.subtitle).toBe('Silenced · Missed');
    });

    test('answered / missed on screened calls; unknown state shows nothing extra', () => {
        expect(describeEvent({type: 'INCOMING_CALL', caller: '+41 •• 67', detail: 'BELOW_THRESHOLD', callState: 'ANSWERED'}).subtitle).toBe(
            'Silenced · Answered',
        );
        expect(describeEvent({type: 'INCOMING_CALL', caller: '+41 •• 67', detail: 'BELOW_THRESHOLD'}).subtitle).toBe('Silenced');
        expect(describeEvent({type: 'EMERGENCY_BREAKTHROUGH', contactName: 'Mum', caller: 'x', callState: 'MISSED'}).subtitle).toBe(
            'Mum · x · Missed',
        );
        expect(describeEvent({type: 'URGENT_REPEAT_CALLER', caller: 'y', repeatCount: 3, callState: 'ANSWERED'}).subtitle).toBe(
            'y · Answered',
        );
    });

    test('native: phone-state broadcasts feed the call log', () => {
        const recv = read('android/app/src/main/java/com/SilenceFocus/comms/SilentFocusCallScreeningService.kt');
        expect(recv).toContain('CallBreakthroughs.onPhoneState(context, state)');
        const calls = read('android/app/src/main/java/com/SilenceFocus/comms/CallBreakthroughs.kt');
        expect(calls).toMatch(/needsFallbackRow\(engine\.owned, tracked, now\)/);
    });
});

describe('Issue 8 - calendar subject in the status notification', () => {
    test('the selected Instances occurrence supplies the single local subject source', () => {
        const engine = read('android/app/src/main/java/com/SilenceFocus/automation/AutomationEngine.kt');
        expect(engine).toContain('CalendarTitles.labelFor(decision.activeRules)');
        const sync = read('android/app/src/main/java/com/SilenceFocus/automation/CalendarSync.kt');
        expect(sync).toContain('CalendarContract.Instances.TITLE');
        expect(sync).not.toContain('CalendarContract.Events.TITLE');
        const status = read('android/app/src/main/java/com/SilenceFocus/automation/StatusNotification.kt');
        expect(status).toContain('setVisibility(NotificationCompat.VISIBILITY_PRIVATE)');
        expect(status).toContain('setContentText(content.publicText)');
        expect(status).toContain('"Your phone is silent · $generic: $name"');
    });
});
