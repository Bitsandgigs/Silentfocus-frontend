/* eslint-env jest */
// Round 3 client feedback: #1 WhatsApp caller names, #2 sender names + one-line
// previews, #3 Automation removed from Activity, #4 all phone calendars,
// #5 radius honesty. Synthetic fixtures only - they model the journal the
// native recorder writes; they do not prove real WhatsApp / Samsung behaviour.

import fs from 'fs';
import path from 'path';

import {
    CATEGORY,
    PREVIEW_PLACEHOLDER,
    TABS,
    UNKNOWN_CALLER,
    UNKNOWN_SENDER,
    describeEvent,
    filterByTab,
    isActivityFeedRow,
    normalizeLocalEvents,
    previewLineFor,
    previewRequests,
    previewTextFor,
} from '../src/utils/activityEvents';
import {serverWritesAllowed, toServerLog} from '../src/utils/serverSync';
import {
    calendarNote,
    describeSelection,
    effectiveSelection,
    groupCalendars,
    isCalendarSelected,
    toggleCalendar,
} from '../src/utils/deviceCalendars';
import {RADIUS_PRESETS, effectiveRadius, radiusChoices, radiusLabel} from '../src/utils/zoneForm';

const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

const call = extra => ({
    id: `c-${extra.at || 1}`,
    type: 'WHATSAPP_CALL',
    app: 'WhatsApp',
    appPackage: 'com.whatsapp',
    notificationRef: 'ref-call',
    at: 1,
    ...extra,
});
const msg = extra => ({
    id: `m-${extra.at || 1}`,
    type: 'MESSAGE_RECEIVED',
    app: 'WhatsApp',
    appPackage: 'com.whatsapp',
    notificationRef: 'ref-chat',
    replyStatus: 'SKIPPED',
    detail: 'COOLDOWN',
    at: 1,
    ...extra,
});

describe('#1 WhatsApp caller names', () => {
    test('the name is the title; call type and app stay visible', () => {
        expect(describeEvent(call({callState: 'MISSED', displayName: 'Priya Sharma'}))).toEqual({
            title: 'Priya Sharma',
            subtitle: 'Missed WhatsApp call',
            summary: 'Missed WhatsApp call · Priya Sharma',
        });
        const incoming = describeEvent(call({callState: 'INCOMING', displayName: 'Acme Support', app: 'WhatsApp Business'}));
        expect(incoming.title).toBe('Acme Support');
        expect(incoming.subtitle).toBe('Incoming WhatsApp Business call · Silenced');
    });

    test('repeated callers keep the repeat information next to the name', () => {
        const d = describeEvent(call({callState: 'INCOMING', displayName: 'Priya', repeat: true, repeatCount: 4}));
        expect(d.title).toBe('Priya');
        expect(d.subtitle).toBe('Repeated WhatsApp caller · 4 calls · Silenced · call back from WhatsApp');
    });

    test('no usable name -> "Unknown caller"; never a hash, ref or heading', () => {
        [undefined, '', '   ', null].forEach(displayName => {
            const row = normalizeLocalEvents([call({callState: 'MISSED', displayName})])[0];
            expect(row.title).toBe(UNKNOWN_CALLER);
            expect(row.title).not.toMatch(/ref-|wa:|[0-9a-f]{16}/);
        });
    });

    test('rows keep timestamp, app source and the existing open behaviour', () => {
        const row = normalizeLocalEvents([call({callState: 'MISSED', displayName: 'Priya', at: 1234})])[0];
        expect(row).toMatchObject({
            at: 1234,
            appName: 'WhatsApp',
            appPackage: 'com.whatsapp',
            notificationRef: 'ref-call',
            opensPhone: false,
            category: CATEGORY.CALL,
            displayName: 'Priya',
        });
    });

    test('WhatsApp call rows (with names) are never uploaded', () => {
        expect(toServerLog('i', call({callState: 'MISSED', displayName: 'Priya'}))).toBeNull();
    });
});

describe('#2 sender names and one-line previews', () => {
    test('sender is the title; app, group and the auto-reply status are kept', () => {
        expect(describeEvent(msg({displayName: 'Rahul'}))).toMatchObject({
            title: 'Rahul',
            subtitle: 'WhatsApp · Already replied to this sender recently',
        });
        expect(describeEvent(msg({displayName: 'Rahul', groupName: 'Family', replyStatus: 'SKIPPED', detail: 'GROUP_CONVERSATION'})))
            .toMatchObject({title: 'Rahul', subtitle: 'WhatsApp group · Family · Group chats are never auto-replied'});
        // Unknown sender in a group: the group is never presented as the sender.
        expect(describeEvent(msg({groupName: 'Family'})).title).toBe(UNKNOWN_SENDER);
        expect(describeEvent(msg({app: 'WhatsApp Business', displayName: 'Shop', replyStatus: 'SENT'})).subtitle).toBe(
            'WhatsApp Business · Auto reply sent',
        );
    });

    test('auto reply rows name who was answered', () => {
        expect(describeEvent({type: 'AUTO_REPLY_SENT', app: 'WhatsApp', displayName: 'Rahul'})).toMatchObject({
            title: 'Auto reply sent',
            subtitle: 'To Rahul · WhatsApp',
        });
    });

    const journal = [
        msg({id: 'old', at: 10, messageAt: 9}),
        msg({id: 'new', at: 20, messageAt: 19}),
        {id: 'r', type: 'AUTO_REPLY_SENT', app: 'WhatsApp', appPackage: 'com.whatsapp', notificationRef: 'ref-chat', at: 21},
        msg({id: 'legacy1', at: 5, notificationRef: 'ref-legacy'}),
        msg({id: 'legacy2', at: 6, notificationRef: 'ref-legacy'}),
    ];
    const rows = normalizeLocalEvents(journal);
    const byId = id => rows.find(r => r.id === `local-${id}`);

    test('each message row asks for its own message (no newer text on an older row)', () => {
        expect(previewRequests(rows)).toEqual([
            {appPackage: 'com.whatsapp', notificationRef: 'ref-chat', messageAt: 19, key: 'ref-chat|19'},
            {appPackage: 'com.whatsapp', notificationRef: 'ref-chat', messageAt: 9, key: 'ref-chat|9'},
            // Older-format rows: only the newest of a notification asks.
            {appPackage: 'com.whatsapp', notificationRef: 'ref-legacy', key: 'ref-legacy|'},
        ]);
        const previews = {'ref-chat|19': {status: 'TEXT', text: 'Second'}, 'ref-chat|9': {status: 'GONE'}};
        expect(previewTextFor(byId('new'), previews)).toBe('Second');
        expect(previewTextFor(byId('old'), previews)).toBeNull();
        expect(previewTextFor(byId('r'), previews)).toBeNull();
        expect(previewTextFor(byId('legacy1'), {'ref-legacy|': {status: 'TEXT', text: 'x'}})).toBeNull();
    });

    test('honest placeholders - never invented text; nothing before previews were read', () => {
        expect(previewLineFor(byId('new'), {'ref-chat|19': {status: 'TEXT', text: 'Hi'}}, true)).toEqual({
            text: 'Hi',
            placeholder: false,
        });
        expect(previewLineFor(byId('old'), {'ref-chat|9': {status: 'GONE'}}, true)).toEqual({
            text: PREVIEW_PLACEHOLDER.GONE,
            placeholder: true,
        });
        expect(previewLineFor(byId('new'), {'ref-chat|19': {status: 'NONE'}}, true).text).toBe(PREVIEW_PLACEHOLDER.NONE);
        expect(previewLineFor(byId('new'), {'ref-chat|19': {status: 'LOCKED'}}, true).text).toBe(
            PREVIEW_PLACEHOLDER.LOCKED,
        );
        expect(previewLineFor(byId('new'), {}, false)).toBeNull();
        expect(previewLineFor(byId('r'), {}, true)).toBeNull();
    });

    test('the screen shows the name, then ONE ellipsized preview line, then source/status', () => {
        const screen = read('src/screens/ActivityScreen.js');
        expect(screen).toMatch(/styles\.name[^>]*numberOfLines=\{1\}/);
        expect(screen).toMatch(/numberOfLines=\{1\}\s*ellipsizeMode="tail"\s*testID=\{`activity-preview-/);
        const name = screen.indexOf('{item.title}');
        const preview = screen.indexOf('activity-preview-');
        const subtitle = screen.indexOf('{item.subtitle}', preview);
        expect(name).toBeGreaterThan(0);
        expect(preview).toBeGreaterThan(name);
        expect(subtitle).toBeGreaterThan(preview);
    });
});

describe('privacy of names and previews', () => {
    test('names and message times are never in an upload payload', () => {
        const row = toServerLog('install', {
            ...msg({displayName: 'Rahul Secret', groupName: 'Family Secret', messageAt: 5, replyStatus: 'SENT'}),
            id: 'e1',
        });
        expect(row).not.toBeNull();
        expect(JSON.stringify(row)).not.toMatch(/Secret|messageAt|displayName|groupName/);
        expect(row.sender_name).toBe('WhatsApp');
        const reply = toServerLog('install', {type: 'AUTO_REPLY_SENT', id: 'e2', at: 1, app: 'WhatsApp', displayName: 'Rahul Secret'});
        expect(JSON.stringify(reply)).not.toMatch(/Secret/);
    });

    test('JS never stores, logs or reports names or previews', () => {
        const files = [
            'src/screens/ActivityScreen.js',
            'src/utils/activityEvents.js',
            'src/utils/comms.js',
            'src/screens/SessionHistoryScreen.js',
        ];
        files.forEach(f => {
            const src = read(f);
            expect([f, /AsyncStorage/.test(src)]).toEqual([f, false]);
            expect([f, /console\.[a-z]+\([^)]*(displayName|groupName|preview)/i.test(src)]).toEqual([f, false]);
            expect([f, /reportError\([^)]*(displayName|preview)/i.test(src)]).toEqual([f, false]);
        });
        ['src/utils/serverSync.js', 'src/utils/outbox.js', 'src/utils/errorReporting.js', 'src/utils/api/api.js'].forEach(f => {
            expect([f, /displayName|groupName|preview/i.test(read(f))]).toEqual([f, false]);
        });
    });

    test('native: names are stripped from outboxes and never logged', () => {
        const store = read('android/app/src/main/java/com/SilenceFocus/automation/EngineStore.kt');
        expect(store).toMatch(/outboxJson\(e\)\.toString\(\)/);
        expect(store).toMatch(/NotificationNames\.LOCAL_ONLY_FIELDS\.forEach \{ remove\(it\) \}/);
        const sources = [
            'android/app/src/main/java/com/SilenceFocus/comms/WhatsAppCalls.kt',
            'android/app/src/main/java/com/SilenceFocus/comms/SilentFocusNotificationListener.kt',
            'android/app/src/main/java/com/SilenceFocus/comms/NotificationNames.kt',
            'android/app/src/main/java/com/SilenceFocus/comms/NotificationPreviews.kt',
        ].map(read);
        sources.forEach(src => {
            [...src.matchAll(/Log\.[diwe]\(([^\n]*)\)/g)].forEach(m =>
                expect(m[1]).not.toMatch(/\bname\b|displayName|groupName|personName|sender\.|\btitle\b|\btext\b|preview/i),
            );
        });
        // The repeated-caller notice (lock screen) never contains a name.
        const wa = sources[0];
        expect(wa).toMatch(/val \(title, text\) = WhatsAppEmergency\.repeatNoticeText\(app, count\)/);
        const emergency = read('android/app/src/main/java/com/SilenceFocus/comms/WhatsAppEmergency.kt');
        expect(emergency).toMatch(/"Repeated \$app calls" to "Someone called \$count times\. Open \$app\."/);
    });

    test('no Contacts lookup for names (no new permission)', () => {
        const names = read('android/app/src/main/java/com/SilenceFocus/comms/NotificationNames.kt');
        expect(names).not.toMatch(/ContactsContract|contentResolver/);
    });
});

describe('#3 Automation removed from the Activity feed', () => {
    const journal = [
        {id: '1', type: 'SILENCE_STARTED', source: 'ZONE', at: 1},
        {id: '2', type: 'ZONE_ENTER', name: 'Office', at: 2},
        {id: '3', type: 'SCHEDULE_STARTED', at: 3},
        {id: '4', type: 'CALENDAR_ENDED', at: 4},
        {id: '5', type: 'SILENCE_ENDED', at: 5},
        call({id: '6', callState: 'MISSED', displayName: 'Priya', at: 6}),
        msg({id: '7', displayName: 'Rahul', at: 7}),
        {id: '8', type: 'AUTOMATION_ERROR', detail: 'DND_ACCESS_MISSING', at: 8},
        {id: '9', type: 'ZONE_EXIT', name: 'Office', at: 9},
    ];
    const rows = normalizeLocalEvents(journal);

    test('tabs are All, Calls, Messages - no Automation', () => {
        expect(TABS.map(t => t.label)).toEqual(['All', 'Calls', 'Messages']);
        expect(read('src/screens/ActivityScreen.js')).not.toMatch(/label: 'Automation'|'AUTOMATION'\)/);
    });

    test('All = calls + messages (+ automation errors); starts/ends/zones are gone', () => {
        expect(filterByTab(rows, 'ALL').map(r => r.type)).toEqual(['AUTOMATION_ERROR', 'MESSAGE_RECEIVED', 'WHATSAPP_CALL']);
        expect(filterByTab(rows, 'CALL').map(r => r.id)).toEqual(['local-6']);
        expect(filterByTab(rows, 'MESSAGE').map(r => r.id)).toEqual(['local-7']);
        // A stale "AUTOMATION" tab key (old state) shows nothing rather than automation rows.
        expect(filterByTab(rows, 'AUTOMATION').filter(r => r.type !== 'AUTOMATION_ERROR')).toEqual([]);
        expect(isActivityFeedRow(rows.find(r => r.type === 'ZONE_ENTER'))).toBe(false);
    });

    test('the journal and Session History keep automation events (nothing deleted)', () => {
        expect(rows.filter(r => r.category === CATEGORY.AUTOMATION)).toHaveLength(7);
        const history = read('src/screens/SessionHistoryScreen.js');
        expect(history).toMatch(/normalizeLocalEvents\(e\)/);
        expect(history).not.toMatch(/isActivityFeedRow|filterByTab/);
        expect(history).toMatch(/\{r\.summary \|\| r\.title\}/);
        expect(describeEvent(journal[5]).summary).toBe('Missed WhatsApp call · Priya');
    });

    test('automation itself is untouched: engine still journals rule starts/ends', () => {
        const engine = read('android/app/src/main/java/com/SilenceFocus/automation/ActivityEvents.kt');
        expect(engine).toMatch(/fun ruleStarted\(source: RuleSource\)/);
        expect(engine).toMatch(/RuleSource\.ZONE -> ZONE_ENTER/);
        // The live status notification (not a history entry) is kept.
        expect(read('android/app/src/main/java/com/SilenceFocus/automation/StatusNotification.kt')).toMatch(
            /Silent Focus is active/,
        );
    });

    test('no dead UI: Clear button follows feed rows; empty text points to Session History', () => {
        const screen = read('src/screens/ActivityScreen.js');
        expect(screen).toMatch(/\{hasFeedRows \? \(/);
        expect(screen).toMatch(/Session History above/);
    });
});

describe('#4 every calendar on the phone', () => {
    const calendars = [
        {id: '1', name: 'me@gmail.com', accountName: 'me@gmail.com', provider: 'Google', visible: true, synced: true},
        {id: '2', name: 'Holidays', accountName: 'me@gmail.com', provider: 'Google', visible: false, synced: true},
        {id: '3', name: 'My calendar', accountName: 'Samsung account', provider: 'Samsung', visible: true, synced: true},
        {id: '4', name: 'Calendar', accountName: 'me@corp.com', provider: 'Outlook / Exchange', visible: true, synced: false},
        {id: '5', name: 'Birthdays', accountName: null, provider: 'On this phone', visible: true, synced: true},
    ];

    test('grouped by provider and account, Google first, nothing dropped', () => {
        const groups = groupCalendars(calendars);
        expect(groups.map(g => g.title)).toEqual(['Google', 'Samsung', 'Outlook / Exchange', 'On this phone']);
        expect(groups.flatMap(g => g.data).map(c => c.id).sort()).toEqual(['1', '2', '3', '4', '5']);
    });

    test('default (no saved choice) = visible calendars; a saved choice is exact', () => {
        expect(effectiveSelection(null, calendars)).toEqual(['1', '3', '4', '5']);
        expect(describeSelection(null, calendars)).toBe('All 4 visible calendars');
        expect(isCalendarSelected(['2'], calendars[1])).toBe(true);
        expect(describeSelection(['2', '3'], calendars)).toBe('2 of 5 calendars');
        expect(describeSelection([], calendars)).toBe('No calendars selected');
        expect(describeSelection(null, [])).toBe('No calendars on this phone');
    });

    test('toggling makes the choice explicit and supports several calendars', () => {
        expect(toggleCalendar(null, calendars, '3')).toEqual(['1', '4', '5']);
        expect(toggleCalendar(['1'], calendars, '2')).toEqual(['1', '2']);
    });

    test('honest notes for unsynced / hidden calendars', () => {
        expect(calendarNote(calendars[3])).toMatch(/Not synced to this phone/);
        expect(calendarNote(calendars[1])).toBe('Hidden in your calendar app');
        expect(calendarNote(calendars[0])).toBeNull();
    });

    test('Profile no longer offers only "Google Calendar"; picker has all states', () => {
        const profile = read('src/screens/ProfileScreen.js');
        expect(profile).not.toMatch(/calendarOptions|Choose Calendar Provider/);
        expect(profile).toMatch(/<CalendarPickerModal/);
        const picker = read('src/componentes/CalendarPickerModal.js');
        ['loading', 'permission', 'error', 'empty'].forEach(p => expect(picker).toMatch(new RegExp(`case '${p}'`)));
        expect(picker).toMatch(/disabled=\{!chosen\.length \|\| saving\}/);
    });

    test('native engine reads only the chosen calendars, still only event times', () => {
        const sync = read('android/app/src/main/java/com/SilenceFocus/automation/CalendarSync.kt');
        expect(sync).toMatch(/query\(ctx, now - LOOKBACK_MS, now \+ LOOKAHEAD_MS, store\.calendarSelection\)/);
        expect(sync).not.toMatch(/Instances\.TITLE|Events\.TITLE|DESCRIPTION|EVENT_LOCATION/);
        // No calendar writes and no OAuth.
        expect(sync).not.toMatch(/insert\(|update\(|delete\(/);
        expect(read('src/utils/deviceCalendars.js')).not.toMatch(/oauth|googleapis|APICall/i);
    });
});

describe('#5 radius honesty', () => {
    test('presets stay 100/150/200; 10 m and 50 m are not offered', () => {
        expect(RADIUS_PRESETS).toEqual([100, 150, 200]);
        expect(radiusChoices(100)).not.toContain(10);
        expect(radiusChoices(100)).not.toContain(50);
    });

    test('legacy radii are preserved and labelled honestly', () => {
        expect(radiusChoices(300)).toEqual([100, 150, 200, 300]);
        expect(radiusChoices(500)).toEqual([100, 150, 200, 500]);
        expect(effectiveRadius(50)).toBe(100);
        expect(radiusLabel(50)).toBe('50 m (monitored as 100 m)');
        expect(effectiveRadius(500)).toBe(500);
    });
});

describe('field-test build: automatic uploads off', () => {
    test('the gate refuses automatic uploads whatever the account', () => {
        expect(serverWritesAllowed({isDev: false, testAccountId: '', userId: 3, uploadsDisabled: true})).toBe(false);
        expect(serverWritesAllowed({isDev: true, testAccountId: '3', userId: 3, uploadsDisabled: true})).toBe(false);
        // Unchanged otherwise.
        expect(serverWritesAllowed({isDev: false, testAccountId: '', userId: 3, uploadsDisabled: false})).toBe(true);
    });

    test('fieldTest build type: no debug source set, uploads off, no crash reports', () => {
        const gradle = read('android/app/build.gradle');
        const block = gradle.slice(gradle.indexOf('fieldTest {'));
        expect(block).toMatch(/initWith release/);
        expect(block).toMatch(/SF_AUTOMATIC_UPLOADS_DISABLED", "true"/);
        expect(block).toMatch(/SF_ACTIVITY_TEST_HARNESS", "false"/);
        expect(block).toMatch(/SF_WHATSAPP_CALL_PROBE", "false"/);
        expect(block).toMatch(/crashlyticsEnabled = "false"/);
        expect(fs.existsSync(path.join(__dirname, '..', 'android/app/src/fieldTest'))).toBe(false);
    });
});
