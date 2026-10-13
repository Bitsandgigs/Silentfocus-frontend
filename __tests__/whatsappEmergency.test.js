/* eslint-env jest */
// Urgent client issue: Emergency Contacts and Urgent Callers for WhatsApp /
// WhatsApp Business calls (Silent Focus's own DND-exempt alert). Synthetic
// fixtures; real WhatsApp/Samsung behaviour needs the device checks.
import fs from 'fs';
import path from 'path';

import {describeEvent, normalizeLocalEvents} from '../src/utils/activityEvents';
import {DEFAULT_COMMS_STATE, normalizeCommsState, testAlertMessage, whatsAppAlertBlockers} from '../src/utils/comms';
import {toServerLog} from '../src/utils/serverSync';

const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const row = extra => ({id: 'w1', type: 'WHATSAPP_CALL', callState: 'INCOMING', app: 'WhatsApp', appPackage: 'com.whatsapp', at: 1, ...extra});

describe('Activity rows', () => {
    test('emergency WhatsApp call: name, emergency label and the honest alert outcome', () => {
        expect(describeEvent(row({emergency: true, contactName: 'Mum', displayName: 'Mum', alert: 'SENT'}))).toMatchObject({
            title: 'Mum',
            subtitle: 'Emergency contact · WhatsApp call · Alert sounded',
        });
        // WhatsApp name differs from the user's own label: both shown.
        expect(describeEvent(row({emergency: true, contactName: 'Mum', displayName: 'Priya', alert: 'SENT_SILENCED'})).subtitle).toBe(
            "Emergency contact · WhatsApp call · Your contact “Mum” · Alert shown silently (can't override Do Not Disturb)",
        );
        // No WhatsApp name: the user's own contact label.
        expect(describeEvent(row({emergency: true, contactName: 'Mum'})).title).toBe('Mum');
        expect(describeEvent(row({emergency: true, app: 'WhatsApp Business', alert: 'ALERTS_OFF'})).subtitle).toBe(
            'Emergency contact · WhatsApp Business call · No alert: WhatsApp alerts are off',
        );
    });

    test('urgent repeat caller shows the alert outcome; duplicates and rate limits are explained', () => {
        expect(describeEvent(row({repeat: true, repeatCount: 3, displayName: 'Raj', alert: 'SENT'})).subtitle).toBe(
            'Repeated WhatsApp caller · 3 calls · Alert sounded',
        );
        expect(describeEvent(row({repeat: true, repeatCount: 3, alert: 'DUPLICATE'})).subtitle).toMatch(/already sent/);
        expect(describeEvent(row({repeat: true, repeatCount: 3, alert: 'RATE_LIMIT'})).subtitle).toMatch(/too many alerts/);
        // Older rows without an alert field keep the previous wording.
        expect(describeEvent(row({repeat: true, repeatCount: 3})).subtitle).toMatch(/call back from WhatsApp/);
    });

    test('normal WhatsApp calls are unchanged', () => {
        expect(describeEvent(row({displayName: 'Raj'})).subtitle).toBe('Incoming WhatsApp call · Silenced');
    });

    test('emergency WhatsApp rows are never uploaded (local only)', () => {
        expect(toServerLog('i', row({emergency: true, contactName: 'Mum', displayName: 'Mum', alert: 'SENT'}))).toBeNull();
        expect(normalizeLocalEvents([row({emergency: true, contactName: 'Mum'})])[0].category).toBe('CALL');
    });
});

describe('settings and alert status', () => {
    test('defaults: alerts on, name matching off', () => {
        expect(DEFAULT_COMMS_STATE.callSettings.whatsAppAlertsEnabled).toBe(true);
        expect(DEFAULT_COMMS_STATE.callSettings.whatsAppNameMatch).toBe(false);
        expect(normalizeCommsState({}).whatsAppAlert.overridesDnd).toBe(false);
    });

    const ready = {
        notificationAccess: true,
        whatsAppAlert: {notificationsAllowed: true, dndAccess: true, channelExists: true, channelEnabled: true, overridesDnd: true, sound: true},
    };

    test('blockers explain exactly why the alert cannot sound', () => {
        expect(whatsAppAlertBlockers(ready)).toEqual([]);
        expect(whatsAppAlertBlockers({...ready, notificationAccess: false})).toEqual(['NOTIFICATION_ACCESS']);
        expect(whatsAppAlertBlockers({...ready, whatsAppAlert: {...ready.whatsAppAlert, overridesDnd: false}})).toEqual(['NO_DND_OVERRIDE']);
        expect(whatsAppAlertBlockers({...ready, whatsAppAlert: {...ready.whatsAppAlert, channelEnabled: false}})).toEqual(['CHANNEL_OFF']);
        expect(
            whatsAppAlertBlockers({...ready, whatsAppAlert: {...ready.whatsAppAlert, notificationsAllowed: false}}),
        ).toEqual(['NOTIFICATIONS_OFF']);
        expect(
            whatsAppAlertBlockers({...ready, whatsAppAlert: {...ready.whatsAppAlert, dndAccess: false, channelExists: false}}),
        ).toEqual(['DND_ACCESS']);
        // Feature switched off: nothing to fix.
        expect(whatsAppAlertBlockers({...ready, callSettings: {whatsAppAlertsEnabled: false}, notificationAccess: false})).toEqual([]);
    });

    test('test-alert messages never claim more than happened (Round 4: plain words)', () => {
        expect(testAlertMessage('SENT', {soundReady: 'READY', silentFocusOn: true})).toBe(
            'Alert sent. If your phone is set to Ring you should hear it. In Vibrate mode you should feel it.',
        );
        expect(testAlertMessage('SENT', {soundReady: 'SILENT_MODE', silentFocusOn: true})).toMatch(/on Silent, so the alert has no sound/);
        expect(testAlertMessage('SENT', {soundReady: 'VIBRATE', silentFocusOn: true})).toMatch(/feel the alert/);
        // Tested while Silent Focus was off: suggest the realistic test.
        expect(testAlertMessage('SENT', {soundReady: 'READY', silentFocusOn: false})).toMatch(/turn on Silent Focus, then try again/);
        expect(testAlertMessage('SENT_SILENCED')).toMatch(/may keep it silent/);
        expect(testAlertMessage('NOTIFICATIONS_OFF')).toMatch(/turned off/);
        expect(testAlertMessage('FAILED')).toMatch(/could not be shown/);
        // No jargon in any message.
        ['SENT', 'SENT_SILENCED', 'NOTIFICATIONS_OFF', 'CHANNEL_OFF', 'FAILED'].forEach(o =>
            expect(testAlertMessage(o, {})).not.toMatch(/channel|override|interruption|policy|cooldown/i),
        );
    });

    test('screen offers the switch, opt-in name matching, a test alert and the channel settings', () => {
        const screen = read('src/screens/EmergencyContactsScreen.js');
        expect(screen).toMatch(/updateCall\(\{whatsAppAlertsEnabled: v\}\)/);
        expect(screen).toMatch(/updateCall\(\{whatsAppNameMatch: v\}\)/);
        expect(screen).toMatch(/onPress=\{onTestAlert\}/);
        expect(screen).toMatch(/openWhatsAppAlertSettings\(\)/);
    });
});

describe('native safety properties', () => {
    const alert = read('android/app/src/main/java/com/SilenceFocus/comms/EmergencyCallAlert.kt');
    const recorder = read('android/app/src/main/java/com/SilenceFocus/comms/WhatsAppCalls.kt');
    const dnd = read('android/app/src/main/java/com/SilenceFocus/automation/DndController.kt');

    test('own channel that overrides DND - no DND pause, no global DND or ringer change', () => {
        expect(alert).toMatch(/setBypassDnd\(bypass\)/);
        expect(alert).toMatch(/desiredChannel\(context, NotificationManager\.IMPORTANCE_HIGH, bypass = true\)/);
        expect(alert).not.toMatch(/setInterruptionFilter|setNotificationPolicy|ringerMode\s*=(?!=)|setRingerMode|setAutomaticZenRuleState|startBreakthrough/);
        expect(recorder).not.toMatch(/startBreakthrough|setInterruptionFilter|BreakthroughRinger/);
        // The DND rule itself is unchanged by this feature.
        expect(dnd).toMatch(/\.disallowAllSounds\(\)\s*\.allowAlarms\(true\)\s*\.allowMedia\(true\)/);
    });

    test('lock screen: private notification with a public version without name or number', () => {
        expect(alert).toMatch(/setVisibility\(NotificationCompat\.VISIBILITY_PRIVATE\)/);
        expect(alert).toMatch(/setPublicVersion\(publicVersion\)/);
        expect(alert).toMatch(/lockscreenVisibility = Notification\.VISIBILITY_PRIVATE/);
    });

    test('alert stops with the call, times out, and is rate limited', () => {
        // Round 4: stopped only when no notification of that call still rings (after a short grace).
        expect(recorder).toMatch(/if \(WhatsAppCalls\.stillRinging\(comms\.waCallEpisodes, alertRef, now\)\) return/);
        expect(recorder).toMatch(/EmergencyCallAlert\.cancel\(ctx, alertRef\)/);
        expect(alert).toMatch(/setTimeoutAfter\(TIMEOUT_MS\)/);
        expect(recorder).toMatch(/WhatsAppEmergency\.limit\(comms\.waAlertsSent, key, now\)/);
        // An updated or re-posted ringing notification is handled once.
        expect(recorder).toMatch(/if \(!post\.isNew\) return null/);
    });

    test('nothing about the caller is logged; contacts permission never requested', () => {
        [alert, recorder].forEach(src =>
            [...src.matchAll(/Log\.[diwe]\(([^\n]*)\)/g)].forEach(m =>
                expect(m[1]).not.toMatch(/\bname\b|who|title|number|contact\b|ids\b|\$ref/i),
            ),
        );
        const contacts = read('android/app/src/main/java/com/SilenceFocus/comms/ContactNumbers.kt');
        expect(contacts).toMatch(/checkSelfPermission\(Manifest\.permission\.READ_CONTACTS\)/);
        expect(contacts).not.toMatch(/requestPermissions|Log\./);
    });

    test('no new permissions (no full-screen intent, no foreground service)', () => {
        const manifest = read('android/app/src/main/AndroidManifest.xml');
        expect(manifest).not.toMatch(/USE_FULL_SCREEN_INTENT|FOREGROUND_SERVICE|SYSTEM_ALERT_WINDOW|MODIFY_AUDIO_SETTINGS/);
    });
});
