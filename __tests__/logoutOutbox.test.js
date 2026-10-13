/* eslint-env jest */
// Logout keeps unsynced data in a per-account outbox; only the same account
// uploads it later, and entries go only after server read-back.

const MIN = 60 * 1000;
const serverTime = ms => new Date(ms).toISOString().slice(0, 19).replace('T', ' ');

let native;
let outboxes; // userId -> {events, sessions}
let RN;
let AsyncStorage;
let Constants;

const setup = async ({preserveSaved = true} = {}) => {
    jest.resetModules();
    RN = require('react-native');
    RN.Platform.OS = 'android';
    outboxes = {};
    native = {
        getRecentEvents: jest.fn(() => Promise.resolve([])),
        getSessionHistory: jest.fn(() => Promise.resolve({recordingSince: 1, sessions: []})),
        markAcknowledged: jest.fn(() => Promise.resolve(true)),
        getState: jest.fn(() => Promise.resolve({})), // makes the engine wrapper available
        reset: jest.fn(() => Promise.resolve({})),
        resetKeepingHistory: jest.fn(() => Promise.resolve({})),
        preserveForLogout: jest.fn(() => Promise.resolve({saved: preserveSaved, count: 2})),
        claimHistory: jest.fn(() => Promise.resolve('KEPT')),
        ensureSignedOut: jest.fn(() => Promise.resolve(false)),
        getOutbox: jest.fn(userId => Promise.resolve(outboxes[userId] || {events: [], sessions: []})),
        removeFromOutbox: jest.fn((userId, ids, ends) => {
            const box = outboxes[userId];
            if (box) {
                box.events = box.events.filter(e => !ids.includes(e.id));
                box.sessions = box.sessions.filter(x => !ends.some(a => a.start === x.start && a.end === x.end));
            }
            return Promise.resolve(true);
        }),
        dropOutbox: jest.fn(userId => {
            delete outboxes[userId];
            return Promise.resolve(true);
        }),
    };
    RN.NativeModules.SilentFocus = native;
    AsyncStorage = require('@react-native-async-storage/async-storage');
    await AsyncStorage.clear();
    Constants = require('../src/utils/theme').Constants;
    Constants.commonConstant.appToken = 'tok';
    Constants.commonConstant.appUserId = 3;
};

afterEach(() => {
    delete require('react-native').NativeModules.SilentFocus;
});

describe('clearSession (every logout path)', () => {
    test('saved to the outbox -> full reset, with the user captured before sign-out', async () => {
        await setup();
        await require('../src/utils/session').clearSession();
        expect(native.preserveForLogout).toHaveBeenCalledWith(3);
        expect(native.reset).toHaveBeenCalled();
        expect(native.resetKeepingHistory).not.toHaveBeenCalled();
        expect(Constants.commonConstant.appToken).toBe('');
    });

    test('forced 401 / failed outbox write -> history is kept, sign-out still completes', async () => {
        await setup({preserveSaved: false});
        await require('../src/utils/session').clearSession();
        expect(native.resetKeepingHistory).toHaveBeenCalled();
        expect(native.reset).not.toHaveBeenCalled();
        expect(Constants.commonConstant.appUserId).toBe(0);
    });

    test('native preserve throws -> treated as not saved (history kept)', async () => {
        await setup();
        native.preserveForLogout.mockRejectedValueOnce(new Error('io'));
        await require('../src/utils/session').clearSession();
        expect(native.resetKeepingHistory).toHaveBeenCalled();
        expect(native.reset).not.toHaveBeenCalled();
    });

    test('native code without the outbox (older build) -> history kept, never wiped', async () => {
        await setup();
        delete native.preserveForLogout;
        await require('../src/utils/session').clearSession();
        expect(native.resetKeepingHistory).toHaveBeenCalled();
        expect(native.reset).not.toHaveBeenCalled();
    });

    test('half-written session (no user id) -> native uses the recorded owner', async () => {
        await setup();
        Constants.commonConstant.appUserId = 0;
        await require('../src/utils/session').clearSession();
        expect(native.preserveForLogout).toHaveBeenCalledWith(0);
    });

    test('account deleted -> that account\'s outbox is dropped, nothing preserved', async () => {
        await setup();
        outboxes[3] = {events: [{id: 'x'}], sessions: []};
        outboxes[7] = {events: [{id: 'y'}], sessions: []};
        await require('../src/utils/session').clearSession({mode: 'deleted'});
        expect(native.dropOutbox).toHaveBeenCalledWith(3);
        expect(native.preserveForLogout).not.toHaveBeenCalled();
        expect(native.reset).toHaveBeenCalled();
        expect(outboxes[3]).toBeUndefined();
        expect(outboxes[7]).toBeDefined();
    });
});

describe('prepareUserLogout (Profile -> Logout)', () => {
    test('bounded: a hanging sync does not block saving the outbox', async () => {
        await setup();
        const hanging = jest.fn(() => new Promise(() => {}));
        const res = await require('../src/utils/serverSync').prepareUserLogout({transport: hanging, enabled: true, timeoutMs: 20});
        expect(res.ok).toBe(true);
        expect(native.preserveForLogout).toHaveBeenCalledWith(3);
    });

    test('outbox cannot be saved -> not ok (Profile stays signed in, no destructive option)', async () => {
        await setup({preserveSaved: false});
        const res = await require('../src/utils/serverSync').prepareUserLogout({transport: jest.fn(), enabled: false});
        expect(res.ok).toBe(false);
    });
});

describe('flushOutbox (same account, after sign-in)', () => {
    const T = Date.now();
    const msg = {id: `${T - 5 * MIN}-3-MESSAGE_RECEIVED`, type: 'MESSAGE_RECEIVED', app: 'Messages', at: T - 5 * MIN};
    const call = {id: `${T - 4 * MIN}-4-INCOMING_CALL`, type: 'INCOMING_CALL', caller: '***0199', at: T - 4 * MIN};
    const sess = {start: T - 10 * MIN, end: T - 2 * MIN, primarySource: 'MANUAL'};

    // Server that stores what it accepts; `reject` lists log types it drops (HTTP 200 anyway).
    const server = ({reject = [], failPost = false} = {}) => {
        const stored = {logs: [], sessions: []};
        const transport = jest.fn((m, b, url) => {
            if (m === 'post') {
                if (failPost) return Promise.resolve({statusCode: 0});
                b.logs.filter(l => !reject.includes(l.type)).forEach(l => stored.logs.push({client_event_id: l.client_event_id, type: l.type, timestamp: serverTime(Date.parse(l.timestamp))}));
                b.silent_sessions.forEach(x => stored.sessions.push({
                    notes: `client_event_id:${x.client_event_id}`,
                    started_at: serverTime(Date.parse(x.started_at)),
                    ended_at: serverTime(Date.parse(x.ended_at)),
                    status: 'ended',
                }));
                return Promise.resolve({statusCode: 200, data: {status: '1', result: {errors: []}}});
            }
            const data = url === 'logs' ? stored.logs : stored.sessions;
            return Promise.resolve({statusCode: 200, data: {status: '1', result: {current_page: 1, last_page: 1, data}}});
        });
        return {transport, stored};
    };

    const flush = async transport => {
        const sync = require('../src/utils/serverSync');
        const installId = await sync.getInstallId();
        return sync.flushOutbox({transport, installId});
    };

    test('uploads, reads back and removes everything verified', async () => {
        await setup();
        outboxes[3] = {events: [msg, call], sessions: [sess]};
        const {transport, stored} = server();
        const res = await flush(transport);
        expect(res).toMatchObject({uploaded: 3, verified: 3, left: 0});
        expect(stored.logs).toHaveLength(2);
        expect(outboxes[3]).toEqual({events: [], sessions: []});
    });

    test('partial acceptance: the rejected item stays (with backoff), the rest is removed', async () => {
        await setup();
        outboxes[3] = {events: [msg, call], sessions: [sess]};
        const {transport} = server({reject: ['incoming_call']});
        const res = await flush(transport);
        expect(res).toMatchObject({verified: 2, left: 1});
        expect(outboxes[3].events.map(e => e.id)).toEqual([call.id]);
        const state = JSON.parse(await AsyncStorage.getItem('sf.sync.state'));
        expect(Object.keys(state.backoff)).toHaveLength(1);
        // Backed off: an immediate retry doesn't resend it.
        transport.mockClear();
        await flush(transport);
        expect(transport.mock.calls.filter(c => c[0] === 'post')).toHaveLength(0);
        expect(outboxes[3].events).toHaveLength(1);
    });

    test('upload fails -> nothing removed', async () => {
        await setup();
        outboxes[3] = {events: [msg], sessions: [sess]};
        const res = await flush(server({failPost: true}).transport);
        expect(res).toEqual({failed: true});
        expect(outboxes[3].events).toHaveLength(1);
        expect(outboxes[3].sessions).toHaveLength(1);
    });

    test('cross-account isolation: another account\'s outbox is never read or uploaded', async () => {
        await setup();
        outboxes[7] = {events: [msg], sessions: [sess]};
        const {transport} = server();
        const res = await flush(transport);
        expect(native.getOutbox).toHaveBeenCalledWith(3);
        expect(native.getOutbox).not.toHaveBeenCalledWith(7);
        expect(transport).not.toHaveBeenCalled();
        expect(res).toMatchObject({uploaded: 0});
        expect(outboxes[7].events).toHaveLength(1);
    });

    test('signed out (no user) -> skipped', async () => {
        await setup();
        Constants.commonConstant.appUserId = 0;
        expect(await flush(jest.fn())).toEqual({skipped: true});
        expect(native.getOutbox).not.toHaveBeenCalled();
    });
});

describe('account switching (sign-in claims local history first)', () => {
    const {CLAIM_BLOCKED} = require('../src/utils/outbox');

    test('claim runs BEFORE the new session is saved', async () => {
        await setup();
        const order = [];
        native.claimHistory.mockImplementationOnce(() => {
            order.push('claim');
            return Promise.resolve('MOVED');
        });
        const setItem = jest.spyOn(AsyncStorage, 'multiSet');
        setItem.mockImplementationOnce(async () => order.push('save'));
        await require('../src/utils/session').startSession({token: 't7', user: {user_id: 7}});
        expect(order).toEqual(['claim', 'save']);
        expect(native.claimHistory).toHaveBeenCalledWith(7);
        setItem.mockRestore();
    });

    test('storage failure while moving the previous account\'s data -> sign-in refused, nothing saved or deleted', async () => {
        await setup();
        Constants.commonConstant.appUserId = 0;
        Constants.commonConstant.appToken = '';
        native.claimHistory.mockResolvedValueOnce(CLAIM_BLOCKED);
        const {startSession, ACCOUNT_SWITCH_BLOCKED} = require('../src/utils/session');
        await expect(startSession({token: 't7', user: {user_id: 7}})).rejects.toMatchObject({code: ACCOUNT_SWITCH_BLOCKED});
        expect(await AsyncStorage.getItem(Constants.asyncStorageKeys.userToken)).toBeNull();
        expect(Constants.commonConstant.appUserId).toBe(0);
        expect(Constants.commonConstant.appToken).toBe('');
        expect(native.reset).not.toHaveBeenCalled();
        expect(native.resetKeepingHistory).not.toHaveBeenCalled();
    });

    test('native error during the claim counts as blocked', async () => {
        await setup();
        native.claimHistory.mockRejectedValueOnce(new Error('io'));
        expect(await require('../src/utils/outbox').claimLocalHistory(7)).toBe(CLAIM_BLOCKED);
    });

    test('older native code without owners: sign-in proceeds as before', async () => {
        await setup();
        delete native.claimHistory;
        expect(await require('../src/utils/outbox').claimLocalHistory(7)).toBe('KEPT');
    });
});

describe('older native code (fail-safe)', () => {
    test('no resetKeepingHistory: falls back to the full reset so silencing never stays on', async () => {
        await setup({preserveSaved: false});
        delete native.resetKeepingHistory;
        await require('../src/utils/session').clearSession();
        expect(native.reset).toHaveBeenCalled();
    });
});

describe('signed-out start-up', () => {
    test('ensureSignedOut asks native to finish a cut-short sign-out', async () => {
        await setup();
        native.ensureSignedOut.mockResolvedValueOnce(true);
        expect(await require('../src/utils/outbox').ensureSignedOut()).toBe(true);
        expect(native.ensureSignedOut).toHaveBeenCalledTimes(1);
    });

    test('native error -> false (start-up continues)', async () => {
        await setup();
        native.ensureSignedOut.mockRejectedValueOnce(new Error('x'));
        expect(await require('../src/utils/outbox').ensureSignedOut()).toBe(false);
    });
});

describe('logout paths are distinct', () => {
    test('user logout and forced 401 preserve; deletion drops; none of them touch another account', async () => {
        await setup();
        outboxes[7] = {events: [{id: 'other'}], sessions: []};
        const {clearSession} = require('../src/utils/session');
        await clearSession();
        expect(native.preserveForLogout).toHaveBeenLastCalledWith(3);
        Constants.commonConstant.appUserId = 3;
        await clearSession({mode: 'deleted'});
        expect(native.dropOutbox).toHaveBeenCalledWith(3);
        expect(native.dropOutbox).not.toHaveBeenCalledWith(7);
        expect(outboxes[7].events).toHaveLength(1);
    });

    test('a 401 for a request sent with an old token does not sign the current user out', () => {
        const {wasSentWithCurrentToken, bearerFor} = require('../src/utils/session');
        const {Constants: C} = require('../src/utils/theme');
        C.commonConstant.appToken = 'new';
        expect(wasSentWithCurrentToken({Authorization: bearerFor('old')})).toBe(false);
        expect(wasSentWithCurrentToken({Authorization: bearerFor('new')})).toBe(true);
        expect(wasSentWithCurrentToken({})).toBe(false);
    });
});

describe('retry backoff', () => {
    const {withBackoff, inBackoff, backoffDelay, pendingUploads} = require('../src/utils/serverSync');
    const NOW = 1_000_000_000;

    test('15 min, doubling, capped at 24 h; cleared once accepted', () => {
        expect(backoffDelay(1)).toBe(15 * MIN);
        expect(backoffDelay(3)).toBe(60 * MIN);
        expect(backoffDelay(20)).toBe(24 * 60 * MIN);
        let s = withBackoff({}, {failedIds: ['a'], now: NOW});
        s = withBackoff(s, {failedIds: ['a'], now: NOW});
        expect(s.backoff.a).toEqual({n: 2, nextAt: NOW + 30 * MIN});
        expect(inBackoff(s, 'a', NOW + 29 * MIN)).toBe(true);
        expect(inBackoff(s, 'a', NOW + 31 * MIN)).toBe(false);
        expect(withBackoff(s, {okIds: ['a'], now: NOW}).backoff.a).toBeUndefined();
    });

    test('a backed-off item does not block new valid records', () => {
        const ID = 'i';
        const bad = {id: '1-1-INCOMING_CALL', type: 'INCOMING_CALL', at: NOW - MIN};
        const good = {id: '2-2-MESSAGE_RECEIVED', type: 'MESSAGE_RECEIVED', at: NOW};
        const state = withBackoff({}, {failedIds: [`sf:${ID}:e:${bad.id}`], now: NOW});
        const p = pendingUploads({installId: ID, events: [bad, good], sessions: [], state, now: NOW + MIN});
        expect(p.logs.map(l => l.client_event_id)).toEqual([`sf:${ID}:e:${good.id}`]);
    });
});

describe('backoff only for real rejections', () => {
    const T = Date.now();
    const msg = {id: `${T - MIN}-1-MESSAGE_RECEIVED`, type: 'MESSAGE_RECEIVED', app: 'Messages', at: T - MIN};

    const run = async transport => {
        const sync = require('../src/utils/serverSync');
        native.getRecentEvents.mockImplementation(() => Promise.resolve([{...msg}]));
        await sync.syncActivityAndSessions({transport, enabled: true});
        return JSON.parse((await AsyncStorage.getItem('sf.sync.state')) || '{}');
    };

    test('network error on upload -> no backoff (retried next sync)', async () => {
        await setup();
        const state = await run(jest.fn(() => Promise.resolve({statusCode: 0, isNetworkError: true})));
        expect(state.backoff || {}).toEqual({});
    });

    test('upload accepted but read-back fails (network) -> no backoff', async () => {
        await setup();
        const t = jest.fn(m => Promise.resolve(m === 'post' ? {statusCode: 200, data: {status: '1', result: {errors: []}}} : {statusCode: 0}));
        const state = await run(t);
        expect(state.backoff || {}).toEqual({});
    });

    test('upload accepted and read back without the row -> backoff', async () => {
        await setup();
        const empty = {statusCode: 200, data: {status: '1', result: {current_page: 1, last_page: 1, data: []}}};
        const t = jest.fn(m => Promise.resolve(m === 'post' ? {statusCode: 200, data: {status: '1', result: {errors: []}}} : empty));
        const state = await run(t);
        expect(Object.keys(state.backoff)).toHaveLength(1);
    });
});
