/* eslint-env jest */
// Remaining accessibility/contrast fixes (after Batch 1): Save Zone, zone
// category tags, Accounts light secondary text, light Cancel, Confirm,
// status-bar icons in dark mode.

import React from 'react';
import fs from 'fs';
import path from 'path';
import renderer, {act} from 'react-test-renderer';
import {StyleSheet, TouchableHighlight} from 'react-native';

import {DARK_CONTROLS as D, LIGHT_CONTROLS as L, contrastRatio} from '../src/utils/theme/controlColors';

const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

/** #RRGGBB of #RRGGBBAA drawn over an opaque #RRGGBB. */
const over = (rgba, base) => {
    const h = rgba.replace('#', '');
    const b = base.replace('#', '');
    const a = parseInt(h.slice(6, 8), 16) / 255;
    return (
        '#' +
        [0, 2, 4]
            .map(i => Math.round(parseInt(h.slice(i, i + 2), 16) * a + parseInt(b.slice(i, i + 2), 16) * (1 - a)))
            .map(v => v.toString(16).padStart(2, '0'))
            .join('')
    );
};

describe('contrast targets (WCAG AA 4.5:1 for text)', () => {
    test.each([
        ['Save Zone: #111111 on #FF6600', '#111111', '#ff6600'],
        ['category tag: white on #A8550A', '#FFFFFF', '#A8550A'],
        ['light Cancel text on white', L.cancelText, '#FFFFFF'],
        ['dark Cancel text on the dark page', D.cancelText, D.page],
        ['light Confirm: white on button', '#FFFFFF', L.confirmBg],
        ['dark Confirm: white on button', '#FFFFFF', D.confirmBg],
        ['light Accounts secondary text on the card', L.mutedText, over('#2E3A3E14', '#FFFFFF')],
        ['light Accounts secondary text on the page', L.mutedText, '#FFFFFF'],
        ['dark Accounts secondary text (unchanged) on the page', D.mutedText, D.page],
    ])('%s', (_, fg, bg) => {
        expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(4.5);
    });

    test('previous values really failed (so the change is needed)', () => {
        expect(contrastRatio('#FFFFFF', '#ff6600')).toBeLessThan(4.5);
        expect(contrastRatio('#FFFFFF', '#d46c0d')).toBeLessThan(4.5);
        expect(contrastRatio('#D6721E', '#FFFFFF')).toBeLessThan(4.5);
        expect(contrastRatio('#FFFFFF', '#B87333')).toBeLessThan(4.5);
        expect(contrastRatio('#999999', over('#2E3A3E14', '#FFFFFF'))).toBeLessThan(4.5);
    });
});

describe('styles use the new colours (design kept)', () => {
    test('MapScreen: Save Zone text dark on the same orange; tags darker; Cancel follows the theme', () => {
        const src = read('src/screens/MapScreen.js');
        const flat = s => s.replace(/\s+/g, ' ');
        expect(flat(src)).toMatch(/saveButton: \{ backgroundColor: '#ff6600'/);
        expect(flat(src)).toMatch(/saveButtonText: \{ color: '#111111'/);
        expect(flat(src)).toMatch(/tagContainer: \{ alignSelf: 'flex-start', backgroundColor: '#A8550A'/);
        expect(flat(src)).toMatch(/tagText: \{ fontSize: 12, color: '#fff'/);
        expect(src).toMatch(/styles\.secondaryButtonText, \{color: palette\.cancelText\}/);
        expect(src).not.toMatch(/backgroundColor: '#d46c0d'/i);
    });

    test('Accounts: no #999 text in light mode', () => {
        const src = read('src/screens/ProfileScreen.js');
        expect(src).toMatch(/const text = isDark \? '#eee' : LIGHT_CONTROLS\.mutedText/);
        expect(src).toMatch(/const mutedText = isDark \? '#aaa' : LIGHT_CONTROLS\.mutedText/);
        expect(src).toMatch(/defaultLabelColor = isDark \? '#eee' : LIGHT_CONTROLS\.mutedText/);
        expect(src).toMatch(/defaultValueColor = isDark \? '#aaa' : LIGHT_CONTROLS\.mutedText/);
        expect(src).not.toMatch(/\? '#34A853' : '#999'/);
        // Section titles: darker in light mode only (#888 stays on the dark page, 5.3:1).
        expect(src).toMatch(/styles\.sectionTitle, !isDark && \{color: LIGHT_CONTROLS\.mutedText\}/);
        expect(src).not.toMatch(/<Text style=\{styles\.sectionTitle\}>/);
        expect(contrastRatio('#888888', '#111111')).toBeGreaterThanOrEqual(4.5);
    });

    test('Add/Edit Schedule Confirm uses the darker copper', () => {
        ['src/screens/ScheduleTimeScreen.js', 'src/screens/EditScheduleTimeScreen.js'].forEach(f => {
            expect(read(f)).toMatch(/color=\{palette\.confirmBg\}/);
        });
    });

    test('status bar: light icons in dark mode, dark icons in light mode', () => {
        const app = read('App.js');
        expect(app).toMatch(/barStyle=\{isDark \? 'light-content' : 'dark-content'\}/);
        expect(app).toMatch(/backgroundColor=\{isDark \? '#111111' : Colors\.white\}/);
        const modal = read('src/componentes/CustomBottomSheetModal/CustomBottomSheetModal.js');
        expect(modal).toMatch(/barStyle=\{isDark \? 'light-content' : 'dark-content'\}/);
    });
});

describe('CustomButton colour prop', () => {
    const CustomButton = require('../src/componentes/CustomButton/CustomButton').default;
    const bg = tree => StyleSheet.flatten(tree.root.findByType(TouchableHighlight).props.style).backgroundColor;

    test('default stays the theme colour (other screens unchanged)', () => {
        let tree;
        act(() => {
            tree = renderer.create(<CustomButton title="Go" />);
        });
        expect(bg(tree)).toBe('#B87333');
    });

    test('color is used when enabled; disabled look unchanged', () => {
        let tree;
        act(() => {
            tree = renderer.create(<CustomButton title="Go" color="#9A5F28" />);
        });
        expect(bg(tree)).toBe('#9A5F28');
        act(() => {
            tree.update(<CustomButton title="Go" color="#9A5F28" disabled />);
        });
        expect(bg(tree)).toBe('#B8733380');
    });
});
