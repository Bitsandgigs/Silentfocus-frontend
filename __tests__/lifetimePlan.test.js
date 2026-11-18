// Lifetime (one-time) purchase: the app only renders what the backend says
// (plan prices.lifetime, snapshot.is_lifetime) and hands the payment to Checkout.

import React from 'react';
import {Alert} from 'react-native';
import renderer, {act} from 'react-test-renderer';

jest.mock('../src/utils/api/apiServices', () => ({
    getSubscription: jest.fn(),
    getSubscriptionPlans: jest.fn(),
    getSubscriptionPayments: jest.fn(),
    createSubscriptionCheckout: jest.fn(),
    upgradeSubscription: jest.fn(),
    cancelSubscription: jest.fn(),
    resumeSubscription: jest.fn(),
    openBillingPortal: jest.fn(),
    syncSubscription: jest.fn(),
    setCalendarSelectionOnServer: jest.fn(),
}));
jest.mock('@react-navigation/native', () => ({
    ...jest.requireActual('@react-navigation/native'),
    useNavigation: () => ({goBack: jest.fn(), navigate: jest.fn()}),
    createNavigationContainerRef: () => ({isReady: () => true, navigate: jest.fn()}),
}));
jest.mock('../src/assets/svgs/Back', () => 'BackIcon');

import * as api from '../src/utils/api/apiServices';
import SubscriptionScreen from '../src/screens/SubscriptionScreen';
import {
    billingSummary,
    clearSubscriptionState,
    intervalTitle,
    lifetimeAvailable,
    paymentAmountText,
    priceSuffix,
    statusBadge,
} from '../src/utils/subscription';

const ok = result => ({statusCode: 200, data: {status: '1', result}});
const limits = {calendars: 1, schedules: 10, zones: 3, automation_rules: 10, devices: 2, history_retention_days: 30};
const plan = (key, name, prices) => ({key, name, purchasable: true, currency: 'usd', prices, limits});
const FREE = {key: 'free', name: 'Free', purchasable: false, currency: 'usd', prices: {month: 0, year: 0, lifetime: null}, limits};
const PRO = plan('pro', 'Pro', {month: 499, year: 4990, lifetime: 14900});
const PREMIUM = plan('premium', 'Premium', {month: 999, year: 9990, lifetime: 29900});
const plansWith = (...p) => ({payments_configured: true, test_mode: false, plans: [FREE, ...p]});

const feature = (used, limit) => ({used, limit, unlimited: limit === null, remaining: limit === null ? null : Math.max(0, limit - used), reached: limit !== null && used >= limit});
const snapshot = (over = {}) => ({
    status: 'none', plan: FREE, subscribed_plan: null, billing_interval: null, current_period_end: null, cancel_at_period_end: false,
    is_lifetime: false, lifetime_paid_at: null, last_payment_status: null, last_payment_error: null, history_retention_days: 7,
    features: {calendars: feature(0, 1), schedules: feature(2, 10), zones: feature(0, 3), automation_rules: feature(0, 10), devices: feature(1, 2)},
    ...over,
});
const recurringPro = () => snapshot({status: 'active', plan: PRO, subscribed_plan: 'pro', billing_interval: 'month', current_period_end: '2026-12-13 10:00:00'});
const lifetimePro = () => snapshot({status: 'active', plan: PRO, subscribed_plan: 'pro', billing_interval: 'lifetime', is_lifetime: true, lifetime_paid_at: '2026-11-19 10:00:00'});

const flush = () => act(async () => { await new Promise(r => setImmediate(r)); });
const collect = n => (n == null ? [] : typeof n === 'string' ? [n] : Array.isArray(n) ? n.flatMap(collect) : collect(n.children));
const texts = tree => collect(tree.toJSON()).join(' ');
const byId = (tree, id) => tree.root.findAll(n => n.props.testID === id)[0];

const trees = [];
const mount = async (snap, plans = plansWith(PRO, PREMIUM), payments = []) => {
    api.getSubscriptionPlans.mockResolvedValue(ok(plans));
    api.getSubscription.mockResolvedValue(ok(snap));
    api.getSubscriptionPayments.mockResolvedValue(ok({payments}));
    let tree;
    await act(async () => { tree = renderer.create(<SubscriptionScreen />); });
    await flush();
    trees.push(tree);
    return tree;
};
const pressLifetimeTab = tree => act(async () => byId(tree, 'interval-lifetime').props.onPress());

afterEach(async () => {
    await act(async () => { trees.splice(0).forEach(t => t.unmount()); });
});
beforeEach(() => {
    jest.clearAllMocks();
    clearSubscriptionState();
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

describe('helpers', () => {
    test('lifetime is available only when a purchasable plan has a lifetime price', () => {
        expect(lifetimeAvailable(plansWith(PRO))).toBe(true);
        expect(lifetimeAvailable(plansWith(plan('pro', 'Pro', {month: 499, year: 4990, lifetime: null})))).toBe(false);
        // An older server that does not know "lifetime" at all.
        expect(lifetimeAvailable(plansWith(plan('pro', 'Pro', {month: 499, year: 4990})))).toBe(false);
        expect(lifetimeAvailable(null)).toBe(false);
        expect(lifetimeAvailable({plans: [{...FREE, purchasable: false, prices: {lifetime: 100}}]})).toBe(false);
    });
    test('labels', () => {
        expect(priceSuffix('month')).toBe(' / month');
        expect(priceSuffix('year')).toBe(' / year');
        expect(priceSuffix('lifetime')).toBe(' one-time');
        expect(intervalTitle('lifetime')).toBe('Lifetime');
        expect(statusBadge(lifetimePro())).toBe('Lifetime');
        expect(statusBadge(recurringPro())).toBe('Active');
        expect(paymentAmountText({status: 'paid', amount_cents: 14900, currency: 'usd'})).toBe('$149');
        expect(paymentAmountText({status: 'refunded', amount_cents: 14900, currency: 'usd'})).toBe('Refunded');
        expect(paymentAmountText({status: 'failed', amount_cents: 0, currency: 'usd'})).toBe('Failed');
    });
    test('billing summary: renewal for subscriptions, never-expires for lifetime', () => {
        expect(billingSummary(recurringPro())).toMatch(/^Renews .* · billed monthly$/);
        expect(billingSummary({...recurringPro(), cancel_at_period_end: true})).toMatch(/^Ends /);
        expect(billingSummary(lifetimePro())).toMatch(/^Lifetime · never expires/);
        expect(billingSummary(snapshot())).toBe('');
    });
});

describe('Lifetime tab', () => {
    test('is hidden until the server gives a plan a lifetime price', async () => {
        const tree = await mount(snapshot(), plansWith(plan('pro', 'Pro', {month: 499, year: 4990, lifetime: null}), plan('premium', 'Premium', {month: 999, year: 9990, lifetime: null})));
        expect(byId(tree, 'interval-month')).toBeTruthy();
        expect(byId(tree, 'interval-lifetime')).toBeUndefined();
    });

    test('shows the one-time price and a "for life" button', async () => {
        const tree = await mount(snapshot());
        await pressLifetimeTab(tree);
        const t = texts(tree);
        expect(t).toContain('$149');
        expect(t).toContain('one-time');
        expect(t).toContain('$299');
        expect(t).toContain('Get Pro for life');
        expect(t).toContain('Get Premium for life');
    });

    test('a plan without a lifetime price says so instead of offering a purchase', async () => {
        const tree = await mount(snapshot(), plansWith(PRO, plan('premium', 'Premium', {month: 999, year: 9990, lifetime: null})));
        await pressLifetimeTab(tree);
        expect(byId(tree, 'plan-pro-cta')).toBeTruthy();
        expect(byId(tree, 'plan-premium-cta')).toBeUndefined();
        expect(byId(tree, 'plan-premium-no-lifetime')).toBeTruthy();
    });

    test('Get Pro for life confirms the one-time price, then asks the backend for a lifetime checkout', async () => {
        const {Linking} = require('react-native');
        const open = jest.spyOn(Linking, 'openURL').mockResolvedValue();
        api.createSubscriptionCheckout.mockResolvedValue(ok({checkout_url: 'https://checkout.stripe.com/c/pay/cs_life', session_id: 'cs_life'}));
        Alert.alert.mockImplementation((title, msg, buttons) => buttons?.find(b => b.text === 'Continue')?.onPress?.());
        const tree = await mount(snapshot());
        await pressLifetimeTab(tree);
        jest.useFakeTimers();
        await act(async () => byId(tree, 'plan-pro-cta').props.onPress());
        await act(async () => { jest.runAllTimers(); });
        jest.useRealTimers();
        await flush();
        const [title, message] = Alert.alert.mock.calls[0];
        expect(title).toBe('Get Pro for life?');
        expect(message).toContain('$149');
        expect(message).not.toContain('cancelled');
        expect(api.createSubscriptionCheckout).toHaveBeenCalledWith('pro', 'lifetime');
        expect(open).toHaveBeenCalledWith('https://checkout.stripe.com/c/pay/cs_life');
    });

    test('declining the confirmation starts no checkout', async () => {
        Alert.alert.mockImplementation((title, msg, buttons) => buttons?.find(b => b.text === 'Not now')?.onPress?.());
        const tree = await mount(snapshot());
        await pressLifetimeTab(tree);
        jest.useFakeTimers();
        await act(async () => byId(tree, 'plan-pro-cta').props.onPress());
        await act(async () => { jest.runAllTimers(); });
        jest.useRealTimers();
        expect(api.createSubscriptionCheckout).not.toHaveBeenCalled();
    });
});

describe('recurring subscriber buying lifetime', () => {
    test('the same plan stays "current" for monthly, but can be bought for life', async () => {
        const tree = await mount(recurringPro());
        expect(texts(tree)).toContain('Your current plan');
        await pressLifetimeTab(tree);
        expect(texts(tree)).not.toContain('Your current plan');
        expect(texts(tree)).toContain('Get Pro for life');
    });

    test('the confirmation warns that the subscription is cancelled once paid, and uses checkout (not upgrade)', async () => {
        api.createSubscriptionCheckout.mockResolvedValue(ok({checkout_url: 'https://checkout.stripe.com/c/pay/cs_l2', session_id: 'cs_l2'}));
        jest.spyOn(require('react-native').Linking, 'openURL').mockResolvedValue();
        Alert.alert.mockImplementation((title, msg, buttons) => buttons?.find(b => b.text === 'Continue')?.onPress?.());
        const tree = await mount(recurringPro());
        await pressLifetimeTab(tree);
        jest.useFakeTimers();
        await act(async () => byId(tree, 'plan-premium-cta').props.onPress());
        await act(async () => { jest.runAllTimers(); });
        jest.useRealTimers();
        await flush();
        expect(Alert.alert.mock.calls[0][1]).toContain('cancelled once this payment is confirmed');
        expect(api.createSubscriptionCheckout).toHaveBeenCalledWith('premium', 'lifetime');
        expect(api.upgradeSubscription).not.toHaveBeenCalled();
    });
});

describe('lifetime owner', () => {
    test('sees Lifetime, never-expires text, no cancel/resume and no monthly/yearly toggle', async () => {
        const tree = await mount(lifetimePro());
        expect(byId(tree, 'sub-current-status').props.children).toBe('Lifetime');
        expect(byId(tree, 'sub-current-renewal').props.children).toMatch(/Lifetime · never expires/);
        expect(byId(tree, 'sub-cancel')).toBeUndefined();
        expect(byId(tree, 'sub-resume')).toBeUndefined();
        expect(byId(tree, 'interval-month')).toBeUndefined();
        expect(texts(tree)).not.toContain('Renews');
        expect(texts(tree)).toContain('You own this for life');
        expect(texts(tree)).toContain('Get a higher plan for life');
    });

    test('can only buy a higher plan, and only for life', async () => {
        api.createSubscriptionCheckout.mockResolvedValue(ok({checkout_url: 'https://checkout.stripe.com/c/pay/cs_l3', session_id: 'cs_l3'}));
        jest.spyOn(require('react-native').Linking, 'openURL').mockResolvedValue();
        Alert.alert.mockImplementation((title, msg, buttons) => buttons?.find(b => b.text === 'Continue')?.onPress?.());
        const tree = await mount(lifetimePro());
        expect(texts(tree)).toContain('Get Premium for life');
        expect(texts(tree)).not.toContain('Get Pro for life');
        jest.useFakeTimers();
        await act(async () => byId(tree, 'plan-premium-cta').props.onPress());
        await act(async () => { jest.runAllTimers(); });
        jest.useRealTimers();
        await flush();
        expect(Alert.alert.mock.calls[0][1]).not.toContain('cancelled once');
        expect(api.createSubscriptionCheckout).toHaveBeenCalledWith('premium', 'lifetime');
    });

    test('payment list marks lifetime and refunded payments', async () => {
        const tree = await mount(lifetimePro(), plansWith(PRO, PREMIUM), [
            {id: 1, plan_key: 'pro', amount_cents: 14900, currency: 'usd', status: 'paid', reason: 'lifetime', paid_at: '2026-11-19 10:00:00'},
            {id: 2, plan_key: 'pro', amount_cents: 14900, currency: 'usd', status: 'refunded', reason: 'lifetime', paid_at: '2026-11-01 10:00:00'},
        ]);
        const t = texts(tree);
        expect(t).toContain('(lifetime)');
        expect(t).toContain('$149');
        expect(t).toContain('Refunded');
    });
});
