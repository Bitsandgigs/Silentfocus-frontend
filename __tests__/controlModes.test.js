/* eslint-env jest */
// Location Mode vs Custom Mode -> whether the user's Silent Zones automate.

import AsyncStorage from '@react-native-async-storage/async-storage';

import {
    buildAutomationSettings,
    customModeConfirmedKey,
    isPersistedCustomConfirmation,
    markDeviceCustomConfirmed,
    readDeviceCustomConfirmed,
    zonesEnabledFor,
} from '../src/utils/automationSync';

const settings = {meeting_start_before_minutes: 0, meeting_end_after_minutes: 0, ignore_all_day_events: 1};
const combos = [
    // [locationMode, customMode, confirmed result, unconfirmed (legacy) result]
    [false, false, false, false],
    [true, false, false, false], // Location only: public places are not implemented
    [false, true, true, false], // Custom only: unconfirmed accounts stay off (no surprise DND)
    [true, true, true, true],
];

describe('zonesEnabledFor', () => {
    test.each(combos)('confirmed account: Location %p + Custom %p -> %p', (locationMode, customMode, expected) => {
        expect(zonesEnabledFor({locationMode, customMode, customModeConfirmed: true})).toBe(expected);
    });

    test.each(combos)(
        'unconfirmed account: Location %p + Custom %p -> %p (legacy-safe)',
        (locationMode, customMode, _confirmed, expected) => {
            expect(zonesEnabledFor({locationMode, customMode, customModeConfirmed: false})).toBe(expected);
        },
    );

    test('mentor: Location ON + Custom OFF never runs zones, confirmed or not', () => {
        expect(zonesEnabledFor({locationMode: true, customMode: false, customModeConfirmed: false})).toBe(false);
        expect(zonesEnabledFor({locationMode: true, customMode: false, customModeConfirmed: true})).toBe(false);
    });

    test('server confirmation wins over the device marker', () => {
        const modes = {locationMode: false, customMode: true};
        expect(zonesEnabledFor({...modes, customModeConfirmed: false}, true)).toBe(false);
        expect(zonesEnabledFor({...modes, customModeConfirmed: true}, false)).toBe(true);
    });

    test('backend without the field: device marker decides, default is legacy-safe', () => {
        const modes = {locationMode: false, customMode: true};
        expect(zonesEnabledFor(modes)).toBe(false);
        expect(zonesEnabledFor(modes, false)).toBe(false);
        expect(zonesEnabledFor(modes, true)).toBe(true);
        expect(zonesEnabledFor({...modes, customModeConfirmed: null}, true)).toBe(true);
    });

    test('backend without customMode keeps the old Location-only behaviour', () => {
        expect(zonesEnabledFor({locationMode: true})).toBe(true);
        expect(zonesEnabledFor({locationMode: false}, true)).toBe(false);
        expect(zonesEnabledFor({locationMode: true, customMode: null})).toBe(true);
    });

    test('numeric/string flags from the backend', () => {
        expect(zonesEnabledFor({locationMode: 0, customMode: 1, customModeConfirmed: 1})).toBe(true);
        expect(zonesEnabledFor({locationMode: '1', customMode: '0', customModeConfirmed: '1'})).toBe(false);
        expect(zonesEnabledFor({locationMode: 0, customMode: '1', customModeConfirmed: 0})).toBe(false);
    });

    test('nothing at all (offline/failed fetch is handled by the caller) is off', () => {
        expect(zonesEnabledFor(undefined)).toBe(false);
        expect(zonesEnabledFor({})).toBe(false);
    });
});

describe('buildAutomationSettings', () => {
    test('zones follow Custom Mode for a confirmed account; Calendar is independent of both', () => {
        const s = buildAutomationSettings({
            controlModes: {locationMode: false, calendarMode: true, customMode: true, customModeConfirmed: true},
            settings,
            calendarConnected: true,
        });
        expect(s.locationEnabled).toBe(true);
        expect(s.calendarEnabled).toBe(true);

        const off = buildAutomationSettings({
            controlModes: {locationMode: true, calendarMode: true, customMode: false, customModeConfirmed: true},
            settings,
            calendarConnected: true,
        });
        expect(off.locationEnabled).toBe(false);
        expect(off.calendarEnabled).toBe(true);
    });

    test('device marker is passed through when the server has no field', () => {
        const modes = {locationMode: false, calendarMode: false, customMode: true};
        expect(buildAutomationSettings({controlModes: modes, settings, deviceCustomConfirmed: true}).locationEnabled).toBe(true);
        expect(buildAutomationSettings({controlModes: modes, settings}).locationEnabled).toBe(false);
    });
});

describe('device confirmation marker', () => {
    beforeEach(() => AsyncStorage.clear());

    test('is per user and only set explicitly', async () => {
        expect(await readDeviceCustomConfirmed(3)).toBe(false);
        await markDeviceCustomConfirmed(3);
        expect(await readDeviceCustomConfirmed(3)).toBe(true);
        expect(await readDeviceCustomConfirmed(2)).toBe(false);
        expect(await AsyncStorage.getItem(customModeConfirmedKey(3))).toBe('1');
    });

    test('no user id: never marked, never read as confirmed', async () => {
        await markDeviceCustomConfirmed(0);
        expect(await readDeviceCustomConfirmed(0)).toBe(false);
        expect(await readDeviceCustomConfirmed(undefined)).toBe(false);
    });

    test('a storage failure reads as unconfirmed (legacy-safe)', async () => {
        // getItem is already a jest.fn in the AsyncStorage mock: reject once,
        // without spyOn/mockRestore (that would wipe its implementation).
        await markDeviceCustomConfirmed(3);
        AsyncStorage.getItem.mockRejectedValueOnce(new Error('io'));
        expect(await readDeviceCustomConfirmed(3)).toBe(false);
        expect(await readDeviceCustomConfirmed(3)).toBe(true);
    });
});

describe('confirmation is only trusted when the backend persisted it', () => {
    const ok = result => ({statusCode: 200, data: {status: '1', result}});
    const modes = {userId: 3, locationMode: false, calendarMode: true, customMode: true};

    test('only an explicit customModeConfirmed === true counts', () => {
        expect(isPersistedCustomConfirmation(ok({...modes, customModeConfirmed: true}))).toBe(true);
        // Deployed code, column not migrated yet: HTTP 200 without the field.
        expect(isPersistedCustomConfirmation(ok(modes))).toBe(false);
        expect(isPersistedCustomConfirmation(ok({...modes, customModeConfirmed: false}))).toBe(false);
        expect(isPersistedCustomConfirmation(ok({...modes, customModeConfirmed: null}))).toBe(false);
        expect(isPersistedCustomConfirmation(ok({...modes, customModeConfirmed: 1}))).toBe(false);
        expect(isPersistedCustomConfirmation(ok({...modes, customModeConfirmed: 'true'}))).toBe(false);
        expect(isPersistedCustomConfirmation({statusCode: 200, data: {status: '0', result: {customModeConfirmed: true}}})).toBe(false);
        expect(isPersistedCustomConfirmation({statusCode: 500})).toBe(false);
        expect(isPersistedCustomConfirmation(undefined)).toBe(false);
    });

    // Mirrors SettingScreen: mark the device only on a persisted confirmation,
    // then map the modes the way syncAutomationSettings does.
    const toggleCustom = async (response, userId = 3) => {
        if (isPersistedCustomConfirmation(response)) {
            await markDeviceCustomConfirmed(userId);
        }
        const deviceConfirmed = await readDeviceCustomConfirmed(userId);
        return zonesEnabledFor(response?.data?.result, deviceConfirmed);
    };

    beforeEach(() => AsyncStorage.clear());

    test('HTTP 200 without a persisted confirmation keeps the legacy-safe mapping', async () => {
        expect(await toggleCustom(ok(modes))).toBe(false); // Location OFF + Custom ON stays off
        expect(await readDeviceCustomConfirmed(3)).toBe(false);
    });

    test('a failed request never marks the device', async () => {
        expect(await toggleCustom({statusCode: 0, isNetworkError: true})).toBe(false);
        expect(await readDeviceCustomConfirmed(3)).toBe(false);
    });

    test('a persisted confirmation switches to independent Custom Mode', async () => {
        expect(await toggleCustom(ok({...modes, customModeConfirmed: true}))).toBe(true);
        expect(await readDeviceCustomConfirmed(3)).toBe(true);
    });

    test('server reporting unconfirmed is not overridden by an older device marker', async () => {
        await markDeviceCustomConfirmed(3);
        expect(await toggleCustom(ok({...modes, customModeConfirmed: false}))).toBe(false);
    });
});
