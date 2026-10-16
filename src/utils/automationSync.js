// Feeds backend-owned automation inputs (Silent Zones, automation settings)
// into the native engine. The engine keeps its last copy, so a failed
// request here never stops automation: it just isn't refreshed.
// Calendar events never pass through JS; the engine reads the device
// calendar itself.

import AsyncStorage from '@react-native-async-storage/async-storage';

import APICall from './api/api';
import EndPoints from './api/endpoints';
import {
    extractPagination,
    normalizeSilentZones,
    toBooleanFlag,
} from './api/normalizers';
import {
    pushAutomationSettings,
    pushZonesToEngine,
    syncDeviceCalendar,
} from './silentFocusEngine';
import {CALENDAR_SYNC_KEY} from './session';
import {syncActivityAndSessions} from './serverSync';
import {syncAutoReply} from './autoResponseSync';
import Constants from './theme/constants';

const MAX_ZONE_PAGES = 20;

const clampMinutes = value => {
    const n = Number(value);
    return Number.isFinite(n) ? Math.min(240, Math.max(0, Math.round(n))) : 0;
};

// Pure: backend settings + Control Center modes + the local "calendar
// connected" flag -> engine settings. Calendar automation needs all of:
// Calendar Mode on, a calendar connected in Profile (and, natively, the
// READ_CALENDAR permission).
/**
 * Whether the user's own Silent Zones automate. They belong to Custom Mode;
 * Location Mode is reserved for public places (not implemented).
 *  - Confirmed account (new account, or Custom toggled in this app version):
 *    Custom Mode alone.
 *  - Unconfirmed account: the pre-split behaviour narrowed to Location AND
 *    Custom, so zones never start silencing where they didn't before.
 *  - No customMode from the backend: Location Mode, as before.
 * `customModeConfirmed` from the server wins; the device marker is only used
 * when the server doesn't report it (backend not yet updated).
 */
export const zonesEnabledFor = (controlModes, deviceConfirmed = false) => {
    const location = toBooleanFlag(controlModes?.locationMode);
    const rawCustom = controlModes?.customMode;
    if (rawCustom === undefined || rawCustom === null) {
        return location;
    }
    const custom = toBooleanFlag(rawCustom);
    const serverConfirmed = controlModes?.customModeConfirmed;
    const confirmed =
        serverConfirmed === undefined || serverConfirmed === null
            ? deviceConfirmed === true
            : toBooleanFlag(serverConfirmed);
    return confirmed ? custom : location && custom;
};

/**
 * #4: texts for the Control Center mode cards, derived from the same rule as
 * zonesEnabledFor (never a different one). Location Mode = public places
 * (libraries / places of worship, see PublicPlaces.kt); Custom = the user's
 * own Silent Zones.
 * Accounts that never confirmed Custom on this app version keep the old
 * rule (Location AND Custom) - explained, never changed silently.
 * Resolves {zonesActive, legacyRule, locationText, customText, customStatus}.
 */
export const describeControlModes = ({locationMode, customMode, customModeConfirmed}, deviceConfirmed = false) => {
    const modes = {locationMode, customMode, customModeConfirmed};
    const zonesActive = zonesEnabledFor(modes, deviceConfirmed);
    const hasCustom = customMode !== undefined && customMode !== null;
    const confirmed =
        customModeConfirmed === undefined || customModeConfirmed === null
            ? deviceConfirmed === true
            : toBooleanFlag(customModeConfirmed);
    const legacyRule = !hasCustom || !confirmed;
    const custom = toBooleanFlag(customMode);
    const location = toBooleanFlag(locationMode);
    let customStatus;
    if (zonesActive) {
        customStatus = 'Your Silent Zones are on.';
    } else if (custom && legacyRule && !location) {
        customStatus = 'Your Silent Zones are paused: on this account they also need Location Mode on.';
    } else {
        customStatus = 'Turn on to silence your phone at your Silent Zones.';
    }
    return {
        zonesActive,
        legacyRule,
        locationText:
            'Silences your phone when you stay a few minutes at a library or place of worship.' +
            (legacyRule ? ' On this account it also has to be on for your own Silent Zones.' : ''),
        customText: 'Silences your phone at places you add yourself, such as your office or home.',
        customStatus,
    };
};

export const buildAutomationSettings = ({
    controlModes,
    settings,
    calendarConnected,
    deviceCustomConfirmed = false,
}) => ({
    // Native name kept for stored settings; it gates the user's Silent Zones.
    locationEnabled: zonesEnabledFor(controlModes, deviceCustomConfirmed),
    // Location Mode: silence at libraries and places of worship nearby.
    publicPlacesEnabled: toBooleanFlag(controlModes?.locationMode),
    calendarEnabled:
        toBooleanFlag(controlModes?.calendarMode) && calendarConnected === true,
    calendarBeforeMinutes: clampMinutes(settings?.meeting_start_before_minutes),
    calendarAfterMinutes: clampMinutes(settings?.meeting_end_after_minutes),
    ignoreAllDayEvents:
        settings?.ignore_all_day_events === undefined ||
        settings?.ignore_all_day_events === null
            ? true
            : toBooleanFlag(settings.ignore_all_day_events),
});

// All pages of the user's zones. {ok: false} on any failure, so callers
// never replace the engine's copy with a partial list.
export const fetchAllSilentZones = async () => {
    let zones = [];
    for (let page = 1; page <= MAX_ZONE_PAGES; page++) {
        const response = await APICall(
            'get',
            {per_page: 25, page},
            EndPoints.getSilentZones,
        );
        if (response?.statusCode !== Constants.apiStatusCode.success) {
            return {ok: false, zones: [], response};
        }
        const data = response?.data;
        if (data?.status !== '1') {
            // status '0': the user has no zones.
            return {ok: true, zones};
        }
        zones = zones.concat(normalizeSilentZones(data?.result));
        if (!extractPagination(data?.result)?.hasMore) {
            break;
        }
    }
    return {ok: true, zones};
};

export const syncZonesToEngine = async zones => {
    if (zones) {
        return pushZonesToEngine(zones);
    }
    const result = await fetchAllSilentZones();
    return result.ok ? pushZonesToEngine(result.zones) : null;
};

export const readCalendarConnected = async () => {
    try {
        return JSON.parse(await AsyncStorage.getItem(CALENDAR_SYNC_KEY)) === true;
    } catch (e) {
        return false;
    }
};

// Device copy of the Custom Mode confirmation, per user. Set only after the
// server confirmed it persisted an explicit Custom toggle from this app.
export const customModeConfirmedKey = userId => `sf.customModeConfirmed.${userId}`;

export const readDeviceCustomConfirmed = async userId => {
    if (!userId) {
        return false;
    }
    try {
        return (await AsyncStorage.getItem(customModeConfirmedKey(userId))) === '1';
    } catch (e) {
        return false;
    }
};

/**
 * True only when the backend reports the confirmation as stored. HTTP 200 or
 * status '1' alone isn't enough: a backend without the column (or one that
 * didn't persist it) omits the field, and must not switch the account.
 */
export const isPersistedCustomConfirmation = response =>
    response?.data?.status === '1' && response?.data?.result?.customModeConfirmed === true;

export const markDeviceCustomConfirmed = userId =>
    userId ? AsyncStorage.setItem(customModeConfirmedKey(userId), '1').catch(() => {}) : Promise.resolve();

export const syncAutomationSettings = async () => {
    const userId = Constants.commonConstant.appUserId;
    const [settingsRes, modesRes, calendarConnected, deviceCustomConfirmed] = await Promise.all([
        APICall('get', null, EndPoints.getSettings),
        APICall(
            'get',
            {userId: userId || ''},
            EndPoints.getControlModes,
        ),
        readCalendarConnected(),
        readDeviceCustomConfirmed(userId),
    ]);
    const ok = res =>
        res?.statusCode === Constants.apiStatusCode.success &&
        res?.data?.status === '1';
    if (!ok(settingsRes) || !ok(modesRes)) {
        return null; // keep what the engine already has
    }
    return pushAutomationSettings(
        buildAutomationSettings({
            controlModes: modesRes.data.result,
            settings: settingsRes.data.result,
            calendarConnected,
            deviceCustomConfirmed,
        }),
    );
};

// Settings first (they gate zones/calendar), then zones, then a calendar
// re-read. Each step is independent; a failure only skips that step.
/** Zones for the Auto Reply sync (throws when they can't be read). */
export const fetchZonesForSync = async () => {
    const result = await fetchAllSilentZones();
    if (!result.ok) throw new Error('zones');
    return result.zones;
};

// Background mirror to the backend (activity, sessions, auto reply). Never
// awaited by screens and never blocks automation; failures stay queued.
export const syncServerMirrors = () => {
    syncActivityAndSessions().catch(() => null);
    syncAutoReply({fetchZones: fetchZonesForSync}).catch(() => null);
};

export const syncAllAutomationSources = async () => {
    await syncAutomationSettings().catch(() => null);
    await syncZonesToEngine().catch(() => null);
    syncServerMirrors();
    return syncDeviceCalendar().catch(() => null);
};
