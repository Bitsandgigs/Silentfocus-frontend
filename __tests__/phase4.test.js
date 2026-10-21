// Phase 4: comms wrapper (settings persistence goes through native) and the
// unified activity model shown by the Activity screen.

import {
    TABS,
    categoryOf,
    describeEvent,
    filterByTab,
    formatRelativeTime,
    normalizeLocalEvents,
    normalizeServerLogs,
} from '../src/utils/activityEvents';

describe('activity model', () => {
    const events = [
        {id: '1', type: 'SILENCE_STARTED', source: 'ZONE', at: 1000},
        {id: '2', type: 'ZONE_ENTER', name: 'Office', at: 1001},
        {id: '3', type: 'INCOMING_CALL', caller: '+91******1234', detail: 'BELOW_THRESHOLD', at: 1002},
        {id: '4', type: 'URGENT_REPEAT_CALLER', caller: '+91******1234', repeatCount: 3, at: 1003},
        {id: '5', type: 'EMERGENCY_BREAKTHROUGH', contactName: 'Mom', caller: '+91******9876', at: 1004},
        {id: '6', type: 'MESSAGE_RECEIVED', app: 'WhatsApp', replyStatus: 'SENT', at: 1005},
        {id: '7', type: 'AUTO_REPLY_SENT', app: 'WhatsApp', replyStatus: 'SENT', at: 1006},
        {id: '8', type: 'AUTO_REPLY_FAILED', app: 'Telegram', replyStatus: 'FAILED', at: 1007},
        {id: '9', type: 'AUTO_REPLY_SKIPPED', app: 'Chat', replyStatus: 'UNSUPPORTED', detail: 'NO_REPLY_ACTION', at: 1008},
        {id: '10', type: 'CALENDAR_STARTED', at: 1009},
        {id: '11', type: 'SCHEDULE_ENDED', name: 'Work', at: 1010},
        {id: '12', type: 'AUTOMATION_FAILED', detail: 'DND_ACCESS_MISSING', at: 1011},
    ];

    test('normalizes newest first with categories', () => {
        const rows = normalizeLocalEvents(events);
        expect(rows[0].type).toBe('AUTOMATION_ERROR'); // legacy name mapped
        expect(rows.map(r => r.at)).toEqual([...rows.map(r => r.at)].sort((a, b) => b - a));
        expect(rows.every(r => r.origin === 'local')).toBe(true);
        expect(filterByTab(rows, 'CALL').map(r => r.type)).toEqual([
            'EMERGENCY_BREAKTHROUGH',
            'URGENT_REPEAT_CALLER',
            'INCOMING_CALL',
        ]);
        expect(filterByTab(rows, 'MESSAGE')).toHaveLength(4);
        // Round 3 (#3): no Automation tab; All = calls + messages (+ automation errors).
        expect(filterByTab(rows, 'ALL')).toHaveLength(8);
        expect(filterByTab(rows, 'ALL').filter(r => r.category === 'AUTOMATION').map(r => r.type)).toEqual([
            'AUTOMATION_ERROR',
        ]);
        expect(TABS.map(t => t.key)).toEqual(['ALL', 'CALL', 'MESSAGE']);
    });

    test('describes events the way the dashboard needs', () => {
        expect(describeEvent(events[4]).title).toBe('Emergency contact allowed');
        expect(describeEvent(events[4]).subtitle).toBe('Mom · +91******9876');
        expect(describeEvent(events[3]).title).toBe('Urgent caller allowed after 3 calls');
        expect(describeEvent(events[1]).title).toBe('Silent Zone activated: Office');
        expect(describeEvent(events[9]).title).toBe('Calendar silence started');
        expect(describeEvent(events[10]).title).toBe('Schedule silence ended');
        expect(describeEvent(events[6]).title).toBe('Reply action accepted');
        expect(describeEvent(events[7]).title).toBe('Auto reply failed');
        expect(describeEvent(events[8]).title).toBe('Auto reply not supported');
        // Round 3 (#2): the sender is the title; app and reply outcome stay in the subtitle.
        expect(describeEvent(events[5]).title).toBe('Unknown sender');
        expect(describeEvent(events[5]).subtitle).toBe('WhatsApp · Reply action accepted');
        expect(describeEvent({...events[5], displayName: 'Alice'}).title).toBe('Alice');
        expect(
            describeEvent({type: 'MESSAGE_RECEIVED', replyStatus: 'SKIPPED', detail: 'COOLDOWN'}).subtitle,
        ).toBe('Message · Already replied to this sender recently');
        expect(describeEvent({type: 'MESSAGE_RECEIVED', replyStatus: 'SKIPPED', detail: 'DISABLED'}).subtitle).toBe(
            'Message',
        );
    });

    test('never surfaces message content or full numbers', () => {
        const leaky = {type: 'MESSAGE_RECEIVED', app: 'WhatsApp', text: 'secret body', at: 5};
        const row = normalizeLocalEvents([leaky])[0];
        expect(JSON.stringify(row)).not.toContain('secret');
        const server = normalizeServerLogs([
            {id: 1, name: 'Alice', content: 'private text', rawType: 'whatsapp', timestamp: '2026-09-04 08:22:18'},
        ]);
        expect(JSON.stringify(server)).not.toContain('private text');
    });

    test('drops malformed entries', () => {
        expect(normalizeLocalEvents([null, {type: 'X'}, {at: 5}, 'bad'])).toEqual([]);
        expect(normalizeLocalEvents(undefined)).toEqual([]);
    });

    test('server rows stay labelled as server history', () => {
        const rows = normalizeServerLogs([
            {id: 1, name: 'Bob', rawType: 'whatsapp call', timestamp: '2026-09-04 08:22:18'},
            {id: 2, name: 'Eve', rawType: 'sms', timestamp: '2026-09-05 08:22:18'},
            {id: 3, name: 'No time', rawType: 'sms', timestamp: null},
        ]);
        expect(rows).toHaveLength(2);
        expect(rows.every(r => r.origin === 'server')).toBe(true);
        expect(rows[0].id).toBe('server-2');
        expect(rows[1].category).toBe('CALL');
        expect(rows[1].subtitle).toBe('WHATSAPP CALL');
    });

    test('categories and relative time', () => {
        expect(categoryOf('INCOMING_CALL')).toBe('CALL');
        expect(categoryOf('AUTO_REPLY_SKIPPED')).toBe('MESSAGE');
        expect(categoryOf('ZONE_EXIT')).toBe('AUTOMATION');
        expect(formatRelativeTime(0, 30 * 1000)).toBe('Just now');
        expect(formatRelativeTime(0, 5 * 60 * 1000)).toBe('5 min ago');
        expect(formatRelativeTime(0, 3 * 3600 * 1000)).toBe('3 hr ago');
    });
});

describe('comms wrapper', () => {
    let native;
    let comms;

    beforeEach(() => {
        jest.resetModules();
        const RN = require('react-native');
        RN.Platform.OS = 'android';
        native = {
            getCommsState: jest.fn(() => Promise.resolve({emergencyContacts: [{id: 'a', name: 'Mom', number: '+91******3210'}]})),
            setCallSettings: jest.fn(s => Promise.resolve({callSettings: s})),
            setAutoReplySettings: jest.fn(s => Promise.resolve({autoReply: s})),
            pickEmergencyContact: jest.fn(() => Promise.resolve(null)),
            removeEmergencyContact: jest.fn(() => Promise.resolve({})),
            requestCallScreeningRole: jest.fn(() => Promise.resolve(true)),
            getRecentEvents: jest.fn(() => Promise.resolve([])),
            clearRecentEvents: jest.fn(() => Promise.resolve(true)),
            hasNotificationAccess: jest.fn(() => Promise.resolve(true)),
        };
        RN.NativeModules.SilentFocus = native;
        comms = require('../src/utils/comms');
    });

    afterEach(() => {
        delete require('react-native').NativeModules.SilentFocus;
    });

    test('state is normalized with defaults', async () => {
        const s = await comms.getCommsState();
        expect(s.emergencyContacts).toHaveLength(1);
        expect(s.callSettings.urgentThreshold).toBe(2);
        expect(s.callSettings.simCallMode).toBe('ring_through_dnd');
        expect(s.callSettings.urgentWindowMinutes).toBe(15);
        expect(s.autoReply.defaultTemplate).toBe(comms.DEFAULT_REPLY);
    });

    test('templates are cleaned before persisting natively', async () => {
        await comms.setAutoReplySettings({
            defaultTemplate: '   ',
            zoneTemplates: {3: "  I'm at work.  ", 7: '   '},
        });
        expect(native.setAutoReplySettings).toHaveBeenCalledWith({
            defaultTemplate: comms.DEFAULT_REPLY,
            zoneTemplates: {3: "I'm at work."},
        });
        const long = 'x'.repeat(900);
        await comms.setAutoReplySettings({defaultTemplate: long});
        expect(native.setAutoReplySettings.mock.calls[1][0].defaultTemplate).toHaveLength(comms.MAX_TEMPLATE_LENGTH);
    });

    test('zone template override with default fallback', () => {
        const ar = {defaultTemplate: 'Default', zoneTemplates: {3: 'Library', 4: ' '}};
        expect(comms.templateForZone(ar, '3')).toBe('Library');
        expect(comms.templateForZone(ar, '4')).toBe('Default');
        expect(comms.templateForZone(ar, null)).toBe('Default');
        expect(comms.templateForZone({}, null)).toBe(comms.DEFAULT_REPLY);
    });

    test('call exception blockers in priority order', () => {
        expect(comms.callExceptionBlockers({callScreening: {supported: false}})).toEqual(['UNSUPPORTED']);
        expect(
            comms.callExceptionBlockers({
                callScreening: {supported: true, held: false},
                contactsPermission: false,
                dndAccess: true,
                phoneStatePermission: false,
            }),
        ).toEqual(['SCREENING_ROLE', 'CONTACTS_PERMISSION', 'PHONE_STATE']);
        expect(
            comms.callExceptionBlockers({
                callScreening: {supported: true, held: true},
                contactsPermission: true,
                dndAccess: true,
                phoneStatePermission: true,
            }),
        ).toEqual([]);
    });

    test('urgent rule description follows the settings', () => {
        expect(comms.describeUrgentRule({urgentThreshold: 3, urgentWindowMinutes: 15})).toBe(
            'If the same number calls 3 times within 15 minutes while Silent Focus is on, the 3rd call rings.',
        );
    });

    test('activity wording does not claim notification-action delivery', () => {
        expect(describeEvent({type: 'AUTO_REPLY_SENT', app: 'WhatsApp', replyStatus: 'SENT'}).title).toBe(
            'Reply action accepted',
        );
        expect(
            describeEvent({type: 'MESSAGE_RECEIVED', app: 'Chat', replyStatus: 'SKIPPED', detail: 'AMBIGUOUS_SENDER'})
                .subtitle,
        ).toContain('Sender identity was ambiguous');
        expect(
            describeEvent({
                type: 'MESSAGE_RECEIVED',
                app: 'Chat',
                replyStatus: 'SKIPPED',
                detail: 'CONVERSATION_METADATA_MISSING',
            }).subtitle,
        ).toContain('Conversation type could not be verified');
    });

    test('role request and contact removal go to native', async () => {
        expect(await comms.requestCallScreeningRole()).toBe(true);
        await comms.removeEmergencyContact(12);
        expect(native.removeEmergencyContact).toHaveBeenCalledWith('12');
    });
});

describe('comms without the native module (iOS / tests)', () => {
    test('is a safe no-op', async () => {
        jest.resetModules();
        require('react-native').Platform.OS = 'ios';
        const comms = require('../src/utils/comms');
        expect(comms.isCommsAvailable).toBe(false);
        expect((await comms.getCommsState()).emergencyContacts).toEqual([]);
        expect(await comms.pickEmergencyContact()).toBeNull();
        expect(await comms.getLocalActivity()).toEqual([]);
    });
});

describe('Emergency Call Handling + urgent threshold 2 (JS side)', () => {
    const comms = require('../src/utils/comms');
    const {describeEvent} = require('../src/utils/activityEvents');

    test('mode ids match native; unknown or missing values read as Ring Through DND', () => {
        expect(comms.SIM_CALL_MODES).toEqual({RING_THROUGH_DND: 'ring_through_dnd', ALERT_ONLY: 'alert_only'});
        expect(comms.normalizeSimCallMode('alert_only')).toBe('alert_only');
        [undefined, null, '', 'ALERT_ONLY', 'ring', 3].forEach(v => expect(comms.normalizeSimCallMode(v)).toBe('ring_through_dnd'));
        expect(comms.DEFAULT_COMMS_STATE.callSettings.simCallMode).toBe('ring_through_dnd');
        expect(comms.DEFAULT_COMMS_STATE.callSettings.urgentThreshold).toBe(2);
    });

    test('urgent rule text: 2nd call, and what it does in each mode', () => {
        expect(comms.describeUrgentRule({urgentThreshold: 2, urgentWindowMinutes: 15})).toBe(
            'If the same number calls 2 times within 15 minutes while Silent Focus is on, the 2nd call rings.',
        );
        expect(comms.describeUrgentRule({urgentThreshold: 2, urgentWindowMinutes: 15, simCallMode: 'alert_only'})).toBe(
            'If the same number calls 2 times within 15 minutes while Silent Focus is on, the 2nd call triggers an alert.',
        );
    });

    test('Activity rows say "alert" for Alert Only and keep the old wording otherwise', () => {
        expect(describeEvent({type: 'EMERGENCY_BREAKTHROUGH', contactName: 'Mum', at: 1}).title).toBe('Emergency contact allowed');
        expect(describeEvent({type: 'EMERGENCY_BREAKTHROUGH', handling: 'alert_only', at: 1}).title).toBe('Emergency call alert');
        expect(describeEvent({type: 'URGENT_REPEAT_CALLER', repeatCount: 2, at: 1}).title).toBe('Urgent caller allowed after 2 calls');
        expect(describeEvent({type: 'URGENT_REPEAT_CALLER', repeatCount: 2, handling: 'alert_only', at: 1}).title).toBe('Urgent call alert after 2 calls');
    });
});
