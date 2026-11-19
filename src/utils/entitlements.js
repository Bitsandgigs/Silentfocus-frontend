// Turns the server's plan snapshot into what the phone may run, and hands it to the native engine
// (muting runs offline and in the background, so the limits must live there too).
// No plan logic here: every number comes from GET /subscription.

import {NativeModules, Platform} from 'react-native';

const Native = Platform.OS === 'android' ? NativeModules.SilentFocus : null;

const PAID_GRACE_MS = 24 * 60 * 60 * 1000; // same grace the server gives an unrenewed period

const dateMs = iso => {
  if (!iso) return 0;
  const d = new Date(String(iso).replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(String(iso)) ? '' : 'Z'));
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
};

/**
 * {limits, until}: limits use null for unlimited and 0 for locked; `until` (ms, 0 = never) is when the
 * entitlement lapses on its own, after which the native side falls back to the Free limits until the
 * app refreshes the plan.
 */
export const entitlementsFrom = snapshot => {
  if (!snapshot || !snapshot.limits) return null;
  const l = snapshot.limits;
  const pick = v => (v === null || v === undefined ? null : Math.max(0, Number(v) || 0));
  const limits = {
    calendars: pick(l.calendars),
    zones: pick(l.zones),
    replies: pick(l.automation_rules),
    apps: pick(l.connected_apps),
    suggestions: pick(l.zone_suggestions),
  };
  let until = 0;
  if (snapshot.trial?.active) {
    until = dateMs(snapshot.trial.ends_at);
  } else if (!snapshot.is_lifetime && snapshot.subscribed_plan && snapshot.current_period_end) {
    until = dateMs(snapshot.current_period_end) + PAID_GRACE_MS;
  }
  return {limits, until};
};

export const pushEntitlements = async snapshot => {
  const ent = entitlementsFrom(snapshot);
  if (!ent || !Native?.setEntitlements) return null;
  try {
    return await Native.setEntitlements(ent.limits, ent.until);
  } catch (e) {
    return null; // never let a plan sync break the screen that triggered it
  }
};

/** Logout / account switch: nothing of the previous account's plan may linger on the phone. */
export const clearEntitlements = () =>
  Native?.setEntitlements
    ? Native.setEntitlements({calendars: null, zones: null, replies: null, apps: null, suggestions: null}, 0).catch(() => null)
    : Promise.resolve(null);

/** Messaging apps installed on this phone and which of them the user picked: {apps: [{packageName, label}], chosen: []}. */
export const getMessagingApps = () =>
  Native?.getMessagingApps ? Native.getMessagingApps() : Promise.resolve({apps: [], chosen: []});

export const setAutoReplyApps = packages =>
  Native?.setAutoReplyApps ? Native.setAutoReplyApps(packages) : Promise.resolve({chosen: packages});
