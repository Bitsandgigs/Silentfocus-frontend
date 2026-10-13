/* eslint-env jest */
// "Clear phone activity" must never delete a session or log whose latest
// state the server hasn't acknowledged (read back after the sync).

const MIN = 60 * 1000;
const NOW = Date.UTC(2026, 9, 10, 8, 0, 0);
const iso = ms => new Date(ms).toISOString();
// Backend storage format: UTC "YYYY-MM-DD HH:mm:ss" (seconds truncated).
const serverTime = ms => (ms == null ? null : iso(ms).slice(0, 19).replace('T', ' '));

describe('read-back checks (pure)', () => {
    const {unacknowledgedSessions, unacknowledgedLogs, sessionClientId, eventClientId} = require('../src/utils/serverSync');
    const ID = 'install-1';
    const row = (s, extra = {}) => ({
        notes: `client_event_id:${sessionClientId(ID, s)}`,
        started_at: serverTime(s.start),
        ended_at: serverTime(s.end),
        status: s.end == null ? 'active' : 'ended',
        ...extra,
    });
    const ended = {start: NOW - 60 * MIN, end: NOW - 30 * MIN + 495};
    const open = {start: NOW - 10 * MIN, end: null};

    test('session acknowledged when start, end (to the second) and status match', () => {
        expect(unacknowledgedSessions({installId: ID, sessions: [ended, open], serverRows: [row(ended)], now: NOW})).toEqual([]);
    });

    test('server still has it open (the #74 case) -> not acknowledged', () => {
        const stale = row({...ended, end: null});
        expect(unacknowledgedSessions({installId: ID, sessions: [ended], serverRows: [stale], now: NOW})).toEqual([ended]);
    });

    test('missing, wrong end, wrong start, other install -> not acknowledged', () => {
        const check = serverRows => unacknowledgedSessions({installId: ID, sessions: [ended], serverRows, now: NOW});
        expect(check([])).toHaveLength(1);
        expect(check([row(ended, {ended_at: serverTime(ended.end + 5000)})])).toHaveLength(1);
        expect(check([row(ended, {started_at: serverTime(ended.start - 1000)})])).toHaveLength(1);
        expect(check([row(ended, {notes: 'client_event_id:sf:other:s:1'})])).toHaveLength(1);
    });

    test('open sessions are not checked; old pending ones are (retention keeps them)', () => {
        const old = {start: NOW - 40 * 24 * 60 * MIN, end: NOW - 40 * 24 * 60 * MIN + MIN};
        expect(unacknowledgedSessions({installId: ID, sessions: [open, old], serverRows: []})).toEqual([old]);
    });

    const msg = {id: `${NOW - MIN}-7-MESSAGE_RECEIVED`, type: 'MESSAGE_RECEIVED', app: 'WhatsApp', at: NOW - MIN};
    const call = {id: `${NOW - 2 * MIN}-6-INCOMING_CALL`, type: 'INCOMING_CALL', caller: '+91******1234', at: NOW - 2 * MIN};
    const zone = {id: `${NOW - 3 * MIN}-5-ZONE_ENTER`, type: 'ZONE_ENTER', at: NOW - 3 * MIN};
    const logRow = (e, type) => ({client_event_id: eventClientId(ID, e), type});

    test('logs: acknowledged only when read back by client_event_id and type', () => {
        const serverLogs = [logRow(msg, 'notification'), logRow(call, 'incoming_call')];
        expect(unacknowledgedLogs({installId: ID, events: [msg, call, zone], serverLogs, now: NOW})).toEqual([]);
        // Rejected by the server (absent) or stored as something else.
        expect(unacknowledgedLogs({installId: ID, events: [msg, call], serverLogs: [logRow(call, 'incoming_call')], now: NOW})).toEqual([msg]);
        expect(unacknowledgedLogs({installId: ID, events: [msg], serverLogs: [logRow(msg, 'incoming_call')], now: NOW})).toEqual([msg]);
    });

    test('logs: automation events are never uploaded, so never pending', () => {
        expect(unacknowledgedLogs({installId: ID, events: [zone], serverLogs: [], now: NOW})).toEqual([]);
    });
});

describe('clearLocalActivitySafely', () => {
    let native;
    let serverSync;
    let AsyncStorage;
    let sessions; // server sessions by client_event_id
    let logs; // server logs by client_event_id
    let online;
    let dropEndedAt;
    let rejectLogTypes;
    let failRead;
    let journal;
    let history;

    const transport = jest.fn(async (method, body, url) => {
        if (!online) return {statusCode: 0, isNetworkError: true};
        if (method === 'post' && url === 'sync') {
            const errors = [];
            (body.logs || []).forEach((l, index) => {
                // storeLogs: a rejected row is only {index, message}; HTTP stays 200.
                if (rejectLogTypes.includes(l.type)) errors.push({index, message: 'rejected'});
                else logs[l.client_event_id] = {client_event_id: l.client_event_id, type: l.type, timestamp: serverTime(Date.parse(l.timestamp))};
            });
            (body.silent_sessions || []).forEach(s => {
                const ended = dropEndedAt ? null : s.ended_at;
                sessions[s.client_event_id] = {
                    notes: `client_event_id:${s.client_event_id}`,
                    started_at: serverTime(Date.parse(s.started_at)),
                    ended_at: ended ? serverTime(Date.parse(ended)) : null,
                    status: ended ? 'ended' : 'active',
                };
            });
            return {statusCode: 200, data: {status: '1', result: {errors}}};
        }
        if (method === 'get' && (url === 'silent-sessions' || url === 'logs')) {
            if (failRead === url) return {statusCode: 500};
            const data = Object.values(url === 'logs' ? logs : sessions);
            return {statusCode: 200, data: {status: '1', result: {current_page: 1, last_page: 1, data}}};
        }
        return {statusCode: 404};
    });

    beforeEach(async () => {
        jest.resetModules();
        const RN = require('react-native');
        RN.Platform.OS = 'android';
        const now = Date.now();
        history = [
            {start: now - 60 * MIN, end: now - 30 * MIN, primarySource: 'MANUAL'},
            {start: now - 20 * MIN, end: null, primarySource: 'MANUAL'},
        ];
        journal = [
            {id: `${now - 50 * MIN}-1-INCOMING_CALL`, type: 'INCOMING_CALL', caller: '+91******1234', at: now - 50 * MIN},
            {id: `${now - 40 * MIN}-2-MESSAGE_RECEIVED`, type: 'MESSAGE_RECEIVED', app: 'WhatsApp', at: now - 40 * MIN},
            {id: `${now - 30 * MIN}-3-SILENCE_ENDED`, type: 'SILENCE_ENDED', at: now - 30 * MIN},
        ];
        native = {
            getRecentEvents: jest.fn(() => Promise.resolve(journal.map(e => ({...e})))),
            getSessionHistory: jest.fn(() => Promise.resolve({recordingSince: 1, sessions: history.map(x => ({...x}))})),
            clearRecentEvents: jest.fn(() => Promise.resolve(true)),
            // Like EngineStore/SessionStore.markAcknowledged.
            markAcknowledged: jest.fn((ids, ends) => {
                journal.forEach(e => {
                    if (ids.includes(e.id)) e.acked = true;
                });
                history.forEach(x => {
                    const hit = ends.find(a => a.start === x.start && a.end === x.end);
                    if (hit) x.ackedEnd = x.end;
                });
                return Promise.resolve(true);
            }),
        };
        RN.NativeModules.SilentFocus = native;
        AsyncStorage = require('@react-native-async-storage/async-storage');
        await AsyncStorage.clear();
        const {Constants} = require('../src/utils/theme');
        Constants.commonConstant.appToken = 'token';
        Constants.commonConstant.appUserId = 3;
        serverSync = require('../src/utils/serverSync');
        sessions = {};
        logs = {};
        online = true;
        dropEndedAt = false;
        rejectLogTypes = [];
        failRead = null;
        transport.mockClear();
    });

    afterEach(() => {
        delete require('react-native').NativeModules.SilentFocus;
    });

    const clear = (opts = {}) => serverSync.clearLocalActivitySafely({transport, enabled: true, ...opts});
    const sentState = async () => JSON.parse((await AsyncStorage.getItem('sf.sync.state')) || '{}');

    test('online: syncs, reads back, clears exactly the verified sessions and journal entries', async () => {
        const res = await clear();
        expect(res).toMatchObject({ok: true, kept: 0});
        expect(native.clearRecentEvents).toHaveBeenCalledWith([history[0].start], journal.map(e => e.id));
        const calls = new Set(transport.mock.calls.map(c => `${c[0]} ${c[2]}`));
        expect(calls).toEqual(new Set(['post sync', 'get logs', 'get silent-sessions']));
        // Acknowledged natively, so retention may drop them later.
        expect(journal.filter(e => e.type !== 'SILENCE_ENDED').every(e => e.acked)).toBe(true);
        expect(history[0].ackedEnd).toBe(history[0].end);
    });

    test('events recorded after the check are not in the clear list (kept natively)', async () => {
        native.getRecentEvents.mockImplementationOnce(() => Promise.resolve(journal.slice())); // used by the sync
        const res = await clear();
        const late = {id: `${Date.now()}-9-MESSAGE_RECEIVED`, type: 'MESSAGE_RECEIVED', at: Date.now()};
        journal.push(late);
        expect(res.clearableEventIds).not.toContain(late.id);
    });

    test('partial acceptance: a rejected log (HTTP 200) is kept, re-queued, and everything verified is cleared', async () => {
        rejectLogTypes = ['notification'];
        const res = await clear();
        const message = journal[1];
        expect(res).toMatchObject({ok: true, kept: 1});
        expect(res.clearableEventIds).toEqual([journal[0].id, journal[2].id]);
        expect(native.clearRecentEvents).toHaveBeenCalledWith([history[0].start], [journal[0].id, journal[2].id]);
        const state = await sentState();
        expect(Object.keys(state.sentEvents).some(k => k.endsWith(message.id))).toBe(false);
        // Rejected once -> backed off: an immediate retry doesn't resend it
        // (and it is still kept, never deleted).
        rejectLogTypes = [];
        expect(await clear()).toMatchObject({ok: true, kept: 1});
        expect(Object.values(state.backoff || {})).toHaveLength(1);
        // Once the backoff has passed, it is sent, read back and cleared.
        const later = await sentState();
        Object.values(later.backoff).forEach(b => {
            b.nextAt = 0;
        });
        await AsyncStorage.setItem('sf.sync.state', JSON.stringify(later));
        expect(await clear()).toMatchObject({ok: true, kept: 0});
    });

    test('HTTP 200 without the persisted session end -> that session is kept', async () => {
        dropEndedAt = true;
        const res = await clear();
        expect(res).toMatchObject({ok: true, kept: 1});
        expect(res.clearableStarts).toEqual([]);
    });

    test('offline: nothing is cleared', async () => {
        online = false;
        expect(await clear()).toMatchObject({ok: false, reason: 'SYNC_FAILED'});
        expect(native.clearRecentEvents).not.toHaveBeenCalled();
    });

    test.each(['logs', 'silent-sessions'])('failed read-back of %s -> nothing is cleared', async url => {
        failRead = url;
        expect((await clear()).ok).toBe(false);
        expect(native.clearRecentEvents).not.toHaveBeenCalled();
    });

    test('timeout -> nothing is cleared, and the late result is ignored', async () => {
        let release;
        const gate = new Promise(r => {
            release = r;
        });
        const slow = jest.fn(async (...args) => {
            await gate;
            return transport(...args);
        });
        const res = await clear({transport: slow, timeoutMs: 20});
        expect(res).toMatchObject({ok: false, reason: 'TIMEOUT'});
        release();
        await new Promise(r => setTimeout(r, 30));
        expect(native.clearRecentEvents).not.toHaveBeenCalled();
    });

    test('a late re-queue cannot overwrite newer upload acknowledgements', async () => {
        rejectLogTypes = ['notification'];
        // While the clear check reads back, another sync acknowledges something new.
        const newer = 'sf:other-ack:e:1-1-INCOMING_CALL';
        const racing = jest.fn(async (method, body, url) => {
            if (url === 'logs') {
                const state = await sentState();
                await AsyncStorage.setItem(
                    'sf.sync.state',
                    JSON.stringify({...state, sentEvents: {...(state.sentEvents || {}), [newer]: true}}),
                );
            }
            return transport(method, body, url);
        });
        await clear({transport: racing});
        const state = await sentState();
        expect(state.sentEvents[newer]).toBe(true);
        expect(Object.keys(state.sentEvents).some(k => k.endsWith(journal[1].id))).toBe(false);
    });

    test('writes disabled (debug, non-test account): clears as before', async () => {
        const res = await clear({enabled: false});
        expect(res.ok).toBe(true);
        expect(native.clearRecentEvents).toHaveBeenCalledWith(null, null);
        expect(transport).not.toHaveBeenCalled();
    });
});
