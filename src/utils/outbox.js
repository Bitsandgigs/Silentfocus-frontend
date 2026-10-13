// Per-account logout outbox (native: android/.../automation/Outbox.kt).
// Unacknowledged sessions and call/message logs survive logout here, keyed
// by server user id, until the SAME account signs in again on this phone and
// the server is read back to hold them. Never shown to, merged into or
// uploaded for another account.

import {NativeModules, Platform} from 'react-native';
import {isSyntheticEvent} from './comms';

const Native = Platform.OS === 'android' ? NativeModules.SilentFocus : null;

/**
 * Saves this account's unacknowledged data before logout. userId 0 lets the
 * native side use the recorded history owner. Resolves {saved, count};
 * saved:false means the history must NOT be wiped.
 */
export const preserveForLogout = async userId => {
    if (!Native) return {saved: true, count: 0}; // no native history on this platform
    // Native code older than this JS can't save: keep the history instead.
    if (!Native.preserveForLogout) return {saved: false, count: 0};
    try {
        const r = await Native.preserveForLogout(Number(userId) || 0);
        return {saved: r?.saved === true, count: Number(r?.count) || 0};
    } catch (e) {
        return {saved: false, count: 0};
    }
};

/**
 * Logout when the outbox could not be saved: rules go, history stays.
 * Fail-safe for native code older than this JS (no such method): the old
 * full reset, so Silent Focus's silencing never stays on after logout -
 * history may then be lost (only possible with mismatched debug builds;
 * release APKs bundle JS and native together).
 */
export const resetEngineKeepingHistory = () => {
    if (Native?.resetKeepingHistory) return Native.resetKeepingHistory();
    return Native?.reset ? Native.reset() : Promise.resolve(null);
};

/**
 * Confirmed session expiry (HTTP 401, not a logout): native stops silencing
 * and this account's rules but keeps its history, pending data and settings,
 * owned by [userId]. Native code older than this JS: the logout path
 * (pending data to the outbox; history kept if that fails).
 */
export const expireNativeSession = async userId => {
    if (!Native) return;
    if (Native.expireSession) {
        await Native.expireSession(Number(userId) || 0);
        return;
    }
    const kept = await preserveForLogout(userId);
    await (kept.saved ? (Native.reset ? Native.reset() : null) : resetEngineKeepingHistory());
};

/**
 * Signed-out app start: if a sign-out was cut short (engine still holds a
 * user's rules or is silencing), finish it - pending data kept, Silent
 * Focus's own DND rule off. Resolves true if it had to clean up.
 */
export const ensureSignedOut = async () => {
    if (!Native?.ensureSignedOut) return false;
    try {
        return (await Native.ensureSignedOut()) === true;
    } catch (e) {
        return false;
    }
};

export const CLAIM_BLOCKED = 'BLOCKED';

export const ACCOUNT_SWITCH_BLOCKED_MESSAGE =
    "You can't sign in to a different account on this phone yet: activity from the previous sign-in hasn't been backed up and couldn't be saved. Please try again, or sign in with the previous account.";

/**
 * Before a sign-in completes: local history must be this account's.
 * Another account's history is moved to ITS outbox first; if that can't be
 * saved nothing is deleted and this resolves 'BLOCKED' (the caller must not
 * sign in). 'KEPT' | 'ADOPTED' | 'MOVED' otherwise.
 */
export const claimLocalHistory = async userId => {
    if (!Native) return 'KEPT'; // no native history on this platform
    if (!Native.claimHistory) return 'KEPT'; // older native code: no owners yet
    if (!(Number(userId) > 0)) return CLAIM_BLOCKED;
    try {
        const r = await Native.claimHistory(Number(userId));
        return typeof r === 'string' ? r : CLAIM_BLOCKED;
    } catch (e) {
        return CLAIM_BLOCKED;
    }
};

/** Only this account's outbox: {events, sessions}. */
export const getOutbox = async userId => {
    if (!Native?.getOutbox || !(Number(userId) > 0)) return {events: [], sessions: []};
    const r = await Native.getOutbox(Number(userId));
    return {
        // Synthetic (test-harness) rows never enter an outbox natively; dropped again here.
        events: Array.isArray(r?.events) ? r.events.filter(e => !isSyntheticEvent(e)) : [],
        sessions: Array.isArray(r?.sessions) ? r.sessions : [],
    };
};

/** Removes only what the server was read back to hold. */
export const removeFromOutbox = (userId, eventIds, sessions) =>
    Native?.removeFromOutbox
        ? Native.removeFromOutbox(Number(userId), eventIds || [], sessions || [])
        : Promise.resolve(false);

/** Account deleted: its outbox can never be uploaded. */
export const dropOutbox = userId =>
    Native?.dropOutbox && Number(userId) > 0 ? Native.dropOutbox(Number(userId)) : Promise.resolve(true);
