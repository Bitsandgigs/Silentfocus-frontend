/* eslint-env jest */
// Activity history: one action -> one entry, also across sync retries.

import {markUploaded, pendingUploads} from '../src/utils/serverSync';
import {normalizeLocalEvents} from '../src/utils/activityEvents';

const ID = 'install-1';
const NOW = Date.UTC(2026, 9, 10, 12, 0, 0);
const MIN = 60 * 1000;
const ev = (type, at, extra = {}) => ({id: `${at}-1-${type}`, type, at, ...extra});

describe('sync retries', () => {
    const events = [
        ev('SCHEDULE_STARTED', NOW - 20 * MIN, {name: 'Night'}),
        ev('MESSAGE_RECEIVED', NOW - 10 * MIN, {app: 'WhatsApp'}),
        ev('SCHEDULE_ENDED', NOW, {name: 'Night'}),
    ];
    const session = {start: NOW - 20 * MIN, end: NOW, primarySource: 'SCHEDULE'};

    test('a failed upload is retried with the same ids, a successful one is not repeated', () => {
        const first = pendingUploads({installId: ID, events, sessions: [session], state: {}, now: NOW});
        // Rule/silence events are local-only; only the message is a server log.
        expect(first.logs.map(l => l.content)).toEqual(['Message received']);
        expect(first.sessions).toHaveLength(1);

        // Request failed: nothing marked, the retry sends identical client ids.
        const retry = pendingUploads({installId: ID, events, sessions: [session], state: {}, now: NOW + MIN});
        expect(retry.logs.map(l => l.client_event_id)).toEqual(first.logs.map(l => l.client_event_id));

        const state = markUploaded({installId: ID, state: {}, ...retry, now: NOW + MIN});
        const after = pendingUploads({installId: ID, events, sessions: [session], state, now: NOW + 2 * MIN});
        expect(after.logs).toHaveLength(0);
        expect(after.sessions).toHaveLength(0);
    });
});

describe('schedule session in Activity', () => {
    test('one START and one END row for a schedule-driven session', () => {
        // What the engine now journals for a schedule that silences and unsilences.
        const rows = normalizeLocalEvents([
            ev('SCHEDULE_STARTED', NOW - 60 * MIN, {name: 'Night', source: 'SCHEDULE'}),
            ev('SCHEDULE_ENDED', NOW, {name: 'Night', source: 'SCHEDULE'}),
        ]);
        expect(rows.map(r => r.title)).toEqual(['Schedule silence ended', 'Schedule silence started']);
    });
});
