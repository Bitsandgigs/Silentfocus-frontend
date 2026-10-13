// Account deletion: DELETE /account (authenticated). The backend deletes the
// user's zones, schedules, sessions, logs, templates, devices and settings,
// revokes every token and anonymises the user row.
//
// Local data is wiped only after the server confirmed: a failed request
// leaves the user signed in with everything intact, so they can retry.

import AsyncStorage from '@react-native-async-storage/async-storage';

import APICall from './api/api';
import EndPoints from './api/endpoints';
import {clearSession} from './session';
import Constants from './theme/constants';

// Not covered by logout (kept across normal sign-outs on purpose): the random
// tag this install puts on uploaded activity.
const DELETION_EXTRA_KEYS = ['sf.sync.installId'];

/**
 * Resolves {ok: true} once the account is deleted and this phone is signed
 * out with the account's local data removed; otherwise {ok: false,
 * response} (nothing was changed locally - except on an auth failure,
 * where the API client has already signed the user out).
 */
export const deleteAccount = async ({transport = APICall, clear = clearSession} = {}) => {
    if (!Constants.commonConstant.appToken) {
        return {ok: false, response: null};
    }
    const response = await transport('delete', null, EndPoints.deleteAccount, {}, false, false);
    if (response?.statusCode !== Constants.apiStatusCode.success || response?.data?.status !== '1') {
        return {ok: false, response};
    }
    try {
        await AsyncStorage.multiRemove(DELETION_EXTRA_KEYS);
    } catch (e) {
        // Not personal data; sign-out below must still happen.
    }
    // Token, user, schedules/zones/override in the native engine (phone
    // restored if Silent Focus silenced it), emergency contacts, auto reply,
    // activity journal, session history, learned places, sync bookkeeping.
    await clear({mode: 'deleted'});
    return {ok: true, response};
};
