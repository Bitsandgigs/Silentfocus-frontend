// Privacy & Data actions shared by the Accounts tab (where the buttons live)
// and the Control tab (Smart Location Learning's "turn off" prompt), so the
// behaviour exists once (Client Issue #7).

import {Alert} from 'react-native';

import {showAlert} from '../function/Alert';
import {clearLearnedLocations} from './learning';
import {clearLocalActivitySafely} from './serverSync';
import {Constants} from './theme';

export const CLEAR_ACTIVITY_TITLE = 'Clear activity history?';
export const CLEAR_ACTIVITY_MESSAGE =
    'Removes the Activity list and Silent Focus session history stored on this phone. Your zones, schedules and settings are not affected, and nothing is deleted from your account.';

/** Result of clearLocalActivitySafely -> message shown to the user. */
export const clearActivityResultMessage = result =>
    !result?.ok
        ? "Some activity hasn't been backed up to your account yet. Connect to the internet and try again."
        : result.kept > 0
        ? `Activity history was cleared, except ${result.kept} item(s) not yet backed up to your account; they were kept on this phone.`
        : 'Activity history was cleared.';

/**
 * Asks first, then clears only what the server has acknowledged
 * (clearLocalActivitySafely: sync, read-back, pending items kept).
 */
export const confirmClearActivity = ({clear = clearLocalActivitySafely, alert = Alert.alert} = {}) =>
    alert(CLEAR_ACTIVITY_TITLE, CLEAR_ACTIVITY_MESSAGE, [
        {text: 'Cancel', style: 'cancel'},
        {
            text: 'Clear',
            style: 'destructive',
            onPress: () =>
                clear()
                    .then(result => showAlert(Constants.commonConstant.appName, clearActivityResultMessage(result)))
                    .catch(() => showAlert(Constants.commonConstant.appName, 'Activity history could not be cleared.')),
        },
    ]);

/** Clears learned places now (as before: no extra prompt); resolves the new learning state or null. */
export const clearLearnedNow = async ({clear = clearLearnedLocations} = {}) => {
    try {
        const next = await clear();
        showAlert(Constants.commonConstant.appName, 'Learned locations were cleared.');
        return next;
    } catch (e) {
        showAlert(Constants.commonConstant.appName, 'Learned locations could not be cleared.');
        return null;
    }
};
