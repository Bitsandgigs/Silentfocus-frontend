// Error reporting that never sends personal data. Messages are scrubbed of
// bearer tokens, e-mail addresses, coordinates and digit runs (phone
// numbers, ids) and truncated; component stacks are sent only as component
// names. Reports go to native crash reporting when it is available.

import {NativeModules, Platform} from 'react-native';

const MAX_LENGTH = 300;

export const scrubErrorText = text =>
    String(text ?? '')
        .replace(/bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]')
        .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]')
        .replace(/-?\d{1,3}\.\d{3,}/g, '[number]') // coordinates / precise decimals
        .replace(/\+?\d[\d\s-]{3,}\d/g, '[number]') // phone numbers, long ids
        .slice(0, MAX_LENGTH);

/** Only "in Foo" component names from a React component stack. */
export const componentNames = stack =>
    String(stack ?? '')
        .split('\n')
        .map(l => l.trim().match(/^(?:in|at)\s+([A-Za-z0-9_$.]+)/)?.[1])
        .filter(Boolean)
        .slice(0, 15)
        .join(' < ');

export const reportError = (error, componentStack) => {
    const name = scrubErrorText(error?.name || 'Error').slice(0, 60);
    const message = scrubErrorText(error?.message || error);
    const where = componentNames(componentStack);
    try {
        const Native = Platform.OS === 'android' ? NativeModules.SilentFocus : null;
        Native?.recordJsError?.(name, message, where);
    } catch (e) {
        // Reporting must never throw.
    }
    if (__DEV__) {
        console.error('[ErrorBoundary]', name, message, where);
    }
};
