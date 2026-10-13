// Round 3 (client feedback #4): the phone's own calendars for Calendar
// Settings. Everything Android's Calendar Provider holds is listed - Google,
// Samsung, Outlook / Exchange, local and other accounts that sync to the
// phone - not just Google. The native engine reads only event times from the
// chosen calendars (android/.../automation/CalendarSync.kt); calendar names
// and account names stay on the phone and are never logged or uploaded.

import {NativeModules} from 'react-native';

const Native = NativeModules.SilentFocus;

export const isCalendarPickerAvailable = !!Native?.getDeviceCalendars;

/**
 * {permission: 'granted'|'missing', selection: [id]|null, calendars: [...]}.
 * Rejects when the phone's calendar can't be read.
 */
export const getDeviceCalendars = () =>
    isCalendarPickerAvailable
        ? Native.getDeviceCalendars()
        : Promise.reject(new Error('Calendar list is not available in this version'));

/** [ids] (strings) or null (= every calendar shown in the phone's calendar app). */
export const saveCalendarSelection = ids =>
    Native?.setCalendarSelection
        ? Native.setCalendarSelection(Array.isArray(ids) ? ids.map(String) : null)
        : Promise.reject(new Error('Calendar selection is not available in this version'));

const PROVIDER_ORDER = ['Google', 'Samsung', 'Outlook / Exchange', 'On this phone', 'Other'];

/** Whether [calendar] counts under [selection] (null = visible calendars). */
export const isCalendarSelected = (selection, calendar) =>
    Array.isArray(selection) ? selection.includes(String(calendar?.id)) : !!calendar?.visible;

/** The ids [selection] stands for, among [calendars]. */
export const effectiveSelection = (selection, calendars) =>
    (Array.isArray(calendars) ? calendars : []).filter(c => isCalendarSelected(selection, c)).map(c => String(c.id));

/** Selection after tapping [id] (always explicit afterwards). */
export const toggleCalendar = (selection, calendars, id) => {
    const current = effectiveSelection(selection, calendars);
    const key = String(id);
    return current.includes(key) ? current.filter(x => x !== key) : [...current, key];
};

/**
 * Picker sections: one per provider + account, Google first, e.g.
 * {key, title: 'Google', subtitle: 'name@gmail.com', data: [calendars]}.
 */
export const groupCalendars = calendars => {
    const groups = new Map();
    (Array.isArray(calendars) ? calendars : []).forEach(c => {
        const provider = c?.provider || 'Other';
        const account = c?.accountName || '';
        const key = `${provider}|${account}`;
        if (!groups.has(key)) groups.set(key, {key, title: provider, subtitle: account || null, data: []});
        groups.get(key).data.push(c);
    });
    const rank = t => {
        const i = PROVIDER_ORDER.indexOf(t);
        return i < 0 ? PROVIDER_ORDER.length : i;
    };
    return [...groups.values()].sort(
        (a, b) => rank(a.title) - rank(b.title) || (a.subtitle || '').localeCompare(b.subtitle || ''),
    );
};

/** "All 4 visible calendars", "2 of 6 calendars", "No calendars selected". */
export const describeSelection = (selection, calendars) => {
    const list = Array.isArray(calendars) ? calendars : [];
    const chosen = effectiveSelection(selection, list).length;
    if (!list.length) return 'No calendars on this phone';
    if (!chosen) return 'No calendars selected';
    if (!Array.isArray(selection)) return `All ${chosen} visible calendar${chosen === 1 ? '' : 's'}`;
    return `${chosen} of ${list.length} calendar${list.length === 1 ? '' : 's'}`;
};

/** A short note under a calendar's name, or null. */
export const calendarNote = calendar => {
    if (calendar?.synced === false) return 'Not synced to this phone - turn on sync in its account settings';
    if (calendar?.visible === false) return 'Hidden in your calendar app';
    return null;
};
