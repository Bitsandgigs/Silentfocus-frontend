/* eslint-env jest */
// Round 4: Important WhatsApp Calls – simpler settings (#B), short test
// notification (#C) and the "Check WhatsApp Call Alerts" diagnostic (#A).
// Synthetic data only; real WhatsApp on a Samsung still needs the device test.
import fs from 'fs';
import path from 'path';
import React from 'react';
import renderer, {act} from 'react-test-renderer';
import * as RN from 'react-native';

RN.Platform.OS = 'android';

const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

const native = {
    getCommsState: jest.fn(),
    setCallSettings: jest.fn(),
    sendTestWhatsAppAlert: jest.fn(),
    openWhatsAppAlertSettings: jest.fn(() => Promise.resolve(true)),
    startWhatsAppCallCheck: jest.fn(),
    getWhatsAppCallCheck: jest.fn(),
    stopWhatsAppCallCheck: jest.fn(),
};
RN.NativeModules.SilentFocus = native;

jest.mock('@react-navigation/native', () => ({useNavigation: () => ({goBack: jest.fn(), navigate: jest.fn()})}));
jest.mock('react-native-safe-area-context', () => {
    const {View} = require('react-native');
    return {SafeAreaView: View};
});
jest.mock('react-native-permissions', () => ({
    PERMISSIONS: {ANDROID: {}},
    RESULTS: {},
    openSettings: jest.fn(() => Promise.resolve()),
    request: jest.fn(() => Promise.resolve('granted')),
}));
jest.mock('../src/utils/silentFocusEngine', () => ({openDndAccessSettings: jest.fn()}));
jest.mock('../src/assets/svgs/Back', () => () => null);

const {describeCallCheck, testAlertMessage} = require('../src/utils/comms');

const settings = {urgentThreshold: 3, urgentWindowMinutes: 15, urgentEnabled: true, emergencyEnabled: true};
const base = {exists: true, running: false, notificationAccess: true, soundReady: 'READY', silentFocusOn: 1, alertStoppedAfterMs: -1};
const values = r => Object.fromEntries(describeCallCheck(r, settings).rows.map(x => [x.key, x.value]));

describe('Check WhatsApp Call Alerts – result wording', () => {
    test('six plain rows with Yes / No / Not applicable / Cannot determine', () => {
        const d = describeCallCheck({...base}, settings);
        expect(d.rows.map(r => r.label)).toEqual([
            'WhatsApp call detected',
            'Caller recognised',
            'Emergency contact matched',
            'Urgent repeat-call rule reached',
            'Alert attempted',
            'Sound settings appear ready',
        ]);
        expect(values({...base, soundReady: 'UNKNOWN'}).sound).toBe('Cannot determine');
        expect(values({...base, ringing: true, emergencyMatched: true}).urgent).toBe('Not applicable');
        expect(values({...base, ringing: true, callerIdentified: true, repeatCount: 2}).urgent).toBe('No – call 2 of 3');
    });

    test('no call detected: notification access first, then what was seen', () => {
        expect(describeCallCheck({...base, notificationAccess: false}, settings)).toMatchObject({
            summary: 'No WhatsApp call was detected. Please check notification access.',
            action: 'NOTIFICATION_ACCESS',
        });
        expect(describeCallCheck({...base, running: true}, settings).summary).toBe(
            'Ask someone to call you on WhatsApp while this check is running.',
        );
        expect(describeCallCheck({...base, callLikeSeen: true}, settings).summary).toMatch(/could not tell that it was ringing/);
        expect(describeCallCheck({...base, waSeen: true}, settings).summary).toMatch(/notifications arrived, but no call/);
    });

    test('detected but not identified / name-only / not an emergency contact', () => {
        const ringing = {...base, ringing: true};
        expect(describeCallCheck(ringing, settings).summary).toBe("We detected the call, but couldn't identify who was calling.");
        expect(describeCallCheck({...ringing, callerIdentified: true, nameWouldMatch: true}, settings)).toMatchObject({
            action: 'NAME_MATCH',
            summary: expect.stringMatching(/only showed the caller’s name/),
        });
        expect(describeCallCheck({...ringing, callerIdentified: true}, settings).summary).toMatch(/not on your emergency contacts list/);
        expect(describeCallCheck({...ringing, silentFocusOn: 0}, settings).summary).toMatch(/Silent Focus was off/);
    });

    test('recognised: alert outcomes are never overstated', () => {
        const ok = {...base, ringing: true, callerIdentified: true, emergencyMatched: true};
        expect(describeCallCheck({...ok, alertAttempted: true, alertOutcome: 'SENT'}, settings).summary).toBe(
            'We recognised your emergency contact and played the alert. Did you hear it?',
        );
        expect(describeCallCheck({...ok, alertAttempted: true, alertOutcome: 'SENT', soundReady: 'BLOCKED'}, settings).summary).toBe(
            'We recognised your emergency contact, but your phone settings may have silenced the alert.',
        );
        expect(describeCallCheck({...ok, alertAttempted: true, alertOutcome: 'SENT_SILENCED'}, settings).action).toBe('SETTINGS');
        expect(describeCallCheck({...ok, alertAttempted: true, alertOutcome: 'SENT', alertStoppedAfterMs: 1200}, settings).summary).toMatch(
            /WhatsApp stopped ringing after 1 second/,
        );
        expect(describeCallCheck({...ok, alertOutcome: 'ALERTS_OFF'}, settings).summary).toMatch(/no alert was played/);
        const urgent = {...base, ringing: true, callerIdentified: true, urgentReached: true, repeatCount: 3};
        expect(values(urgent).urgent).toBe('Yes');
        expect(describeCallCheck({...urgent, alertAttempted: true, alertOutcome: 'SENT'}, settings).summary).toMatch(/a repeat caller/);
    });

    test('results never contain caller details (only yes/no facts reach JS)', () => {
        const module = read('android/app/src/main/java/com/SilenceFocus/SilentFocusModule.kt');
        const fn = module.slice(module.indexOf('private fun callCheckState'), module.indexOf('/** {enabled, messagingEnabled'));
        expect(fn).not.toMatch(/displayName|contactName|personName|notificationKey|"refs"|"number"|"title"|"name"/);
    });
});

describe('Important WhatsApp Calls screen (#B)', () => {
    const screen = read('src/screens/EmergencyContactsScreen.js');

    test('plain wording; technical clutter is gone', () => {
        [
            'Important WhatsApp Calls',
            'Get an alert when an emergency contact calls you on WhatsApp, or when someone calls repeatedly.',
            'Get an alert when someone on your emergency contacts list calls you.',
            'Try an Alert',
            'Check how an important call alert sounds on your phone.',
            'Alert Sound & Settings',
            'Important call alerts may be silent. Check your sound settings.',
            'Check Settings',
            'Some WhatsApp calls only show a name. You can allow Silent Focus to use that name to',
        ].forEach(t => expect(screen).toContain(t));
        expect(screen).toMatch(/Silent Focus plays a special alert for important WhatsApp calls\. Set your phone to Ring to\s+hear it, or Vibrate to feel it\./);
        expect(screen).toMatch(/Get an alert when the same person calls \{cs\.urgentThreshold\} times within\{' '\}\s+\{cs\.urgentWindowMinutes\} minutes\./);
        const wa = screen.slice(screen.indexOf('Important WhatsApp Calls'), screen.indexOf('{state.callScreening.held ? ('));
        ['Send test alert', 'Alert sound & Do Not Disturb', '45 seconds', 'five every 10 minutes', 'channel', 'DND', 'cooldown'].forEach(t =>
            expect(wa).not.toContain(t),
        );
    });

    const ready = {
        callSettings: {
            emergencyEnabled: true, urgentEnabled: true, urgentThreshold: 3, urgentWindowMinutes: 15,
            urgentCooldownMinutes: 15, whatsAppAlertsEnabled: true, whatsAppNameMatch: false,
        },
        whatsAppAlert: {notificationsAllowed: true, dndAccess: true, channelExists: true, channelEnabled: true, overridesDnd: true, sound: true, soundReady: 'READY', silentFocusOn: true},
        emergencyContacts: [{id: 'c1', name: 'Test Contact', number: '+44******0123'}],
        callScreening: {supported: true, held: true},
        notificationAccess: true, contactsPermission: true, phoneStatePermission: true, dndAccess: true,
    };

    const renderScreen = async state => {
        native.getCommsState.mockResolvedValue(state);
        native.getWhatsAppCallCheck.mockResolvedValue({exists: false});
        const Screen = require('../src/screens/EmergencyContactsScreen').default;
        let tree;
        await act(async () => {
            tree = renderer.create(<Screen />);
        });
        await act(async () => {});
        return tree;
    };
    const texts = tree => tree.root.findAll(n => typeof n.props.children === 'string' || Array.isArray(n.props.children))
        .filter(n => n.type === 'Text')
        .map(n => [].concat(n.props.children).join(''));

    test('renders the simple section; no warning when everything is ready; diagnostic off until tapped', async () => {
        const tree = await renderScreen(ready);
        const all = texts(tree).join('\n');
        expect(all).toContain('Important WhatsApp Calls');
        expect(all).toContain('Urgent Repeat Calls');
        expect(all).toContain('Get an alert when the same person calls 3 times within 15 minutes.');
        expect(all).not.toContain('Important call alerts may be silent');
        expect(tree.root.findAllByProps({testID: 'wa-call-check-start'}).length).toBeGreaterThan(0);
        expect(native.startWhatsAppCallCheck).not.toHaveBeenCalled();
        tree.unmount();
    });

    test('missing setup shows one short warning with Check Settings', async () => {
        const tree = await renderScreen({...ready, whatsAppAlert: {...ready.whatsAppAlert, overridesDnd: false}});
        const all = texts(tree).join('\n');
        expect(all).toContain('Important call alerts may be silent. Check your sound settings.');
        expect(all).toContain('Check Settings');
        tree.unmount();
    });

    test('Try an Alert shows a plain message', async () => {
        const {Alert} = require('react-native');
        const spy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
        native.sendTestWhatsAppAlert.mockResolvedValue('SENT');
        const tree = await renderScreen(ready);
        const button = tree.root.findAllByProps({testID: 'wa-test-alert'})[0];
        await act(async () => button.props.onPress());
        expect(spy).toHaveBeenCalledWith('Try an Alert', expect.stringMatching(/^Alert sent\. If your phone is set to Ring/));
        spy.mockRestore();
        tree.unmount();
    });
});

describe('notification text (#C)', () => {
    const emergency = read('android/app/src/main/java/com/SilenceFocus/comms/WhatsAppEmergency.kt');
    const alert = read('android/app/src/main/java/com/SilenceFocus/comms/EmergencyCallAlert.kt');

    test('test notification: short title and body', () => {
        expect(emergency).toContain('const val TEST_TITLE = "Important Call Alert Test"');
        expect(emergency).toContain('const val TEST_TEXT = "This is the alert for important WhatsApp calls."');
        expect(alert).toMatch(/setContentTitle\(WhatsAppEmergency\.TEST_TITLE\)\s*\.setContentText\(WhatsAppEmergency\.TEST_TEXT\)/);
        expect(alert).not.toContain('This is how an emergency or urgent WhatsApp call will sound');
    });

    test('regression: re-registering the channel (rename) never drops "override Do Not Disturb"', () => {
        const ensure = alert.slice(alert.indexOf('fun ensureChannel'), alert.indexOf('private fun desiredChannel'));
        // Every createNotificationChannel call passes the full desired channel, never a bare NotificationChannel.
        expect(ensure).not.toMatch(/createNotificationChannel\(\s*NotificationChannel\(/);
        expect(ensure).toMatch(/createNotificationChannel\(desiredChannel\(context, existing\.importance, bypass = dndAccess \|\| existing\.canBypassDnd\(\)\)\)/);
        expect(ensure).toMatch(/dndAccess && !existing\.canBypassDnd\(\)/);
    });

    test('real alerts: the title says it all; lock screen has no name', () => {
        expect(emergency).toContain('Kind.EMERGENCY -> "Emergency call on $app" to "Your emergency contact is calling."');
        expect(emergency).toContain('Kind.URGENT -> "Urgent call on $app" to "Someone called $repeatCount times."');
        expect(alert).toMatch(/setPublicVersion\(publicVersion\)/);
        expect(alert).toMatch(/BigTextStyle\(\)\.bigText\(text\)/);
    });

    test('testAlertMessage stays plain', () => {
        expect(testAlertMessage('SENT', {soundReady: 'READY', silentFocusOn: true})).not.toMatch(/Do Not Disturb|channel/);
    });
});

describe('diagnostic privacy and lifecycle (native source)', () => {
    const check = read('android/app/src/main/java/com/SilenceFocus/comms/WhatsAppCallCheck.kt');
    const store = read('android/app/src/main/java/com/SilenceFocus/comms/CommsStore.kt');

    test('off by default, short window, auto-delete, cleared at logout, no upload or logging', () => {
        expect(check).toMatch(/const val DURATION_MS = 5 \* 60_000L/);
        expect(check).toMatch(/const val KEEP_MS = 30 \* 60_000L/);
        expect(store).toMatch(/WhatsAppCallCheck\.KEY,/);
        expect(check).not.toMatch(/Log\.[a-z]\(|HttpURLConnection|OkHttp|fetch\(|Outbox/);
        expect(check).not.toMatch(/EXTRA_TEXT|EXTRA_TITLE|getCharSequence/);
    });

    test('no new permissions or services', () => {
        const manifest = read('android/app/src/main/AndroidManifest.xml');
        expect(manifest).not.toMatch(/USE_FULL_SCREEN_INTENT|FOREGROUND_SERVICE|SYSTEM_ALERT_WINDOW|MODIFY_AUDIO_SETTINGS|ACCESS_NOTIFICATION_POLICY_OVERRIDE/);
    });
});

describe('activity recreation (font / display size change)', () => {
    test('MainActivity never restores react-native-screens fragments', () => {
        const main = read('android/app/src/main/java/com/SilenceFocus/MainActivity.kt');
        expect(main).toMatch(/super\.onCreate\(null\)/);
        expect(main).not.toMatch(/super\.onCreate\(savedInstanceState\)/);
    });
});
