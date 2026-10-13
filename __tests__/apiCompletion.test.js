// API completion: activity/session upload via POST /sync and Auto Reply
// sync with auto-response templates / settings / zones. Contracts come from
// the backend source; all I/O goes through a fake transport here.

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
    clientEventPrefix,
    isOwnUpload,
    markUploaded,
    pendingUploads,
    serverWritesAllowed,
    syncActivityAndSessions,
    toServerLog,
    toServerSession,
} from '../src/utils/serverSync';
import {
    hasLocalCustomisation,
    normalizeTemplate,
    planPush,
    serverToLocal,
    syncAutoReply,
    pushAutoReply,
} from '../src/utils/autoResponseSync';
import {normalizeActivityLog, normalizeSilentZone} from '../src/utils/api/normalizers';
import {Constants} from '../src/utils/theme';

const NOW = Date.UTC(2026, 9, 1, 10, 0, 0);
const MIN = 60 * 1000;
const ID = 'inst1';

const ev = (type, at, extra = {}) => ({id: `${at}-1-${type}`, type, at, ...extra});

describe('activity/session upload mapping', () => {
    test('calls and messages map to backend log types without content or full numbers', () => {
        expect(toServerLog(ID, ev('EMERGENCY_BREAKTHROUGH', NOW, {caller: '+91******1234', contactName: 'Mom'}))).toEqual({
            type: 'incoming_call',
            client_event_id: `sf:${ID}:e:${NOW}-1-EMERGENCY_BREAKTHROUGH`,
            timestamp: new Date(NOW).toISOString(),
            sender_name: null, // contact names are not uploaded
            sender_number: '+91******1234',
            content: 'Emergency contact allowed',
        });
        const msg = toServerLog(ID, ev('MESSAGE_RECEIVED', NOW, {app: 'WhatsApp', text: 'secret'}));
        expect(msg.type).toBe('notification');
        expect(msg.sender_name).toBe('WhatsApp');
        expect(JSON.stringify(msg)).not.toContain('secret');
        expect(toServerLog(ID, ev('AUTO_REPLY_SENT', NOW)).type).toBe('auto_response');
        // Automation and failed/skipped replies are not uploaded as logs.
        ['SILENCE_STARTED', 'ZONE_ENTER', 'AUTO_REPLY_FAILED', 'AUTO_REPLY_SKIPPED'].forEach(t =>
            expect(toServerLog(ID, ev(t, NOW))).toBeNull(),
        );
    });

    test('sessions map to silent_sessions with a stable client_event_id', () => {
        const open = {start: NOW - 30 * MIN, end: null, primarySource: 'ZONE'};
        expect(toServerSession(ID, open)).toEqual({
            client_event_id: `sf:${ID}:s:${NOW - 30 * MIN}`,
            trigger_type: 'silent_zone',
            silent_mode: 'dnd',
            started_at: new Date(NOW - 30 * MIN).toISOString(),
            ended_at: null,
        });
        expect(toServerSession(ID, {...open, primarySource: 'MANUAL'}).trigger_type).toBe('manual');
        expect(toServerSession(ID, {...open, primarySource: 'CALENDAR'}).trigger_type).toBe('calendar');
        expect(toServerSession(ID, {...open, primarySource: 'SCHEDULE'}).trigger_type).toBe('schedule');
    });

    test('queue: only unsent items, re-sends a session when it ends, bounded state', () => {
        const events = [ev('INCOMING_CALL', NOW - MIN, {caller: '***0100'}), ev('ZONE_ENTER', NOW)];
        const open = {start: NOW - 10 * MIN, end: null, primarySource: 'MANUAL'};
        let state = {};
        let p = pendingUploads({installId: ID, events, sessions: [open], state, now: NOW});
        expect(p.logs).toHaveLength(1);
        expect(p.sessions).toHaveLength(1);
        state = markUploaded({installId: ID, state, ...p, now: NOW});
        p = pendingUploads({installId: ID, events, sessions: [open], state, now: NOW});
        expect(p.logs).toHaveLength(0);
        expect(p.sessions).toHaveLength(0);
        // The session ended: same client_event_id, sent again (server upserts).
        const ended = {...open, end: NOW};
        p = pendingUploads({installId: ID, events, sessions: [ended], state, now: NOW});
        expect(p.sessions).toEqual([ended]);
        // Old ids are forgotten.
        const later = markUploaded({installId: ID, state, logs: [], sessions: [], now: NOW + 40 * 24 * 60 * MIN});
        expect(Object.keys(later.sentEvents)).toHaveLength(0);
    });

    test('own uploads are recognised so Activity does not list them twice', () => {
        const row = normalizeActivityLog({id: 9, type: 'incoming_call', client_event_id: `${clientEventPrefix(ID)}e:1-1-X`});
        expect(row.clientEventId).toBe(`sf:${ID}:e:1-1-X`);
        expect(isOwnUpload(ID, row)).toBe(true);
        expect(isOwnUpload('other', row)).toBe(false);
        expect(isOwnUpload(ID, normalizeActivityLog({id: 3, type: 'sms', client_event_id: 'sync-log-1'}))).toBe(false);
    });
});

describe('activity/session upload run', () => {
    let RN;
    beforeEach(async () => {
        await AsyncStorage.clear();
        Constants.commonConstant.appToken = 'tok';
        RN = require('react-native');
        RN.NativeModules.SilentFocus = {
            getRecentEvents: jest.fn(() => Promise.resolve([ev('URGENT_REPEAT_CALLER', Date.now() - MIN, {caller: '***0199'})])),
            getSessionHistory: jest.fn(() =>
                Promise.resolve({recordingSince: 1, sessions: [{id: 's', start: Date.now() - 5 * MIN, end: Date.now(), primarySource: 'MANUAL'}]}),
            ),
        };
        RN.Platform.OS = 'android';
    });
    afterEach(() => {
        delete RN.NativeModules.SilentFocus;
        Constants.commonConstant.appToken = '';
    });

    test('writes are off unless enabled (no test data from debug builds)', async () => {
        const transport = jest.fn();
        expect(await syncActivityAndSessions({transport})).toEqual({skipped: 'WRITES_DISABLED'});
        expect(transport).not.toHaveBeenCalled();
    });

    test('sends JSON to /sync, keeps the queue on failure, marks sent on 200', async () => {
        jest.resetModules();
        // Fresh module graph: configure the new react-native / storage instances.
        const RN2 = require('react-native');
        RN2.Platform.OS = 'android';
        // Fixed times: the same event/session on every read, like the native store.
        const T = Date.now();
        const journal = [ev('URGENT_REPEAT_CALLER', T - MIN, {caller: '***0199'})];
        const sessions = [{id: 's', start: T - 5 * MIN, end: T, primarySource: 'MANUAL'}];
        RN2.NativeModules.SilentFocus = {
            getRecentEvents: jest.fn(() => Promise.resolve(journal.map(e => ({...e})))),
            getSessionHistory: jest.fn(() => Promise.resolve({recordingSince: 1, sessions: sessions.map(x => ({...x}))})),
            markAcknowledged: jest.fn((ids, ends) => {
                journal.forEach(e => {
                    if (ids.includes(e.id)) e.acked = true;
                });
                sessions.forEach(x => {
                    if (ends.some(a => a.start === x.start && a.end === x.end)) x.ackedEnd = x.end;
                });
                return Promise.resolve(true);
            }),
        };
        const AS = require('@react-native-async-storage/async-storage');
        await (AS.default || AS).clear();
        const {syncActivityAndSessions: run} = require('../src/utils/serverSync');
        require('../src/utils/theme').Constants.commonConstant.appToken = 'tok';
        const fail = jest.fn(() => Promise.resolve({statusCode: 0, isNetworkError: true}));
        const first = await run({transport: fail, enabled: true});
        expect(first).toMatchObject({failed: true, statusCode: 0});
        const [method, body, url, headers] = fail.mock.calls[0];
        expect(method).toBe('post');
        expect(url).toBe('sync');
        expect(headers['Content-Type']).toBe('application/json');
        expect(body.logs).toHaveLength(1);
        expect(body.logs[0].type).toBe('incoming_call');
        expect(body.silent_sessions).toHaveLength(1);
        expect(body.silent_sessions[0].ended_at).not.toBeNull();

        // A server that stores what it receives and serves it back (UTC, seconds).
        const stored = {logs: [], sessions: []};
        const utc = iso => iso.slice(0, 19).replace('T', ' ');
        const okT = jest.fn((m, b, url) => {
            if (m === 'post') {
                stored.logs.push(...b.logs.map(l => ({client_event_id: l.client_event_id, type: l.type, timestamp: utc(l.timestamp)})));
                stored.sessions.push(
                    ...b.silent_sessions.map(x => ({
                        notes: `client_event_id:${x.client_event_id}`,
                        started_at: utc(x.started_at),
                        ended_at: x.ended_at && utc(x.ended_at),
                        status: x.ended_at ? 'ended' : 'active',
                    })),
                );
                return Promise.resolve({statusCode: 200, data: {status: '1', result: {errors: []}}});
            }
            const data = url === 'logs' ? stored.logs : stored.sessions;
            return Promise.resolve({statusCode: 200, data: {status: '1', result: {current_page: 1, last_page: 1, data}}});
        });
        const second = await run({transport: okT, enabled: true});
        expect(second).toMatchObject({uploaded: 2, verified: true}); // retried after failure, then read back
        expect((await run({transport: okT, enabled: true})).uploaded).toBe(0); // nothing left
        expect(okT.mock.calls.filter(c => c[0] === 'post')).toHaveLength(1);
        // Read back -> acknowledged natively (retention may drop them now).
        expect(journal[0].acked).toBe(true);
        expect(sessions[0].ackedEnd).toBe(sessions[0].end);
    });
});

describe('auto reply mapping', () => {
    const templates = [
        normalizeTemplate({id: 5, name: 'Default reply', message: 'Busy right now', is_default: 1}),
        normalizeTemplate({id: 7, name: 'Silent Zone: Office', message: 'At work', is_default: 0}),
    ];
    const zone = (id, extra = {}) => normalizeSilentZone({id, name: `Z${id}`, latitude: 1, longitude: 1, radius_m: 200, status: 1, ...extra});

    test('backend zone fields are kept by the mapping layer', () => {
        const z = zone(3, {auto_response_template_id: 1, auto_response_enabled: 1});
        expect(z.autoResponseTemplateId).toBe(1);
        expect(z.autoResponseEnabled).toBe(true);
    });

    test('server -> local: default and linked zone replies; dangling links ignored; never enables', () => {
        const zones = [zone(3, {auto_response_template_id: 7, auto_response_enabled: 1}), zone(4, {auto_response_template_id: 99, auto_response_enabled: 1})];
        const local = serverToLocal({settings: {auto_response_enabled: 1}, templates, zones});
        expect(local).toEqual({defaultTemplate: 'Busy right now', zoneTemplates: {3: 'At work'}});
        expect('enabled' in local).toBe(false);
    });

    test('local -> plan: only needed writes, creates and links zone templates, never deletes', () => {
        const zones = [zone(3, {auto_response_template_id: 7, auto_response_enabled: 1}), zone(4), zone(6, {auto_response_template_id: 99, auto_response_enabled: 1})];
        const plan = planPush({
            local: {enabled: true, defaultTemplate: 'Busy right now', zoneTemplates: {3: 'At work today', 4: 'At the gym'}},
            settings: {auto_response_enabled: 0},
            templates,
            zones,
        });
        expect(plan).toEqual([
            {kind: 'settings', body: {auto_response_enabled: true}},
            {kind: 'updateTemplate', id: '7', body: {message: 'At work today'}},
            {kind: 'createTemplate', ref: 'zone:4', body: {name: 'Silent Zone: Z4', message: 'At the gym'}},
            {kind: 'linkZone', zoneId: '4', templateRef: 'zone:4'},
        ]);
        expect(plan.some(s => /delete/i.test(s.kind))).toBe(false);
        // Clearing a zone reply unlinks it (template kept); dangling links untouched.
        const cleared = planPush({local: {enabled: false, defaultTemplate: 'Busy right now', zoneTemplates: {}}, settings: {auto_response_enabled: 0}, templates, zones});
        expect(cleared).toEqual([{kind: 'unlinkZone', zoneId: '3'}]);
    });

    test('an interrupted push (template created, link failed) is resumed without a duplicate', () => {
        const leftover = normalizeTemplate({id: 12, name: 'Silent Zone: Z4', message: 'At the gym', is_default: 0});
        const plan = planPush({
            local: {enabled: true, defaultTemplate: 'Busy right now', zoneTemplates: {4: 'At the gym'}},
            settings: {auto_response_enabled: 1},
            templates: [templates[0], leftover],
            zones: [zone(4)],
        });
        expect(plan).toEqual([{kind: 'linkZone', zoneId: '4', templateId: '12'}]);
        // A same-named template already linked to another zone is not taken over.
        const plan2 = planPush({
            local: {enabled: true, defaultTemplate: 'Busy right now', zoneTemplates: {4: 'At the gym', 8: 'At the gym'}},
            settings: {auto_response_enabled: 1},
            templates: [templates[0], leftover],
            zones: [zone(4), zone(8, {auto_response_template_id: 12, auto_response_enabled: 1})],
        });
        expect(plan2.map(p => p.kind)).toEqual(['createTemplate', 'linkZone']);
    });

    test('creates the default template when the account has none', () => {
        const plan = planPush({local: {enabled: false, defaultTemplate: '', zoneTemplates: {}}, settings: {auto_response_enabled: false}, templates: [], zones: []});
        expect(plan).toEqual([
            {kind: 'createTemplate', ref: 'default', body: {name: 'Default reply', message: "I'm currently unavailable and will get back to you soon.", is_default: true}},
        ]);
    });

    test('local customisation detection', () => {
        expect(hasLocalCustomisation({defaultTemplate: "I'm currently unavailable and will get back to you soon.", zoneTemplates: {}})).toBe(false);
        expect(hasLocalCustomisation({defaultTemplate: 'Away', zoneTemplates: {}})).toBe(true);
        expect(hasLocalCustomisation({defaultTemplate: '', zoneTemplates: {3: 'Library'}})).toBe(true);
    });
});

describe('auto reply sync run', () => {
    let RN;
    let native;
    const okRes = result => Promise.resolve({statusCode: 200, data: {status: '1', result}});
    beforeEach(async () => {
        jest.resetModules();
        const AS = require('@react-native-async-storage/async-storage');
        await (AS.default || AS).clear();
        RN = require('react-native');
        RN.Platform.OS = 'android';
        native = {
            getCommsState: jest.fn(() => Promise.resolve({autoReply: {enabled: false, defaultTemplate: 'Away for a bit', zoneTemplates: {}}})),
            setAutoReplySettings: jest.fn(s => Promise.resolve({autoReply: s})),
        };
        RN.NativeModules.SilentFocus = native;
        require('../src/utils/theme').Constants.commonConstant.appToken = 'tok';
    });
    afterEach(() => {
        delete RN.NativeModules.SilentFocus;
    });

    const server = () => {
        const calls = [];
        const transport = jest.fn((method, body, url) => {
            calls.push([method, url, body]);
            if (method === 'get' && url === 'settings') return okRes({auto_response_enabled: 1});
            if (method === 'get' && url === 'auto-response-templates') return okRes({data: [], current_page: 1, last_page: 1});
            if (method === 'post' && url === 'auto-response-templates') return okRes({id: 11});
            if (method === 'put') return okRes({});
            return Promise.resolve({statusCode: 404, data: {}});
        });
        return {transport, calls};
    };

    test('first sync pushes replies customised before sync existed instead of overwriting them', async () => {
        const {syncAutoReply: sync} = require('../src/utils/autoResponseSync');
        const {transport, calls} = server();
        await sync({transport, fetchZones: () => Promise.resolve([]), writesEnabled: true});
        expect(calls).toContainEqual(['post', 'auto-response-templates', {name: 'Default reply', message: 'Away for a bit', is_default: true}]);
        // Local "off" is mirrored; the server's "on" never switches it on locally.
        expect(calls).toContainEqual(['put', 'settings', {auto_response_enabled: false}]);
        const applied = native.setAutoReplySettings.mock.calls.map(c => c[0]);
        expect(applied.every(a => !('enabled' in a))).toBe(true);
    });

    test('with writes disabled, local edits are kept (pending) and never overwritten', async () => {
        const {syncAutoReply: sync} = require('../src/utils/autoResponseSync');
        const {transport, calls} = server();
        expect(await sync({transport, fetchZones: () => Promise.resolve([]), writesEnabled: false})).toBeNull();
        expect(calls.filter(c => c[0] !== 'get')).toHaveLength(0);
        expect(native.setAutoReplySettings).not.toHaveBeenCalled();
    });

    test('a failed push stays pending and is retried', async () => {
        const {pushAutoReply: push, isPushPending} = require('../src/utils/autoResponseSync');
        const offline = jest.fn(() => Promise.resolve({statusCode: 0, isNetworkError: true}));
        expect(await push({transport: offline, fetchZones: () => Promise.resolve([]), writesEnabled: true})).toBe(false);
        expect(await isPushPending()).toBe(true);
        const {transport} = server();
        expect(await push({transport, fetchZones: () => Promise.resolve([]), writesEnabled: true})).toBe(true);
        expect(await isPushPending()).toBe(false);
    });
});

describe('server write gating', () => {
    test('release builds write; debug builds never do by default', () => {
        expect(serverWritesAllowed({isDev: false, testAccountId: '', userId: 2})).toBe(true);
        expect(serverWritesAllowed({isDev: true, testAccountId: '', userId: 2})).toBe(false);
    });

    test('debug writes only for the dedicated test account named at build time', () => {
        expect(serverWritesAllowed({isDev: true, testAccountId: '57', userId: 57})).toBe(true);
        expect(serverWritesAllowed({isDev: true, testAccountId: '57', userId: '57'})).toBe(true);
        // A real account signed into the same test build: no writes.
        expect(serverWritesAllowed({isDev: true, testAccountId: '57', userId: 2})).toBe(false);
        // Signed out / malformed values: no writes.
        expect(serverWritesAllowed({isDev: true, testAccountId: '57', userId: 0})).toBe(false);
        expect(serverWritesAllowed({isDev: true, testAccountId: '57', userId: null})).toBe(false);
        expect(serverWritesAllowed({isDev: true, testAccountId: '5 7', userId: 57})).toBe(false);
        expect(serverWritesAllowed({isDev: true, testAccountId: 'all', userId: 57})).toBe(false);
    });

    test('this debug test run has the switch off (no build-time account configured)', () => {
        expect(require('../src/utils/buildConfig').DEBUG_SERVER_WRITES_ACCOUNT_ID).toBe('');
        expect(serverWritesAllowed({userId: 2})).toBe(false);
    });
});
