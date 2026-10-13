/* eslint-env jest */
// Client Issues #1, #2, #7, #8 (Batch 1).

import React from 'react';
import fs from 'fs';
import path from 'path';
import renderer, {act} from 'react-test-renderer';
import {StyleSheet, Text} from 'react-native';

import {DARK_CONTROLS as D, LIGHT_CONTROLS as L, contrastRatio} from '../src/utils/theme/controlColors';

describe('#2/#8 dark-mode control colours meet WCAG AA', () => {
    const text = [
        ['unselected pill text', D.pillText, D.pill],
        ['labels on page', D.label, D.page],
        ['secondary text on page', D.secondaryText, D.page],
        ['placeholder on input', D.placeholder, D.inputBg],
        ['placeholder on unselected pill', D.placeholder, D.pill],
        ['input text', D.inputText, D.inputBg],
        ['selected schedule pill text', D.scheduleSelectedText, D.scheduleSelected],
        ['time value on selected pill', D.timeValueText, D.scheduleSelected],
        ['selected zone chip text', D.zoneSelectedText, D.zoneSelected],
    ];
    test.each(text)('%s >= 4.5:1', (_, fg, bg) => {
        expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(4.5);
    });

    const indicators = [
        ['selected schedule pill vs page', D.scheduleSelected, D.page],
        ['selected schedule pill vs unselected', D.scheduleSelected, D.pill],
        ['selected zone chip vs unselected', D.zoneSelected, D.pill],
        ['back icon on page', D.icon, D.page],
    ];
    test.each(indicators)('%s >= 3:1', (_, a, b) => {
        expect(contrastRatio(a, b)).toBeGreaterThanOrEqual(3);
    });

    test('approved copper #9A5F28 with white text passes (5.2:1)', () => {
        expect(D.scheduleSelected).toBe('#9A5F28');
        expect(contrastRatio('#FFFFFF', '#9A5F28')).toBeCloseTo(5.2, 1);
    });

    test('light-mode layout colours kept; only the AA fixes (Batch 3) differ', () => {
        expect(L).toMatchObject({
            pill: '#5555551F',
            pillText: '#000000',
            scheduleSelected: '#9A5F28', // Batch 3 (was #B87333, 3.8:1)
            scheduleSelectedText: '#FFFFFF',
            timeValueText: '#FFFFFF', // Batch 3 (on the selected copper)
            placeholder: '#706C6C',
            zoneSelected: '#ff6600',
            zoneSelectedText: '#111111', // Batch 3 (was white, 2.9:1)
            icon: '#000000',
            label: null,
        });
    });

    test('contrast helper matches known WCAG values', () => {
        expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 1);
        expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5);
    });
});

describe('#2 CustomTextInputView: the caller\'s text colour wins', () => {
    const CustomTextInputView = require('../src/componentes/CustomTextInputView/CustomTextInputView').default;
    const colorOf = tree => {
        const texts = tree.root.findAllByType(Text).filter(t => t.props.numberOfLines === 1);
        return StyleSheet.flatten(texts[0].props.style).color;
    };

    test('a set value uses textStyle.color (was forced to black)', () => {
        let tree;
        act(() => {
            tree = renderer.create(
                <CustomTextInputView value="08:00 AM" type="dropdown" placeholder="Select" textStyle={{color: '#FFFFFF'}} />,
            );
        });
        expect(colorOf(tree)).toBe('#FFFFFF');
    });

    test('without textStyle the defaults stay (black value, grey placeholder)', () => {
        let tree;
        act(() => {
            tree = renderer.create(<CustomTextInputView value="" type="dropdown" placeholder="Select" />);
        });
        expect(colorOf(tree)).toBe('#706C6C');
        act(() => {
            tree.update(<CustomTextInputView value="09:00 AM" type="dropdown" placeholder="Select" />);
        });
        expect(colorOf(tree)).toBe('#000000');
    });
});

describe('#7 Privacy & Data actions (shared)', () => {
    let actions;
    let alerts;
    beforeEach(() => {
        jest.resetModules();
        alerts = [];
        jest.doMock('../src/function/Alert', () => ({showAlert: (t, m) => alerts.push(m)}));
        actions = require('../src/utils/privacyActions');
    });

    test('clear activity asks first; Cancel does nothing', () => {
        const alert = jest.fn();
        const clear = jest.fn();
        actions.confirmClearActivity({clear, alert});
        const [title, message, buttons] = alert.mock.calls[0];
        expect(title).toBe('Clear activity history?');
        expect(message).toMatch(/nothing is deleted from your account/);
        expect(buttons.map(b => b.text)).toEqual(['Cancel', 'Clear']);
        expect(clear).not.toHaveBeenCalled();
    });

    test.each([
        [{ok: true, kept: 0}, 'Activity history was cleared.'],
        [{ok: true, kept: 2}, /except 2 item\(s\) not yet backed up/],
        [{ok: false, reason: 'SYNC_FAILED'}, /hasn't been backed up/],
    ])('Clear uses the safe clear and reports %p', async (result, expected) => {
        const alert = jest.fn();
        const clear = jest.fn(() => Promise.resolve(result));
        actions.confirmClearActivity({clear, alert});
        await alert.mock.calls[0][2][1].onPress();
        expect(clear).toHaveBeenCalledTimes(1);
        expect(alerts[0]).toEqual(expected instanceof RegExp ? expect.stringMatching(expected) : expected);
    });

    test('default clear is clearLocalActivitySafely (sync + read-back protections kept)', () => {
        const src = fs.readFileSync(path.join(__dirname, '../src/utils/privacyActions.js'), 'utf8');
        expect(src).toMatch(/clear = clearLocalActivitySafely/);
    });

    test('clear learned locations: immediate (as before), reports success or failure', async () => {
        expect(await actions.clearLearnedNow({clear: () => Promise.resolve({placeCount: 0})})).toEqual({placeCount: 0});
        expect(alerts.pop()).toBe('Learned locations were cleared.');
        expect(await actions.clearLearnedNow({clear: () => Promise.reject(new Error('x'))})).toBeNull();
        expect(alerts.pop()).toBe('Learned locations could not be cleared.');
    });
});

describe('#7 layout: sections live only in the Accounts tab', () => {
    const read = f => fs.readFileSync(path.join(__dirname, '../src/screens', f), 'utf8');

    test('Accounts: live Permissions + Privacy & Data; static Active Permissions row gone; account controls kept', () => {
        const src = read('ProfileScreen.js');
        expect(src).toMatch(/<PermissionHub \/>/);
        expect(src).toMatch(/title="Privacy & Data"/);
        expect(src).toMatch(/confirmClearActivity\(\)/);
        expect(src).toMatch(/Clear learned locations/);
        expect(src).not.toMatch(/Active Permissions/);
        expect(src).toMatch(/Add or Change Password/);
        expect(src).toMatch(/onPress=\{onPressDeleteAccount\}/);
        expect(src).toMatch(/onPress=\{\(\) => onPressLogOut\(\)\}/);
        // Order: Permissions -> Privacy & Data -> Legal -> Account -> Logout.
        const order = ['<PermissionHub />', 'title="Privacy & Data"', 'title="Legal"', 'title="Account"', '{/* Logout */}'].map(t => src.indexOf(t));
        expect(order.every((v, i) => v > 0 && (i === 0 || v > order[i - 1]))).toBe(true);
    });

    test('Control: no Permissions / Privacy & Data sections and no Clear learned locations button', () => {
        const src = read('SettingScreen.js');
        expect(src).not.toMatch(/PermissionHub/);
        expect(src).not.toMatch(/PRIVACY & DATA/);
        expect(src).not.toMatch(/>\s*\{?`?Clear learned locations/);
        expect(src).not.toMatch(/onPress=\{onClearActivity\}/);
        // Still offered when learning is turned off.
        expect(src).toMatch(/onPress: onClearLearned/);
    });
});

describe('#1 app name', () => {
    test('Android app_name and iOS display name are "Silent Focus"; application id unchanged', () => {
        const strings = fs.readFileSync(path.join(__dirname, '../android/app/src/main/res/values/strings.xml'), 'utf8');
        expect(strings).toMatch(/<string name="app_name">Silent Focus<\/string>/);
        const plist = fs.readFileSync(path.join(__dirname, '../ios/Silence_Focus/Info.plist'), 'utf8');
        expect(plist).toMatch(/<key>CFBundleDisplayName<\/key>\s*<string>Silent Focus<\/string>/);
        const gradle = fs.readFileSync(path.join(__dirname, '../android/app/build.gradle'), 'utf8');
        expect(gradle).toMatch(/applicationId "com\.SilenceFocus"/);
    });
});
