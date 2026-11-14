// Subscription client: the app holds no plan logic - it renders what the
// backend returns. These tests fake the API layer (the backend's own tests
// cover the rules) and check the app shows server data verbatim, hands off
// to Checkout without trusting payment success, and offers upgrades on limits.

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
    createNavigationContainerRef: () => ({isReady: () => true, navigate: (...a) => mockNavigate(...a)}),
}));
const mockNavigate = jest.fn();
jest.mock('../src/assets/svgs/Back', () => 'BackIcon');

import * as api from '../src/utils/api/apiServices';
import EndPoints from '../src/utils/api/endpoints';
import SubscriptionScreen from '../src/screens/SubscriptionScreen';
import {
    clearSubscriptionState,
    confirmPendingCheckout,
    formatPrice,
    getSubscriptionSnapshot,
    planLimitFrom,
    planLimitLines,
    refreshSubscription,
    rememberCheckoutSession,
    usageText,
} from '../src/utils/subscription';
import {showApiErrorAlert} from '../src/function/Alert';

const ok = result => ({statusCode: 200, data: {status: '1', result}});

const PLANS = {
    payments_configured: true,
    test_mode: true,
    plans: [
        {key: 'free', name: 'Free', purchasable: false, currency: 'usd', prices: {month: 0, year: 0}, limits: {calendars: 0, schedules: 2, zones: 1, automation_rules: 2, devices: 1, history_retention_days: 7}},
        {key: 'pro', name: 'Pro', purchasable: true, currency: 'usd', prices: {month: 499, year: 4990}, limits: {calendars: 1, schedules: 10, zones: 3, automation_rules: 10, devices: 2, history_retention_days: 30}},
        {key: 'premium', name: 'Premium', purchasable: true, currency: 'usd', prices: {month: 999, year: 9990}, limits: {calendars: null, schedules: null, zones: null, automation_rules: null, devices: 5, history_retention_days: 365}},
    ],
};

const feature = (used, limit) => ({used, limit, unlimited: limit === null, remaining: limit === null ? null : Math.max(0, limit - used), reached: limit !== null && used >= limit});
const snapshot = (over = {}) => ({
    status: 'none', plan: PLANS.plans[0], subscribed_plan: null, billing_interval: null, current_period_end: null, cancel_at_period_end: false,
    last_payment_status: null, last_payment_error: null, history_retention_days: 7,
    features: {calendars: feature(0, 0), schedules: feature(2, 2), zones: feature(0, 1), automation_rules: feature(0, 2), devices: feature(1, 1)},
    ...over,
});
const proSnapshot = (over = {}) => snapshot({
    status: 'active', plan: PLANS.plans[1], subscribed_plan: 'pro', billing_interval: 'month', current_period_end: '2026-12-13 10:00:00', history_retention_days: 30,
    features: {calendars: feature(1, 1), schedules: feature(3, 10), zones: feature(3, 3), automation_rules: feature(0, 10), devices: feature(1, 2)}, ...over,
});

const flush = () => act(async () => { await new Promise(r => setImmediate(r)); });
// All rendered text (children only - props can hold circular React elements).
const collect = n => (n == null ? [] : typeof n === 'string' ? [n] : Array.isArray(n) ? n.flatMap(collect) : collect(n.children));
const texts = tree => collect(tree.toJSON()).join(' ');
const byId = (tree, id) => tree.root.findAll(n => n.props.testID === id && typeof n.type === 'string' || n.props.testID === id)[0];

const trees = [];
const mount = async snap => {
    api.getSubscriptionPlans.mockResolvedValue(ok(PLANS));
    api.getSubscription.mockResolvedValue(ok(snap));
    api.getSubscriptionPayments.mockResolvedValue(ok({payments: []}));
    let tree;
    await act(async () => { tree = renderer.create(<SubscriptionScreen />); });
    await flush();
    trees.push(tree);
    return tree;
};

afterEach(async () => {
    await act(async () => { trees.splice(0).forEach(t => t.unmount()); });
});

beforeEach(() => {
    jest.clearAllMocks();
    clearSubscriptionState();
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

describe('formatting / helpers', () => {
    test('prices and usage come out as the server states them', () => {
        expect(formatPrice(499)).toBe('$4.99');
        expect(formatPrice(9990)).toBe('$99.90');
        expect(formatPrice(1000)).toBe('$10');
        expect(usageText({used: 3, limit: 10})).toBe('3 / 10');
        expect(usageText({used: 2, limit: null})).toBe('2 / Unlimited');
    });
    test('plan feature lines use server limits (null = unlimited)', () => {
        expect(planLimitLines(PLANS.plans[1].limits)).toEqual(['1 calendar', '10 active schedules', '3 location zones', '10 automation rules', '2 connected devices', '30 days history']);
        expect(planLimitLines(PLANS.plans[2].limits)).toEqual(['Multiple calendars', 'Unlimited active schedules', 'Unlimited location zones', 'Unlimited automation rules', '5 connected devices', '365 days history']);
    });
    test('planLimitFrom only recognises the backend refusal', () => {
        const refusal = {statusCode: 403, data: {status: '0', result: {code: 'plan_limit_reached', feature: 'zones'}}};
        expect(planLimitFrom(refusal).feature).toBe('zones');
        expect(planLimitFrom({statusCode: 403, data: {result: {code: 'other'}}})).toBeNull();
        expect(planLimitFrom({statusCode: 400, data: {result: {code: 'plan_limit_reached'}}})).toBeNull();
        expect(EndPoints.subscriptionCheckout).toBe('subscription/checkout');
    });
});

describe('subscription store', () => {
    test('refresh stores exactly the server response; errors keep the last good one', async () => {
        api.getSubscription.mockResolvedValueOnce(ok(proSnapshot()));
        expect((await refreshSubscription()).plan.key).toBe('pro');
        api.getSubscription.mockResolvedValueOnce({statusCode: 0, isNetworkError: true});
        expect(await refreshSubscription()).toBeNull();
        expect(getSubscriptionSnapshot().plan.key).toBe('pro');
    });
    test('after Checkout the app asks the server to sync with only the session id', async () => {
        rememberCheckoutSession('cs_test_1');
        api.syncSubscription.mockResolvedValue(ok(proSnapshot()));
        const result = await confirmPendingCheckout();
        expect(api.syncSubscription).toHaveBeenCalledWith('cs_test_1');
        expect(result.status).toBe('active');
    });
    test('a still-incomplete payment keeps the pending checkout so the next return re-checks', async () => {
        rememberCheckoutSession('cs_test_2');
        api.syncSubscription.mockResolvedValue(ok(snapshot({status: 'incomplete'})));
        await confirmPendingCheckout();
        await confirmPendingCheckout();
        expect(api.syncSubscription).toHaveBeenNthCalledWith(2, 'cs_test_2');
    });
});

describe('SubscriptionScreen', () => {
    test('new user sees Pro and Premium with prices, limits and Choose buttons', async () => {
        const tree = await mount(snapshot());
        const t = texts(tree);
        expect(t).toContain('Pro');
        expect(t).toContain('$4.99');
        expect(t).toContain('Premium');
        expect(t).toContain('$9.99');
        expect(t).toContain('Unlimited active schedules');
        expect(t).toContain('Choose Pro');
        expect(t).toContain('Choose Premium');
        expect(t).toContain('Payments are in test mode');
        expect(byId(tree, 'usage-schedules-value').props.children).toBe('2 / 2');
    });

    test('yearly toggle switches displayed prices', async () => {
        const tree = await mount(snapshot());
        await act(async () => byId(tree, 'interval-year').props.onPress());
        expect(texts(tree)).toContain('$49.90');
        expect(texts(tree)).toContain('/ year');
    });

    test('Choose Pro requests checkout from the backend and opens the returned URL', async () => {
        const {Linking} = require('react-native');
        const open = jest.spyOn(Linking, 'openURL').mockResolvedValue();
        api.createSubscriptionCheckout.mockResolvedValue(ok({checkout_url: 'https://checkout.stripe.com/c/pay/cs_1', session_id: 'cs_1'}));
        const tree = await mount(snapshot());
        await act(async () => byId(tree, 'plan-pro-cta').props.onPress());
        expect(api.createSubscriptionCheckout).toHaveBeenCalledWith('pro', 'month');
        expect(open).toHaveBeenCalledWith('https://checkout.stripe.com/c/pay/cs_1');
    });

    test('active Pro: shows current plan, renewal, usage, and offers only the Premium upgrade', async () => {
        const tree = await mount(proSnapshot());
        const t = texts(tree);
        expect(byId(tree, 'sub-current-plan').props.children).toBe('Pro');
        expect(byId(tree, 'sub-current-status').props.children).toBe('Active');
        expect(byId(tree, 'usage-zones-value').props.children).toBe('3 / 3');
        expect(t).toContain('Renews');
        expect(t).toContain('Your current plan');
        expect(t).toContain('Upgrade to Premium');
        expect(t).not.toContain('Choose Pro');
        expect(byId(tree, 'sub-cancel')).toBeTruthy();
    });

    test('upgrade confirms, calls the backend, then re-reads the server state', async () => {
        const tree = await mount(proSnapshot());
        Alert.alert.mockImplementation((title, msg, buttons) => buttons?.find(b => b.text === 'Upgrade')?.onPress?.());
        api.upgradeSubscription.mockResolvedValue(ok(proSnapshot({plan: PLANS.plans[2], subscribed_plan: 'premium'})));
        jest.useFakeTimers();
        await act(async () => byId(tree, 'plan-premium-cta').props.onPress());
        await act(async () => { jest.runAllTimers(); });
        jest.useRealTimers();
        await flush();
        expect(api.upgradeSubscription).toHaveBeenCalledWith('premium', 'month');
    });

    test('cancelled-at-period-end shows end date banner and a resume action', async () => {
        const tree = await mount(proSnapshot({cancel_at_period_end: true}));
        expect(byId(tree, 'sub-banner-ending')).toBeTruthy();
        expect(byId(tree, 'sub-resume')).toBeTruthy();
        expect(byId(tree, 'sub-cancel')).toBeUndefined();
    });

    test('failed renewal shows the server error and a payment-method action', async () => {
        const tree = await mount(proSnapshot({status: 'past_due', last_payment_status: 'failed', last_payment_error: 'Your card was declined.'}));
        expect(byId(tree, 'sub-banner-past-due')).toBeTruthy();
        expect(texts(tree)).toContain('Your card was declined.');
        expect(texts(tree)).toContain('Payment failed');
    });

    test('expired and cancelled subscriptions fall back to Free with a banner and Choose buttons', async () => {
        let tree = await mount(snapshot({status: 'expired', subscribed_plan: 'pro'}));
        expect(byId(tree, 'sub-banner-expired')).toBeTruthy();
        expect(texts(tree)).toContain('Choose Pro');
        tree = await mount(snapshot({status: 'canceled', subscribed_plan: 'pro'}));
        expect(byId(tree, 'sub-banner-canceled')).toBeTruthy();
    });

    test('failed first payment explains that nothing was charged', async () => {
        const tree = await mount(snapshot({status: 'incomplete', last_payment_status: 'failed', last_payment_error: 'Your card was declined.'}));
        expect(byId(tree, 'sub-banner-payment-failed')).toBeTruthy();
    });

    test('payments unavailable: buttons are disabled and the screen says so', async () => {
        api.getSubscriptionPlans.mockResolvedValue(ok({...PLANS, payments_configured: false, test_mode: false}));
        api.getSubscription.mockResolvedValue(ok(snapshot()));
        api.getSubscriptionPayments.mockResolvedValue(ok({payments: []}));
        let tree;
        await act(async () => { tree = renderer.create(<SubscriptionScreen />); });
        await flush();
        trees.push(tree);
        expect(texts(tree)).toContain('Payments are not available right now.');
        expect(byId(tree, 'plan-pro-cta').props.disabled).toBe(true);
    });

    test('a server without the subscription API (404) says so instead of a generic error', async () => {
        api.getSubscriptionPlans.mockResolvedValue({statusCode: 404, data: {message: 'Not Found'}});
        api.getSubscription.mockResolvedValue({statusCode: 404, data: {message: 'Not Found'}});
        api.getSubscriptionPayments.mockResolvedValue({statusCode: 404});
        let tree;
        await act(async () => { tree = renderer.create(<SubscriptionScreen />); });
        await flush();
        trees.push(tree);
        expect(texts(tree)).toContain('Subscriptions are not available on this server yet.');
    });

    test('load failure offers a retry instead of inventing a plan', async () => {
        api.getSubscriptionPlans.mockResolvedValue({statusCode: 0, isNetworkError: true});
        api.getSubscription.mockResolvedValue({statusCode: 0, isNetworkError: true});
        api.getSubscriptionPayments.mockResolvedValue({statusCode: 0, isNetworkError: true});
        let tree;
        await act(async () => { tree = renderer.create(<SubscriptionScreen />); });
        await flush();
        trees.push(tree);
        expect(texts(tree)).toContain('Your subscription could not be loaded.');
        expect(texts(tree)).not.toContain('Current plan');
    });
});

describe('upgrade prompt on plan limits', () => {
    test('a backend plan_limit_reached refusal shows an upgrade prompt that opens the plans screen', () => {
        jest.useFakeTimers();
        const response = {statusCode: 403, data: {status: '0', message: 'Your Pro plan allows 3 location zones. Upgrade your plan to add more.', result: {code: 'plan_limit_reached', feature: 'zones', limit: 3, used: 3, upgrade_required: true}}};
        showApiErrorAlert('Silent Focus', response);
        jest.runAllTimers();
        jest.useRealTimers();
        const [title, message, buttons] = Alert.alert.mock.calls[0];
        expect(title).toBe('Plan limit reached');
        expect(message).toContain('3 location zones');
        buttons.find(b => b.text === 'View plans').onPress();
        expect(mockNavigate).toHaveBeenCalledWith('SubscriptionScreen', undefined);
    });
    test('Premium users at a hard cap get a plain message, no upgrade button', () => {
        jest.useFakeTimers();
        showApiErrorAlert('Silent Focus', {statusCode: 403, data: {message: 'Your Premium plan allows 5 connected devices.', result: {code: 'plan_limit_reached', feature: 'devices', upgrade_required: false}}});
        jest.runAllTimers();
        jest.useRealTimers();
        expect(Alert.alert.mock.calls[0][2].map(b => b.text)).toEqual(['OK']);
    });
    test('ordinary errors are unchanged', () => {
        jest.useFakeTimers();
        showApiErrorAlert('Silent Focus', {statusCode: 422, data: {message: 'Bad input'}});
        jest.runAllTimers();
        jest.useRealTimers();
        expect(Alert.alert.mock.calls[0][0]).toBe('Silent Focus');
    });
});
