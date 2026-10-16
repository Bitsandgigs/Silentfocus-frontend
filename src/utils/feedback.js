// Feedback from the Accounts screen: POST /feedback (authenticated). The
// backend stores it in the `feedback` table (read in phpMyAdmin) and drops it
// when the account is deleted. Only what the user typed plus app/device
// basics are sent - no contacts, messages or location.

import {Platform} from 'react-native';
import DeviceInfo from 'react-native-device-info';

import APICall from './api/api';
import EndPoints from './api/endpoints';
import Constants from './theme/constants';

export const FEEDBACK_CATEGORIES = [
    {key: 'bug', label: 'Problem'},
    {key: 'idea', label: 'Idea'},
    {key: 'other', label: 'Other'},
];
export const FEEDBACK_MIN_LENGTH = 3;
export const FEEDBACK_MAX_LENGTH = 2000;

const deviceDetails = () => {
    try {
        return {
            app_version: `${DeviceInfo.getVersion()} (${DeviceInfo.getBuildNumber()})`,
            os_version: String(DeviceInfo.getSystemVersion()),
            device_model: `${DeviceInfo.getBrand()} ${DeviceInfo.getModel()}`.trim(),
        };
    } catch (e) {
        return {};
    }
};

/**
 * Resolves {ok: true} once the server stored it; otherwise {ok: false,
 * reason} with reason 'empty' | 'signedOut' | 'offline' | 'server' (message
 * from the server when it sent one).
 */
export const sendFeedback = async (
    {category = 'other', message},
    {transport = APICall, device = deviceDetails} = {},
) => {
    const text = String(message || '').trim();
    if (text.length < FEEDBACK_MIN_LENGTH) {
        return {ok: false, reason: 'empty'};
    }
    if (!Constants.commonConstant.appToken) {
        return {ok: false, reason: 'signedOut'};
    }
    const body = {
        category: FEEDBACK_CATEGORIES.some(c => c.key === category) ? category : 'other',
        message: text.slice(0, FEEDBACK_MAX_LENGTH),
        platform: Platform.OS,
        ...device(),
    };
    const response = await transport('post', body, EndPoints.feedback, {}, false, true);
    if (response?.isOffline) {
        return {ok: false, reason: 'offline'};
    }
    if (response?.statusCode !== Constants.apiStatusCode.success || response?.data?.status !== '1') {
        return {ok: false, reason: 'server', message: response?.data?.message};
    }
    return {ok: true};
};
