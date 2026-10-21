import AsyncStorage from '@react-native-async-storage/async-storage';

import EndPoints from './api/endpoints';
import {SCHEDULE_QA_MOCK} from './buildConfig';

export const SCHEDULE_QA_KEY = '@silentfocus/fieldtest/schedule-qa-v1';

const success = data => ({statusCode: 200, data});

const readRows = async () => {
    const raw = await AsyncStorage.getItem(SCHEDULE_QA_KEY);
    if (!raw) {
        return [];
    }
    try {
        const rows = JSON.parse(raw);
        return Array.isArray(rows) ? rows : [];
    } catch (_) {
        return [];
    }
};

const writeRows = rows => AsyncStorage.setItem(SCHEDULE_QA_KEY, JSON.stringify(rows));

const pathOnly = url => String(url || '').split('?')[0];
const scheduleId = url => {
    const match = pathOnly(url).match(/^scheduleTimerData\/([^/]+)$/);
    return match ? decodeURIComponent(match[1]) : null;
};

const rowFrom = (body, id, enabled = false) => ({
    schedule_id: id,
    from_time: body?.from_time || '',
    to_time: body?.to_time || '',
    selected_days: body?.days || '',
    isTimerEnabled: enabled === true,
    timezone: body?.timezone || null,
    event_type: 'custom',
});

/**
 * Returns null when the real transport should run. The adapter is compiled
 * on only for a dedicated FieldTest QA build and stores rows under its own
 * disposable namespace, never the normal schedule cache.
 */
export const scheduleQaResponse = async (method, body, url) => {
    if (!SCHEDULE_QA_MOCK) {
        return null;
    }
    const verb = String(method || '').toLowerCase();
    const path = pathOnly(url);
    const id = scheduleId(url);
    let rows = await readRows();

    if (verb === 'get' && path === EndPoints.getScheduleTimerData) {
        return success({status: rows.length ? '1' : '0', result: rows});
    }
    if (verb === 'post' && path === EndPoints.setscheduleTimerData) {
        const nextId = String(rows.reduce((max, row) => Math.max(max, Number(row.schedule_id) || 0), 9000) + 1);
        rows = [...rows, rowFrom(body, nextId)];
        await writeRows(rows);
        return success({status: '1', result: rows[rows.length - 1]});
    }
    if (verb === 'put' && id !== null) {
        const index = rows.findIndex(row => String(row.schedule_id) === id);
        if (index < 0) {
            return success({status: '0', message: 'Schedule not found'});
        }
        rows[index] = rowFrom(body, id, rows[index].isTimerEnabled);
        await writeRows(rows);
        return success({status: '1', result: rows[index]});
    }
    if (verb === 'delete' && id !== null) {
        rows = rows.filter(row => String(row.schedule_id) !== id);
        await writeRows(rows);
        return success({status: '1'});
    }
    if (verb === 'post' && path === EndPoints.postTimerSchedule) {
        const target = String(body?.schedule_id ?? '');
        rows = rows.map(row =>
            String(row.schedule_id) === target
                ? {...row, isTimerEnabled: body?.isTimerEnabled === true || body?.isTimerEnabled === 'true'}
                : row,
        );
        await writeRows(rows);
        return success({status: '1'});
    }
    return null;
};

export const clearScheduleQaRows = () => AsyncStorage.removeItem(SCHEDULE_QA_KEY);
