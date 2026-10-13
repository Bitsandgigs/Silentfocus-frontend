// Uploads locally recorded activity and Silent Focus sessions to the backend
// through POST /sync (SilentFocusController::syncAppData). Contract taken
// from the backend source and checked against production rows:
//  - logs[]: {type, client_event_id, timestamp, sender_name?, sender_number?,
//    content?}; type in incoming_call | missed_call | incoming_sms |
//    auto_response | notification; a client_event_id that already exists is
//    skipped (idempotent).
//  - silent_sessions[]: {client_event_id, started_at (required), ended_at?,
//    trigger_type, silent_mode}; upserted by client_event_id, so re-sending
//    an open session later with ended_at updates the same row.
// The native engine stays the source of truth; this is a best-effort mirror
// with an offline queue: nothing is marked sent until the server answered
// 200, and anything not yet sent is retried on the next trigger.
//
// Privacy: no message text, no full phone numbers (callers are already
// redacted natively), no contact names, no coordinates.
//
// Server WRITES (see serverWritesAllowed):
//  - release builds: on;
//  - debug builds: off, so development never writes test data into real
//    accounts (there is no separate staging server; both use
//    https://silent.rpaywin.com). The only exception is a dedicated test
//    account named at BUILD time (SF_DEBUG_SERVER_WRITES_ACCOUNT_ID, debug
//    builds only): writes then happen only while that account is signed in.
// Reads are never gated.

import AsyncStorage from '@react-native-async-storage/async-storage';

import APICall from './api/api';
import EndPoints from './api/endpoints';
import {clearLocalActivity, getSyncableActivity, isSyntheticEvent, markActivityAcknowledged} from './comms';
import {getOutbox, preserveForLogout, removeFromOutbox} from './outbox';
import {getSessionHistory} from './sessionHistory';
import {Constants} from './theme';
import {AUTOMATIC_UPLOADS_DISABLED, DEBUG_SERVER_WRITES_ACCOUNT_ID, IS_DEBUG_BUILD} from './buildConfig';

/**
 * Pure decision (tested). `isDev`: a debug APK OR a dev JS bundle - a debug
 * APK running a non-dev bundle must still be gated. Release builds (native
 * BuildConfig.DEBUG false and a production bundle) always write, except the
 * field-test build type (`uploadsDisabled`), which never uploads automatically.
 */
export const serverWritesAllowed = ({
    isDev = __DEV__ || IS_DEBUG_BUILD,
    testAccountId = DEBUG_SERVER_WRITES_ACCOUNT_ID,
    userId = Constants.commonConstant.appUserId,
    uploadsDisabled = AUTOMATIC_UPLOADS_DISABLED,
} = {}) => {
    if (uploadsDisabled === true) return false;
    if (!isDev) return true;
    if (!testAccountId || !/^[0-9]+$/.test(String(testAccountId))) return false;
    return userId != null && String(userId) === String(testAccountId);
};

let warned = false;
const debugWriteNotice = () => {
    if (__DEV__ && !warned && serverWritesAllowed()) {
        warned = true;
        console.warn('[serverSync] Server writes ENABLED for dedicated test account', DEBUG_SERVER_WRITES_ACCOUNT_ID);
    }
};

const KEY_INSTALL_ID = 'sf.sync.installId';
const KEY_STATE = 'sf.sync.state';
const MAX_LOGS_PER_REQUEST = 100;
const MAX_SESSIONS_PER_REQUEST = 50;
// Older items are not uploaded (the local journal keeps 30 days anyway).
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

const JSON_HEADERS = {'Content-Type': 'application/json', Accept: 'application/json'};

// ---- Pure mapping (tested)

const LOG_TYPES = {
    INCOMING_CALL: 'incoming_call',
    EMERGENCY_BREAKTHROUGH: 'incoming_call',
    URGENT_REPEAT_CALLER: 'incoming_call',
    MESSAGE_RECEIVED: 'notification',
    AUTO_REPLY_SENT: 'auto_response',
};

const LOG_CONTENT = {
    INCOMING_CALL: 'Call while Silent Focus was on',
    EMERGENCY_BREAKTHROUGH: 'Emergency contact allowed',
    URGENT_REPEAT_CALLER: 'Urgent caller allowed',
    MESSAGE_RECEIVED: 'Message received',
    AUTO_REPLY_SENT: 'Auto reply sent',
};

const TRIGGER_TYPES = {
    MANUAL: 'manual',
    ZONE: 'silent_zone',
    SCHEDULE: 'schedule',
    CALENDAR: 'calendar',
};

/** Prefix that marks rows this installation uploaded. */
export const clientEventPrefix = installId => `sf:${installId}:`;

export const eventClientId = (installId, event) => `${clientEventPrefix(installId)}e:${event.id}`;

export const sessionClientId = (installId, session) => `${clientEventPrefix(installId)}s:${session.start}`;

const iso = ms => new Date(ms).toISOString();

/** Native journal event -> backend log row, or null when it isn't uploaded. */
export const toServerLog = (installId, e) => {
    const type = LOG_TYPES[e?.type];
    // Test-harness rows are never uploaded (also excluded natively).
    if (!type || !e.id || !Number.isFinite(Number(e.at)) || isSyntheticEvent(e)) return null;
    const isMessage = e.type === 'MESSAGE_RECEIVED' || e.type === 'AUTO_REPLY_SENT';
    return {
        type,
        client_event_id: eventClientId(installId, e),
        timestamp: iso(Number(e.at)),
        sender_name: isMessage ? e.app || null : null,
        // Already redacted natively (e.g. "+91******1234"); never a full number.
        sender_number: isMessage ? null : e.caller || null,
        content: LOG_CONTENT[e.type],
    };
};

/** Native session -> backend silent_sessions row. */
export const toServerSession = (installId, s) => ({
    client_event_id: sessionClientId(installId, s),
    trigger_type: TRIGGER_TYPES[s.primarySource] || 'manual',
    silent_mode: 'dnd',
    started_at: iso(s.start),
    ended_at: s.end == null ? null : iso(s.end),
});

/** A session's state key: re-sent when it changes (e.g. it ended). */
const sessionStateKey = s => `${s.start}|${s.end ?? ''}`;

/**
 * Picks what still has to be uploaded. [state]: {sentEvents: {clientId: true},
 * sentSessions: {clientId: stateKey}}.
 */
/** Read back from the server and marked natively (EngineStore / SessionStore). */
export const isAcknowledgedEvent = e => e?.acked === true;
export const isAcknowledgedSession = s => s?.end != null && s?.ackedEnd === s.end;

export const pendingUploads = ({installId, events, sessions, state, now = Date.now()}) => {
    const sentEvents = state?.sentEvents || {};
    const sentSessions = state?.sentSessions || {};
    // Anything the server has acknowledged (read back) is done; anything else
    // is uploaded whatever its age, because native retention keeps it until
    // it is acknowledged.
    const logs = (Array.isArray(events) ? events : [])
        .filter(e => e && !isAcknowledgedEvent(e))
        .map(e => toServerLog(installId, e))
        .filter(l => l && !sentEvents[l.client_event_id] && !inBackoff(state, l.client_event_id, now))
        .slice(0, MAX_LOGS_PER_REQUEST);
    const silentSessions = (Array.isArray(sessions) ? sessions : [])
        .filter(s => s && !isAcknowledgedSession(s))
        .filter(s => sentSessions[sessionClientId(installId, s)] !== sessionStateKey(s))
        .filter(s => !inBackoff(state, sessionClientId(installId, s), now))
        .slice(0, MAX_SESSIONS_PER_REQUEST);
    return {logs, sessions: silentSessions};
};

/** State after the server accepted a batch (HTTP 200, even with row errors). */
export const markUploaded = ({installId, state, logs, sessions, now = Date.now()}) => {
    const sentEvents = {...(state?.sentEvents || {})};
    logs.forEach(l => {
        sentEvents[l.client_event_id] = true;
    });
    const sentSessions = {...(state?.sentSessions || {})};
    sessions.forEach(s => {
        sentSessions[sessionClientId(installId, s)] = sessionStateKey(s);
    });
    // Bounded: forget ids for items too old to be uploaded again.
    const cutoff = now - MAX_AGE_MS - 24 * 60 * 60 * 1000;
    const keepEvent = id => {
        const m = id.match(/:e:(\d+)-/);
        return !m || Number(m[1]) > cutoff;
    };
    const keepSession = id => {
        const m = id.match(/:s:(\d+)$/);
        return !m || Number(m[1]) > cutoff;
    };
    return {
        sentEvents: Object.fromEntries(Object.entries(sentEvents).filter(([id]) => keepEvent(id))),
        sentSessions: Object.fromEntries(Object.entries(sentSessions).filter(([id]) => keepSession(id))),
        lastSyncAt: now,
    };
};

/** Server rows this installation uploaded (already shown as local activity). */
export const isOwnUpload = (installId, row) =>
    !!installId && typeof row?.clientEventId === 'string' && row.clientEventId.startsWith(clientEventPrefix(installId));

// ---- Storage

export const getInstallId = async () => {
    try {
        const existing = await AsyncStorage.getItem(KEY_INSTALL_ID);
        if (existing) return existing;
        const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
        await AsyncStorage.setItem(KEY_INSTALL_ID, id);
        return id;
    } catch (e) {
        return null;
    }
};

const loadState = async () => {
    try {
        return JSON.parse((await AsyncStorage.getItem(KEY_STATE)) || '{}');
    } catch (e) {
        return {};
    }
};

const saveState = state => AsyncStorage.setItem(KEY_STATE, JSON.stringify(state)).catch(() => {});

// Read-modify-write of the upload state, one at a time and always on the
// latest stored copy, so a slow or late operation can't overwrite newer
// upload acknowledgements.
let stateQueue = Promise.resolve();
const updateState = mutate => {
    const run = stateQueue.then(async () => {
        const next = mutate(await loadState());
        await saveState(next);
        return next;
    });
    stateQueue = run.catch(() => {});
    return run;
};

// ---- Retry backoff for items the server keeps rejecting
// An item uploaded but not found on read-back waits 15 min, then 30, 60...
// (max 24 h) before it is sent again. It is never dropped, and it doesn't
// occupy upload slots meanwhile, so new valid records are not held up.

const BACKOFF_BASE_MS = 15 * 60 * 1000;
const BACKOFF_MAX_MS = 24 * 60 * 60 * 1000;

export const backoffDelay = attempts => Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** Math.max(0, attempts - 1));

export const inBackoff = (state, clientId, now = Date.now()) => Number(state?.backoff?.[clientId]?.nextAt) > now;

/** Pure: state with [failedIds] backed off one more step and [okIds] cleared. */
export const withBackoff = (state, {failedIds = [], okIds = [], now = Date.now()}) => {
    const backoff = {...(state?.backoff || {})};
    failedIds.forEach(id => {
        const n = (Number(backoff[id]?.n) || 0) + 1;
        backoff[id] = {n, nextAt: now + backoffDelay(n)};
    });
    okIds.forEach(id => delete backoff[id]);
    return {...state, backoff};
};

/** Logout: the next account must not inherit this one's upload state. */
export const clearSyncState = () => AsyncStorage.removeItem(KEY_STATE).catch(() => {});

// ---- Upload

let running = null;

/**
 * Uploads pending activity and sessions. Safe to call often: concurrent
 * calls share one run, a failed run leaves everything queued, and the
 * server de-duplicates by client_event_id. Resolves a summary.
 */
export const syncActivityAndSessions = ({transport = APICall, enabled = serverWritesAllowed()} = {}) => {
    if (!enabled) return Promise.resolve({skipped: 'WRITES_DISABLED'});
    debugWriteNotice();
    if (!Constants.commonConstant.appToken) return Promise.resolve({skipped: 'SIGNED_OUT'});
    if (running) return running;
    running = (async () => {
        const installId = await getInstallId();
        if (!installId) return {skipped: 'NO_INSTALL_ID'};
        // This account's data saved at an earlier logout on this phone.
        const outbox = await flushOutbox({transport, installId}).catch(() => ({failed: true}));
        const [events, history, state] = await Promise.all([
            getSyncableActivity().catch(() => []),
            getSessionHistory().catch(() => ({sessions: []})),
            loadState(),
        ]);
        const {logs, sessions} = pendingUploads({installId, events, sessions: history.sessions, state});
        if (!logs.length && !sessions.length) {
            // Nothing new; still confirm older unacknowledged items now and then.
            const due = Date.now() - (Number(state?.lastVerifyAt) || 0) > VERIFY_INTERVAL_MS;
            const verify = due ? await verifyAcknowledgements({transport, installId}).catch(() => ({ok: false})) : null;
            return {uploaded: 0, verified: verify ? verify.ok : null, outbox};
        }
        const response = await transport(
            'post',
            {
                sync_type: 'activity',
                logs,
                silent_sessions: sessions.map(s => toServerSession(installId, s)),
            },
            EndPoints.offlineSync,
            JSON_HEADERS,
        );
        if (response?.statusCode !== Constants.apiStatusCode.success) {
            // Network error / 5xx: keep everything queued for the next try.
            return {failed: true, statusCode: response?.statusCode, outbox};
        }
        // Accepted. Rows the server rejected come back only as
        // {index, message}; the read-back below finds them missing and
        // re-queues them (they stay on the phone until acknowledged).
        await updateState(latest => markUploaded({installId, state: latest, logs, sessions}));
        // HTTP 200 is not proof (rejected rows are only {index, message}):
        // read back and acknowledge what the server really holds.
        const verify = await verifyAcknowledgements({transport, installId}).catch(() => ({ok: false}));
        return {
            uploaded: logs.length + sessions.length,
            rejected: (response?.data?.result?.errors || []).length,
            verified: verify.ok,
            outbox,
        };
    })().finally(() => {
        running = null;
    });
    return running;
};

// ---- Acknowledgement (read-back) and the Clear guard

const CLEAR_TIMEOUT_MS = 20000;
const MAX_READ_PAGES = 20;
const VERIFY_INTERVAL_MS = 6 * 60 * 60 * 1000;

/** Backend "YYYY-MM-DD HH:mm:ss" (UTC) -> epoch seconds, or null. */
const serverSeconds = ts => {
    if (!ts) return null;
    const t = Date.parse(`${String(ts).trim().replace(' ', 'T')}Z`);
    return Number.isNaN(t) ? null : Math.floor(t / 1000);
};

/**
 * Pure (tested): finished sessions whose latest state (start, end, ended)
 * the server doesn't hold.
 */
export const unacknowledgedSessions = ({installId, sessions, serverRows}) => {
    const byClientId = new Map();
    (Array.isArray(serverRows) ? serverRows : []).forEach(row => {
        const m = /^client_event_id:(.+)$/.exec(String(row?.notes || ''));
        if (m) byClientId.set(m[1], row);
    });
    return (Array.isArray(sessions) ? sessions : [])
        .filter(s => s?.end != null)
        .filter(s => {
            const row = byClientId.get(sessionClientId(installId, s));
            return (
                !row ||
                row.status !== 'ended' ||
                serverSeconds(row.started_at) !== Math.floor(s.start / 1000) ||
                serverSeconds(row.ended_at) !== Math.floor(s.end / 1000)
            );
        });
};

/**
 * Pure (tested): uploaded-type journal events (calls/messages) that are not
 * on the server by client_event_id and type. Automation events are never
 * uploaded.
 */
export const unacknowledgedLogs = ({installId, events, serverLogs}) => {
    const onServer = new Map();
    (Array.isArray(serverLogs) ? serverLogs : []).forEach(row => {
        if (row?.client_event_id) onServer.set(String(row.client_event_id), row);
    });
    return (Array.isArray(events) ? events : []).filter(e => {
        const log = toServerLog(installId, e);
        if (!log) return false;
        const row = onServer.get(log.client_event_id);
        return !row || row.type !== log.type;
    });
};

/** Pages a list endpoint (newest first) back to `sinceMs`. Throws on failure. */
const readBack = async (transport, url, params, timeField, sinceMs) => {
    let rows = [];
    for (let page = 1; page <= MAX_READ_PAGES; page++) {
        const response = await transport('get', {...params, page, per_page: 50}, url);
        if (response?.statusCode !== Constants.apiStatusCode.success || response?.data?.status !== '1') {
            throw new Error('read-back');
        }
        const result = response.data.result;
        const data = Array.isArray(result?.data) ? result.data : [];
        rows = rows.concat(data);
        const oldest = serverSeconds(data[data.length - 1]?.[timeField]);
        const lastPage = Number(result?.last_page) || page;
        if (page >= lastPage || (oldest != null && oldest * 1000 < sinceMs)) {
            return rows;
        }
    }
    return rows; // older pages unread: anything there stays unacknowledged
};

/**
 * Reads the server back for every not-yet-acknowledged session/log and
 * marks the ones it really holds as acknowledged natively (so retention may
 * drop them later). The others are re-queued for upload. Resolves
 * {ok, badSessions, badLogs}; throws if the server can't be read.
 */
export const verifyAcknowledgements = async ({transport = APICall, installId} = {}) => {
    const [events, history] = await Promise.all([getSyncableActivity(), getSessionHistory()]);
    const pendingEvents = (Array.isArray(events) ? events : []).filter(e => e && !isAcknowledgedEvent(e) && toServerLog(installId, e));
    const pendingSessions = (history?.sessions || []).filter(x => x.end != null && !isAcknowledgedSession(x));
    if (!pendingEvents.length && !pendingSessions.length) {
        await updateState(latest => ({...latest, lastVerifyAt: Date.now()}));
        return {ok: true, badSessions: [], badLogs: []};
    }
    const since = Math.min(
        ...pendingEvents.map(e => Number(e.at)),
        ...pendingSessions.map(x => x.start),
    );
    const [serverSessions, serverLogs] = await Promise.all([
        pendingSessions.length
            ? readBack(transport, EndPoints.getSilentSessions, {}, 'started_at', since)
            : Promise.resolve([]),
        pendingEvents.length
            ? readBack(transport, EndPoints.getWhatssAppCalllogs, {userId: Constants.commonConstant.appUserId}, 'timestamp', since)
            : Promise.resolve([]),
    ]);
    const badSessions = unacknowledgedSessions({installId, sessions: pendingSessions, serverRows: serverSessions});
    const badLogs = unacknowledgedLogs({installId, events: pendingEvents, serverLogs});
    const badStarts = new Set(badSessions.map(x => x.start));
    const badIds = new Set(badLogs.map(e => e.id));
    const marked = await markActivityAcknowledged(
        pendingEvents.filter(e => !badIds.has(e.id)).map(e => e.id),
        pendingSessions.filter(x => !badStarts.has(x.start)).map(x => ({start: x.start, end: x.end})),
    );
    // Native side can't store the marks (e.g. JS newer than the installed
    // native code): not verified, so don't record a check.
    if (marked === false) throw new Error('acknowledge');
    // Re-queue on the latest state so the next sync sends them again; ones
    // that were already sent (i.e. rejected) wait with a growing backoff.
    await updateState(latest => {
        const sentSessions = {...(latest?.sentSessions || {})};
        const sentEvents = {...(latest?.sentEvents || {})};
        const failedIds = [];
        badSessions.forEach(x => {
            const id = sessionClientId(installId, x);
            if (sentSessions[id] !== undefined) failedIds.push(id);
            delete sentSessions[id];
        });
        badLogs.forEach(e => {
            const id = eventClientId(installId, e);
            if (sentEvents[id] !== undefined) failedIds.push(id);
            delete sentEvents[id];
        });
        const okIds = [
            ...pendingEvents.filter(e => !badIds.has(e.id)).map(e => eventClientId(installId, e)),
            ...pendingSessions.filter(x => !badStarts.has(x.start)).map(x => sessionClientId(installId, x)),
        ];
        return {...withBackoff(latest, {failedIds, okIds}), sentSessions, sentEvents, lastVerifyAt: Date.now()};
    });
    return {ok: true, badSessions, badLogs};
};

/**
 * What "Clear phone activity" may delete: finished sessions and journal
 * entries the server has acknowledged (read back), plus journal entries that
 * are never uploaded. Everything else stays on the phone.
 *  - {ok: false}: nothing may be cleared (offline, sync or read-back failed,
 *    timeout).
 *  - {ok: true, clearableStarts, clearableEventIds, kept}.
 * Without server writes (debug, non-test account) there is nothing to keep.
 */
export const prepareClearLocalActivity = ({
    transport = APICall,
    enabled = serverWritesAllowed(),
    timeoutMs = CLEAR_TIMEOUT_MS,
} = {}) => {
    if (!enabled) return Promise.resolve({ok: true, reason: 'WRITES_DISABLED', kept: 0});
    const work = (async () => {
        const sync = await syncActivityAndSessions({transport, enabled});
        if (sync?.failed || sync?.skipped) return {ok: false, reason: 'SYNC_FAILED'};
        const installId = await getInstallId();
        if (!installId) return {ok: false, reason: 'NO_INSTALL_ID'};
        await verifyAcknowledgements({transport, installId});
        // Fresh copies with the acknowledgement marks just written.
        const [events, history] = await Promise.all([getSyncableActivity(), getSessionHistory()]);
        const list = Array.isArray(events) ? events : [];
        const clearableEventIds = list
            .filter(e => e?.id && (isAcknowledgedEvent(e) || !toServerLog(installId, e)))
            .map(e => e.id);
        const finished = (history?.sessions || []).filter(x => x.end != null);
        const clearableStarts = finished.filter(isAcknowledgedSession).map(x => x.start);
        const kept = (list.length - clearableEventIds.length) + (finished.length - clearableStarts.length);
        return {ok: true, clearableStarts, clearableEventIds, kept};
    })().catch(() => ({ok: false, reason: 'FAILED'}));
    let timer;
    const timeout = new Promise(resolve => {
        timer = setTimeout(() => resolve({ok: false, reason: 'TIMEOUT'}), timeoutMs);
    });
    return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
};

/**
 * The only way screens clear local activity: verifies first, then clears
 * only the acknowledged items. Resolves {ok, reason?, kept}.
 */
export const clearLocalActivitySafely = async options => {
    const check = await prepareClearLocalActivity(options);
    if (!check.ok) return check;
    await clearLocalActivity(check.clearableStarts ?? null, check.clearableEventIds ?? null);
    return check;
};

// ---- Logout outbox (see outbox.js)

/**
 * Uploads the signed-in account's own outbox (data saved at an earlier
 * logout on this phone), reads the server back and removes only what it
 * holds. Never touches another account's outbox. Resolves
 * {uploaded, verified, left} or {failed: true}.
 */
export const flushOutbox = async ({transport = APICall, installId} = {}) => {
    const userId = Number(Constants.commonConstant.appUserId);
    if (!(userId > 0) || !installId) return {skipped: true};
    const box = await getOutbox(userId);
    if (!box.events.length && !box.sessions.length) return {uploaded: 0, left: 0};
    const state = await loadState();
    const now = Date.now();
    const logs = box.events
        .map(e => toServerLog(installId, e))
        .filter(l => l && !inBackoff(state, l.client_event_id, now))
        .slice(0, MAX_LOGS_PER_REQUEST);
    const sessions = box.sessions
        .filter(x => !inBackoff(state, sessionClientId(installId, x), now))
        .slice(0, MAX_SESSIONS_PER_REQUEST);
    if (logs.length || sessions.length) {
        const response = await transport(
            'post',
            {sync_type: 'activity', logs, silent_sessions: sessions.map(x => toServerSession(installId, x))},
            EndPoints.offlineSync,
            JSON_HEADERS,
        );
        if (response?.statusCode !== Constants.apiStatusCode.success) return {failed: true};
    }
    // Read back everything in the outbox (also items uploaded earlier).
    const since = Math.min(...box.events.map(e => Number(e.at)), ...box.sessions.map(x => x.start));
    const [serverSessions, serverLogs] = await Promise.all([
        box.sessions.length ? readBack(transport, EndPoints.getSilentSessions, {}, 'started_at', since) : [],
        box.events.length ? readBack(transport, EndPoints.getWhatssAppCalllogs, {userId}, 'timestamp', since) : [],
    ]);
    const badSessions = new Set(unacknowledgedSessions({installId, sessions: box.sessions, serverRows: serverSessions}).map(x => x.start));
    const badIds = new Set(unacknowledgedLogs({installId, events: box.events, serverLogs}).map(e => e.id));
    const okEvents = box.events.filter(e => !badIds.has(e.id));
    const okSessions = box.sessions.filter(x => !badSessions.has(x.start));
    if (okEvents.length || okSessions.length) {
        await removeFromOutbox(userId, okEvents.map(e => e.id), okSessions.map(x => ({start: x.start, end: x.end})));
    }
    const uploadedIds = new Set([...logs.map(l => l.client_event_id), ...sessions.map(x => sessionClientId(installId, x))]);
    const failedIds = [
        ...box.events.filter(e => badIds.has(e.id)).map(e => eventClientId(installId, e)),
        ...box.sessions.filter(x => badSessions.has(x.start)).map(x => sessionClientId(installId, x)),
    ].filter(id => uploadedIds.has(id));
    const okIds = [...okEvents.map(e => eventClientId(installId, e)), ...okSessions.map(x => sessionClientId(installId, x))];
    await updateState(latest => withBackoff(latest, {failedIds, okIds}));
    return {
        uploaded: logs.length + sessions.length,
        verified: okEvents.length + okSessions.length,
        left: badIds.size + badSessions.size,
    };
};

const PRE_LOGOUT_SYNC_MS = 8000;

/**
 * User-initiated logout, before the token is revoked: one bounded sync,
 * then this account's unacknowledged data is saved to its outbox.
 * {ok: false} -> don't log out (nothing could be kept safely).
 */
export const prepareUserLogout = async ({transport = APICall, enabled = serverWritesAllowed(), timeoutMs = PRE_LOGOUT_SYNC_MS} = {}) => {
    let timer;
    await Promise.race([
        syncActivityAndSessions({transport, enabled}).catch(() => null),
        new Promise(resolve => {
            timer = setTimeout(resolve, timeoutMs);
        }),
    ]);
    clearTimeout(timer);
    const kept = await preserveForLogout(Constants.commonConstant.appUserId);
    return {ok: kept.saved, count: kept.count};
};
