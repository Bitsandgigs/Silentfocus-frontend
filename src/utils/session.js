// Session (auth) state: restoring it on cold start, detecting when the
// backend has rejected it, and clearing it on logout.

// Lib
import AsyncStorage from '@react-native-async-storage/async-storage';

// Mics Constants
import Constants, {defaultUser} from './theme/constants';
import Emitter from './theme/emitter';
import {resetEngine} from './silentFocusEngine';
import {Alert} from 'react-native';
import {CLAIM_BLOCKED, claimLocalHistory, dropOutbox, expireNativeSession, preserveForLogout, resetEngineKeepingHistory} from './outbox';

export const CALENDAR_SYNC_KEY = 'isCalendarSynced';
export const CALENDAR_EVENTS_UPLOADED_KEY = 'calendarEventsUploaded';

// Everything that belongs to the signed-in user. Device-level keys such as
// `showGetStarted` are deliberately left alone on logout.
export const SESSION_STORAGE_KEYS = [
    Constants.asyncStorageKeys.userToken,
    Constants.asyncStorageKeys.userData,
    'timer_state', // legacy JS timer (pre native engine)
    CALENDAR_SYNC_KEY,
    CALENDAR_EVENTS_UPLOADED_KEY,
    'WHATSAPP_NOTIFICATIONS',
    // Server sync bookkeeping (serverSync.js / autoResponseSync.js); the
    // device install id is kept on purpose.
    'sf.sync.state',
    'sf.autoReply.pendingPush',
    'sf.autoReply.syncInitialized',
];

/**
 * Kept when a session merely expires (confirmed 401): they belong to the
 * account's kept history and settings. Tagged with [EXPIRED_OWNER_KEY] and
 * removed at the next sign-in if a different account signs in.
 */
export const EXPIRY_KEPT_KEYS = [CALENDAR_SYNC_KEY, CALENDAR_EVENTS_UPLOADED_KEY, 'sf.sync.state'];
export const EXPIRED_OWNER_KEY = 'sf.session.expiredOwner';

const UNAUTHENTICATED_MESSAGE = 'unauthenticated.';

// The backend answers an invalid/expired token with HTTP 401
// {"status":"0","message":"Unauthenticated."} (older deployments sent HTTP
// 500 {"detail":"Unauthenticated."}; still recognised). Any other 5xx or a
// network error is NOT an auth failure.
export const isAuthFailure = (statusCode, data) => {
    if (statusCode === Constants.apiStatusCode.unAuthorized) {
        return true;
    }
    const text = data?.detail ?? data?.message;
    return (
        typeof text === 'string' &&
        text.trim().toLowerCase() === UNAUTHENTICATED_MESSAGE
    );
};

const parseStored = value => {
    if (value === null || value === undefined) {
        return null;
    }
    try {
        return JSON.parse(value);
    } catch (e) {
        return null;
    }
};

// Reads token + user in one go so the token is always in memory before the
// app decides the user is logged in (and starts firing authenticated calls).
export const loadSession = async () => {
    const entries = await AsyncStorage.multiGet([
        Constants.asyncStorageKeys.userToken,
        Constants.asyncStorageKeys.userData,
    ]);
    const token = parseStored(entries?.[0]?.[1]);
    const user = parseStored(entries?.[1]?.[1]);

    if (typeof token !== 'string' || token === '' || !user) {
        return null;
    }
    return {token, user};
};

/**
 * Successful login / signup-OTP / social-login response body
 * ({status:'1', result:{user_id, username, email, phone_number, token}}) ->
 * {token, user}, or null when it doesn't carry a usable session. Pure.
 */
export const parseAuthResponse = data => {
    if (data?.status !== '1') {
        return null;
    }
    const result = data?.result;
    const token = typeof result?.token === 'string' ? result.token.trim() : '';
    const userId = Number(result?.user_id);
    if (!token || !Number.isInteger(userId) || userId <= 0) {
        return null;
    }
    return {
        token,
        user: {
            user_id: userId,
            username: typeof result.username === 'string' ? result.username : '',
            email: typeof result.email === 'string' ? result.email : '',
            phone_number: typeof result.phone_number === 'string' ? result.phone_number : '',
        },
    };
};

/**
 * Persists then applies a new session. The token is written before the
 * caller flips isLogin, so a restart can't come back half signed-in.
 */
/**
 * Sign-in after a session expiry: the kept JS-side preferences stay only for
 * the same account; for any other account they are removed first.
 */
export const settleExpiredOwner = async userId => {
    let owner = null;
    try {
        owner = Number(await AsyncStorage.getItem(EXPIRED_OWNER_KEY));
    } catch (e) {
        owner = NaN;
    }
    if (!owner) return;
    if (owner !== Number(userId)) {
        await AsyncStorage.multiRemove(EXPIRY_KEPT_KEYS);
    }
    await AsyncStorage.removeItem(EXPIRED_OWNER_KEY);
};

export const startSession = async session => {
    // Before anything is saved: local history must become this account's
    // (another account's pending data goes to that account's outbox first).
    // If that can't be done safely, the sign-in is refused and nothing of
    // the previous account is touched or shown.
    if ((await claimLocalHistory(session.user?.user_id)) === CLAIM_BLOCKED) {
        const error = new Error('Account switch blocked');
        error.code = ACCOUNT_SWITCH_BLOCKED;
        throw error;
    }
    await settleExpiredOwner(session.user?.user_id);
    await AsyncStorage.multiSet([
        [Constants.asyncStorageKeys.userToken, JSON.stringify(session.token)],
        [Constants.asyncStorageKeys.userData, JSON.stringify(session.user)],
    ]);
    applySession(session);
    return session;
};

export const ACCOUNT_SWITCH_BLOCKED = 'ACCOUNT_SWITCH_BLOCKED';

/**
 * Drops stored credentials only (no engine reset, no history change) - for
 * a stored session that must not be entered (its account can't claim the
 * local history).
 */
export const discardCredentials = async () => {
    Constants.commonConstant.appToken = '';
    Constants.commonConstant.appUser = defaultUser;
    Constants.commonConstant.appUserId = 0;
    try {
        await AsyncStorage.multiRemove([Constants.asyncStorageKeys.userToken, Constants.asyncStorageKeys.userData]);
    } catch (e) {
        // Next start tries again; nothing was entered meanwhile.
    }
};

// "Bearer <token>" as sent by the API client.
export const bearerFor = token =>
    token ? (token.startsWith('Bearer ') ? token : `Bearer ${token}`) : '';

/**
 * True when a rejected request was made with the session that is current
 * now. A late 401 for a token that was already replaced (logout + new
 * login while the request was in flight) must not end the new session.
 */
export const wasSentWithCurrentToken = requestHeaders => {
    const current = bearerFor(Constants.commonConstant.appToken);
    if (!current) {
        return false;
    }
    const sent = requestHeaders?.Authorization ?? requestHeaders?.authorization ??
        (typeof requestHeaders?.get === 'function' ? requestHeaders.get('Authorization') : undefined);
    // A request that carried no token has no session to reject.
    return sent !== undefined && sent !== null && String(sent) === current;
};

export const applySession = ({token, user}) => {
    Constants.commonConstant.appToken = token || '';
    Constants.commonConstant.appUser = user || defaultUser;
    Constants.commonConstant.appUserId = user?.user_id || 0;
};

let isClearing = false;

// Always succeeds locally, whatever the backend said about logout.
// `mode`:
// - 'logout' (the user signed out): keeps this account's unsynced data in
//   its outbox before the engine is reset - and if that can't be saved, the
//   history is kept on the phone instead of being wiped;
// - 'expired' (confirmed 401, see handleAuthRejected): silencing and rules
//   stop, but the account's history, pending data and settings stay on the
//   phone, owned by it (same account gets them back at sign-in, another
//   account never sees them); credentials are removed;
// - 'deleted' (account deleted on the server): drops that account's outbox.
export const clearSession = async ({mode = 'logout'} = {}) => {
    if (isClearing) {
        return;
    }
    isClearing = true;
    const userId = Number(Constants.commonConstant.appUserId) || 0;
    Constants.commonConstant.appUserId = 0;
    Constants.commonConstant.appUser = defaultUser;
    Constants.commonConstant.appToken = '';
    try {
        // Forget this user's schedules/manual override and restore the
        // phone if Silent Focus had silenced it.
        if (mode === 'deleted') {
            await dropOutbox(userId);
            await resetEngine();
        } else if (mode === 'expired') {
            // Native first: if the app dies before the credentials are
            // removed, the next start just meets the same 401 again.
            await expireNativeSession(userId);
        } else {
            // userId 0 (e.g. a half-written session): native uses the
            // recorded history owner.
            const kept = await preserveForLogout(userId);
            await (kept.saved ? resetEngine() : resetEngineKeepingHistory());
        }
    } catch (e) {
        // Device state is best effort here; logout must still complete.
    }
    try {
        if (mode === 'expired' && userId > 0) {
            await AsyncStorage.setItem(EXPIRED_OWNER_KEY, String(userId));
            await AsyncStorage.multiRemove(SESSION_STORAGE_KEYS.filter(k => !EXPIRY_KEPT_KEYS.includes(k)));
        } else {
            await AsyncStorage.multiRemove([...SESSION_STORAGE_KEYS, EXPIRED_OWNER_KEY]);
        }
    } catch (e) {
        // Storage failure must not keep the user signed in.
    } finally {
        isClearing = false;
        Emitter.emit(Constants.eventListenerKeys.logoutListener, null);
    }
};

// ---- Server rejected the session (HTTP 401)

export const SESSION_EXPIRED_MESSAGE =
    'Your session has expired. Please sign in again - your activity on this phone has been kept.';

// How long a "this token still works" answer is trusted, so one endpoint
// that keeps answering 401 doesn't re-probe on every request.
export const AUTH_VALID_CACHE_MS = 60 * 1000;

let rejection = null; // in-flight {token, promise}
let lastValid = null; // {token, at}

/** Tests only. */
export const resetAuthRejectionState = () => {
    rejection = null;
    lastValid = null;
};

/**
 * A request sent with [sentHeaders] was answered with an auth failure. Ends
 * the session ('expired' mode, nothing of the account is deleted) only when
 * a fresh check with the same token is rejected too ([confirm] resolves
 * 'REJECTED' | 'VALID' | 'UNKNOWN'):
 * - a 401 for a token that is no longer current (superseded) is ignored;
 * - 'VALID': the endpoint refused this request, the session is fine;
 * - 'UNKNOWN' (network error, 5xx): nothing happens, the next 401 re-checks;
 * - concurrent rejections of the same token share one check and one expiry.
 * Resolves 'STALE' | 'ENDPOINT_ONLY' | 'UNCONFIRMED' | 'EXPIRED'.
 */
export const handleAuthRejected = (sentHeaders, {confirm, now = Date.now} = {}) => {
    if (!wasSentWithCurrentToken(sentHeaders)) return Promise.resolve('STALE');
    const token = Constants.commonConstant.appToken;
    if (rejection?.token === token) return rejection.promise;
    if (lastValid?.token === token && now() - lastValid.at < AUTH_VALID_CACHE_MS) {
        return Promise.resolve('ENDPOINT_ONLY');
    }
    const userId = Number(Constants.commonConstant.appUserId) || 0;
    const promise = (async () => {
        let verdict = 'UNKNOWN';
        try {
            verdict = confirm ? await confirm(token, userId) : 'REJECTED';
        } catch (e) {
            verdict = 'UNKNOWN';
        }
        // Signed out or signed in again while checking: not this session any more.
        if (Constants.commonConstant.appToken !== token) return 'STALE';
        if (verdict === 'VALID') {
            lastValid = {token, at: now()};
            return 'ENDPOINT_ONLY';
        }
        if (verdict !== 'REJECTED') return 'UNCONFIRMED';
        await clearSession({mode: 'expired'});
        Alert.alert('Silent Focus', SESSION_EXPIRED_MESSAGE);
        return 'EXPIRED';
    })().finally(() => {
        if (rejection?.promise === promise) rejection = null;
    });
    rejection = {token, promise};
    return promise;
};

