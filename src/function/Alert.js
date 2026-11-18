import { Alert } from 'react-native';
import { Constants } from '../utils/theme';
import { navigateTo } from '../utils/navigationRef';
import { planLimitFrom } from '../utils/subscription';

// A server, proxy or CDN can answer with an HTML error page instead of JSON.
// That must never be shown to the user as the message (it is pages of markup),
// nor can an overly long blob of text; use the friendly fallback instead.
const MAX_MESSAGE_LENGTH = 300;
export const SERVER_BUSY_MESSAGE = 'The server is busy right now. Please try again in a moment.';
const HTML_PATTERN = /^\s*<(!doctype|html|head|body|\?xml)\b|<\/?(html|head|body|script|style|div|meta|title)\b/i;
export function readableText(text, fallback) {
    const value = String(text).trim();
    if (HTML_PATTERN.test(value)) {
        return SERVER_BUSY_MESSAGE; // an HTML page comes from the host/proxy, not from the API
    }
    if (value.length > MAX_MESSAGE_LENGTH) {
        return fallback;
    }
    return value;
}

// Pulls a human-readable message out of an API response, whatever shape the
// backend used for that particular error (Laravel-style {message}/{errors},
// FastAPI-style {detail}, a plain network error string, or nothing at all),
// so a failed request always has something to show instead of silently
// swallowing the error.
export function getApiErrorMessage(response, fallback = 'Something went wrong. Please try again.') {
    if (response?.isNetworkError) {
        return 'Unable to reach the server. Please check your connection and try again.';
    }

    const data = response?.data;

    if (!data) {
        return fallback;
    }

    if (typeof data === 'string' && data.trim() !== '') {
        return readableText(data, fallback);
    }

    if (typeof data?.message === 'string' && data.message.trim() !== '') {
        return readableText(data.message, fallback);
    }

    if (typeof data?.detail === 'string' && data.detail.trim() !== '') {
        return readableText(data.detail, fallback);
    }

    if (Array.isArray(data?.detail) && data.detail.length > 0) {
        const first = data.detail[0];
        if (typeof first === 'string') return first;
        if (typeof first?.msg === 'string') return first.msg;
    }

    if (data?.errors && typeof data.errors === 'object') {
        const firstKey = Object.keys(data.errors)[0];
        const firstError = firstKey ? data.errors[firstKey] : null;
        if (Array.isArray(firstError) && typeof firstError[0] === 'string') {
            return firstError[0];
        }
        if (typeof firstError === 'string') {
            return firstError;
        }
    }

    return fallback;
}

// Shows an alert for a failed API call using whatever error message the
// response actually contains, so no backend error is ever swallowed silently.
// Skipped when the device is offline (the offline banner already says so)
// and on auth failures (the session is cleared and the user is sent to login).
export function showApiErrorAlert(title, response, fallback) {
    if (response === undefined || response?.isOffline || response?.isAuthError) {
        return;
    }
    // The backend refused because of the subscription plan: offer the upgrade.
    const limit = planLimitFrom(response);
    if (limit) {
        showPlanLimitAlert(getApiErrorMessage(response, fallback), limit);
        return;
    }
    showAlert(title, getApiErrorMessage(response, fallback));
}

export function showPlanLimitAlert(message, limit) {
    const canUpgrade = limit?.upgrade_required !== false;
    setTimeout(() => {
        Alert.alert(
            'Plan limit reached',
            message,
            canUpgrade
                ? [
                    { text: 'Not now', style: 'cancel' },
                    { text: 'View plans', onPress: () => navigateTo('SubscriptionScreen') },
                ]
                : [{ text: 'OK' }],
        );
    }, Constants.commonConstant.animTime100);
}

export function showAlert(title, message, buttonTitle = 'OK') {
    setTimeout(() => {
        Alert.alert(title, message, [
            {
                text: buttonTitle,
            },
        ]);
    }, Constants.commonConstant.animTime100);
}

export function showAlertWithOneCallBack(
    title,
    message,
    okayFirstButtonTitle,
    okayFirstCallback,
) {
    setTimeout(() => {
        Alert.alert(title, message, [
            {
                text: okayFirstButtonTitle,
                onPress: () => {
                    okayFirstCallback();
                },
            },
        ]);
    }, Constants.commonConstant.animTime100);
}

export function showAlertWithTwoCallBack(
    title,
    message,
    cancelTitle,
    cancelSecondCallBack,
    okayTitle,
    okayFirstCallback,
) {
    setTimeout(() => {
        Alert.alert(title, message, [
            {
                text: cancelTitle,
                onPress: () => {
                    cancelSecondCallBack();
                },
                style: 'cancel',
            },
            {
                text: okayTitle,
                onPress: () => {
                    okayFirstCallback();
                },
            },
        ]);
    }, Constants.commonConstant.animTime100);
}
