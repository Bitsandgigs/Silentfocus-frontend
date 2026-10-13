/* eslint-env jest */
// #10/#11 test harness: synthetic journal rows ("synthetic": true) are shown by
// the real Activity code but never uploaded, verified, outboxed or flushed;
// real rows upload exactly as before.

const MIN = 60 * 1000;
const T = Date.now();
const RUN = '0a1b2c3d';

const real = [
    {id: `${T - 5 * MIN}-1-MESSAGE_RECEIVED`, type: 'MESSAGE_RECEIVED', app: 'Messages', at: T - 5 * MIN, appPackage: 'com.google.android.apps.messaging', notificationRef: 'r1'},
    {id: `${T - 4 * MIN}-2-INCOMING_CALL`, type: 'INCOMING_CALL', caller: '***0199', at: T - 4 * MIN},
];
const synthetic = [
    {id: `sftest-${RUN}-1`, type: 'MESSAGE_RECEIVED', synthetic: true, reason: 'TEST_HARNESS', app: 'SF TEST', appPackage: 'com.SilenceFocus', notificationRef: 'aaaa', replyStatus: 'SKIPPED', at: T - MIN},
    {id: `sftest-${RUN}-2`, type: 'INCOMING_CALL', synthetic: true, reason: 'TEST_HARNESS', app: 'SF TEST', appPackage: 'com.SilenceFocus', notificationRef: 'bbbb', caller: 'SF TEST app call', at: T - MIN},
    {id: `sftest-${RUN}-3`, type: 'INCOMING_CALL', synthetic: true, reason: 'TEST_HARNESS', caller: '+00******0000', at: T - MIN},
];

let native;
let outboxes;

const setup = async ({journal = [...real, ...synthetic], syncable = true} = {}) => {
    jest.resetModules();
    const RN = require('react-native');
    RN.Platform.OS = 'android';
    outboxes = {};
    native = {
        getRecentEvents: jest.fn(() => Promise.resolve(journal.map(e => ({...e})))),
        getSessionHistory: jest.fn(() => Promise.resolve({recordingSince: 1, sessions: []})),
        markAcknowledged: jest.fn(() => Promise.resolve(true)),
        getOutbox: jest.fn(userId => Promise.resolve(outboxes[userId] || {events: [], sessions: []})),
        removeFromOutbox: jest.fn(() => Promise.resolve(true)),
    };
    // Current native code filters synthetic rows itself; older native code
    // (no getSyncableEvents) is covered by the JS filter.
    if (syncable) native.getSyncableEvents = jest.fn(() => Promise.resolve(journal.map(e => ({...e}))));
    RN.NativeModules.SilentFocus = native;
    const AsyncStorage = require('@react-native-async-storage/async-storage');
    await AsyncStorage.clear();
    const {Constants} = require('../src/utils/theme');
    Constants.commonConstant.appToken = 'tok';
    Constants.commonConstant.appUserId = 3;
    return require('../src/utils/serverSync');
};

afterEach(() => {
    delete require('react-native').NativeModules.SilentFocus;
});

const accepting = () => {
    const posted = [];
    const transport = jest.fn((m, b) => {
        if (m === 'post') {
            posted.push(...b.logs.map(l => l.client_event_id));
            return Promise.resolve({statusCode: 200, data: {status: '1', result: {errors: []}}});
        }
        return Promise.resolve({statusCode: 200, data: {status: '1', result: {current_page: 1, last_page: 1, data: []}}});
    });
    return {transport, posted};
};

describe('upload exclusion', () => {
    test('toServerLog: synthetic rows map to nothing, the same row without the flag maps', async () => {
        const {toServerLog} = await setup();
        synthetic.forEach(e => expect(toServerLog('i', e)).toBeNull());
        const {synthetic: _s, ...plain} = synthetic[0];
        expect(toServerLog('i', plain)).not.toBeNull();
        // Only `true` marks a row synthetic.
        expect(toServerLog('i', {...plain, synthetic: 'true'})).not.toBeNull();
    });

    test('pendingUploads: the real upload set is identical with and without synthetic rows', async () => {
        const {pendingUploads} = await setup();
        const a = pendingUploads({installId: 'i', events: real, sessions: [], state: {}, now: T});
        const b = pendingUploads({installId: 'i', events: [...real, ...synthetic], sessions: [], state: {}, now: T});
        expect(b).toEqual(a);
        expect(a.logs).toHaveLength(2);
    });

    test.each([true, false])('sync posts only real rows (native syncable list: %s)', async syncable => {
        const sync = await setup({syncable});
        const {transport, posted} = accepting();
        await sync.syncActivityAndSessions({transport, enabled: true});
        const id = await sync.getInstallId();
        expect(posted.sort()).toEqual(real.map(e => `sf:${id}:e:${e.id}`).sort());
        expect(posted.some(p => p.includes('sftest-'))).toBe(false);
    });

    test('server sync never reads the full journal when the syncable list exists', async () => {
        const sync = await setup();
        await sync.syncActivityAndSessions({transport: accepting().transport, enabled: true});
        expect(native.getSyncableEvents).toHaveBeenCalled();
        expect(native.getRecentEvents).not.toHaveBeenCalled();
    });

    test('verification never asks the server about synthetic rows or acknowledges them', async () => {
        const sync = await setup({journal: synthetic});
        const {transport} = accepting();
        const res = await sync.verifyAcknowledgements({transport, installId: await sync.getInstallId()});
        expect(res).toMatchObject({ok: true});
        expect(transport).not.toHaveBeenCalled();
        expect(native.markAcknowledged).not.toHaveBeenCalled();
    });

    test('a synthetic-only journal uploads nothing', async () => {
        const sync = await setup({journal: synthetic});
        const {transport} = accepting();
        await sync.syncActivityAndSessions({transport, enabled: true});
        expect(transport.mock.calls.filter(c => c[0] === 'post')).toHaveLength(0);
    });

    test('writes disabled (harness build): nothing is sent at all', async () => {
        const sync = await setup();
        const {transport} = accepting();
        expect(await sync.syncActivityAndSessions({transport, enabled: false})).toEqual({skipped: 'WRITES_DISABLED'});
        expect(transport).not.toHaveBeenCalled();
    });
});

describe('logout outbox', () => {
    test('getOutbox drops synthetic rows even if native returned one', async () => {
        await setup();
        outboxes[3] = {events: [real[0], synthetic[0]], sessions: []};
        const box = await require('../src/utils/outbox').getOutbox(3);
        expect(box.events.map(e => e.id)).toEqual([real[0].id]);
    });

    test('flushOutbox never uploads a synthetic row', async () => {
        const sync = await setup();
        outboxes[3] = {events: [...synthetic], sessions: []};
        const {transport} = accepting();
        await sync.flushOutbox({transport, installId: await sync.getInstallId()});
        expect(transport.mock.calls.filter(c => c[0] === 'post')).toHaveLength(0);
    });
});

describe('the production Activity code renders and routes synthetic rows', () => {
    test('message row asks for a preview and opens its notification; app-call row opens its notification; phone row opens Phone', async () => {
        await setup();
        const {normalizeLocalEvents, previewRequests, isOpenable, previewTextFor} = require('../src/utils/activityEvents');
        const rows = normalizeLocalEvents(synthetic);
        const byId = Object.fromEntries(rows.map(r => [r.id.replace('local-', ''), r]));
        const msg = byId[`sftest-${RUN}-1`];
        const appCall = byId[`sftest-${RUN}-2`];
        const phone = byId[`sftest-${RUN}-3`];
        expect(previewRequests(rows)).toEqual([{appPackage: 'com.SilenceFocus', notificationRef: 'aaaa', key: 'aaaa|'}]);
        expect(msg).toMatchObject({appPackage: 'com.SilenceFocus', notificationRef: 'aaaa', opensPhone: false});
        expect(appCall).toMatchObject({appPackage: 'com.SilenceFocus', notificationRef: 'bbbb', opensPhone: false});
        expect(phone).toMatchObject({appPackage: null, opensPhone: true});
        rows.forEach(r => expect(isOpenable(r)).toBe(true));
        expect(previewTextFor(msg, {'aaaa|': {status: 'TEXT', text: `SF TEST ${RUN} preview`}})).toBeTruthy();
    });
});
