/* eslint-env jest */
// Retention support on the JS side: pending items are uploaded whatever
// their age, acknowledged ones are not, and the uploaded types match
// ActivityEvents.UPLOADED_TYPES natively.

const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;

describe('pendingUploads with acknowledgement marks', () => {
    const {pendingUploads, toServerLog} = require('../src/utils/serverSync');
    const ID = 'install-1';
    const NOW = Date.UTC(2026, 9, 10, 8, 0, 0);
    const call = (at, extra = {}) => ({id: `${at}-1-INCOMING_CALL`, type: 'INCOMING_CALL', caller: '***0199', at, ...extra});

    test('a pending item older than 30 days is still uploaded (retention keeps it)', () => {
        const old = call(NOW - 45 * DAY);
        const oldSession = {start: NOW - 60 * DAY, end: NOW - 60 * DAY + MIN};
        const p = pendingUploads({installId: ID, events: [old], sessions: [oldSession], state: {}, now: NOW});
        expect(p.logs).toHaveLength(1);
        expect(p.sessions).toEqual([oldSession]);
    });

    test('acknowledged items are never uploaded again', () => {
        const acked = call(NOW - MIN, {acked: true});
        const s = {start: NOW - 10 * MIN, end: NOW - 5 * MIN, ackedEnd: NOW - 5 * MIN};
        const p = pendingUploads({installId: ID, events: [acked], sessions: [s], state: {}, now: NOW});
        expect(p.logs).toEqual([]);
        expect(p.sessions).toEqual([]);
    });

    test('a session acknowledged while open is pending again once it ends', () => {
        const ended = {start: NOW - 10 * MIN, end: NOW - MIN, ackedEnd: null};
        expect(pendingUploads({installId: ID, events: [], sessions: [ended], state: {}, now: NOW}).sessions).toEqual([ended]);
    });

    test('uploaded journal types match ActivityEvents.UPLOADED_TYPES (native)', () => {
        const all = [
            'SILENCE_STARTED', 'SILENCE_ENDED', 'ZONE_ENTER', 'ZONE_EXIT', 'CALENDAR_STARTED', 'CALENDAR_ENDED',
            'SCHEDULE_STARTED', 'SCHEDULE_ENDED', 'INCOMING_CALL', 'EMERGENCY_BREAKTHROUGH', 'URGENT_REPEAT_CALLER',
            'MESSAGE_RECEIVED', 'AUTO_REPLY_SENT', 'AUTO_REPLY_FAILED', 'AUTO_REPLY_SKIPPED', 'AUTOMATION_ERROR',
        ];
        const uploaded = all.filter(type => toServerLog(ID, {id: `1-1-${type}`, type, at: NOW}));
        expect(uploaded.sort()).toEqual(
            ['AUTO_REPLY_SENT', 'EMERGENCY_BREAKTHROUGH', 'INCOMING_CALL', 'MESSAGE_RECEIVED', 'URGENT_REPEAT_CALLER'].sort(),
        );
    });
});

describe('background acknowledgement check', () => {
    let native;
    let sync;
    let AsyncStorage;
    let journal;
    const ok = data => ({statusCode: 200, data: {status: '1', result: {current_page: 1, last_page: 1, data}}});

    beforeEach(async () => {
        jest.resetModules();
        const RN = require('react-native');
        RN.Platform.OS = 'android';
        const t = Date.now();
        journal = [{id: `${t - MIN}-1-INCOMING_CALL`, type: 'INCOMING_CALL', caller: '***0199', at: t - MIN}];
        native = {
            getRecentEvents: jest.fn(() => Promise.resolve(journal.map(e => ({...e})))),
            getSessionHistory: jest.fn(() => Promise.resolve({recordingSince: 1, sessions: []})),
            markAcknowledged: jest.fn(ids => {
                journal.forEach(e => {
                    if (ids.includes(e.id)) e.acked = true;
                });
                return Promise.resolve(true);
            }),
        };
        RN.NativeModules.SilentFocus = native;
        AsyncStorage = require('@react-native-async-storage/async-storage');
        await AsyncStorage.clear();
        require('../src/utils/theme').Constants.commonConstant.appToken = 'tok';
        sync = require('../src/utils/serverSync');
    });

    afterEach(() => {
        delete require('react-native').NativeModules.SilentFocus;
    });

    const installId = async () => sync.getInstallId();

    test('already uploaded but unconfirmed: read back when due, then acknowledged', async () => {
        const id = await installId();
        const cid = `sf:${id}:e:${journal[0].id}`;
        // Uploaded earlier (marked sent) but never read back.
        await AsyncStorage.setItem('sf.sync.state', JSON.stringify({sentEvents: {[cid]: true}}));
        const transport = jest.fn((m, b, url) => Promise.resolve(ok(url === 'logs' ? [{client_event_id: cid, type: 'incoming_call'}] : [])));
        const res = await sync.syncActivityAndSessions({transport, enabled: true});
        expect(res).toMatchObject({uploaded: 0, verified: true});
        expect(journal[0].acked).toBe(true);
        // Not due again right away: no further reads.
        transport.mockClear();
        await sync.syncActivityAndSessions({transport, enabled: true});
        expect(transport).not.toHaveBeenCalled();
    });

    test('marked sent but missing on the server: not acknowledged, re-queued', async () => {
        const id = await installId();
        const cid = `sf:${id}:e:${journal[0].id}`;
        await AsyncStorage.setItem('sf.sync.state', JSON.stringify({sentEvents: {[cid]: true}}));
        const transport = jest.fn(() => Promise.resolve(ok([])));
        await sync.syncActivityAndSessions({transport, enabled: true});
        expect(journal[0].acked).toBeUndefined();
        const state = JSON.parse(await AsyncStorage.getItem('sf.sync.state'));
        expect(state.sentEvents[cid]).toBeUndefined();
    });

    test('read-back failure leaves everything unacknowledged (kept)', async () => {
        const id = await installId();
        await AsyncStorage.setItem('sf.sync.state', JSON.stringify({sentEvents: {[`sf:${id}:e:${journal[0].id}`]: true}}));
        const transport = jest.fn(() => Promise.resolve({statusCode: 500}));
        const res = await sync.syncActivityAndSessions({transport, enabled: true});
        expect(res).toMatchObject({uploaded: 0, verified: false});
        expect(journal[0].acked).toBeUndefined();
    });

    test('native without markAcknowledged: not counted as verified, retried next time', async () => {
        delete native.markAcknowledged;
        const id = await installId();
        const cid = `sf:${id}:e:${journal[0].id}`;
        await AsyncStorage.setItem('sf.sync.state', JSON.stringify({sentEvents: {[cid]: true}}));
        const transport = jest.fn((m, b, url) => Promise.resolve(ok(url === 'logs' ? [{client_event_id: cid, type: 'incoming_call'}] : [])));
        expect(await sync.syncActivityAndSessions({transport, enabled: true})).toMatchObject({verified: false});
        expect(JSON.parse(await AsyncStorage.getItem('sf.sync.state')).lastVerifyAt).toBeUndefined();
    });
});
