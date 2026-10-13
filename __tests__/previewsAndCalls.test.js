/* eslint-env jest */
// #10 ephemeral message previews and #11 single-tap call rows.

import fs from 'fs';
import path from 'path';

import {
    CATEGORY,
    isOpenable,
    normalizeLocalEvents,
    openHint,
    previewLineFor,
    previewRequests,
    previewTextFor,
} from '../src/utils/activityEvents';

const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

const journal = [
    {id: 'm1', type: 'MESSAGE_RECEIVED', app: 'Messages', appPackage: 'com.google.android.apps.messaging', notificationRef: 'ref-a', at: 3000},
    {id: 'r1', type: 'AUTO_REPLY_SENT', app: 'Messages', appPackage: 'com.google.android.apps.messaging', notificationRef: 'ref-a', at: 3001},
    {id: 'm2', type: 'MESSAGE_RECEIVED', app: 'WhatsApp', appPackage: 'com.whatsapp', notificationRef: 'ref-b', at: 2000},
    {id: 'm3', type: 'MESSAGE_RECEIVED', app: 'Old', appPackage: 'com.old', at: 1500}, // no ref (older entry)
    {id: 'c1', type: 'INCOMING_CALL', caller: '+91******1234', detail: 'BELOW_THRESHOLD', at: 1000},
    {id: 'c2', type: 'URGENT_REPEAT_CALLER', caller: '+91******1234', repeatCount: 3, at: 1100},
    {id: 'e1', type: 'EMERGENCY_BREAKTHROUGH', contactName: 'Mum', at: 1200},
    {id: 'w1', type: 'INCOMING_CALL', appPackage: 'com.whatsapp', notificationRef: 'ref-w', at: 900}, // future #9 shape
    {id: 's1', type: 'SILENCE_STARTED', source: 'MANUAL', at: 500},
];

describe('#11 call rows', () => {
    const rows = normalizeLocalEvents(journal);
    const byId = id => rows.find(r => r.id === `local-${id}`);

    test('cellular call rows open the Phone app (single tap)', () => {
        ['c1', 'c2', 'e1'].forEach(id => {
            expect(byId(id).opensPhone).toBe(true);
            expect(isOpenable(byId(id))).toBe(true);
            expect(openHint(byId(id))).toBe("Opens the Phone app's call history");
        });
    });

    test('app call rows (WhatsApp, later) open their notification / app, not the Phone app', () => {
        const w = byId('w1');
        expect(w.opensPhone).toBe(false);
        expect(w.appPackage).toBe('com.whatsapp');
        expect(isOpenable(w)).toBe(true);
    });

    test('automation and server rows stay non-tappable', () => {
        expect(isOpenable(byId('s1'))).toBe(false);
        expect(isOpenable({origin: 'server', category: CATEGORY.CALL, opensPhone: true})).toBe(false);
    });

    test('screen: phone rows use openPhoneApp with call-history -> dialer -> message fallback', () => {
        const src = read('src/screens/ActivityScreen.js');
        expect(src).toMatch(/if \(item\.opensPhone\) \{[\s\S]*await openPhoneApp\(\)/);
        expect(src).toMatch(/result === 'DIALER'/);
        expect(src).toMatch(/No Phone app is available on this phone/);
        expect(src).toMatch(/accessibilityHint=\{openable \? openHint\(item\) : undefined\}/);
        expect(src).not.toMatch(/onLongPress|doubleTap|onDoublePress/);
    });
});

describe('#10 ephemeral previews', () => {
    const rows = normalizeLocalEvents(journal);

    test('requests: "Message received" rows with a notification ref, de-duplicated', () => {
        // Older-format rows (no message time) ask for the newest message of their notification.
        expect(previewRequests(rows)).toEqual([
            {appPackage: 'com.google.android.apps.messaging', notificationRef: 'ref-a', key: 'ref-a|'},
            {appPackage: 'com.whatsapp', notificationRef: 'ref-b', key: 'ref-b|'},
        ]);
        expect(previewRequests(null)).toEqual([]);
    });

    test('only TEXT results are shown, and only on message rows', () => {
        const previews = {
            'ref-a|': {status: 'TEXT', text: 'Are you free?'},
            'ref-b|': {status: 'GONE'},
            'ref-w|': {status: 'TEXT', text: 'should not show on a call row'},
        };
        const m1 = rows.find(r => r.id === 'local-m1');
        expect(previewTextFor(m1, previews)).toBe('Are you free?');
        expect(previewTextFor(rows.find(r => r.id === 'local-m2'), previews)).toBeNull();
        expect(previewTextFor(rows.find(r => r.id === 'local-w1'), previews)).toBeNull();
        // The auto-reply row of the same notification never repeats the preview.
        expect(previewTextFor(rows.find(r => r.id === 'local-r1'), previews)).toBeNull();
        expect(previewTextFor(m1, {'ref-a|': {status: 'LOCKED'}})).toBeNull();
        expect(previewTextFor(m1, {})).toBeNull();
    });

    test('rows themselves never carry preview text', () => {
        expect(JSON.stringify(rows)).not.toMatch(/Are you free/);
    });

    test('preview text is never persisted, logged, uploaded or reported', () => {
        const screen = read('src/screens/ActivityScreen.js');
        // Screen state only.
        expect(screen).toMatch(/const \[previews, setPreviews\] = useState\(\{\}\)/);
        const previewPath = [read('src/utils/comms.js'), screen, read('src/utils/activityEvents.js')].join('\n');
        expect(previewPath).not.toMatch(/AsyncStorage[\s\S]{0,80}preview/i);
        expect(previewPath).not.toMatch(/console\.[a-z]+\([^)]*preview/i);
        expect(previewPath).not.toMatch(/reportError\([^)]*preview/i);
        // Sync / upload / error reporting code never touches previews.
        ['src/utils/serverSync.js', 'src/utils/outbox.js', 'src/utils/errorReporting.js', 'src/utils/api/api.js'].forEach(f => {
            expect([f, /preview/i.test(read(f))]).toEqual([f, false]);
        });
    });

    test('previews are dropped on blur / background and refreshed on notification changes', () => {
        const screen = read('src/screens/ActivityScreen.js');
        expect(screen).toMatch(/const dropPreviews = useCallback\(\(\) => \{\s*setPreviews\(\{\}\);\s*setPreviewsLoaded\(false\)/);
        expect(screen).toMatch(/if \(!isFocused\) \{\s*dropPreviews\(\)/);
        expect(screen).toMatch(/s === 'active' \? schedule\(\) : dropPreviews\(\)/);
        expect(screen).toMatch(/subscribeNotificationsChanged\(schedule\)/);
        // Read aloud with the row for screen readers.
        expect(screen).toMatch(/`Message: \$\{preview\.text\}\. `/);
        // One line, ellipsized.
        expect(screen).toMatch(/numberOfLines=\{1\}\s*ellipsizeMode="tail"\s*testID=\{`activity-preview-/);
    });

    test('no new permissions for previews or the Phone app (declared set unchanged)', () => {
        const manifest = read('android/app/src/main/AndroidManifest.xml');
        const declared = [...manifest.matchAll(/<uses-permission\s+android:name="([^"]+)"(?![^>]*tools:node="remove")/g)]
            .map(m => m[1].replace('android.permission.', ''))
            .sort();
        expect(declared).toEqual([
            'ACCESS_BACKGROUND_LOCATION',
            'ACCESS_COARSE_LOCATION',
            'ACCESS_FINE_LOCATION',
            'ACCESS_NOTIFICATION_POLICY',
            'INTERNET',
            'POST_NOTIFICATIONS',
            'READ_CALENDAR',
            'READ_CONTACTS',
            'READ_PHONE_STATE',
            'RECEIVE_BOOT_COMPLETED',
            'SCHEDULE_EXACT_ALARM',
        ]);
        // Explicitly not added (and READ_SMS / READ_CALL_LOG stay removed).
        expect(manifest).not.toMatch(/RECEIVE_SENSITIVE_NOTIFICATIONS|QUERY_ALL_PACKAGES|CALL_PHONE/);
        expect(manifest).toMatch(/READ_CALL_LOG" tools:node="remove"/);
        expect(manifest).toMatch(/READ_SMS" tools:node="remove"/);
    });
});
