// Keep controls that float above the custom bottom navigation in the same
// coordinate system as the bar.
//
// The tab bar is drawn BOTTOM_TAB_BAR_HEIGHT tall *above* the system
// navigation inset (paddingBottom = inset), while an absolutely positioned
// child of a screen is measured from the window's bottom edge (the screen's
// SafeAreaView padding does not move it). So the floating action must clear
// the bar's height PLUS the live bottom inset: gesture navigation has a small
// inset, 3-button navigation a larger one (a fixed offset hid the lower part
// of the circle behind the bar on 3-button navigation).
export const BOTTOM_TAB_BAR_HEIGHT = 75;
// Visible separation between the top of the bar and the bottom of the 60dp
// action. 75 + 24 (gesture inset on the reference Pixel 8) + 16 = 115, the
// position the client already approved.
export const FLOATING_ACTION_GAP = 16;

export const getFloatingActionBottomOffset = (
    tabBarHeight = BOTTOM_TAB_BAR_HEIGHT,
    gap = FLOATING_ACTION_GAP,
    bottomInset = 0,
) => tabBarHeight + gap + Math.max(0, bottomInset || 0);

// Below this full-display height (dp) the Home hint text can sit level with the
// floating action; the hint then reserves the action's width (60dp circle +
// 10dp margin + 8dp air). Normal phones (>= 760dp) are unchanged.
export const COMPACT_HEIGHT_DP = 760;
export const FLOATING_ACTION_CLEARANCE = 78;
