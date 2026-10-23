import {
    BOTTOM_TAB_BAR_HEIGHT,
    FLOATING_ACTION_GAP,
    getFloatingActionBottomOffset,
} from '../src/utils/bottomNavigationLayout';

describe('floating Home action layout', () => {
    test('uses the visual tab bar geometry, not a device-height offset', () => {
        expect(BOTTOM_TAB_BAR_HEIGHT).toBe(75);
        expect(FLOATING_ACTION_GAP).toBe(40);
        expect(getFloatingActionBottomOffset()).toBe(115);
    });

    test('keeps a caller-supplied bar height and separation together', () => {
        expect(getFloatingActionBottomOffset(80, 20)).toBe(100);
    });
});
