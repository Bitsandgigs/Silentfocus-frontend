import {Platform} from 'react-native';

// Lib
import {
    check,
    openSettings,
    PERMISSIONS,
    request,
    RESULTS,
} from 'react-native-permissions';
import notifee, {AuthorizationStatus} from '@notifee/react-native';

const checkLocationPermission = async () => {
    const permission =
        Platform.OS === 'ios'
            ? PERMISSIONS.IOS.LOCATION_WHEN_IN_USE
            : PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION;

    const result = await check(permission);

    if (result === RESULTS.GRANTED) {
        return true;
    } else {
        return false;
    }
};

const requestLocationPermission = async handleLocation => {
    if (Platform.OS === 'ios') {
        const status = await request(PERMISSIONS.IOS.LOCATION_WHEN_IN_USE);
        if (status === RESULTS.GRANTED) {
            handleLocation();
        } else {
            openSettings().catch(() => {});
        }
    } else if (Platform.OS === 'android') {
        const status = await request(PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION);
        if (status === RESULTS.GRANTED) {
            handleLocation();
        } else {
            openSettings().catch(() => {});
        }
        // const granted = await PermissionsAndroid.request(
        //     PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        // );
        // if (granted === PermissionsAndroid.RESULTS.GRANTED) {
        //     console.log('Location permission granted.');
        // } else {
        //     console.log('Location permission denied.');
        //     handleDeniedPermissionModal();
        // }
    }
};

const checkCalenderPermission = async () => {
    const permission =
        Platform.OS === 'ios'
            ? PERMISSIONS.IOS.CALENDARS
            : PERMISSIONS.ANDROID.READ_CALENDAR;

    const result = await check(permission);

    if (result === RESULTS.GRANTED) {
        return true;
    } else {
        return false;
    }
};

const requestCalenderPermission = async handleCalender => {
    if (Platform.OS === 'ios') {
        const result = await request(PERMISSIONS.IOS.CALENDARS);
        if (result === RESULTS.GRANTED) {
            handleCalender();
        } else {
            openSettings().catch(() => {});
        }
    } else if (Platform.OS === 'android') {
        const result = await request(PERMISSIONS.ANDROID.READ_CALENDAR);
        if (result === RESULTS.GRANTED) {
            handleCalender();
        } else {
            openSettings().catch(() => {});
        }
    }
};

const checkNotificationPermission = async () => {
    if (Platform.OS === 'ios') {
        const result = await notifee.getNotificationSettings();
        console.log('result Check =====', result);

        if (result.authorizationStatus === AuthorizationStatus.AUTHORIZED) {
            return true;
        } else {
            return false;
        }
    }
};

const requestNotificationPermission = async handleNotification => {
    if (Platform.OS === 'ios') {
        const result = await notifee.requestPermission();
        console.log('result ======', result);

        if (result.authorizationStatus === AuthorizationStatus.AUTHORIZED) {
            handleNotification();
        } else {
            openSettings().catch(() => {});
        }
    } else if (Platform.OS === 'android') {
        const result = await notifee.requestPermission();
        if (result.authorizationStatus === AuthorizationStatus.AUTHORIZED) {
            handleNotification();
        } else {
            openSettings().catch(() => {});
        }
    }
};

const checkCallLogPermission = async () => {
    if (Platform.OS === 'android') {
        const result = await check(PERMISSIONS.ANDROID.READ_CALL_LOG);
        return result === RESULTS.GRANTED;
    }
    return false; // iOS does not support this
};

const requestCallLogPermission = async handleCallLog => {
    if (Platform.OS === 'android') {
        const result = await request(PERMISSIONS.ANDROID.READ_CALL_LOG);
        if (result === RESULTS.GRANTED) {
            handleCallLog();
        } else {
            openSettings().catch(() => {});
        }
    }
};

const checkSMSPermission = async () => {
    if (Platform.OS === 'android') {
        const result = await check(PERMISSIONS.ANDROID.READ_SMS);
        return result === RESULTS.GRANTED;
    }
    return false; // iOS does not support this
};

const requestSMSPermission = async handleSMS => {
    if (Platform.OS === 'android') {
        const result = await request(PERMISSIONS.ANDROID.READ_SMS);
        if (result === RESULTS.GRANTED) {
            handleSMS();
        } else {
            openSettings().catch(() => {});
        }
    }
};

const Permissions = {
    checkLocationPermission,
    requestLocationPermission,
    checkCalenderPermission,
    requestCalenderPermission,
    checkNotificationPermission,
    requestNotificationPermission,
    checkCallLogPermission,
    requestCallLogPermission,
    checkSMSPermission,
    requestSMSPermission,
};

export default Permissions;
