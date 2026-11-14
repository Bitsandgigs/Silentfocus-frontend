// iOS location / calendar permission flow (react-native-permissions IOS.* handlers).
// On iOS "Always" is reported as BLOCKED while only "While Using" is granted, but the
// system still offers the one-time upgrade - so we must ask before sending to Settings.

jest.mock('react-native-permissions', () => ({
    PERMISSIONS: {
        IOS: {LOCATION_WHEN_IN_USE: 'ios.when', LOCATION_ALWAYS: 'ios.always', CALENDARS: 'ios.cal'},
        ANDROID: {},
    },
    RESULTS: {GRANTED: 'granted', DENIED: 'denied', BLOCKED: 'blocked', UNAVAILABLE: 'unavailable'},
    check: jest.fn(),
    request: jest.fn(),
    openSettings: jest.fn(() => Promise.resolve()),
}));

import {Alert, Platform} from 'react-native';
import {check, request, openSettings} from 'react-native-permissions';
import {
    getCalendarPermission,
    getLocationPermissionState,
    requestBackgroundLocation,
    requestCalendarPermission,
    requestForegroundLocation,
} from '../src/utils/locationPermissions';

const setStatuses = map => check.mockImplementation(async p => map[p] ?? 'denied');

beforeEach(() => {
    expect(Platform.OS).toBe('ios'); // jest-react-native default
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

test('iOS location state reads While Using + Always', async () => {
    setStatuses({'ios.when': 'granted', 'ios.always': 'blocked'});
    const s = await getLocationPermissionState();
    expect(s.foreground).toBe('granted');
    expect(s.background).toBe('blocked');
    expect(s.automationReady).toBe(false);
    setStatuses({'ios.when': 'granted', 'ios.always': 'granted'});
    expect((await getLocationPermissionState()).automationReady).toBe(true);
});

test('foreground request uses the iOS While Using permission', async () => {
    setStatuses({'ios.when': 'denied'});
    request.mockImplementation(async () => {
        setStatuses({'ios.when': 'granted'});
        return 'granted';
    });
    const s = await requestForegroundLocation();
    expect(request).toHaveBeenCalledWith('ios.when');
    expect(s.foreground).toBe('granted');
});

test('background request asks for Always first (iOS "blocked" is not final) and does not open Settings when granted', async () => {
    setStatuses({'ios.when': 'granted', 'ios.always': 'blocked'});
    Alert.alert.mockImplementationOnce((t, m, buttons) => buttons.find(b => b.text === 'Continue').onPress());
    request.mockImplementation(async () => {
        setStatuses({'ios.when': 'granted', 'ios.always': 'granted'});
        return 'granted';
    });
    const s = await requestBackgroundLocation();
    expect(request).toHaveBeenCalledWith('ios.always');
    expect(openSettings).not.toHaveBeenCalled();
    expect(s.automationReady).toBe(true);
});

test('if Always is still not granted afterwards the user is pointed to Settings', async () => {
    setStatuses({'ios.when': 'granted', 'ios.always': 'blocked'});
    Alert.alert.mockImplementationOnce((t, m, buttons) => buttons.find(b => b.text === 'Continue').onPress());
    request.mockResolvedValue('blocked');
    await requestBackgroundLocation();
    const [title] = Alert.alert.mock.calls[1];
    expect(title).toBe('Permission needed');
});

test('calendar permission uses the iOS CALENDARS handler', async () => {
    setStatuses({'ios.cal': 'denied'});
    expect(await getCalendarPermission()).toBe('denied');
    request.mockImplementation(async () => {
        setStatuses({'ios.cal': 'granted'});
        return 'granted';
    });
    expect(await requestCalendarPermission()).toBe('granted');
    expect(request).toHaveBeenCalledWith('ios.cal');
});
