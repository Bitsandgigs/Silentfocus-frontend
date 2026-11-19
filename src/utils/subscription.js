// Subscription state for the app. There is NO plan logic here: every value
// (plan, status, limits, usage, "limit reached") comes from the backend's
// GET /subscription, so the app and the API can never disagree. This module
// only caches the last response, lets screens subscribe to it and formats it.

import {getSubscription, syncSubscription} from './api/apiServices';
import {clearEntitlements, pushEntitlements} from './entitlements';

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
  clearEntitlements();
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
    pushEntitlements(snapshot);
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
  automation_rules: 'Automatic reply texts',
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
export const statusBadge = snap => {
  if (snap?.is_lifetime) return 'Lifetime';
  if (snap?.trial?.active) return 'Free trial';
  if (snap?.trial?.ended && !snap?.subscribed_plan) return 'Trial ended';
  return STATUS_TEXT[snap?.status] || snap?.status || '';
};

/** Banner text for the free trial: days left while it runs, what is locked once it ended; '' otherwise. */
export const trialSummary = snap => {
  const t = snap?.trial;
  if (!t) return '';
  if (t.active) {
    const days = Number(t.days_left) || 0;
    return `Free trial: ${days <= 1 ? 'last day' : `${days} days left`}. Every feature is unlocked with no limits. You can subscribe at any time.`;
  }
  if (t.ended && !snap.subscribed_plan) {
    return 'Your 7-day free trial has ended. Manual silent mode stays free. Calendars, Silent Zones and automatic replies are locked until you choose a plan.';
  }
  return '';
};

/** Label for a row of the payment list. */
export const paymentAmountText = p =>
  p.status === 'paid' ? formatPrice(p.amount_cents, p.currency) : p.status === 'refunded' ? 'Refunded' : 'Failed';

export const limitText = limit => (limit === null || limit === undefined ? 'Unlimited' : String(limit));

export const retentionText = days => (days === null || days === undefined ? 'Unlimited history' : `${days} days history`);

/** "3 / 10" or "2 / Unlimited" */
export const usageText = feature => `${feature.used} / ${limitText(feature.limit)}`;

const count = (n, one, many) => (n === null || n === undefined ? `Unlimited ${many}` : n === 0 ? `No ${many}` : n === 1 ? `1 ${one}` : `${n} ${many}`);

export const planLimitLines = limits => [
  count(limits.zones, 'Silent Zone', 'Silent Zones'),
  count(limits.calendars, 'calendar', 'calendars'),
  limits.connected_apps === null || limits.connected_apps === undefined
    ? 'All supported messaging apps'
    : limits.connected_apps === 0
    ? 'No automatic replies'
    : `Automatic replies in ${limits.connected_apps} messaging app${limits.connected_apps === 1 ? '' : 's'}`,
  limits.automation_rules === null || limits.automation_rules === undefined
    ? 'Unlimited reply texts'
    : limits.automation_rules === 0
    ? 'No reply texts'
    : `Default reply + ${Math.max(0, limits.automation_rules - 1)} zone repl${limits.automation_rules - 1 === 1 ? 'y' : 'ies'}`,
  count(limits.zone_suggestions, 'suggested zone', 'suggested zones'),
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
