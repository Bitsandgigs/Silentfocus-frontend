// Permission / special-access status for the Settings hub. Pure row
// building (tested); the screen supplies the actions. Only access the app
// actually uses is listed. READ_CONTACTS / phone state / call screening
// appear when emergency or urgent-call features are in use or available.

import {NativeModules, Platform} from 'react-native';

const Native = Platform.OS === 'android' ? NativeModules.SilentFocus : null;

export const getPermissionHub = () =>
    Native?.getPermissionHub ? Native.getPermissionHub() : Promise.resolve(null);

export const openAppSettings = () => Native?.openAppSettings?.();
export const openLocationSettings = () => Native?.openLocationSettings?.();

/** #5: 'APP_DETAILS' | 'BATTERY_LIST' | 'UNAVAILABLE'. */
export const openBatterySettings = () =>
    Native?.openBatterySettings ? Native.openBatterySettings().catch(() => 'UNAVAILABLE') : Promise.resolve('UNAVAILABLE');

export const BATTERY_FALLBACK_MESSAGE = 'Open Settings > Apps > Silent Focus > Battery and choose Unrestricted.';

/** -> [{key, title, why, ok, required}] in display order. */
export const buildPermissionRows = hub => {
    if (!hub) return [];
    const rows = [
        {
            key: 'dnd',
            title: 'Do Not Disturb access',
            why: 'Lets Silent Focus silence and restore your phone.',
            ok: !!hub.dndAccess,
            required: true,
        },
        {
            key: 'exactAlarms',
            title: 'Alarms & reminders',
            why: 'Starts and ends schedules on the exact minute. Without it they can be a few minutes late.',
            ok: !!hub.exactAlarms,
            required: false,
        },
        {
            key: 'notificationAccess',
            title: 'Notification access',
            why: 'Shows messages that arrive while silent and sends auto replies. Message text is never stored.',
            ok: !!hub.notificationAccess,
            required: false,
        },
        {
            key: 'location',
            title: 'Precise location',
            why: 'Needed to set up Silent Zones and for Smart Location Learning.',
            ok: !!hub.fineLocation,
            required: false,
        },
        {
            key: 'backgroundLocation',
            title: 'Location all the time',
            why: 'Lets Silent Zones work while the app is closed.',
            ok: !!hub.backgroundLocation,
            required: false,
        },
        {
            key: 'locationServices',
            title: 'Device location',
            why: 'Silent Zones pause while device location is turned off.',
            ok: !!hub.locationServicesOn,
            required: false,
        },
        {
            key: 'calendar',
            title: 'Calendar',
            why: 'Silences your phone during calendar events. Event details stay on the phone.',
            ok: !!hub.calendar,
            required: false,
        },
    ];
    if (hub.callScreeningSupported) {
        rows.push({
            key: 'callScreening',
            title: 'Call screening',
            why: 'Recognises emergency contacts and urgent repeat callers. Calls are never blocked.',
            ok: !!hub.callScreening,
            required: false,
        });
    }
    if (hub.callFeaturesInUse) {
        rows.push(
            {
                key: 'contacts',
                title: 'Contacts',
                why: 'Android only shows calls from saved contacts to the call-screening app with this permission.',
                ok: !!hub.contacts,
                required: false,
            },
            {
                key: 'phoneState',
                title: 'Phone state',
                why: 'Brings silence back as soon as an allowed call stops ringing.',
                ok: !!hub.phoneState,
                required: false,
            },
        );
    }
    // #5 (optional guidance): battery limits can delay zone silencing. Only
    // when Silent Zones exist and the app isn't already unrestricted.
    if (hub.zonesInUse && hub.batteryUnrestricted === false) {
        rows.push({
            key: 'battery',
            title: 'Battery: Unrestricted (optional)',
            why:
                'Your phone may delay location alerts to save battery. Setting Silent Focus to Unrestricted can make zone silencing start sooner; it may use slightly more battery. On Samsung, also check that Silent Focus is not in Sleeping or Deep sleeping apps (Settings > Battery > Background usage limits).',
            ok: false,
            required: false,
            actionLabel: 'Open',
        });
    }
    return rows;
};
