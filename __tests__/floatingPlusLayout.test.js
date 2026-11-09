import {
    BOTTOM_TAB_BAR_HEIGHT,
    FLOATING_ACTION_GAP,
    getFloatingActionBottomOffset,
} from '../src/utils/bottomNavigationLayout';

describe('floating Home action layout', () => {
    test('clears the visual tab bar plus the live system navigation inset', () => {
        expect(BOTTOM_TAB_BAR_HEIGHT).toBe(75);
        expect(FLOATING_ACTION_GAP).toBe(16);
        // Gesture navigation (24dp inset on the reference Pixel 8): the
        // client-approved 115dp position is unchanged.
        expect(getFloatingActionBottomOffset(undefined, undefined, 24)).toBe(115);
        // 3-button navigation (48dp inset): moves up with the bar, so the whole
        // 60dp circle stays above it (was clipped at a fixed 115dp).
        expect(getFloatingActionBottomOffset(undefined, undefined, 48)).toBe(139);
    });

    test('keeps a caller-supplied bar height and separation together', () => {
        expect(getFloatingActionBottomOffset(80, 20)).toBe(100);
    });

    test('ignores a missing or negative inset', () => {
        expect(getFloatingActionBottomOffset()).toBe(91);
        expect(getFloatingActionBottomOffset(75, 16, -5)).toBe(91);
    });
});

describe('compact-height hint clearance', () => {
    const {COMPACT_HEIGHT_DP, FLOATING_ACTION_CLEARANCE} = require('../src/utils/bottomNavigationLayout');
    test('only short viewports reserve space; 720x1280@280dpi is compact, Pixel 8 is not', () => {
        expect(1280 / (280 / 160)).toBeLessThan(COMPACT_HEIGHT_DP); // ~731dp
        expect(2400 / (420 / 160)).toBeGreaterThanOrEqual(COMPACT_HEIGHT_DP); // ~914dp
        expect(FLOATING_ACTION_CLEARANCE).toBeGreaterThanOrEqual(60 + 10);
    });
});
