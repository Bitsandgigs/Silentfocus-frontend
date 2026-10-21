/* eslint-env jest */

import fs from 'fs';
import path from 'path';

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

describe('Auto Reply safety contract', () => {
    test('enabling requires explicit consent and missing access leaves it off', () => {
        const screen = read('src/screens/SettingScreen.js');
        expect(screen).toContain('Enable automatic replies?');
        expect(screen).toContain('This can send a real reply without another confirmation.');
        expect(screen).toMatch(/if \(!comms\.notificationAccess\)[\s\S]*return;/);
        expect(screen).toMatch(/\{text: 'Enable', onPress: \(\) => saveAutoReply\(\{enabled: true\}\)\}/);
    });

    test('support remains generic to compatible messaging notifications', () => {
        const listener = read(
            'android/app/src/main/java/com/SilenceFocus/comms/SilentFocusNotificationListener.kt',
        );
        expect(listener).toContain('findReplyAction(n)');
        expect(listener).not.toMatch(/packageName\s*==\s*"com\.(whatsapp|telegram|google\.android\.apps\.messaging)/);
    });

    test('user-facing success wording claims action acceptance, not delivery', () => {
        const activity = read('src/utils/activityEvents.js');
        const sessions = read('src/screens/SessionHistoryScreen.js');
        expect(activity).toContain('Reply action accepted');
        expect(sessions).toContain('Reply actions accepted');
        expect(activity).not.toContain("return 'Auto reply sent'");
    });
});
