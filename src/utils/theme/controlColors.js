// Colours for form controls (day pills, time pills, chips, inputs) that
// must stay readable in dark mode (Client Issues #2 and #8). Dark values are
// chosen to meet WCAG AA (4.5:1 text, 3:1 indicators; see
// __tests__/controlColors.test.js). Light values reproduce the existing
// light appearance, with darker shades where light mode missed AA (Batch 3).

import Colors from './colors';

/** WCAG 2.x contrast ratio between two #RRGGBB colours. */
export const contrastRatio = (a, b) => {
    const lum = hex => {
        const h = hex.replace('#', '');
        const [r, g, bl] = [0, 2, 4].map(i => {
            const v = parseInt(h.slice(i, i + 2), 16) / 255;
            return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
    };
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
};

// Orange link/outline text. Light: >= 4.77:1 on white and on the light cards
// (#EAEAEA, #EFF0F0, #FFF4EA); #D6721E was 3.0-3.3:1. Dark: 5.1-5.7:1.
export const LINK_LIGHT = '#9A4F08';
export const LINK_DARK = '#D6721E';
export const linkColor = isDark => (isDark ? LINK_DARK : LINK_LIGHT);

// Filled orange action buttons with white text (both modes): 6.0:1.
// White on #D6721E was 3.3:1.
export const ACTION_BUTTON_BG = '#9A4F08';

export const DARK_CONTROLS = {
    page: '#111111',
    pill: '#1E1E1E', // unselected day/time pill, unselected chip
    pillText: '#E6E6E6',
    label: '#E6E6E6', // From / To and other primary labels
    secondaryText: '#BDBDBD',
    placeholder: '#A9A9A9',
    inputBg: '#1E1E1E',
    inputText: '#F2F2F2',
    icon: '#FFFFFF',
    divider: '#333333',
    scheduleSelected: '#9A5F28', // darker copper: white text 5.2:1
    scheduleSelectedText: '#FFFFFF',
    timeValueText: '#FFFFFF',
    zoneSelected: '#ff6600', // Silent Zone orange kept; dark text 6.4:1
    zoneSelectedText: '#111111',
    confirmBg: '#9A5F28', // primary button: white text 5.2:1 (#B87333 was 3.8:1)
    cancelText: LINK_DARK, // 5.7:1 on the dark page
    link: LINK_DARK,
    mutedText: '#AAAAAA',
};

export const LIGHT_CONTROLS = {
    page: '#FFFFFF',
    pill: '#5555551F',
    pillText: Colors.black,
    label: null, // keep the theme default
    secondaryText: '#5C5C5C', // hint + zone list meta: 5.6:1 on the zone card (#888 was 2.9:1)
    placeholder: Colors.placeHolder,
    inputBg: Colors.textInputBg,
    inputText: '#1C1C1C',
    icon: Colors.black,
    divider: '#5555551F',
    scheduleSelected: '#9A5F28', // white text 5.2:1 (#B87333 was 3.8:1)
    scheduleSelectedText: Colors.white,
    timeValueText: Colors.white, // on the selected copper (black would be 4.0:1)
    zoneSelected: '#ff6600',
    zoneSelectedText: '#111111', // 6.4:1 on #ff6600 (white was 2.9:1)
    confirmBg: '#9A5F28',
    cancelText: LINK_LIGHT, // 6.0:1 on white (#D6721E was 3.3:1)
    link: LINK_LIGHT,
    mutedText: '#666666', // Accounts secondary text: ~5:1 on the light card (#999 was ~2.6:1)
};

export const controlColors = isDark => (isDark ? DARK_CONTROLS : LIGHT_CONTROLS);
