// Public app configuration from GET /app-config (no auth). Loaded in the
// background on start-up: the app never waits for it, and every value has a
// safe built-in default, so a missing/slow/malformed response changes
// nothing. The last good response is cached for offline starts.
//
// Only device-level, non-personal values live here, so the cache is kept
// across logout/account deletion.

import AsyncStorage from '@react-native-async-storage/async-storage';

import APICall from './api/api';
import EndPoints from './api/endpoints';
import Constants from './theme/constants';

export const APP_CONFIG_CACHE_KEY = 'sf.appConfig';

// Matches the live backend (2026-10-01).
export const DEFAULT_APP_CONFIG = Object.freeze({
    otpExpiryMinutes: 10,
    otpResendCooldownSeconds: 30,
    calendarSyncMode: 'mobile_driven_google_calendar',
    defaultGeofenceRadiusM: 250,
    nearbyLocationRadiusKm: 20,
    maxRegisteredGeofences: 50,
    locationRefreshDistanceKm: 10,
    defaultAutoResponseCooldownMinutes: 30,
    androidMinimumVersion: 12,
    sessionSummaryEnabled: true,
    // Places search key set by the admin (app_settings.google_maps_api_key);
    // empty -> the build-time key is used.
    googleMapsApiKey: '',
});

// Google API keys are "AIza" + 35 chars; anything else (empty, the
// "YOUR_API_KEY" placeholder) is ignored.
const mapsKeyOr = (value, fallback) => {
    const k = typeof value === 'string' ? value.trim() : '';
    return /^AIza[0-9A-Za-z_-]{35}$/.test(k) ? k : fallback;
};

// Integer within [min, max], else the fallback.
const intIn = (value, min, max, fallback) => {
    const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
    return typeof n === 'number' && Number.isInteger(n) && n >= min && n <= max ? n : fallback;
};

const boolOr = (value, fallback) => {
    if (typeof value === 'boolean') {return value;}
    if (value === 1 || value === '1' || value === 'true') {return true;}
    if (value === 0 || value === '0' || value === 'false') {return false;}
    return fallback;
};

/**
 * `result` of GET /app-config -> config. Pure (tested). Unknown, missing or
 * out-of-range values keep their default.
 */
export const normalizeAppConfig = result => {
    const d = DEFAULT_APP_CONFIG;
    if (!result || typeof result !== 'object' || Array.isArray(result)) {
        return {...d};
    }
    const s = result.settings && typeof result.settings === 'object' && !Array.isArray(result.settings) ? result.settings : {};
    return {
        otpExpiryMinutes: intIn(result.otp_expiry_minutes, 1, 60, d.otpExpiryMinutes),
        otpResendCooldownSeconds: intIn(result.otp_resend_cooldown_seconds, 0, 600, d.otpResendCooldownSeconds),
        calendarSyncMode:
            typeof result.calendar_sync_mode === 'string' && result.calendar_sync_mode ? result.calendar_sync_mode : d.calendarSyncMode,
        defaultGeofenceRadiusM: intIn(s.default_geofence_radius_m, 50, 5000, d.defaultGeofenceRadiusM),
        nearbyLocationRadiusKm: intIn(s.nearby_location_radius_km, 1, 500, d.nearbyLocationRadiusKm),
        maxRegisteredGeofences: intIn(s.max_registered_geofences, 1, 100, d.maxRegisteredGeofences),
        locationRefreshDistanceKm: intIn(s.location_refresh_distance_km, 1, 500, d.locationRefreshDistanceKm),
        defaultAutoResponseCooldownMinutes: intIn(
            s.default_auto_response_cooldown_minutes,
            0,
            1440,
            d.defaultAutoResponseCooldownMinutes,
        ),
        androidMinimumVersion: intIn(s.android_minimum_version, 1, 100, d.androidMinimumVersion),
        sessionSummaryEnabled: boolOr(s.session_summary_enabled, d.sessionSummaryEnabled),
        googleMapsApiKey: mapsKeyOr(s.google_maps_api_key, d.googleMapsApiKey),
    };
};

let current = {...DEFAULT_APP_CONFIG};

/** Current config (defaults until a cached or fresh copy is loaded). */
export const getAppConfig = () => current;

/** Tests only. */
export const resetAppConfigForTests = () => {
    current = {...DEFAULT_APP_CONFIG};
    inFlight = null;
};

let inFlight = null;

/**
 * Applies the cached copy, then refreshes from the server. Never throws and
 * never blocks: callers don't await it. Resolves the config in use.
 */
export const loadAppConfig = ({transport = APICall} = {}) => {
    if (inFlight) {return inFlight;}
    inFlight = (async () => {
        try {
            const cached = await AsyncStorage.getItem(APP_CONFIG_CACHE_KEY);
            if (cached) {current = normalizeAppConfig(JSON.parse(cached));}
        } catch (e) {
            // Corrupt/unreadable cache: keep defaults.
        }
        try {
            // keyboardOff=false: a background request must not close the
            // keyboard on whatever screen is showing.
            const r = await transport('get', null, EndPoints.appConfig, {}, false, false);
            const result = r?.data?.result;
            if (
                r?.statusCode === Constants.apiStatusCode.success &&
                r?.data?.status === '1' &&
                result &&
                typeof result === 'object' &&
                !Array.isArray(result)
            ) {
                current = normalizeAppConfig(result);
                await AsyncStorage.setItem(APP_CONFIG_CACHE_KEY, JSON.stringify(result)).catch(() => {});
            }
        } catch (e) {
            // Offline / timeout / malformed: cached or default values stay.
        }
        return current;
    })().finally(() => {
        inFlight = null;
    });
    return inFlight;
};
