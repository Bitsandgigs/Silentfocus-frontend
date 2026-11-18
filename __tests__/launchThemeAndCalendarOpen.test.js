import fs from 'fs';
import path from 'path';
import {navigationTheme, LAUNCH_BACKGROUND} from '../src/utils/theme/launchTheme';

const res = p => fs.readFileSync(path.join(__dirname, '../android/app/src/main/res', p), 'utf8');
const color = (xml, name) => new RegExp(`name="${name}">(#[0-9A-Fa-f]{6})<`).exec(xml)[1].toUpperCase();

describe('launch surface (white/grey flash)', () => {
    test('native night launch background equals the in-app dark background', () => {
        expect(color(res('values-night/colors.xml'), 'sf_launch_background')).toBe(LAUNCH_BACKGROUND.dark.toUpperCase());
        expect(color(res('values/colors.xml'), 'sf_launch_background')).toBe(LAUNCH_BACKGROUND.light.toUpperCase());
    });
    test('theme is DayNight, opaque and uses the launch colors', () => {
        const styles = res('values/styles.xml');
        expect(styles).toMatch(/Theme\.AppCompat\.DayNight\.NoActionBar/);
        expect(styles).not.toMatch(/windowIsTranslucent/);
        expect(styles).toMatch(/android:windowBackground">@color\/sf_launch_background/);
        expect(styles).not.toMatch(/#FFFFFF|#ffffff/);
    });
    test('Android 12+ system splash is a plain launch-coloured surface (no white icon circle)', () => {
        const styles = res('values/styles.xml');
        expect(styles).toMatch(/android:windowSplashScreenBackground"[^>]*>@color\/sf_launch_background/);
        expect(styles).toMatch(/android:windowSplashScreenAnimatedIcon"[^>]*>@drawable\/sf_splash_empty_icon/);
        expect(styles).toMatch(/android:windowSplashScreenIconBackgroundColor"[^>]*>@color\/sf_launch_background/);
        expect(res('drawable/sf_splash_empty_icon.xml')).toMatch(/android:fillColor="#00000000"/);
    });
    test('splash layout follows the launch color, not hardcoded white', () => {
        expect(res('layout/launch_screen.xml')).toMatch(/@color\/sf_launch_background/);
    });
    test('navigation theme background is the launch color in both modes', () => {
        const D = {colors: {background: '#010101', card: '#1'}};
        const L = {colors: {background: '#f2f2f2', card: '#fff'}};
        expect(navigationTheme(true, D, L).colors.background).toBe('#000000');
        expect(navigationTheme(false, D, L).colors.background).toBe('#FFFFFF');
    });
});

describe('open calendar app is independent of selection', () => {
    test('uses the native launcher, never a hardcoded app or raw Linking URL', () => {
        const profile = fs.readFileSync(path.join(__dirname, '../src/screens/ProfileScreen.js'), 'utf8');
        expect(profile).toMatch(/openCalendarApp/);
        expect(profile).not.toMatch(/content:\/\/com\.android\.calendar/);
        expect(profile.replace(/\/\/.*\n/g, '')).not.toMatch(/samsung/i);
    });
    test('rejects when the native module lacks it', async () => {
        const {openCalendarApp} = require('../src/utils/deviceCalendars');
        await expect(openCalendarApp()).rejects.toThrow();
    });
});

describe('dark-mode bottom sheet and date picker', () => {
    const read = p => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
    test('sheet switches to a dark surface instead of staying white', () => {
        expect(read('src/componentes/CustomBottomSheetModal/CustomBottomSheetModal.js')).toMatch(/isDark && styles\.bottomSheetContainerDark/);
        expect(read('src/componentes/CustomBottomSheetModal/CustomBottomSheetModalStyle.js')).toMatch(/bottomSheetContainerDark: \{\s*backgroundColor: '#1C1C1C'/);
    });
    test('wheel picker uses dark theme and light text in dark mode', () => {
        const src = read('src/componentes/CustomDateTimePicker/CustomDateTimePicker.js');
        expect(src).toMatch(/theme=\{isDark \? 'dark' : 'light'\}/);
        expect(src).toMatch(/textColor=\{isDark \? '#FFFFFF'/);
    });
});

describe('auth screens follow dark mode (black text on the now-dark window was invisible)', () => {
    const read = p => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
    test.each(['Login', 'ForgotPassword', 'ResetPassword', 'VerifyOtp'])('%sScreen headings use the palette', n => {
        const src = read(`src/screens/${n}Screen.js`);
        expect(src).toMatch(/authPalette\(isDark\)/);
        expect(src).toMatch(/styles\.heading, \{color: ap\.text\}/);
        expect(src).not.toMatch(/color=\{Colors\.black\}/);
    });
    test('dark palette has a dark card and light text; light palette is unchanged', () => {
        const {authPalette} = require('../src/utils/theme/authPalette');
        expect(authPalette(true).card).toBe('#1C1C1C');
        expect(authPalette(true).text).toBe('#FFFFFF');
        expect(authPalette(false).card).toBe('#FFFFFF');
        expect(authPalette(false).text).toBe('#000000');
    });
});
