import {useEffect} from 'react';
import {AppState} from 'react-native';

import {refreshSubscription} from './subscription';

/**
 * Keeps the phone's plan entitlements fresh while signed in: on login and every time the app comes to the
 * foreground (a finished trial, a renewal or a cancellation changes what may run). Failures are silent; the
 * native side keeps the last known plan and lapses it by the clock.
 */
export const usePlanSync = isLoggedIn => {
  useEffect(() => {
    if (!isLoggedIn) return undefined;
    refreshSubscription().catch(() => {});
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') refreshSubscription().catch(() => {});
    });
    return () => sub.remove();
  }, [isLoggedIn]);
};
