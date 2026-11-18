// Pro / Premium subscription screen. Pure view over the backend: plans, prices,
// limits, usage and status all come from the subscription API; checkout,
// upgrade and cancellation are requests to the backend (Stripe runs in the
// browser / on the server - no payment secrets or success flags live here).

import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
    ActivityIndicator,
    AppState,
    Linking,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
    useColorScheme,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useNavigation} from '@react-navigation/native';
import BackIcon from '../assets/svgs/Back';
import {ACTION_BUTTON_BG, LIGHT_CONTROLS} from '../utils/theme/controlColors';
import {showAlert, showAlertWithTwoCallBack, showApiErrorAlert} from '../function/Alert';
import {
    cancelSubscription,
    createSubscriptionCheckout,
    getSubscriptionPayments,
    getSubscriptionPlans,
    openBillingPortal,
    resumeSubscription,
    upgradeSubscription,
} from '../utils/api/apiServices';
import {
    FEATURE_LABELS,
    billingSummary,
    confirmPendingCheckout,
    formatDate,
    formatPrice,
    hasPendingCheckout,
    intervalTitle,
    lifetimeAvailable,
    paymentAmountText,
    planLimitLines,
    priceSuffix,
    refreshSubscription,
    rememberCheckoutSession,
    statusBadge,
    subscribeToSubscription,
    usageText,
} from '../utils/subscription';

const ok = r => r?.statusCode === 200 && r?.data?.status === '1';

export default function SubscriptionScreen() {
    const navigation = useNavigation();
    const isDark = useColorScheme() === 'dark';
    const c = {
        bg: isDark ? '#111111' : '#ffffff',
        card: isDark ? '#1C1C1C' : '#F3F3F3',
        text: isDark ? '#f2f2f2' : '#1a1a1a',
        muted: isDark ? '#bdbdbd' : LIGHT_CONTROLS.mutedText,
        line: isDark ? 'rgba(255,255,255,0.14)' : '#d9d9d9',
        warn: isDark ? '#3a2a12' : '#FFF1D6',
        warnText: isDark ? '#ffd58a' : '#6b4300',
        bad: isDark ? '#3a1717' : '#FDE4E4',
        badText: isDark ? '#ffb4b4' : '#8a1c1c',
    };

    const [snap, setSnap] = useState(null);
    const [plans, setPlans] = useState(null);
    const [payments, setPayments] = useState([]);
    const [interval, setInterval_] = useState('month');
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [loadFailed, setLoadFailed] = useState(false);
    const [unavailable, setUnavailable] = useState(false); // server has no subscription API yet
    const mounted = useRef(true);

    useEffect(() => {
        mounted.current = true;
        const off = subscribeToSubscription(({snapshot}) => mounted.current && setSnap(snapshot));
        return () => {
            mounted.current = false;
            off();
        };
    }, []);

    const loadAll = useCallback(async () => {
        const [planRes, sub] = await Promise.all([
            getSubscriptionPlans(),
            hasPendingCheckout() ? confirmPendingCheckout() : refreshSubscription(),
        ]);
        if (!mounted.current) return;
        if (ok(planRes)) setPlans(planRes.data.result);
        setUnavailable(planRes?.statusCode === 404);
        setLoadFailed(!ok(planRes) || !sub);
        setLoading(false);
        const pay = await getSubscriptionPayments();
        if (mounted.current && ok(pay)) setPayments(pay.data.result.payments || []);
    }, []);

    useEffect(() => {
        loadAll();
        // Returning from the browser (Checkout): ask the backend what happened.
        const sub = AppState.addEventListener('change', next => {
            if (next === 'active') loadAll();
        });
        return () => sub.remove();
    }, [loadAll]);

    const onRefresh = async () => {
        setRefreshing(true);
        await loadAll();
        if (mounted.current) setRefreshing(false);
    };

    const entitledPaid = snap && snap.subscribed_plan && ['active', 'trialing', 'past_due'].includes(snap.status);
    const rank = {free: 0, pro: 1, premium: 2};
    const currentKey = snap?.plan?.key;
    // A lifetime owner has no monthly/yearly billing to change: the only thing left to buy is a higher
    // plan for life. The Lifetime tab only exists while the server gives a plan a lifetime price.
    const isLifetimeOwner = !!(snap && snap.is_lifetime);
    const showLifetime = lifetimeAvailable(plans);
    const activeInterval = isLifetimeOwner || (interval === 'lifetime' && showLifetime) ? 'lifetime' : interval === 'lifetime' ? 'month' : interval;
    const intervalOptions = showLifetime ? ['month', 'year', 'lifetime'] : ['month', 'year'];

    const openUrl = async url => {
        try {
            await Linking.openURL(url);
        } catch (e) {
            showAlert('Silent Focus', 'The secure payment page could not be opened.');
        }
    };

    const startCheckout = async plan => {
        setBusy(true);
        const res = await createSubscriptionCheckout(plan.key, activeInterval);
        setBusy(false);
        if (!ok(res)) return showApiErrorAlert('Silent Focus', res, 'Checkout could not be started.');
        rememberCheckoutSession(res.data.result.session_id);
        openUrl(res.data.result.checkout_url);
    };

    const subscribe = plan => {
        if (activeInterval !== 'lifetime') return startCheckout(plan);
        const recurring = entitledPaid && !isLifetimeOwner;
        showAlertWithTwoCallBack(
            `Get ${plan.name} for life?`,
            `A one-time payment of ${formatPrice(plan.prices.lifetime, plan.currency)}. No renewals, and the plan never expires.` +
                (recurring ? ' Your current subscription is cancelled once this payment is confirmed, so you are not charged twice.' : ''),
            'Not now',
            () => {},
            'Continue',
            () => startCheckout(plan),
        );
    };

    const upgrade = plan => {
        showAlertWithTwoCallBack(
            `Upgrade to ${plan.name}?`,
            'Your plan changes now. The price difference for the rest of this billing period is charged to your saved payment method.',
            'Cancel',
            () => {},
            'Upgrade',
            async () => {
                setBusy(true);
                const res = await upgradeSubscription(plan.key, activeInterval);
                setBusy(false);
                if (!ok(res)) return showApiErrorAlert('Silent Focus', res, 'The upgrade could not be completed.');
                await refreshSubscription();
                showAlert('Silent Focus', `You are now on ${plan.name}.`);
            },
        );
    };

    const cancel = () =>
        showAlertWithTwoCallBack(
            'Cancel subscription?',
            `You keep your plan until ${formatDate(snap?.current_period_end) || 'the end of the billing period'}; it will not renew.`,
            'Keep plan',
            () => {},
            'Cancel plan',
            async () => {
                setBusy(true);
                const res = await cancelSubscription();
                setBusy(false);
                if (!ok(res)) return showApiErrorAlert('Silent Focus', res, 'The subscription could not be cancelled.');
                await refreshSubscription();
            },
        );

    const resume = async () => {
        setBusy(true);
        const res = await resumeSubscription();
        setBusy(false);
        if (!ok(res)) return showApiErrorAlert('Silent Focus', res);
        await refreshSubscription();
    };

    const managePayment = async () => {
        setBusy(true);
        const res = await openBillingPortal();
        setBusy(false);
        if (!ok(res)) return showApiErrorAlert('Silent Focus', res, 'The billing page could not be opened.');
        openUrl(res.data.result.url);
    };

    // ---- pieces --------------------------------------------------------------

    const Banner = ({tone, title, body, action, onAction, testID}) => (
        <View
            testID={testID}
            style={[styles.banner, {backgroundColor: tone === 'bad' ? c.bad : c.warn}]}
            accessibilityRole="alert">
            <Text style={[styles.bannerTitle, {color: tone === 'bad' ? c.badText : c.warnText}]}>{title}</Text>
            <Text style={[styles.bannerBody, {color: tone === 'bad' ? c.badText : c.warnText}]}>{body}</Text>
            {action ? (
                <TouchableOpacity onPress={onAction} accessibilityRole="button" style={styles.bannerAction}>
                    <Text style={[styles.bannerActionText, {color: tone === 'bad' ? c.badText : c.warnText}]}>{action}</Text>
                </TouchableOpacity>
            ) : null}
        </View>
    );

    const renderStatusBanner = () => {
        if (!snap) return null;
        if (snap.status === 'past_due') {
            return (
                <Banner
                    tone="bad"
                    testID="sub-banner-past-due"
                    title="Your last payment failed"
                    body={`${snap.last_payment_error || 'The payment could not be taken.'} Update your payment method to keep ${snap.plan.name}.`}
                    action="Update payment method"
                    onAction={managePayment}
                />
            );
        }
        if (snap.status === 'expired') {
            return <Banner tone="bad" testID="sub-banner-expired" title="Your subscription has expired" body="You are on the Free plan. Choose a plan below to get your limits back." />;
        }
        if (snap.status === 'canceled') {
            return <Banner tone="warn" testID="sub-banner-canceled" title="Subscription cancelled" body="You are on the Free plan. You can subscribe again at any time." />;
        }
        if (snap.status === 'incomplete' && snap.last_payment_status === 'failed') {
            return <Banner tone="bad" testID="sub-banner-payment-failed" title="Payment failed" body={`${snap.last_payment_error || 'Your payment was not completed.'} No charge was made. Please try again.`} />;
        }
        if (snap.cancel_at_period_end && ['active', 'trialing', 'canceled'].includes(snap.status) && snap.subscribed_plan) {
            return (
                <Banner
                    tone="warn"
                    testID="sub-banner-ending"
                    title={`Ends ${formatDate(snap.current_period_end)}`}
                    body={`Your ${snap.plan.name} plan will not renew.`}
                    action="Keep my plan"
                    onAction={resume}
                />
            );
        }
        return null;
    };

    const renderCurrent = () => {
        if (!snap) return null;
        const features = Object.keys(FEATURE_LABELS);
        return (
            <View style={[styles.card, {backgroundColor: c.card}]} testID="sub-current">
                <Text style={[styles.cardLabel, {color: c.muted}]}>Current plan</Text>
                <View style={styles.rowBetween}>
                    <Text style={[styles.planName, {color: c.text}]} testID="sub-current-plan">
                        {snap.plan.name}
                    </Text>
                    <Text style={[styles.badge, {color: c.text, borderColor: c.line}]} testID="sub-current-status">
                        {statusBadge(snap)}
                    </Text>
                </View>
                {billingSummary(snap) ? (
                    <Text style={[styles.small, {color: c.muted}]} testID="sub-current-renewal">
                        {billingSummary(snap)}
                    </Text>
                ) : null}
                <View style={[styles.divider, {backgroundColor: c.line}]} />
                {features.map(f => {
                    const feature = snap.features[f];
                    const pct = feature.unlimited ? 0 : Math.min(1, feature.limit ? feature.used / feature.limit : 1);
                    return (
                        <View key={f} style={styles.usageRow} testID={`usage-${f}`}>
                            <View style={styles.rowBetween}>
                                <Text style={[styles.usageLabel, {color: c.text}]}>{FEATURE_LABELS[f]}</Text>
                                <Text style={[styles.usageValue, {color: feature.reached ? c.badText : c.text}]} testID={`usage-${f}-value`}>
                                    {usageText(feature)}
                                </Text>
                            </View>
                            {!feature.unlimited ? (
                                <View style={[styles.track, {backgroundColor: c.line}]}>
                                    <View style={[styles.fill, {width: `${pct * 100}%`, backgroundColor: feature.reached ? '#C0392B' : ACTION_BUTTON_BG}]} />
                                </View>
                            ) : null}
                        </View>
                    );
                })}
                <Text style={[styles.small, {color: c.muted, marginTop: 6}]}>
                    History kept: {snap.history_retention_days === null ? 'unlimited' : `${snap.history_retention_days} days`}
                </Text>
                {entitledPaid && !isLifetimeOwner ? (
                    <View style={styles.actions}>
                        {snap.cancel_at_period_end ? (
                            <TouchableOpacity testID="sub-resume" onPress={resume} accessibilityRole="button" style={styles.secondaryBtn}>
                                <Text style={[styles.secondaryText, {color: c.text}]}>Keep my plan</Text>
                            </TouchableOpacity>
                        ) : (
                            <TouchableOpacity testID="sub-cancel" onPress={cancel} accessibilityRole="button" style={styles.secondaryBtn}>
                                <Text style={[styles.secondaryText, {color: c.text}]}>Cancel subscription</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                ) : null}
            </View>
        );
    };

    const renderPlan = plan => {
        const lifetimeMode = activeInterval === 'lifetime';
        const cents = plan.prices[activeInterval];
        // Monthly/yearly view: your plan is "current". Lifetime view: only owning it for life counts,
        // a recurring subscriber can still buy the same plan for life.
        const isCurrent = entitledPaid && currentKey === plan.key && (!lifetimeMode || isLifetimeOwner);
        const isLower = entitledPaid && rank[plan.key] < rank[currentKey] && (!lifetimeMode || isLifetimeOwner);
        let cta = null;
        if (isCurrent) {
            cta = <Text style={[styles.currentTag, {color: c.muted}]}>{isLifetimeOwner ? 'You own this for life' : 'Your current plan'}</Text>;
        } else if (isLower) {
            cta = <Text style={[styles.currentTag, {color: c.muted}]}>Below your current plan</Text>;
        } else if (lifetimeMode && !(cents > 0)) {
            cta = <Text style={[styles.currentTag, {color: c.muted}]} testID={`plan-${plan.key}-no-lifetime`}>No lifetime option for this plan</Text>;
        } else {
            const upgradeMode = !lifetimeMode && entitledPaid && snap.status !== 'past_due';
            cta = (
                <TouchableOpacity
                    testID={`plan-${plan.key}-cta`}
                    disabled={busy || (!plans?.payments_configured && !upgradeMode)}
                    onPress={() => (upgradeMode ? upgrade(plan) : subscribe(plan))}
                    accessibilityRole="button"
                    style={[styles.primaryBtn, (busy || !plans?.payments_configured) && {opacity: 0.5}]}>
                    <Text style={styles.primaryText}>
                        {upgradeMode ? `Upgrade to ${plan.name}` : lifetimeMode ? `Get ${plan.name} for life` : `Choose ${plan.name}`}
                    </Text>
                </TouchableOpacity>
            );
        }
        return (
            <View key={plan.key} style={[styles.card, {backgroundColor: c.card}, isCurrent && {borderColor: ACTION_BUTTON_BG, borderWidth: 2}]} testID={`plan-${plan.key}`}>
                <View style={styles.rowBetween}>
                    <Text style={[styles.planName, {color: c.text}]}>{plan.name}</Text>
                    <Text style={[styles.price, {color: c.text}]} testID={`plan-${plan.key}-price`}>
                        {cents > 0 || !lifetimeMode ? formatPrice(cents, plan.currency) : '-'}
                        {cents > 0 || !lifetimeMode ? <Text style={[styles.small, {color: c.muted}]}>{priceSuffix(activeInterval)}</Text> : null}
                    </Text>
                </View>
                {planLimitLines(plan.limits).map(line => (
                    <Text key={line} style={[styles.feature, {color: c.text}]}>
                        {'•  '}
                        {line}
                    </Text>
                ))}
                <View style={{marginTop: 12}}>{cta}</View>
            </View>
        );
    };

    const purchasable = (plans?.plans || []).filter(p => p.purchasable);

    return (
        <SafeAreaView style={{flex: 1, backgroundColor: c.bg}}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Back" style={styles.back}>
                    <BackIcon width={26} height={26} color={c.text} />
                </TouchableOpacity>
                <Text style={[styles.title, {color: c.text}]}>Plans & subscription</Text>
            </View>
            {loading ? (
                <View style={styles.center}>
                    <ActivityIndicator color={ACTION_BUTTON_BG} />
                </View>
            ) : (
                <ScrollView
                    contentContainerStyle={styles.content}
                    testID="subscription-screen"
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
                    {loadFailed && !snap ? (
                        <View style={styles.center}>
                            <Text style={[styles.small, {color: c.text, textAlign: 'center'}]}>
                                {unavailable ? 'Subscriptions are not available on this server yet.' : 'Your subscription could not be loaded.'}
                            </Text>
                            <TouchableOpacity onPress={loadAll} accessibilityRole="button" style={[styles.secondaryBtn, {marginTop: 12}]}>
                                <Text style={[styles.secondaryText, {color: c.text}]}>Try again</Text>
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <>
                            {plans?.test_mode ? <Text style={[styles.small, {color: c.muted, marginBottom: 8}]}>Payments are in test mode - no real charges.</Text> : null}
                            {renderStatusBanner()}
                            {renderCurrent()}
                            <Text style={[styles.section, {color: c.text}]}>{isLifetimeOwner ? 'Get a higher plan for life' : entitledPaid ? 'Change plan' : 'Choose a plan'}</Text>
                            {isLifetimeOwner ? null : (
                                <View style={[styles.toggle, {backgroundColor: c.card}]} accessibilityRole="tablist">
                                    {intervalOptions.map(i => (
                                        <TouchableOpacity
                                            key={i}
                                            testID={`interval-${i}`}
                                            onPress={() => setInterval_(i)}
                                            accessibilityRole="tab"
                                            accessibilityState={{selected: activeInterval === i}}
                                            style={[styles.toggleItem, activeInterval === i && {backgroundColor: ACTION_BUTTON_BG}]}>
                                            <Text style={{color: activeInterval === i ? '#fff' : c.text, fontWeight: '600'}}>{intervalTitle(i)}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            )}
                            {plans && !plans.payments_configured ? (
                                <Text style={[styles.small, {color: c.badText, marginBottom: 8}]}>Payments are not available right now.</Text>
                            ) : null}
                            {purchasable.map(renderPlan)}
                            {payments.length ? (
                                <View style={[styles.card, {backgroundColor: c.card}]} testID="sub-payments">
                                    <Text style={[styles.cardLabel, {color: c.muted}]}>Recent payments</Text>
                                    {payments.slice(0, 5).map(p => (
                                        <View key={p.id} style={styles.rowBetween}>
                                            <Text style={[styles.small, {color: c.text}]}>
                                                {formatDate(p.paid_at || p.created_at)} · {p.plan_key || ''}{p.reason === 'lifetime' ? ' (lifetime)' : ''}
                                            </Text>
                                            <Text style={[styles.small, {color: p.status === 'paid' ? c.text : c.badText}]}>{paymentAmountText(p)}</Text>
                                        </View>
                                    ))}
                                </View>
                            ) : null}
                        </>
                    )}
                </ScrollView>
            )}
            {busy ? (
                <View style={styles.busy} pointerEvents="auto">
                    <ActivityIndicator color="#fff" size="large" />
                </View>
            ) : null}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    header: {flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8},
    back: {padding: 8, marginRight: 4},
    title: {fontSize: 20, fontWeight: '700'},
    content: {padding: 16, paddingBottom: 40},
    center: {flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24},
    card: {borderRadius: 14, padding: 16, marginBottom: 14},
    cardLabel: {fontSize: 13, marginBottom: 4},
    rowBetween: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
    planName: {fontSize: 22, fontWeight: '700'},
    price: {fontSize: 22, fontWeight: '700'},
    badge: {fontSize: 12, fontWeight: '600', borderWidth: 1, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden'},
    small: {fontSize: 13},
    divider: {height: 1, marginVertical: 12},
    usageRow: {marginBottom: 10},
    usageLabel: {fontSize: 14},
    usageValue: {fontSize: 14, fontWeight: '600'},
    track: {height: 6, borderRadius: 3, marginTop: 4, overflow: 'hidden'},
    fill: {height: 6, borderRadius: 3},
    section: {fontSize: 18, fontWeight: '700', marginTop: 8, marginBottom: 10},
    toggle: {flexDirection: 'row', borderRadius: 12, padding: 4, marginBottom: 14},
    toggleItem: {flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 9},
    feature: {fontSize: 15, marginTop: 6},
    primaryBtn: {backgroundColor: ACTION_BUTTON_BG, borderRadius: 12, paddingVertical: 14, alignItems: 'center'},
    primaryText: {color: '#fff', fontWeight: '700', fontSize: 16},
    secondaryBtn: {borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16, alignItems: 'center', borderWidth: 1, borderColor: '#8888'},
    secondaryText: {fontWeight: '600', fontSize: 15},
    actions: {marginTop: 14},
    currentTag: {textAlign: 'center', fontSize: 14, fontWeight: '600', paddingVertical: 6},
    banner: {borderRadius: 12, padding: 14, marginBottom: 14},
    bannerTitle: {fontSize: 16, fontWeight: '700'},
    bannerBody: {fontSize: 14, marginTop: 4},
    bannerAction: {marginTop: 10},
    bannerActionText: {fontWeight: '700', textDecorationLine: 'underline'},
    busy: {...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center'},
});
