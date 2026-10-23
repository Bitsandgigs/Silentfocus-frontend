// Keep controls that float above the custom bottom navigation in the same
// coordinate system as the bar. The bar itself accounts for the Android
// navigation inset; screens use SafeAreaView, so adding that inset again here
// would create a device-specific (and especially 3-button-navigation) gap.
export const BOTTOM_TAB_BAR_HEIGHT = 75;
// The tab navigator lays screens out above the system inset, while the custom
// bar is drawn over that space.  A 40dp separation keeps the 60dp Home action
// clear of the bar (and its profile tab) on gesture and 3-button navigation.
export const FLOATING_ACTION_GAP = 40;

export const getFloatingActionBottomOffset = (
    tabBarHeight = BOTTOM_TAB_BAR_HEIGHT,
    gap = FLOATING_ACTION_GAP,
) => tabBarHeight + gap;
