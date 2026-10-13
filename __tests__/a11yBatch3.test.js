/* eslint-env jest */
// Batch 3 accessibility: light selected chips and day pills, orange link
// text, zone-list secondary text. Dark mode must stay AA too.

import fs from 'fs';
import path from 'path';

import {
    DARK_CONTROLS as D,
    LIGHT_CONTROLS as L,
    ACTION_BUTTON_BG,
    LINK_DARK,
    LINK_LIGHT,
    contrastRatio,
    linkColor,
} from '../src/utils/theme/controlColors';

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

// Real light surfaces (as rendered on white).
const WHITE = '#FFFFFF';
const LIGHT_PILL = over(L.pill, WHITE); // chips, day pills, zone cards, schedule card (#5555551F)
const ACCOUNTS_CARD = over('#2E3A3E14', WHITE);
const SUGGESTION_CARD = '#FFF4EA';
const SUMMARY_CARD = '#EEEEEE';
// Dark surfaces.
const DARK_PAGE = '#111111';
const DARK_CARD = over('#5555552E', DARK_PAGE); // rgba(85,85,85,0.18), the lightest dark card
const DARK_MODAL = '#222222';

describe('1. selected radius/category chips', () => {
    test.each([
        ['light selected text', L.zoneSelectedText, L.zoneSelected],
        ['dark selected text', D.zoneSelectedText, D.zoneSelected],
        ['light unselected text', L.pillText, LIGHT_PILL],
        ['dark unselected text', D.pillText, D.pill],
    ])('%s >= 4.5:1', (_, fg, bg) => expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(4.5));

    test('orange chip colour is kept (design)', () => {
        expect(L.zoneSelected).toBe('#ff6600');
        expect(D.zoneSelected).toBe('#ff6600');
    });

    test('chips announce their selected state', () => {
        const src = read('src/screens/MapScreen.js');
        expect(src.match(/accessibilityState=\{\{selected\}\}/g)).toHaveLength(2);
    });
});

describe('2. selected weekday pills (and set time pills)', () => {
    test.each([
        ['light selected day text', L.scheduleSelectedText, L.scheduleSelected],
        ['light set time text', L.timeValueText, L.scheduleSelected],
        ['dark selected day text', D.scheduleSelectedText, D.scheduleSelected],
        ['dark set time text', D.timeValueText, D.scheduleSelected],
        ['light unselected day text', L.pillText, LIGHT_PILL],
        ['light placeholder on unset time pill', L.placeholder, LIGHT_PILL],
    ])('%s', (_, fg, bg) => {
        // Placeholder text: 4.5:1 is not required by WCAG for hints, but keep >= 3:1.
        const min = /placeholder/.test(_) ? 3 : 4.5;
        expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(min);
    });

    test('selected copper stands out from unselected pills and the page (>= 3:1)', () => {
        expect(contrastRatio(L.scheduleSelected, LIGHT_PILL)).toBeGreaterThanOrEqual(3);
        expect(contrastRatio(L.scheduleSelected, WHITE)).toBeGreaterThanOrEqual(3);
    });

    test('day pills announce their selected state on both schedule screens', () => {
        ['src/screens/ScheduleTimeScreen.js', 'src/screens/EditScheduleTimeScreen.js'].forEach(f => {
            expect(read(f)).toMatch(/accessibilityState=\{\{\s*selected: arraySelectedDays\.some\(/);
        });
    });
});

describe('3. orange link text', () => {
    test('light link meets 4.5:1 on every light surface it sits on', () => {
        [WHITE, LIGHT_PILL, ACCOUNTS_CARD, SUGGESTION_CARD, SUMMARY_CARD].forEach(bg => {
            expect(contrastRatio(LINK_LIGHT, bg)).toBeGreaterThanOrEqual(4.5);
        });
    });

    test('dark link (unchanged #D6721E) meets 4.5:1 on dark surfaces', () => {
        expect(LINK_DARK).toBe('#D6721E');
        [DARK_PAGE, DARK_CARD, DARK_MODAL, '#1C1C1C'].forEach(bg => {
            expect(contrastRatio(LINK_DARK, bg)).toBeGreaterThanOrEqual(4.5);
        });
        expect(linkColor(true)).toBe(LINK_DARK);
        expect(linkColor(false)).toBe(LINK_LIGHT);
    });

    test.each([
        ['src/screens/MapScreen.js', /secondaryButtonText, \{color: palette\.link\}\]\}>\s*Use My Current Location/],
        ['src/screens/ProfileScreen.js', /color=\{link\}/],
        ['src/screens/ProfileScreen.js', /styles\.syncNow, \{color: link\}\]\}>\s*\+ Sync a Calendar/],
        ['src/screens/ProfileScreen.js', /styles\.disconnect, \{color: link\}/],
        // Round 3: the calendar options moved to the calendar picker.
        ['src/componentes/CalendarPickerModal.js', /styles\.link, \{color: link\}\]\}>Cancel/],
        ['src/componentes/CalendarPickerModal.js', /const link = linkColor\(isDark\)/],
        ['src/screens/ProfileScreen.js', /placeholderTextColor=\{link\}/],
        ['src/screens/HomeScreen.js', /styles\.addSchedule, \{color: link\}\]\}>\s*Add Schedule/],
        ['src/screens/HomeScreen.js', /\{color: link\}\}>\s*Edit/],
        ['src/screens/HomeScreen.js', /\{color: link\}\}>\s*Delete/],
        ['src/screens/HomeScreen.js', /styles\.seeAll, \{color: link\}/],
        ['src/screens/SettingScreen.js', /styles\.manageZonesLink, \{color: link\}\]\}>\s*\{'Manage Silent Zones ›'\}/],
        ['src/screens/SettingScreen.js', /styles\.manualText, \{color: link\}\]\}>Edit/],
        ['src/screens/SettingScreen.js', /color: link,\s*fontWeight: '600',\s*\}\}>\s*Cancel/],
        ['src/componentes/LearningSuggestionCard.js', /color: linkColor\(isDark\)\}\]\}>Not Now/],
        ['src/componentes/LearningSuggestionCard.js', /color: linkColor\(isDark\)\}\]\}>No thanks/],
        ['src/componentes/TodaySummaryCard.js', /styles\.link, \{color: linkColor\(isDark\)\}/],
        ['src/componentes/PermissionHub.js', /r\.required \? '#fff' : linkColor\(isDark\)/],
        ['src/screens/EmergencyContactsScreen.js', /styles\.link, \{color: linkColor\(isDark\)\}/],
    ])('%s uses the theme link colour (%p)', (file, re) => {
        expect(read(file)).toMatch(re);
    });

    test('all three Control "›" links use the link colour', () => {
        expect(read('src/screens/SettingScreen.js').match(/styles\.manageZonesLink, \{color: link\}/g)).toHaveLength(3);
    });

    test('"Modify Filters" is the link-coloured value', () => {
        expect(read('src/screens/ProfileScreen.js')).toMatch(/value="Modify Filters"\s*color=\{link\}/);
    });
});

describe('4. zone list secondary text', () => {
    test('radius / "Tap to edit" meta and the form hint meet 4.5:1', () => {
        expect(contrastRatio(L.secondaryText, LIGHT_PILL)).toBeGreaterThanOrEqual(4.5); // zone card
        expect(contrastRatio(L.secondaryText, WHITE)).toBeGreaterThanOrEqual(4.5); // form hint
        expect(contrastRatio(D.secondaryText, '#1C1C1C')).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(D.secondaryText, D.page)).toBeGreaterThanOrEqual(4.5);
    });

    test('both modes use the palette (light no longer falls back to #888)', () => {
        const src = read('src/screens/MapScreen.js');
        expect(src).toMatch(/styles\.zoneMeta, \{color: palette\.secondaryText\}/);
        expect(src).toMatch(/styles\.hint, \{color: palette\.secondaryText\}/);
        expect(src).not.toMatch(/isDark && \{color: palette\.secondaryText\}/);
    });
});

describe('5. filled orange action buttons (white text)', () => {
    test('white on the action colour meets 4.5:1 (was 3.3:1 on #D6721E)', () => {
        expect(ACTION_BUTTON_BG).toBe('#9A4F08');
        expect(contrastRatio('#FFFFFF', ACTION_BUTTON_BG)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio('#FFFFFF', '#D6721E')).toBeLessThan(4.5);
    });

    test.each([
        ['src/componentes/PermissionHub.js', /fixRequired: \{backgroundColor: ACTION_BUTTON_BG, borderColor: ACTION_BUTTON_BG\}/],
        ['src/componentes/PermissionHub.js', /r\.required \? '#fff'/],
        ['src/componentes/LearningSuggestionCard.js', /primary: \{\s*backgroundColor: ACTION_BUTTON_BG/],
        ['src/componentes/LearningSuggestionCard.js', /primaryText: \{color: '#fff'/],
        ['src/screens/EmergencyContactsScreen.js', /bannerButton: \{[^}]*backgroundColor: ACTION_BUTTON_BG/],
        ['src/screens/EmergencyContactsScreen.js', /addButton: \{\s*backgroundColor: ACTION_BUTTON_BG/],
    ])('%s (%p)', (file, re) => {
        expect(read(file)).toMatch(re);
    });
});

describe('6. remaining filled orange controls (white text)', () => {
    test.each([
        ['src/screens/AutoReplyScreen.js', /smallButton: \{[^}]*backgroundColor: ACTION_BUTTON_BG/],
        ['src/screens/AutoReplyScreen.js', /chipSelected: \{backgroundColor: ACTION_BUTTON_BG, borderColor: ACTION_BUTTON_BG\}/],
        ['src/screens/AutoReplyScreen.js', /saveButton: \{backgroundColor: ACTION_BUTTON_BG/],
        ['src/screens/SettingScreen.js', /saveBtn: \{\s*backgroundColor: ACTION_BUTTON_BG/],
        ['src/screens/ActivityScreen.js', /tabSelected: \{[^}]*backgroundColor: ACTION_BUTTON_BG/],
        ['src/screens/ActivityScreen.js', /retry: \{[^}]*backgroundColor: ACTION_BUTTON_BG/],
        ['src/screens/SessionHistoryScreen.js', /retry: \{[^}]*backgroundColor: ACTION_BUTTON_BG/],
        ['src/componentes/ErrorBoundary.js', /button: \{backgroundColor: '#9A4F08'/],
    ])('%s (%p)', (file, re) => {
        expect(read(file)).toMatch(re);
    });

    test('no white-on-#D6721E fills left (icon backgrounds excepted)', () => {
        [
            'src/screens/AutoReplyScreen.js',
            'src/screens/SettingScreen.js',
            'src/screens/SessionHistoryScreen.js',
            'src/componentes/ErrorBoundary.js',
            'src/componentes/PermissionHub.js',
            'src/componentes/LearningSuggestionCard.js',
            'src/screens/EmergencyContactsScreen.js',
        ].forEach(f => expect([f, /backgroundColor: (ORANGE|'#D6721E')/.test(read(f))]).toEqual([f, false]));
        // ActivityScreen: only the row icon wrapper (white icon, 3:1 graphics rule: 3.3:1).
        expect(read('src/screens/ActivityScreen.js').match(/backgroundColor: '#D6721E'/g)).toHaveLength(1);
        expect(contrastRatio('#FFFFFF', '#D6721E')).toBeGreaterThanOrEqual(3);
    });

    test('selected vs unselected: Activity tabs and Auto Reply chips', () => {
        // Activity tab: selected = filled (white text 6.0:1); unselected = no fill, muted text on the page.
        expect(contrastRatio(ACTION_BUTTON_BG, '#FFFFFF')).toBeGreaterThanOrEqual(3);
        expect(contrastRatio(ACTION_BUTTON_BG, '#111111')).toBeGreaterThanOrEqual(3);
        expect(contrastRatio('#555555', '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio('#AAAAAA', '#111111')).toBeGreaterThanOrEqual(4.5);
        const activity = read('src/screens/ActivityScreen.js');
        expect(activity).toMatch(/accessibilityRole="tab"\s*accessibilityState=\{\{selected\}\}/);
        expect(activity).toMatch(/accessibilityRole="tablist"/);
        const autoReply = read('src/screens/AutoReplyScreen.js');
        expect(autoReply).toMatch(/accessibilityRole="radio"\s*accessibilityState=\{\{selected\}\}/);
    });
});
