import AsyncStorage from '@react-native-async-storage/async-storage';

import Constants from '../src/utils/theme/constants';
import Emitter from '../src/utils/theme/emitter';
import {
    applySession,
    clearSession,
    isAuthFailure,
    loadSession,
    SESSION_STORAGE_KEYS,
} from '../src/utils/session';

const {userToken, userData, showGetStarted} = Constants.asyncStorageKeys;

beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
    Constants.commonConstant.appToken = '';
    Constants.commonConstant.appUserId = 0;
});

describe('isAuthFailure', () => {
    test('401 is an auth failure', () => {
        expect(isAuthFailure(401, null)).toBe(true);
    });

    test("backend's 500 {detail: 'Unauthenticated.'} is an auth failure", () => {
        expect(isAuthFailure(500, {detail: 'Unauthenticated.'})).toBe(true);
        expect(isAuthFailure(500, {message: 'Unauthenticated.'})).toBe(true);
    });

    test('other 5xx, 4xx and network errors are not', () => {
        expect(isAuthFailure(500, {detail: 'Server Error'})).toBe(false);
        expect(isAuthFailure(500, 'Network Error')).toBe(false);
        expect(isAuthFailure(503, null)).toBe(false);
        expect(isAuthFailure(403, {message: 'Forbidden'})).toBe(false);
        expect(isAuthFailure(0, null)).toBe(false);
    });
});

describe('loadSession', () => {
    test('returns token and user together', async () => {
        await AsyncStorage.setItem(userToken, JSON.stringify('abc'));
        await AsyncStorage.setItem(userData, JSON.stringify({user_id: 5}));
        await expect(loadSession()).resolves.toEqual({
            token: 'abc',
            user: {user_id: 5},
        });
    });

    test('a user without a token is not a session', async () => {
        await AsyncStorage.setItem(userData, JSON.stringify({user_id: 5}));
        await expect(loadSession()).resolves.toBeNull();
        await AsyncStorage.setItem(userToken, JSON.stringify(''));
        await expect(loadSession()).resolves.toBeNull();
    });

    test('corrupt storage is treated as logged out', async () => {
        await AsyncStorage.setItem(userToken, '{not json');
        await AsyncStorage.setItem(userData, JSON.stringify({user_id: 5}));
        await expect(loadSession()).resolves.toBeNull();
    });

    test('applySession puts the token in memory', () => {
        applySession({token: 't', user: {user_id: 9}});
        expect(Constants.commonConstant.appToken).toBe('t');
        expect(Constants.commonConstant.appUserId).toBe(9);
    });
});

describe('clearSession', () => {
    test('removes only session keys and emits logout', async () => {
        await AsyncStorage.setItem(showGetStarted, JSON.stringify(true));
        for (const key of SESSION_STORAGE_KEYS) {
            await AsyncStorage.setItem(key, JSON.stringify('x'));
        }
        applySession({token: 't', user: {user_id: 9}});
        const listener = jest.fn();
        const sub = Emitter.addListener(
            Constants.eventListenerKeys.logoutListener,
            listener,
        );

        await clearSession();

        for (const key of SESSION_STORAGE_KEYS) {
            await expect(AsyncStorage.getItem(key)).resolves.toBeNull();
        }
        await expect(AsyncStorage.getItem(showGetStarted)).resolves.toBe(
            'true',
        );
        expect(AsyncStorage.clear).not.toHaveBeenCalled();
        expect(Constants.commonConstant.appToken).toBe('');
        expect(Constants.commonConstant.appUserId).toBe(0);
        expect(listener).toHaveBeenCalledTimes(1);
        sub.remove();
    });

    test('still signs out locally when storage fails', async () => {
        applySession({token: 't', user: {user_id: 9}});
        AsyncStorage.multiRemove.mockRejectedValueOnce(new Error('disk'));
        const listener = jest.fn();
        const sub = Emitter.addListener(
            Constants.eventListenerKeys.logoutListener,
            listener,
        );

        await clearSession();

        expect(Constants.commonConstant.appToken).toBe('');
        expect(listener).toHaveBeenCalledTimes(1);
        sub.remove();
    });
});
