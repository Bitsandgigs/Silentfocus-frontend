/* eslint-env jest */
// Activity Center message rows open their source notification / app.

import {isOpenable, normalizeLocalEvents} from '../src/utils/activityEvents';

describe('openable activity rows', () => {
    const events = [
        {id: 'm1', type: 'MESSAGE_RECEIVED', app: 'WhatsApp', appPackage: 'com.whatsapp', notificationRef: 'abc123', replyStatus: 'SKIPPED', detail: 'DISABLED', at: 3000},
        {id: 'm0', type: 'MESSAGE_RECEIVED', app: 'Messages', appPackage: 'com.google.android.apps.messaging', at: 2500}, // pre-fix entry: no ref
        {id: 'r1', type: 'AUTO_REPLY_SENT', app: 'WhatsApp', appPackage: 'com.whatsapp', notificationRef: 'abc123', at: 2000},
        {id: 'c1', type: 'INCOMING_CALL', caller: '+91******1234', appPackage: 'com.android.dialer', at: 1500},
        {id: 's1', type: 'SILENCE_STARTED', source: 'MANUAL', at: 1000},
    ];

    test('message rows keep package, app name and notification ref', () => {
        const [m1, m0, r1] = normalizeLocalEvents(events);
        expect(m1).toMatchObject({title: 'Unknown sender', subtitle: 'WhatsApp', appPackage: 'com.whatsapp', appName: 'WhatsApp', notificationRef: 'abc123'});
        expect(isOpenable(m1)).toBe(true);
        // Older journal entries without a ref still open the app.
        expect(m0).toMatchObject({appPackage: 'com.google.android.apps.messaging', notificationRef: null});
        expect(isOpenable(m0)).toBe(true);
        expect(isOpenable(r1)).toBe(true);
    });

    test('automation and server rows are not openable; phone call rows open the Phone app (#11)', () => {
        const rows = normalizeLocalEvents(events);
        // This fixture names a package; such rows open that app (native cellular
        // entries carry none and open the Phone app's call history instead).
        const call = rows.find(r => r.type === 'INCOMING_CALL');
        expect(isOpenable(call)).toBe(true);
        expect(call.opensPhone).toBe(false);
        expect(call.appPackage).toBe('com.android.dialer');
        expect(isOpenable(rows.find(r => r.type === 'SILENCE_STARTED'))).toBe(false);
        expect(isOpenable({origin: 'server', appPackage: 'com.whatsapp'})).toBe(false);
        expect(isOpenable(null)).toBe(false);
    });

    test('rows never carry message text', () => {
        const [m1] = normalizeLocalEvents([{...events[0], text: 'secret'}]);
        expect(JSON.stringify(m1)).not.toContain('secret');
    });
});

describe('openActivitySource', () => {
    let native;
    let comms;

    beforeEach(() => {
        jest.resetModules();
        const RN = require('react-native');
        RN.Platform.OS = 'android';
        native = {openActivitySource: jest.fn(() => Promise.resolve('NOTIFICATION'))};
        RN.NativeModules.SilentFocus = native;
        comms = require('../src/utils/comms');
    });

    afterEach(() => {
        delete require('react-native').NativeModules.SilentFocus;
    });

    test('passes package and ref to native', async () => {
        await expect(comms.openActivitySource('com.whatsapp', 'abc123')).resolves.toBe('NOTIFICATION');
        expect(native.openActivitySource).toHaveBeenCalledWith('com.whatsapp', 'abc123');
    });

    test('missing ref is sent as null (native falls back to the app)', async () => {
        native.openActivitySource.mockResolvedValueOnce('APP');
        await expect(comms.openActivitySource('com.whatsapp')).resolves.toBe('APP');
        expect(native.openActivitySource).toHaveBeenCalledWith('com.whatsapp', null);
    });

    test('no package or native failure resolves UNAVAILABLE', async () => {
        await expect(comms.openActivitySource(null, 'abc')).resolves.toBe('UNAVAILABLE');
        expect(native.openActivitySource).not.toHaveBeenCalled();
        native.openActivitySource.mockRejectedValueOnce(new Error('boom'));
        await expect(comms.openActivitySource('com.whatsapp', 'abc')).resolves.toBe('UNAVAILABLE');
    });
});
