// Final API integration pass (2026-10-01): app-config bootstrap, auth
// session parsing (incl. social login), secure password-reset token, account
// deletion, schedule name/timezone, stale-401 handling, Auto Reply save/pull
// race and the debug server-write gate. All I/O goes through fake transports.

import AsyncStorage from '@react-native-async-storage/async-storage';

import EndPoints from '../src/utils/api/endpoints';
import {
    APP_CONFIG_CACHE_KEY,
    DEFAULT_APP_CONFIG,
    getAppConfig,
    loadAppConfig,
    normalizeAppConfig,
    resetAppConfigForTests,
} from '../src/utils/appConfig';
import {
    parseAuthResponse,
    startSession,
    wasSentWithCurrentToken,
} from '../src/utils/session';
import {deleteAccount} from '../src/utils/account';
import {
    buildSchedulePayload,
    normalizeScheduleRow,
    toEngineSchedules,
} from '../src/utils/scheduleRules';
import {serverWritesAllowed} from '../src/utils/serverSync';
import Constants from '../src/utils/theme/constants';

const ok = result => ({statusCode: 200, data: {status: '1', message: 'Success', result}});

// Exact body of the live GET https://silent.rpaywin.com/app-config (2026-10-01).
const LIVE_APP_CONFIG = {
    app_name: 'Silent Focus',
    otp_expiry_minutes: 10,
    otp_resend_cooldown_seconds: 30,
    calendar_sync_mode: 'mobile_driven_google_calendar',
    settings: {
        default_geofence_radius_m: 250,
        nearby_location_radius_km: 20,
        max_registered_geofences: 50,
        location_refresh_distance_km: 10,
        default_auto_response_cooldown_minutes: 30,
        android_minimum_version: 12,
        session_summary_enabled: true,
    },
};

beforeEach(async () => {
    await AsyncStorage.clear();
    Constants.commonConstant.appToken = '';
    Constants.commonConstant.appUserId = 0;
});

describe('endpoints', () => {
    test('routes are relative to the API root: no /api prefix, no leading slash', () => {
        Object.entries(EndPoints).forEach(([name, path]) => {
            expect([name, path.startsWith('/')]).toEqual([name, false]);
            expect([name, path.startsWith('api/')]).toEqual([name, false]);
        });
        expect(EndPoints.appConfig).toBe('app-config');
        expect(EndPoints.deleteAccount).toBe('account');
        expect(EndPoints.resetPassword).toBe('reset-password');
        expect(EndPoints.resetNewPassword).toBe('create-new-password');
        expect(EndPoints.offlineSync).toBe('sync');
    });
});

describe('app-config', () => {
    afterEach(resetAppConfigForTests);

    test('live payload maps to typed config', () => {
        expect(normalizeAppConfig(LIVE_APP_CONFIG)).toEqual({
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
            googleMapsApiKey: '',
        });
    });

    test('admin Maps key: only a real Google key is used', () => {
        const key = 'AIza' + 'a'.repeat(35);
        const withKey = v => normalizeAppConfig({settings: {google_maps_api_key: v}}).googleMapsApiKey;
        expect(withKey(` ${key} `)).toBe(key);
        ['YOUR_API_KEY', '', null, 42, 'AIzaShort'].forEach(v => expect(withKey(v)).toBe(''));
    });

    test('malformed or out-of-range values fall back to safe defaults', () => {
        [null, undefined, 'x', [], 42].forEach(bad => expect(normalizeAppConfig(bad)).toEqual({...DEFAULT_APP_CONFIG}));
        const cfg = normalizeAppConfig({
            otp_resend_cooldown_seconds: -5,
            otp_expiry_minutes: '15',
            settings: {max_registered_geofences: 5000, session_summary_enabled: 'nope', default_geofence_radius_m: 'abc'},
        });
        expect(cfg.otpResendCooldownSeconds).toBe(30);
        expect(cfg.otpExpiryMinutes).toBe(15); // numeric strings accepted
        expect(cfg.maxRegisteredGeofences).toBe(50);
        expect(cfg.sessionSummaryEnabled).toBe(true);
        expect(cfg.defaultGeofenceRadiusM).toBe(250);
        // The backend once returned settings as [] (empty PHP array).
        expect(normalizeAppConfig({settings: []}).defaultGeofenceRadiusM).toBe(250);
    });

    test('success is applied and cached; offline start uses the cache', async () => {
        const live = jest.fn(() => Promise.resolve(ok({...LIVE_APP_CONFIG, otp_resend_cooldown_seconds: 45})));
        await loadAppConfig({transport: live});
        expect(live).toHaveBeenCalledWith('get', null, 'app-config', {}, false, false);
        expect(getAppConfig().otpResendCooldownSeconds).toBe(45);
        expect(JSON.parse(await AsyncStorage.getItem(APP_CONFIG_CACHE_KEY)).otp_resend_cooldown_seconds).toBe(45);

        resetAppConfigForTests();
        const offline = jest.fn(() => Promise.resolve({statusCode: 0, data: null, isNetworkError: true, isOffline: true}));
        await loadAppConfig({transport: offline});
        expect(getAppConfig().otpResendCooldownSeconds).toBe(45);
    });

    test('failures never throw and never replace good values', async () => {
        const cases = [
            () => Promise.reject(new Error('timeout')),
            () => Promise.resolve({statusCode: 500, data: {status: '0', message: 'Server Error'}}),
            () => Promise.resolve({statusCode: 401, data: {status: '0', message: 'Unauthenticated.'}}),
            () => Promise.resolve({statusCode: 200, data: '<html>'}),
            () => Promise.resolve({statusCode: 200, data: {status: '1', result: null}}),
        ];
        for (const transport of cases) {
            await expect(loadAppConfig({transport})).resolves.toEqual({...DEFAULT_APP_CONFIG});
        }
        expect(await AsyncStorage.getItem(APP_CONFIG_CACHE_KEY)).toBeNull();
    });

    test('corrupt cache is ignored', async () => {
        await AsyncStorage.setItem(APP_CONFIG_CACHE_KEY, '{not json');
        await loadAppConfig({transport: () => Promise.reject(new Error('offline'))});
        expect(getAppConfig()).toEqual({...DEFAULT_APP_CONFIG});
    });
});

describe('auth session', () => {
    const authResult = extra => ({
        status: '1',
        message: 'Login successful',
        result: {user_id: 57, username: 'tester', email: 't@example.com', phone_number: null, token: '9|abc', token_type: 'Bearer', ...extra},
    });

    test('login / signup OTP / social login responses carry the session in result', () => {
        expect(parseAuthResponse(authResult({provider: 'google', provider_id: '123'}))).toEqual({
            token: '9|abc',
            user: {user_id: 57, username: 'tester', email: 't@example.com', phone_number: ''},
        });
    });

    test('responses without a usable session are rejected (no empty-token sign-in)', () => {
        // The old social-login parser read these root-level fields.
        expect(parseAuthResponse({id: 57, name: 'x', token: 'abc'})).toBeNull();
        expect(parseAuthResponse({status: '0', message: 'Invalid credentials.', result: null})).toBeNull();
        expect(parseAuthResponse(authResult({token: ''}))).toBeNull();
        expect(parseAuthResponse(authResult({user_id: 0}))).toBeNull();
        expect(parseAuthResponse(undefined)).toBeNull();
    });

    test('startSession persists token+user before they are used', async () => {
        await startSession(parseAuthResponse(authResult()));
        expect(JSON.parse(await AsyncStorage.getItem('userToken'))).toBe('9|abc');
        expect(JSON.parse(await AsyncStorage.getItem('userData')).user_id).toBe(57);
        expect(Constants.commonConstant.appToken).toBe('9|abc');
        expect(Constants.commonConstant.appUserId).toBe(57);
    });

    test('a late 401 for a replaced token, or a request without a token, does not end the current session', () => {
        Constants.commonConstant.appToken = 'new';
        expect(wasSentWithCurrentToken({Authorization: 'Bearer new'})).toBe(true);
        expect(wasSentWithCurrentToken({Authorization: 'Bearer old'})).toBe(false);
        expect(wasSentWithCurrentToken({})).toBe(false);
        expect(wasSentWithCurrentToken(undefined)).toBe(false);
        Constants.commonConstant.appToken = '';
        expect(wasSentWithCurrentToken({Authorization: 'Bearer old'})).toBe(false);
    });
});

describe('account deletion', () => {
    beforeEach(() => {
        Constants.commonConstant.appToken = 'tok';
    });

    test('DELETE /account, then local data cleared and signed out', async () => {
        await AsyncStorage.setItem('sf.sync.installId', 'inst');
        const transport = jest.fn(() => Promise.resolve(ok({deleted_user_id: 57})));
        const clear = jest.fn(() => Promise.resolve());
        expect((await deleteAccount({transport, clear})).ok).toBe(true);
        expect(transport).toHaveBeenCalledWith('delete', null, 'account', {}, false, false);
        expect(clear).toHaveBeenCalledTimes(1);
        expect(await AsyncStorage.getItem('sf.sync.installId')).toBeNull();
    });

    test.each([
        ['offline', {statusCode: 0, data: null, isNetworkError: true, isOffline: true}],
        ['server error', {statusCode: 500, data: {status: '0', message: 'Something went wrong. Please try again.'}}],
        ['not found', {statusCode: 404, data: {status: '0', message: 'User not found.'}}],
    ])('%s: nothing is cleared locally', async (_, res) => {
        await AsyncStorage.setItem('sf.sync.installId', 'inst');
        const clear = jest.fn();
        const result = await deleteAccount({transport: () => Promise.resolve(res), clear});
        expect(result.ok).toBe(false);
        expect(result.response).toBe(res);
        expect(clear).not.toHaveBeenCalled();
        expect(await AsyncStorage.getItem('sf.sync.installId')).toBe('inst');
    });

    test('signed out: no request', async () => {
        Constants.commonConstant.appToken = '';
        const transport = jest.fn();
        expect((await deleteAccount({transport, clear: jest.fn()})).ok).toBe(false);
        expect(transport).not.toHaveBeenCalled();
    });

    test('logout keys cover user data; app-config cache and onboarding flag are device-level', () => {
        const {SESSION_STORAGE_KEYS} = require('../src/utils/session');
        expect(SESSION_STORAGE_KEYS).toEqual(
            expect.arrayContaining(['userToken', 'userData', 'sf.sync.state', 'sf.autoReply.pendingPush']),
        );
        expect(SESSION_STORAGE_KEYS).not.toContain(APP_CONFIG_CACHE_KEY);
        expect(SESSION_STORAGE_KEYS).not.toContain('showGetStarted');
    });
});

describe('schedules: name / timezone', () => {
    test('payload carries the device timezone; legacy time_zone is read back', () => {
        expect(buildSchedulePayload({userId: 57, fromTime: '22:00', toTime: '07:00', days: 'Friday', timezone: 'Asia/Kolkata'})).toEqual({
            userId: 57,
            from_time: '22:00',
            to_time: '07:00',
            days: 'Friday',
            timezone: 'Asia/Kolkata',
        });
        expect(buildSchedulePayload({userId: 57, fromTime: '22:00', toTime: '07:00', days: 'Friday', timezone: null})).not.toHaveProperty(
            'timezone',
        );
        expect(typeof buildSchedulePayload({fromTime: '1:00', toTime: '2:00', days: 'Monday'}).timezone).toBe('string');
    });

    test('list rows with name/timezone still produce the same engine rules (cross-midnight kept)', () => {
        const row = {
            schedule_id: 8,
            name: ' Night ',
            timezone: null,
            time_zone: 'Europe/London',
            from_time: '22:00:00',
            to_time: '07:00:00',
            selected_days: ['Friday', 'Saturday'],
            days: 'Friday,Saturday',
            isTimerEnabled: true,
            active: true,
            event_type: 'custom',
            calendar_event_id: null,
        };
        const n = normalizeScheduleRow(row, 0);
        expect(n.name).toBe('Night');
        expect(n.timezone).toBe('Europe/London');
        expect(toEngineSchedules([n])).toEqual([{id: '8', startMinute: 1320, endMinute: 420, days: [5, 6], enabled: true}]);
    });
});

describe('debug server-write gate', () => {
    test('release (no dev bundle, no debug APK) always writes; debug only for the named account', () => {
        expect(serverWritesAllowed({isDev: false, testAccountId: '', userId: 2})).toBe(true);
        expect(serverWritesAllowed({isDev: true, testAccountId: '', userId: 2})).toBe(false);
        expect(serverWritesAllowed({isDev: true, testAccountId: '57', userId: 2})).toBe(false);
        expect(serverWritesAllowed({isDev: true, testAccountId: '57', userId: 57})).toBe(true);
        expect(serverWritesAllowed({isDev: true, testAccountId: 'abc', userId: 'abc'})).toBe(false);
    });

    test('default gate under Jest (dev) is closed', () => {
        Constants.commonConstant.appUserId = 2;
        expect(serverWritesAllowed()).toBe(false);
    });
});

describe('auto reply: save during a pull', () => {
    let RN;
    afterEach(() => {
        delete RN.NativeModules.SilentFocus;
    });

    test('a save made while the server was being read is not overwritten, and is pushed', async () => {
        jest.resetModules();
        const AS = require('@react-native-async-storage/async-storage');
        await (AS.default || AS).clear();
        RN = require('react-native');
        RN.Platform.OS = 'android';
        let local = {enabled: true, defaultTemplate: "I'm currently unavailable and will get back to you soon.", zoneTemplates: {}};
        const native = {
            getCommsState: jest.fn(() => Promise.resolve({autoReply: local})),
            setAutoReplySettings: jest.fn(s => {
                local = {...local, ...s};
                return Promise.resolve({autoReply: local});
            }),
        };
        RN.NativeModules.SilentFocus = native;
        require('../src/utils/theme').Constants.commonConstant.appToken = 'tok';
        const {syncAutoReply, pushAutoReply} = require('../src/utils/autoResponseSync');

        let releaseTemplates;
        const writes = [];
        const transport = jest.fn((method, body, url) => {
            if (method !== 'get') {writes.push([method, url, body]);}
            if (method === 'get' && url === 'settings') {return Promise.resolve(ok({auto_response_enabled: 1}));}
            if (method === 'get' && url === 'auto-response-templates') {
                const page = ok({data: [{id: 4, name: 'Default reply', message: 'Server text', is_default: 1}], current_page: 1, last_page: 1});
                // First read is held open until the user has saved.
                if (!releaseTemplates) {return new Promise(r => (releaseTemplates = () => r(page)));}
                return Promise.resolve(page);
            }
            return Promise.resolve(ok({}));
        });
        const fetchZones = () => Promise.resolve([]);

        const pull = syncAutoReply({transport, fetchZones, writesEnabled: true});
        await new Promise(r => setImmediate(r));
        // User saves while the pull is waiting on the server.
        local = {...local, defaultTemplate: 'At the gym'};
        const push = pushAutoReply({transport, fetchZones, writesEnabled: true});
        releaseTemplates();
        expect(await pull).toBeNull();
        expect(await push).toBe(true);
        expect(local.defaultTemplate).toBe('At the gym');
        expect(writes).toContainEqual(['put', 'auto-response-templates/4', {message: 'At the gym'}]);
    });
});
