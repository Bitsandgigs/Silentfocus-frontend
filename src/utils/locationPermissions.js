// Location + calendar permission flow for automation (Android).
//
// Foreground (precise) location and background location are asked for
// separately, background only after an in-app explanation (Google Play's
// "prominent disclosure"). Nothing here runs on app launch: every request
// starts from a user action, so the user isn't nagged.

import {Alert, Platform} from 'react-native';
import {
    check,
    openSettings,
    PERMISSIONS,
    request,
    RESULTS,
} from 'react-native-permissions';

const A = PERMISSIONS.ANDROID;
const I = PERMISSIONS.IOS;
const isIos = () => Platform.OS === 'ios';

// Pure: raw react-native-permissions results -> what automation can do.
export const summarizeLocation = ({fine, coarse, background}) => {
    const foreground =
        fine === RESULTS.GRANTED
            ? 'granted'
            : coarse === RESULTS.GRANTED
            ? 'approximate'
            : fine === RESULTS.BLOCKED
            ? 'blocked'
            : 'denied';
    const bg =
        background === RESULTS.GRANTED || background === RESULTS.UNAVAILABLE
            ? 'granted'
            : background === RESULTS.BLOCKED
            ? 'blocked'
            : 'denied';
    return {
        foreground,
        background: bg,
        // Geofencing needs precise location, and background access to work
        // while the app isn't open.
        automationReady: foreground === 'granted' && bg === 'granted',
        mapReady: foreground === 'granted' || foreground === 'approximate',
    };
};

export const getLocationPermissionState = async () => {
    if (isIos()) {
        // iOS: "While Using" + "Always" (Always can only be asked after While Using).
        const [whenInUse, always] = await Promise.all([
            check(I.LOCATION_WHEN_IN_USE),
            check(I.LOCATION_ALWAYS),
        ]);
        return summarizeLocation({fine: whenInUse, coarse: undefined, background: always});
    }
    if (Platform.OS !== 'android') {
        return summarizeLocation({});
    }
    const [fine, coarse, background] = await Promise.all([
        check(A.ACCESS_FINE_LOCATION),
        check(A.ACCESS_COARSE_LOCATION),
        check(A.ACCESS_BACKGROUND_LOCATION),
    ]);
    return summarizeLocation({fine, coarse, background});
};

const confirm = (title, message, okLabel) =>
    new Promise(resolve => {
        Alert.alert(
            title,
            message,
            [
                {text: 'Not now', style: 'cancel', onPress: () => resolve(false)},
                {text: okLabel, onPress: () => resolve(true)},
            ],
            {cancelable: true, onDismiss: () => resolve(false)},
        );
    });

const offerSettings = message =>
    Alert.alert('Permission needed', message, [
        {text: 'Cancel', style: 'cancel'},
        {text: 'Open Settings', onPress: () => openSettings().catch(() => {})},
    ]);

// Step 1: precise location while using the app (map, current location).
export const requestForegroundLocation = async () => {
    let state = await getLocationPermissionState();
    if (state.foreground === 'granted') {
        return state;
    }
    if (state.foreground === 'blocked') {
        offerSettings(
            'Location is turned off for Silent Focus. Allow it in Settings to use Silent Zones.',
        );
        return state;
    }
    await request(isIos() ? I.LOCATION_WHEN_IN_USE : A.ACCESS_FINE_LOCATION);
    state = await getLocationPermissionState();
    if (state.foreground === 'approximate') {
        Alert.alert(
            'Precise location needed',
            'Silent Zones need precise location to know when you arrive or leave. You can change "Use precise location" in Settings.',
        );
    }
    return state;
};

// Step 2: background location, only after explaining why.
export const BACKGROUND_DISCLOSURE =
    'Silent Focus uses your location in the background to silence your phone when you arrive at your Silent Zones, and to restore it when you leave - even when the app is closed. Your location is not shared or stored on our servers for this.';

export const requestBackgroundLocation = async () => {
    let state = await getLocationPermissionState();
    if (state.background === 'granted' || state.foreground !== 'granted') {
        return state;
    }
    const agreed = await confirm(
        'Allow location all the time?',
        isIos()
            ? `${BACKGROUND_DISCLOSURE}\n\nWhen asked, choose "Change to Always Allow".`
            : `${BACKGROUND_DISCLOSURE}\n\nOn the next screen choose "Allow all the time".`,
        'Continue',
    );
    if (!agreed) {
        return state;
    }
    // iOS reports "Always" as blocked while only "While Using" is granted, but the
    // system still offers the one-time "Change to Always Allow" upgrade: ask first and
    // only send the user to Settings if it is still not granted afterwards.
    if (state.background === 'blocked' && !isIos()) {
        openSettings().catch(() => {});
        return state;
    }
    await request(isIos() ? I.LOCATION_ALWAYS : A.ACCESS_BACKGROUND_LOCATION);
    state = await getLocationPermissionState();
    if (isIos() && state.background !== 'granted') {
        offerSettings(
            'To silence your phone at your Silent Zones when the app is closed, set Location to "Always" for Silent Focus in Settings.',
        );
    }
    return state;
};

// Full flow for turning on location automation.
export const ensureLocationAutomationPermissions = async () => {
    const fg = await requestForegroundLocation();
    if (fg.foreground !== 'granted') {
        return fg;
    }
    return requestBackgroundLocation();
};

export const getCalendarPermission = async () => {
    if (Platform.OS !== 'android' && !isIos()) {
        return 'denied';
    }
    const result = await check(isIos() ? I.CALENDARS : A.READ_CALENDAR);
    return result === RESULTS.GRANTED
        ? 'granted'
        : result === RESULTS.BLOCKED
        ? 'blocked'
        : 'denied';
};

export const requestCalendarPermission = async () => {
    const current = await getCalendarPermission();
    if (current === 'granted') {
        return current;
    }
    if (current === 'blocked') {
        offerSettings(
            'Calendar access is turned off for Silent Focus. Allow it in Settings to silence your phone during meetings.',
        );
        return current;
    }
    await request(isIos() ? I.CALENDARS : A.READ_CALENDAR);
    return getCalendarPermission();
};
