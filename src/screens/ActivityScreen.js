import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    useColorScheme,
    FlatList,
    RefreshControl,
    ActivityIndicator,
    Alert,
    AppState,
    ToastAndroid,
} from 'react-native';
import {
    widthPercentageToDP as wp,
    heightPercentageToDP as hp,
} from 'react-native-responsive-screen';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useIsFocused, useNavigation} from '@react-navigation/native';
import TodaySummaryCard from '../componentes/TodaySummaryCard';
import screens from '../utils/theme/screens';
import {getSessionHistory, summarizeDay} from '../utils/sessionHistory';
import {clearLocalActivitySafely, getInstallId, isOwnUpload} from '../utils/serverSync';
import CallIcon from '../assets/svgs/Call';
import MessageIcon from '../assets/svgs/Message';
import NotificationSingleIcon from '../assets/svgs/NotificationSingle';
import {Constants} from '../utils/theme';
import EndPoints from '../utils/api/endpoints';
import APICall from '../utils/api/api';
import {extractPagination, normalizeActivityLogs} from '../utils/api/normalizers';
import {
    getActivityPreviews,
    getLocalActivity,
    openActivitySource,
    openPhoneApp,
    subscribeNotificationsChanged,
} from '../utils/comms';
import {
    CATEGORY,
    TABS,
    filterByTab,
    formatRelativeTime,
    isActivityFeedRow,
    isOpenable,
    normalizeLocalEvents,
    normalizeServerLogs,
    openHint,
    previewLineFor,
    previewRequests,
} from '../utils/activityEvents';
import {ACTION_BUTTON_BG} from '../utils/theme/controlColors';

const NOT_BACKED_UP =
    "Some activity hasn't been backed up to your account yet. Connect to the internet and try again.";
const keptMessage = n =>
    `${n} item${n === 1 ? " hasn't" : "s haven't"} been backed up to your account yet and ${n === 1 ? 'was' : 'were'} kept on this phone. Try again later.`;

// Follows the backend's pagination; the cap is only a safety net (1000 rows).
const MAX_SERVER_PAGES = 20;

// Backend activity history (read-only). Returns rows, or throws on failure.
const fetchServerLogs = async () => {
    const userId = Constants.commonConstant.appUserId;
    if (!userId) return [];
    // Rows this phone uploaded are already listed under "On this phone".
    const installId = await getInstallId();
    let rows = [];
    for (let page = 1; page <= MAX_SERVER_PAGES; page++) {
        const response = await APICall('get', {userId, page, per_page: 50}, EndPoints.getWhatssAppCalllogs);
        if (response?.statusCode !== Constants.apiStatusCode.success) {
            throw new Error('server');
        }
        if (response?.data?.status !== '1') break; // nothing logged yet
        rows = rows.concat(normalizeActivityLogs(response.data.result).filter(r => !isOwnUpload(installId, r)));
        if (!extractPagination(response.data.result)?.hasMore) break;
    }
    return normalizeServerLogs(rows);
};

const ActivityCenterScreen = () => {
    const isDark = useColorScheme() === 'dark';
    const background = isDark ? '#111' : '#fff';
    const textColor = isDark ? '#fff' : '#1a1a1a';
    const muted = isDark ? '#aaa' : '#555';
    const isFocused = useIsFocused();
    const navigation = useNavigation();

    const [tab, setTab] = useState('ALL');
    const [summary, setSummary] = useState(null);
    const [summaryError, setSummaryError] = useState(false);
    const [localRows, setLocalRows] = useState([]);
    const [serverRows, setServerRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [localError, setLocalError] = useState(false);
    const [serverError, setServerError] = useState(false);

    const load = useCallback(async () => {
        // Local activity first: it works offline and needs no account.
        try {
            setLocalRows(normalizeLocalEvents(await getLocalActivity()));
            setLocalError(false);
        } catch (e) {
            setLocalError(true);
        }
        try {
            setSummary(summarizeDay(await getSessionHistory()));
            setSummaryError(false);
        } catch (e) {
            setSummaryError(true);
        }
        try {
            setServerRows(await fetchServerLogs());
            setServerError(false);
        } catch (e) {
            setServerError(true);
        }
    }, []);

    useEffect(() => {
        if (!isFocused) return;
        let active = true;
        setLoading(true);
        load().finally(() => active && setLoading(false));
        return () => {
            active = false;
        };
    }, [isFocused, load]);

    // #10: ephemeral previews, read from still-posted notifications only. Kept
    // in screen state (never stored, logged or uploaded); dropped when the
    // screen loses focus or the app goes to the background, re-read when
    // notifications change. Round 3: one line per message row - its own
    // message, or an honest placeholder once previews were read.
    const [previews, setPreviews] = useState({});
    const [previewsLoaded, setPreviewsLoaded] = useState(false);
    const previewTimer = useRef(null);
    const dropPreviews = useCallback(() => {
        setPreviews({});
        setPreviewsLoaded(false);
    }, []);
    const refreshPreviews = useCallback(async () => {
        const requests = previewRequests(localRows);
        setPreviews(requests.length ? (await getActivityPreviews(requests)) || {} : {});
        setPreviewsLoaded(true);
    }, [localRows]);

    useEffect(() => {
        if (!isFocused) {
            dropPreviews();
            return undefined;
        }
        refreshPreviews();
        const schedule = () => {
            clearTimeout(previewTimer.current);
            previewTimer.current = setTimeout(refreshPreviews, 400);
        };
        const unsubscribe = subscribeNotificationsChanged(schedule);
        const appState = AppState.addEventListener('change', s => (s === 'active' ? schedule() : dropPreviews()));
        return () => {
            clearTimeout(previewTimer.current);
            unsubscribe();
            appState.remove();
        };
    }, [isFocused, refreshPreviews, dropPreviews]);

    const onRefresh = async () => {
        setRefreshing(true);
        await load();
        setRefreshing(false);
    };

    const clearingRef = useRef(false);

    // Confirm first (same wording as Settings), then clear only what the
    // server has acknowledged; anything not backed up stays on the phone.
    const onClearLocal = () => {
        if (clearingRef.current) return;
        Alert.alert(
            'Clear activity history?',
            'Removes the Activity list and Silent Focus session history stored on this phone. Your zones, schedules and settings are not affected, and nothing is deleted from your account.',
            [
                {text: 'Cancel', style: 'cancel'},
                {text: 'Clear', style: 'destructive', onPress: () => doClearLocal()},
            ],
        );
    };

    const doClearLocal = async () => {
        if (clearingRef.current) return;
        clearingRef.current = true;
        let result;
        try {
            result = await clearLocalActivitySafely();
        } finally {
            clearingRef.current = false;
        }
        if (!result?.ok) {
            Alert.alert('Not cleared', NOT_BACKED_UP);
            return;
        }
        if (result.kept > 0) {
            Alert.alert('Partly cleared', keptMessage(result.kept));
        }
        await load();
    };

    // Rows the feed shows (automation rows are in Session History).
    const hasFeedRows = useMemo(() => localRows.some(isActivityFeedRow), [localRows]);

    const sections = useMemo(() => {
        const local = filterByTab(localRows, tab);
        const server = filterByTab(serverRows, tab);
        const data = [];
        if (local.length) {
            data.push({id: 'h-local', header: 'On this phone'});
            data.push(...local);
        }
        if (server.length) {
            data.push({id: 'h-server', header: 'Server history'});
            data.push(...server);
        }
        return data;
    }, [localRows, serverRows, tab]);

    const renderIcon = category => {
        if (category === CATEGORY.CALL) return <CallIcon color="#fff" />;
        if (category === CATEGORY.MESSAGE) return <MessageIcon width={18} height={18} />;
        return <NotificationSingleIcon width={20} height={20} />;
    };

    // Opens the original notification while it is still posted; otherwise
    // the app that posted it (an expired notification can't be reopened).
    const onOpenRow = async item => {
        if (item.opensPhone) {
            // #11: a specific call can't be opened; the Phone app's call history is the closest.
            const result = await openPhoneApp();
            if (result === 'DIALER') {
                ToastAndroid.show("Call history isn't available. Opened the Phone app.", ToastAndroid.SHORT);
            } else if (result !== 'CALL_LOG') {
                Alert.alert('Cannot open', 'No Phone app is available on this phone.');
            }
            return;
        }
        const app = item.appName || 'the app';
        const result = await openActivitySource(item.appPackage, item.notificationRef);
        if (result === 'APP') {
            ToastAndroid.show(`The notification is no longer available. Opened ${app}.`, ToastAndroid.SHORT);
        } else if (result !== 'NOTIFICATION') {
            Alert.alert('Cannot open', `${app} is not available on this phone.`);
        }
    };

    const renderItem = ({item}) => {
        if (item.header) {
            return <Text style={[styles.sectionHeader, {color: muted}]}>{item.header}</Text>;
        }
        const failed = item.type === 'AUTO_REPLY_FAILED' || item.type === 'AUTOMATION_ERROR';
        const openable = isOpenable(item);
        const preview = previewLineFor(item, previews, previewsLoaded);
        const Row = openable ? TouchableOpacity : View;
        return (
            <Row
                style={[styles.card, {backgroundColor: isDark ? 'rgba(85,85,85,0.12)' : '#eeeeee'}]}
                accessible
                accessibilityRole={openable ? 'button' : undefined}
                accessibilityHint={openable ? openHint(item) : undefined}
                onPress={openable ? () => onOpenRow(item) : undefined}
                testID={openable ? `activity-open-${item.id}` : undefined}
                accessibilityLabel={`${item.title}. ${
                    preview ? (preview.placeholder ? `${preview.text}. ` : `Message: ${preview.text}. `) : ''
                }${item.subtitle ? `${item.subtitle}. ` : ''}${formatRelativeTime(item.at)}`}>
                <View
                    style={[
                        styles.iconWrapper,
                        item.category === CATEGORY.AUTOMATION && styles.iconAutomation,
                        failed && styles.iconFailed,
                    ]}>{renderIcon(item.category)}</View>
                <View style={styles.textBlock}>
                    <Text style={[styles.name, {color: textColor}]} numberOfLines={1}>
                        {item.title}
                    </Text>
                    {preview ? (
                        <Text
                            style={[styles.preview, {color: preview.placeholder ? muted : textColor}]}
                            numberOfLines={1}
                            ellipsizeMode="tail"
                            testID={`activity-preview-${item.id}`}>
                            {preview.placeholder ? preview.text : `“${preview.text}”`}
                        </Text>
                    ) : null}
                    {item.subtitle ? (
                        <Text style={[styles.subText, {color: muted}]} numberOfLines={2}>
                            {item.subtitle}
                        </Text>
                    ) : null}
                </View>
                <View style={styles.meta}>
                    <Text style={[styles.time, {color: muted}]}>{formatRelativeTime(item.at)}</Text>
                    {item.origin === 'server' ? <Text style={styles.serverBadge}>Server</Text> : null}
                </View>
            </Row>
        );
    };

    const empty = () => {
        if (loading) return null;
        if (localError) {
            return (
                <View style={styles.emptyBox}>
                    <Text style={styles.emptyText}>Activity could not be loaded.</Text>
                    <TouchableOpacity onPress={onRefresh} style={styles.retry}>
                        <Text style={styles.retryText}>Try again</Text>
                    </TouchableOpacity>
                </View>
            );
        }
        return (
            <View style={styles.emptyBox}>
                <Text style={styles.emptyText}>No activity yet</Text>
                <Text style={[styles.emptyHint, {color: muted}]}>
                    Calls, messages and automatic replies that happen while Silent Focus is on will appear here.
                    When Silent Focus started and ended is in Session History above.
                </Text>
            </View>
        );
    };

    return (
        <SafeAreaView style={{flex: 1, backgroundColor: background}}>
            <View style={[styles.container, {backgroundColor: background}]}>
                <Text style={styles.title}>Activity Center</Text>

                <TodaySummaryCard
                    summary={summary}
                    error={summaryError}
                    onPress={() => navigation.navigate(screens.SessionHistoryScreen)}
                />

                <View style={styles.tabs} accessibilityRole="tablist">
                    {TABS.map(t => {
                        const selected = tab === t.key;
                        return (
                            <TouchableOpacity
                                key={t.key}
                                onPress={() => setTab(t.key)}
                                accessibilityRole="tab"
                                accessibilityState={{selected}}
                                style={[styles.tab, selected && styles.tabSelected]}>
                                <Text style={[styles.tabText, {color: selected ? '#fff' : muted}]}>{t.label}</Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>

                {serverError ? (
                    <Text style={styles.notice}>
                        Server history is unavailable right now. Activity recorded on this phone is still shown.
                    </Text>
                ) : null}

                {hasFeedRows ? (
                    <View style={styles.clearAllWrapper}>
                        <TouchableOpacity onPress={onClearLocal} accessibilityRole="button">
                            <Text style={[styles.clearAll, {backgroundColor: isDark ? '#000' : '#222'}]}>
                                Clear phone activity
                            </Text>
                        </TouchableOpacity>
                    </View>
                ) : null}

                {loading && !refreshing ? <ActivityIndicator style={styles.loader} color="#D6721E" /> : null}

                <FlatList
                    data={sections}
                    keyExtractor={item => String(item.id)}
                    renderItem={renderItem}
                    ListEmptyComponent={empty}
                    refreshControl={
                        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#D6721E" />
                    }
                    contentContainerStyle={{paddingBottom: hp('12%')}}
                />
            </View>
        </SafeAreaView>
    );
};

export default ActivityCenterScreen;

const styles = StyleSheet.create({
    container: {
        flex: 1,
        paddingTop: hp('1%'),
        paddingHorizontal: wp('5%'),
    },
    title: {
        fontSize: wp('5.5%'),
        fontWeight: '700',
        alignSelf: 'center',
        marginBottom: hp('1.5%'),
        color: '#D6721E',
    },
    tabs: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: hp('1.5%'),
    },
    tab: {
        paddingVertical: hp('0.8%'),
        paddingHorizontal: wp('3%'),
        borderRadius: wp('4%'),
        minHeight: 36,
        justifyContent: 'center',
    },
    tabSelected: {
        // White text 6.0:1; vs the page 6.0:1 (light) / 3.1:1 (dark).
        backgroundColor: ACTION_BUTTON_BG,
    },
    preview: {
        fontSize: wp('3.2%'),
        fontStyle: 'italic',
        marginTop: hp('0.3%'),
    },
    tabText: {
        fontSize: wp('3.4%'),
        fontWeight: '600',
    },
    notice: {
        fontSize: wp('3.2%'),
        color: '#B3261E',
        marginBottom: hp('1%'),
    },
    clearAllWrapper: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        marginBottom: hp('1%'),
    },
    clearAll: {
        fontSize: wp('3%'),
        paddingVertical: hp('0.5%'),
        paddingHorizontal: wp('4%'),
        borderRadius: wp('3%'),
        color: '#fff',
        overflow: 'hidden',
    },
    loader: {
        marginVertical: hp('2%'),
    },
    sectionHeader: {
        fontSize: wp('3.2%'),
        fontWeight: '700',
        marginTop: hp('1%'),
        marginBottom: hp('1%'),
        textTransform: 'uppercase',
    },
    card: {
        borderRadius: wp('4%'),
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: wp('4%'),
        paddingVertical: hp('1.5%'),
        marginBottom: hp('1.5%'),
    },
    textBlock: {
        flex: 1,
        justifyContent: 'center',
        marginLeft: wp('3%'),
    },
    name: {
        fontSize: wp('3.8%'),
        fontWeight: '600',
    },
    subText: {
        fontSize: wp('3.2%'),
        marginTop: hp('0.3%'),
    },
    meta: {
        alignItems: 'flex-end',
        marginLeft: wp('2%'),
    },
    time: {
        fontSize: wp('3%'),
    },
    serverBadge: {
        marginTop: hp('0.5%'),
        fontSize: wp('2.6%'),
        color: '#D6721E',
        fontWeight: '700',
    },
    iconWrapper: {
        backgroundColor: '#D6721E',
        borderRadius: wp('6%'),
        width: wp('9%'),
        height: wp('9%'),
        justifyContent: 'center',
        alignItems: 'center',
    },
    iconAutomation: {
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: '#D6721E',
    },
    iconFailed: {
        backgroundColor: '#B3261E',
    },
    emptyBox: {
        alignItems: 'center',
        marginTop: hp('5%'),
        paddingHorizontal: wp('6%'),
    },
    emptyText: {
        textAlign: 'center',
        fontSize: wp('4%'),
        color: '#888',
    },
    emptyHint: {
        textAlign: 'center',
        fontSize: wp('3.3%'),
        marginTop: hp('1%'),
    },
    retry: {
        marginTop: hp('1.5%'),
        paddingVertical: hp('0.8%'),
        paddingHorizontal: wp('6%'),
        borderRadius: wp('4%'),
        backgroundColor: ACTION_BUTTON_BG,
    },
    retryText: {
        color: '#fff',
        fontWeight: '600',
    },
});
