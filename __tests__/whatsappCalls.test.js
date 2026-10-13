/* eslint-env jest */
// #9 / #6: WhatsApp call rows in the Activity Center (local only).
import {categoryOf, CATEGORY, describeEvent, isOpenable, normalizeLocalEvents, openHint} from '../src/utils/activityEvents';
import {toServerLog} from '../src/utils/serverSync';

const row = extra => ({id: '1-1-WHATSAPP_CALL', type: 'WHATSAPP_CALL', app: 'WhatsApp', appPackage: 'com.whatsapp', notificationRef: 'r1', at: 1, ...extra});

test('WhatsApp calls are calls, shown per state; without a recorded name: "Unknown caller", never a number', () => {
    expect(categoryOf('WHATSAPP_CALL')).toBe(CATEGORY.CALL);
    expect(describeEvent(row({callState: 'INCOMING'}))).toEqual({
        title: 'Unknown caller',
        subtitle: 'Incoming WhatsApp call · Silenced',
        summary: 'Incoming WhatsApp call · Unknown caller',
    });
    expect(describeEvent(row({callState: 'MISSED'})).subtitle).toBe('Missed WhatsApp call');
    expect(describeEvent(row({callState: 'INCOMING', app: 'WhatsApp Business'})).subtitle).toBe(
        'Incoming WhatsApp Business call · Silenced',
    );
    expect(describeEvent(row({callState: 'INCOMING', repeat: true, repeatCount: 3})).subtitle).toMatch(
        /^Repeated WhatsApp caller · 3 calls · Silenced/,
    );
});

test('tapping opens WhatsApp (its notification, else the app) - not the Phone app', () => {
    const [r] = normalizeLocalEvents([row({callState: 'INCOMING'})]);
    expect(r).toMatchObject({appPackage: 'com.whatsapp', notificationRef: 'r1', opensPhone: false, category: CATEGORY.CALL});
    expect(isOpenable(r)).toBe(true);
    expect(openHint(r)).toBe('Opens WhatsApp');
});

test('WhatsApp call rows are never uploaded', () => {
    expect(toServerLog('i', row({callState: 'INCOMING'}))).toBeNull();
    expect(toServerLog('i', row({callState: 'MISSED'}))).toBeNull();
});

test('cellular call rows still open the Phone app', () => {
    const [r] = normalizeLocalEvents([{id: '2', type: 'INCOMING_CALL', caller: '+91******1234', at: 2}]);
    expect(r.opensPhone).toBe(true);
});
