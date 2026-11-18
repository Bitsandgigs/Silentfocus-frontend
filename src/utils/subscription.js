// Subscription state for the app. There is NO plan logic here: every value
// (plan, status, limits, usage, "limit reached") comes from the backend's
// GET /subscription, so the app and the API can never disagree. This module
// only caches the last response, lets screens subscribe to it and formats it.

import {getSubscription, syncSubscription} from './api/apiServices';

let snapshot = null; // last server response (result object)
let lastError = null;
let pendingSessionId = null; // Stripe Checkout session the user was sent to
const listeners = new Set();

const emit = () => listeners.forEach(l => l({snapshot, error: lastError}));

export const subscribeToSubscription = listener => {
  listeners.add(listener);
  listener({snapshot, error: lastError});
  return () => listeners.delete(listener);
};

export const getSubscriptionSnapshot = () => snapshot;
export const clearSubscriptionState = () => {
  snapshot = null;
  lastError = null;
  pendingSessionId = null;
  emit();
};

export const rememberCheckoutSession = id => {
  pendingSessionId = id || null;
};
export const hasPendingCheckout = () => !!pendingSessionId;

const accept = response => {
  if (response?.statusCode === 200 && response?.data?.status === '1' && response.data.result) {
    snapshot = response.data.result;
    lastError = null;
    emit();
    return snapshot;
  }
  lastError = response;
  emit();
  return null;
};

/** Reads the current subscription from the backend. */
export const refreshSubscription = async () => accept(await getSubscription());

/**
 * After the user returns from Checkout: asks the backend to confirm with Stripe
 * (server-to-server), then renders what the backend says. The app never decides
 * whether a payment succeeded.
 */
export const confirmPendingCheckout = async () => {
  const id = pendingSessionId;
  const result = accept(await syncSubscription(id));
  if (result && result.status !== 'incomplete') {
    pendingSessionId = null;
  }
  return result;
};

// ---- formatting (display only) ---------------------------------------------

export const formatPrice = (cents, currency = 'usd') => {
  const amount = (Number(cents) || 0) / 100;
  const symbol = {usd: '$', eur: '€', gbp: '£'}[String(currency).toLowerCase()] || `${String(currency).toUpperCase()} `;
  return `${symbol}${Number.isInteger(amount) ? amount : amount.toFixed(2)}`;
};

export const intervalLabel = interval => (interval === 'year' ? 'year' : 'month');

export const FEATURE_LABELS = {
  calendars: 'Connected calendars',
  schedules: 'Active schedules',
  zones: 'Location zones',
  automation_rules: 'Automation rules',
  devices: 'Connected devices',
};

// ---- lifetime (one-time) purchase -------------------------------------------

/** True when at least one purchasable plan has a lifetime price (the server hides it otherwise). */
export const lifetimeAvailable = plans =>
  (plans?.plans || []).some(p => p.purchasable && Number(p.prices?.lifetime) > 0);

/** " / month", " / year" or " one-time". */
export const priceSuffix = interval => (interval === 'lifetime' ? ' one-time' : interval === 'year' ? ' / year' : ' / month');

export const intervalTitle = interval => (interval === 'lifetime' ? 'Lifetime' : interval === 'year' ? 'Yearly' : 'Monthly');

/** Line under the plan name: when it renews / ends, or that a lifetime plan never does. */
export const billingSummary = snap => {
  if (!snap?.subscribed_plan) return '';
  if (snap.is_lifetime) {
    const since = formatDate(snap.lifetime_paid_at);
    return since ? `Lifetime · never expires · bought ${since}` : 'Lifetime · never expires';
  }
  if (!snap.current_period_end) return '';
  return `${snap.cancel_at_period_end ? 'Ends' : 'Renews'} ${formatDate(snap.current_period_end)} · billed ${snap.billing_interval === 'year' ? 'yearly' : 'monthly'}`;
};

/** Badge next to the plan name ("Active", or "Lifetime" for a one-time purchase). */
export const statusBadge = snap => (snap?.is_lifetime ? 'Lifetime' : STATUS_TEXT[snap?.status] || snap?.status || '');

/** Label for a row of the payment list. */
export const paymentAmountText = p =>
  p.status === 'paid' ? formatPrice(p.amount_cents, p.currency) : p.status === 'refunded' ? 'Refunded' : 'Failed';

export const limitText = limit => (limit === null || limit === undefined ? 'Unlimited' : String(limit));

export const retentionText = days => (days === null || days === undefined ? 'Unlimited history' : `${days} days history`);

/** "3 / 10" or "2 / Unlimited" */
export const usageText = feature => `${feature.used} / ${limitText(feature.limit)}`;

export const planLimitLines = limits => [
  limits.calendars === 1 ? '1 calendar' : limits.calendars === null ? 'Multiple calendars' : `${limits.calendars} calendars`,
  limits.schedules === null ? 'Unlimited active schedules' : `${limits.schedules} active schedules`,
  limits.zones === null ? 'Unlimited location zones' : `${limits.zones} location zones`,
  limits.automation_rules === null ? 'Unlimited automation rules' : `${limits.automation_rules} automation rules`,
  `${limits.devices} connected devices`,
  retentionText(limits.history_retention_days),
];

export const STATUS_TEXT = {
  none: 'No subscription',
  active: 'Active',
  trialing: 'Trial',
  past_due: 'Payment failed',
  canceled: 'Cancelled',
  expired: 'Expired',
  incomplete: 'Payment not completed',
};

export const formatDate = iso => {
  if (!iso) return '';
  const d = new Date(String(iso).replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(String(iso)) ? '' : 'Z'));
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, {year: 'numeric', month: 'short', day: 'numeric'});
};

/** True when a failed API response is the backend's "plan limit reached" refusal. */
export const planLimitFrom = response => {
  const result = response?.data?.result;
  return response?.statusCode === 403 && result?.code === 'plan_limit_reached' ? result : null;
};
