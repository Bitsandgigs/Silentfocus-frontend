/* eslint-env jest */
// A confirmed HTTP 401 is a session EXPIRY, not a logout: silencing and rules
// stop, but the account's history, pending data and settings stay on the
// phone, owned by it. Stale / endpoint-only / unconfirmed 401s do nothing.

import NetInfo from '@react-native-community/netinfo';

const mockHandlers = {};
const mockTransport = jest.fn();
jest.mock('axios', () => {
    const instance = async config => {
        const cfg = mockHandlers.request({...config, headers: {...config.headers}});
        try {
            return await mockTransport(cfg);
        } catch (error) {
            if (!error.config) error.config = cfg;
            return mockHandlers.responseError(error);
        }
    };
    instance.interceptors = {
        request: {use: fn => (mockHandlers.request = fn)},
        response: {
            use: (ok, err) => {
                mockHandlers.responseOk = ok;
                mockHandlers.responseError = err;
            },
        },
    };
    return {__esModule: true, default: {create: () => instance}};
});

const RN = require('react-native');
RN.Platform.OS = 'android';
// Installed before the modules load (outbox.js reads it once); refreshed in place per test.
const native = {getState: () => Promise.resolve({})};
RN.NativeModules.SilentFocus = native;
const AsyncStorage = require('@react-native-async-storage/async-storage');
const Constants = require('../src/utils/theme/constants').default;
const Emitter = require('../src/utils/theme/emitter').default;
const session = require('../src/utils/session');
const APICall = require('../src/utils/api/api').default;
const {confirmSessionRejected, AUTH_PROBE_ENDPOINT} = require('../src/utils/api/api');

const httpError = (status, data) => Object.assign(new Error(`HTTP ${status}`), {response: {status, data}});
const unauth = () => httpError(401, {status: '0', message: 'Unauthenticated.'});
const flush = () => new Promise(r => setImmediate(r));

let logoutListener;
let subscription;

const signIn = async (token = 'tok-A', userId = 3) => {
    Constants.commonConstant.appToken = token;
    Constants.commonConstant.appUserId = userId;
    await AsyncStorage.multiSet([
        [Constants.asyncStorageKeys.userToken, JSON.stringify(token)],
        [Constants.asyncStorageKeys.userData, JSON.stringify({user_id: userId})],
        [session.CALENDAR_SYNC_KEY, 'true'],
        ['sf.sync.state', '{"sentEvents":{"x":true}}'],
        ['sf.autoReply.pendingPush', '{"p":1}'],
    ]);
};

beforeEach(async () => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(RN.Alert, 'alert').mockImplementation(() => {});
    NetInfo.fetch.mockResolvedValue({isConnected: true, isInternetReachable: true});
    for (const k of Object.keys(native)) delete native[k];
    Object.assign(native, {
        expireSession: jest.fn(() => Promise.resolve({})),
        preserveForLogout: jest.fn(() => Promise.resolve({saved: true, count: 1})),
        reset: jest.fn(() => Promise.resolve({})),
        resetKeepingHistory: jest.fn(() => Promise.resolve({})),
        dropOutbox: jest.fn(() => Promise.resolve(true)),
        claimHistory: jest.fn(() => Promise.resolve('KEPT')),
        getState: jest.fn(() => Promise.resolve({})),
    });
    await AsyncStorage.clear();
    session.resetAuthRejectionState();
    logoutListener = jest.fn();
    subscription = Emitter.addListener(Constants.eventListenerKeys.logoutListener, logoutListener);
});

afterEach(() => {
    subscription.remove();
    console.log.mockRestore?.();
    RN.Alert.alert.mockRestore?.();
});

const headersFor = token => ({Authorization: `Bearer ${token}`});
const stored = async key => AsyncStorage.getItem(key);

describe('confirmed 401 -> expiry (nothing of the account is deleted)', () => {
    test('native expiry instead of logout reset; credentials gone, history-owned prefs kept and tagged', async () => {
        await signIn();
        const res = await session.handleAuthRejected(headersFor('tok-A'), {confirm: async () => 'REJECTED'});
        expect(res).toBe('EXPIRED');
        expect(native.expireSession).toHaveBeenCalledWith(3);
        expect(native.reset).not.toHaveBeenCalled();
        expect(native.resetKeepingHistory).not.toHaveBeenCalled();
        // Pending data stays in the journal: no copy in the outbox (no duplicates).
        expect(native.preserveForLogout).not.toHaveBeenCalled();
        expect(await stored(Constants.asyncStorageKeys.userToken)).toBeNull();
        expect(await stored(Constants.asyncStorageKeys.userData)).toBeNull();
        expect(await stored('sf.sync.state')).not.toBeNull();
        expect(await stored(session.CALENDAR_SYNC_KEY)).toBe('true');
        // Unpushed auto-reply edits are not carried over (server copy wins next sign-in).
        expect(await stored('sf.autoReply.pendingPush')).toBeNull();
        expect(await stored(session.EXPIRED_OWNER_KEY)).toBe('3');
        expect(Constants.commonConstant.appToken).toBe('');
        expect(logoutListener).toHaveBeenCalledTimes(1);
        expect(RN.Alert.alert).toHaveBeenCalledWith('Silent Focus', session.SESSION_EXPIRED_MESSAGE);
    });

    test('native expiry runs before the credentials are removed (crash-safe order)', async () => {
        await signIn();
        let tokenAtNativeCall;
        native.expireSession.mockImplementation(async () => {
            tokenAtNativeCall = await stored(Constants.asyncStorageKeys.userToken);
            return {};
        });
        await session.handleAuthRejected(headersFor('tok-A'), {confirm: async () => 'REJECTED'});
        expect(tokenAtNativeCall).toBe(JSON.stringify('tok-A'));
    });

    test('older native code without expireSession: logout path (outbox first, history kept if that fails)', async () => {
        await signIn();
        delete native.expireSession;
        native.preserveForLogout.mockResolvedValue({saved: false, count: 0});
        await session.handleAuthRejected(headersFor('tok-A'), {confirm: async () => 'REJECTED'});
        expect(native.preserveForLogout).toHaveBeenCalledWith(3);
        expect(native.resetKeepingHistory).toHaveBeenCalled();
        expect(native.reset).not.toHaveBeenCalled();
    });

    test('a failing native expiry still signs out (rules can never outlive the session)', async () => {
        await signIn();
        native.expireSession.mockRejectedValue(new Error('boom'));
        expect(await session.handleAuthRejected(headersFor('tok-A'), {confirm: async () => 'REJECTED'})).toBe('EXPIRED');
        expect(await stored(Constants.asyncStorageKeys.userToken)).toBeNull();
    });
});

describe('401s that must NOT end the session', () => {
    test('stale: sent with a token that is no longer current', async () => {
        await signIn('tok-B');
        const confirm = jest.fn(async () => 'REJECTED');
        expect(await session.handleAuthRejected(headersFor('tok-A'), {confirm})).toBe('STALE');
        expect(confirm).not.toHaveBeenCalled();
        expect(native.expireSession).not.toHaveBeenCalled();
    });

    test('request without a token (e.g. wrong password at login)', async () => {
        await signIn();
        expect(await session.handleAuthRejected({}, {confirm: async () => 'REJECTED'})).toBe('STALE');
        expect(native.expireSession).not.toHaveBeenCalled();
    });

    test('endpoint-only: the confirmation shows the token still works; cached for a minute', async () => {
        await signIn();
        let t = 1000;
        const confirm = jest.fn(async () => 'VALID');
        expect(await session.handleAuthRejected(headersFor('tok-A'), {confirm, now: () => t})).toBe('ENDPOINT_ONLY');
        t += 30 * 1000;
        expect(await session.handleAuthRejected(headersFor('tok-A'), {confirm, now: () => t})).toBe('ENDPOINT_ONLY');
        expect(confirm).toHaveBeenCalledTimes(1);
        t += session.AUTH_VALID_CACHE_MS;
        await session.handleAuthRejected(headersFor('tok-A'), {confirm, now: () => t});
        expect(confirm).toHaveBeenCalledTimes(2);
        expect(native.expireSession).not.toHaveBeenCalled();
        expect(await stored(Constants.asyncStorageKeys.userToken)).not.toBeNull();
    });

    test('unconfirmed: network error / 5xx during the check decides nothing', async () => {
        await signIn();
        expect(await session.handleAuthRejected(headersFor('tok-A'), {confirm: async () => 'UNKNOWN'})).toBe('UNCONFIRMED');
        expect(await session.handleAuthRejected(headersFor('tok-A'), {confirm: async () => {
            throw new Error('x');
        }})).toBe('UNCONFIRMED');
        expect(native.expireSession).not.toHaveBeenCalled();
        expect(Constants.commonConstant.appToken).toBe('tok-A');
    });

    test('superseded while checking: a new sign-in during the check is left alone', async () => {
        await signIn('tok-A');
        const res = await session.handleAuthRejected(headersFor('tok-A'), {
            confirm: async () => {
                Constants.commonConstant.appToken = 'tok-B';
                return 'REJECTED';
            },
        });
        expect(res).toBe('STALE');
        expect(native.expireSession).not.toHaveBeenCalled();
    });
});

describe('concurrent failures', () => {
    test('many simultaneous 401s for one token -> one check, one expiry', async () => {
        await signIn();
        let release;
        const confirm = jest.fn(() => new Promise(r => (release = r)));
        const all = [1, 2, 3, 4].map(() => session.handleAuthRejected(headersFor('tok-A'), {confirm}));
        release('REJECTED');
        expect(await Promise.all(all)).toEqual(['EXPIRED', 'EXPIRED', 'EXPIRED', 'EXPIRED']);
        expect(confirm).toHaveBeenCalledTimes(1);
        expect(native.expireSession).toHaveBeenCalledTimes(1);
        expect(logoutListener).toHaveBeenCalledTimes(1);
    });
});

describe('sign-in after an expiry (strict ownership)', () => {
    const expireAs = async userId => {
        await signIn('tok-A', userId);
        await session.handleAuthRejected(headersFor('tok-A'), {confirm: async () => 'REJECTED'});
    };

    test('same account: kept prefs stay, tag cleared, native claim runs', async () => {
        await expireAs(3);
        await session.startSession({token: 'tok-C', user: {user_id: 3}});
        expect(native.claimHistory).toHaveBeenCalledWith(3);
        expect(await stored('sf.sync.state')).not.toBeNull();
        expect(await stored(session.CALENDAR_SYNC_KEY)).toBe('true');
        expect(await stored(session.EXPIRED_OWNER_KEY)).toBeNull();
    });

    test('another account: the previous account\'s kept prefs are removed first', async () => {
        await expireAs(3);
        native.claimHistory.mockResolvedValue('MOVED');
        await session.startSession({token: 'tok-D', user: {user_id: 7}});
        expect(native.claimHistory).toHaveBeenCalledWith(7);
        for (const k of session.EXPIRY_KEPT_KEYS) expect(await stored(k)).toBeNull();
        expect(await stored(session.EXPIRED_OWNER_KEY)).toBeNull();
    });

    test('blocked claim: nothing is entered and the kept data is not touched by JS', async () => {
        await expireAs(3);
        native.claimHistory.mockResolvedValue('BLOCKED');
        await expect(session.startSession({token: 'tok-D', user: {user_id: 7}})).rejects.toMatchObject({code: session.ACCOUNT_SWITCH_BLOCKED});
        expect(await stored('sf.sync.state')).not.toBeNull();
        expect(await stored(session.EXPIRED_OWNER_KEY)).toBe('3');
    });
});

describe('explicit logout and account deletion are unchanged', () => {
    test('logout: outbox first, full reset, every session key and the expiry tag removed', async () => {
        await signIn();
        await AsyncStorage.setItem(session.EXPIRED_OWNER_KEY, '3');
        await session.clearSession();
        expect(native.preserveForLogout).toHaveBeenCalledWith(3);
        expect(native.reset).toHaveBeenCalled();
        expect(native.expireSession).not.toHaveBeenCalled();
        for (const k of [...session.SESSION_STORAGE_KEYS, session.EXPIRED_OWNER_KEY]) expect(await stored(k)).toBeNull();
    });

    test('deleted: drops the outbox and resets', async () => {
        await signIn();
        await session.clearSession({mode: 'deleted'});
        expect(native.dropOutbox).toHaveBeenCalledWith(3);
        expect(native.reset).toHaveBeenCalled();
        expect(native.expireSession).not.toHaveBeenCalled();
    });
});

describe('API client wiring', () => {
    test('a 401 is confirmed with one read-only request carrying the same token, then expires', async () => {
        await signIn();
        mockTransport.mockRejectedValue(unauth());
        const res = await APICall('get', null, 'silent-zones');
        await flush();
        await flush();
        expect(res.isAuthError).toBe(true);
        const probe = mockTransport.mock.calls.map(c => c[0]).filter(c => c.sfAuthProbe);
        expect(probe).toHaveLength(1);
        expect(probe[0]).toMatchObject({method: 'get', url: AUTH_PROBE_ENDPOINT});
        expect(probe[0].headers.Authorization).toBe('Bearer tok-A');
        expect(native.expireSession).toHaveBeenCalledWith(3);
        // The probe's own 401 never starts another check.
        expect(mockTransport).toHaveBeenCalledTimes(2);
    });

    test('a 401 from one endpoint while the token still works -> signed in', async () => {
        await signIn();
        mockTransport.mockImplementation(async cfg => {
            if (cfg.sfAuthProbe) return {status: 200, data: {status: '1'}};
            throw unauth();
        });
        await APICall('get', null, 'some-endpoint');
        await flush();
        await flush();
        expect(native.expireSession).not.toHaveBeenCalled();
        expect(Constants.commonConstant.appToken).toBe('tok-A');
    });

    test('403 is an authorization failure, never a session end', async () => {
        await signIn();
        mockTransport.mockRejectedValue(httpError(403, {message: 'You cannot access another user.'}));
        await APICall('get', null, 'users/9');
        await flush();
        expect(mockTransport).toHaveBeenCalledTimes(1);
        expect(native.expireSession).not.toHaveBeenCalled();
    });

    test('confirmSessionRejected maps answers', async () => {
        mockTransport.mockResolvedValueOnce({status: 200, data: {}});
        expect(await confirmSessionRejected('t')).toBe('VALID');
        mockTransport.mockRejectedValueOnce(unauth());
        expect(await confirmSessionRejected('t')).toBe('REJECTED');
        mockTransport.mockRejectedValueOnce(httpError(500, {message: 'Server Error'}));
        expect(await confirmSessionRejected('t')).toBe('UNKNOWN');
        mockTransport.mockRejectedValueOnce(httpError(500, {detail: 'Unauthenticated.'}));
        expect(await confirmSessionRejected('t')).toBe('REJECTED');
        mockTransport.mockRejectedValueOnce(httpError(404, {}));
        expect(await confirmSessionRejected('t')).toBe('VALID');
        mockTransport.mockRejectedValueOnce(new Error('Network Error'));
        expect(await confirmSessionRejected('t')).toBe('UNKNOWN');
    });

    test('the token is never logged', async () => {
        await signIn('very-secret');
        mockTransport.mockRejectedValue(unauth());
        await APICall('get', null, 'silent-zones');
        await flush();
        expect(JSON.stringify(console.log.mock.calls)).not.toContain('very-secret');
    });
});
