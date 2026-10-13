// JS side of the native automation engine (android/.../automation). Screens
// never change DND themselves; they call these and render the engine state.

import {NativeEventEmitter, NativeModules, Platform} from 'react-native';

import {toEngineSchedules} from './scheduleRules';
import {toEngineZones} from './api/normalizers';

const Native = Platform.OS === 'android' ? NativeModules.SilentFocus : null;

export const isEngineAvailable = !!Native?.getState;

export const ENGINE_STATE_EVENT = 'SilentFocusStateChanged';

const unavailable = () => Promise.resolve(null);

export const getEngineState = () =>
    isEngineAvailable ? Native.getState() : unavailable();

export const evaluateEngine = reason =>
    isEngineAvailable ? Native.evaluate(reason) : unavailable();

export const setManualSilent = on =>
    isEngineAvailable ? Native.setManualSilent(!!on) : unavailable();

// Accepts Home's schedule list; calendar rows are filtered out.
export const pushSchedulesToEngine = schedules =>
    isEngineAvailable
        ? Native.setSchedules(toEngineSchedules(schedules))
        : unavailable();

// Accepts normalised Silent Zones (normalizeSilentZone output).
export const pushZonesToEngine = zones =>
    isEngineAvailable ? Native.setZones(toEngineZones(zones)) : unavailable();

export const pushAutomationSettings = settings =>
    isEngineAvailable ? Native.setAutomationSettings(settings) : unavailable();

// Re-read the device calendar natively (no event details reach JS).
export const syncDeviceCalendar = () =>
    isEngineAvailable ? Native.syncCalendar() : unavailable();

// One fresh fix: {latitude, longitude, accuracy, time, precise}.
export const getCurrentLocation = () =>
    isEngineAvailable
        ? Native.getCurrentLocation()
        : Promise.reject(new Error('Location is not available here.'));

export const resetEngine = () =>
    isEngineAvailable ? Native.reset() : unavailable();

export const openDndAccessSettings = () => Native?.openDndAccessSettings?.();

export const openExactAlarmSettings = () => Native?.openExactAlarmSettings?.();

export const subscribeEngineState = callback => {
    if (!isEngineAvailable) {
        return () => {};
    }
    const emitter = new NativeEventEmitter(Native);
    const subscription = emitter.addListener(ENGINE_STATE_EVENT, callback);
    return () => subscription.remove();
};
