import { Alert } from 'react-native';
import { Constants } from '../utils/theme';

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
        return data;
    }

    if (typeof data?.message === 'string' && data.message.trim() !== '') {
        return data.message;
    }

    if (typeof data?.detail === 'string' && data.detail.trim() !== '') {
        return data.detail;
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
    showAlert(title, getApiErrorMessage(response, fallback));
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
