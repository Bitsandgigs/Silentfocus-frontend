// Smart Location Learning (native: android/.../learning). Suggestions only:
// a Silent Zone is created solely through the normal zone form after the
// user presses Save. Learned places never leave the device.

import {NativeEventEmitter, NativeModules, Platform} from 'react-native';

const Native = Platform.OS === 'android' ? NativeModules.SilentFocus : null;

export const isLearningAvailable = !!Native?.getLearningState;

export const LEARNING_SUGGESTION_EVENT = 'SilentFocusLearningSuggestion';

export const DEFAULT_LEARNING_STATE = {
    enabled: false,
    optInAnswered: false,
    placeCount: 0,
    suggestion: null,
};

export const normalizeLearningState = raw => {
    const s = {...DEFAULT_LEARNING_STATE, ...(raw || {})};
    const g = s.suggestion;
    const valid =
        g && typeof g.id === 'string' && Number.isFinite(g.latitude) && Number.isFinite(g.longitude);
    return {
        enabled: !!s.enabled,
        optInAnswered: !!s.optInAnswered,
        placeCount: Number.isFinite(s.placeCount) ? s.placeCount : 0,
        suggestion: valid
            ? {
                  id: g.id,
                  latitude: g.latitude,
                  longitude: g.longitude,
                  radius: Number.isFinite(g.radius) ? g.radius : 150,
              }
            : null,
    };
};

/** Route params for MapScreen's Add Zone form (pre-filled, not saved). */
export const zonePrefillFromSuggestion = suggestion =>
    suggestion
        ? {
              learnedPlace: {
                  id: suggestion.id,
                  latitude: suggestion.latitude,
                  longitude: suggestion.longitude,
                  radius: suggestion.radius,
              },
          }
        : null;

/** Whether Home should offer to turn learning on (once, after a manual ON). */
export const shouldOfferOptIn = (state, justTurnedOnManually) =>
    isLearningAvailable && !!justTurnedOnManually && !state.enabled && !state.optInAnswered;

const unavailable = () => Promise.resolve(normalizeLearningState(null));
const call = (name, ...args) =>
    isLearningAvailable ? Native[name](...args).then(normalizeLearningState) : unavailable();

export const getLearningState = () => call('getLearningState');
export const setLearningEnabled = on => call('setLearningEnabled', !!on);
export const answerLearningOptIn = accepted => call('answerLearningOptIn', !!accepted);
export const dismissLearningSuggestion = id => call('dismissLearningSuggestion', String(id));
export const acceptLearningSuggestion = id => call('acceptLearningSuggestion', String(id));
export const resolveLearnedPlace = id => call('resolveLearnedPlace', String(id));
export const clearLearnedLocations = () => call('clearLearnedLocations');

export const subscribeLearningSuggestion = callback => {
    if (!isLearningAvailable) return () => {};
    const sub = new NativeEventEmitter(Native).addListener(LEARNING_SUGGESTION_EVENT, callback);
    return () => sub.remove();
};
