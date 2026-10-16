/* eslint-env jest */
// #4: the Control Center texts follow the unchanged zone rule (zonesEnabledFor).
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
import {describeControlModes, zonesEnabledFor} from '../src/utils/automationSync';

const cases = [];
for (const locationMode of [false, true]) {
    for (const customMode of [false, true, undefined]) {
        for (const customModeConfirmed of [false, true, undefined]) {
            for (const device of [false, true]) cases.push([{locationMode, customMode, customModeConfirmed}, device]);
        }
    }
}

test('zonesActive is exactly zonesEnabledFor for every combination (no semantic change)', () => {
    cases.forEach(([m, d]) => expect(describeControlModes(m, d).zonesActive).toBe(zonesEnabledFor(m, d)));
});

test('legacy account (not confirmed): needs Location AND Custom, and says so', () => {
    const paused = describeControlModes({locationMode: false, customMode: true, customModeConfirmed: false});
    expect(paused.zonesActive).toBe(false);
    expect(paused.legacyRule).toBe(true);
    expect(paused.customStatus).toMatch(/also need Location Mode/);
    expect(paused.locationText).toMatch(/also has to be on/);
    expect(describeControlModes({locationMode: true, customMode: true, customModeConfirmed: false}).zonesActive).toBe(true);
});

test('confirmed account: Custom alone; Location text has no legacy note', () => {
    const on = describeControlModes({locationMode: false, customMode: true, customModeConfirmed: true});
    expect(on.zonesActive).toBe(true);
    expect(on.customStatus).toBe('Your Silent Zones are on.');
    expect(on.locationText).not.toMatch(/also has to be on/);
    // Device marker counts only when the server doesn't report the flag.
    expect(describeControlModes({locationMode: false, customMode: true}, true).zonesActive).toBe(true);
    expect(describeControlModes({locationMode: false, customMode: true, customModeConfirmed: false}, true).zonesActive).toBe(false);
});

test('Location Mode text describes public-place silencing', () => {
    const text = describeControlModes({locationMode: true, customMode: false, customModeConfirmed: true}).locationText;
    expect(text).toMatch(/library or place of worship/);
    expect(text).not.toMatch(/isn't available yet/);
});

test('public places get their own labels everywhere', () => {
    const {describeEngineState} = require('../src/utils/engineStatus');
    const {SOURCE_LABELS} = require('../src/utils/sessionHistory');
    const state = {
        dndAccess: true,
        silentActive: true,
        source: 'PLACE',
        activeRules: [{source: 'PLACE', name: 'City Library'}],
    };
    expect(describeEngineState(state).detail).toBe('Public place: City Library');
    expect(SOURCE_LABELS.PLACE).toBe('Public place');
    const paused = describeEngineState({dndAccess: true, silentActive: false, suppressedRules: [{source: 'PLACE'}]});
    expect(paused.detail).toBe('Public place paused until you leave it');
});
