// The window behind every screen must match the native launch surface
// (android res/values[-night]/colors.xml: sf_launch_background) so no light
// "default" navigation background (#f2f2f2) shows between splash and first screen.

export const LAUNCH_BACKGROUND = {dark: '#000000', light: '#FFFFFF'};

export const navigationTheme = (isDark, DarkTheme, DefaultTheme) => {
    const base = isDark ? DarkTheme : DefaultTheme;
    const background = isDark ? LAUNCH_BACKGROUND.dark : LAUNCH_BACKGROUND.light;
    return {...base, colors: {...base.colors, background, card: background}};
};
