import React, {useCallback, useEffect, useState} from 'react';
import {
    ActivityIndicator,
    FlatList,
    RefreshControl,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
    useColorScheme,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useNavigation} from '@react-navigation/native';
import BackIcon from '../assets/svgs/Back';
import TodaySummaryCard from '../componentes/TodaySummaryCard';
import {getLocalActivity} from '../utils/comms';
import {normalizeLocalEvents} from '../utils/activityEvents';
import {ACTION_BUTTON_BG} from '../utils/theme/controlColors';
import {
    describeSources,
    eventsInSession,
    formatDuration,
    getSessionHistory,
    sessionDuration,
    summarizeDay,
} from '../utils/sessionHistory';

const ORANGE = '#D6721E';

const fmtTime = t => new Date(t).toLocaleTimeString([], {hour: 'numeric', minute: '2-digit'});
const fmtDay = t => new Date(t).toLocaleDateString([], {weekday: 'short', day: 'numeric', month: 'short'});

const SessionHistoryScreen = () => {
    const navigation = useNavigation();
    const isDark = useColorScheme() === 'dark';
    const bg = isDark ? '#111' : '#fff';
    const card = isDark ? 'rgba(85,85,85,0.12)' : '#eeeeee';
    const text = isDark ? '#fff' : '#1a1a1a';
    const muted = isDark ? '#aaa' : '#555';

    const [history, setHistory] = useState(null);
    const [events, setEvents] = useState([]);
    const [error, setError] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [openId, setOpenId] = useState(null);

    const load = useCallback(async () => {
        try {
            const [h, e] = await Promise.all([getSessionHistory(), getLocalActivity().catch(() => [])]);
            setHistory(h);
            setEvents(normalizeLocalEvents(e));
            setError(false);
        } catch (err) {
            setError(true);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const onRefresh = async () => {
        setRefreshing(true);
        await load();
        setRefreshing(false);
    };

    const now = Date.now();

    const renderDetails = s => {
        const {primary, others} = describeSources(s);
        const related = eventsInSession(events, s, now).filter(r => r.category !== 'MESSAGE' || r.type !== 'MESSAGE_RECEIVED');
        const facts = [
            ['Started by', primary],
            s.primarySource === 'CALENDAR'
                ? ['Event', s.calendarEventTitle || 'Calendar event']
                : null,
            others.length ? ['Also active', others.join(', ')] : null,
            s.zoneNames.length ? ['Zones', s.zoneNames.join(', ')] : null,
            s.emergencyBreakthroughs ? ['Emergency calls allowed', String(s.emergencyBreakthroughs)] : null,
            s.urgentBreakthroughs ? ['Urgent callers allowed', String(s.urgentBreakthroughs)] : null,
            s.callsSilenced ? ['Calls silenced', String(s.callsSilenced)] : null,
            s.messagesReceived ? ['Messages received', String(s.messagesReceived)] : null,
            s.autoRepliesSent ? ['Reply actions accepted', String(s.autoRepliesSent)] : null,
        ].filter(Boolean);
        return (
            <View style={styles.details}>
                {facts.map(([k, v]) => (
                    <View key={k} style={styles.factRow}>
                        <Text style={[styles.factKey, {color: muted}]}>{k}</Text>
                        <Text style={[styles.factValue, {color: text}]}>{v}</Text>
                    </View>
                ))}
                {related.length ? (
                    <>
                        <Text style={[styles.subhead, {color: muted}]}>DURING THIS SESSION</Text>
                        {related.slice(0, 20).map(r => (
                            <Text key={r.id} style={[styles.eventLine, {color: text}]}>
                                {fmtTime(r.at)} · {r.summary || r.title}
                            </Text>
                        ))}
                    </>
                ) : null}
            </View>
        );
    };

    const renderItem = ({item: s}) => {
        const open = openId === s.id;
        const {primary} = describeSources(s);
        return (
            <TouchableOpacity
                onPress={() => setOpenId(open ? null : s.id)}
                style={[styles.card, {backgroundColor: card}]}
                accessibilityRole="button"
                accessibilityState={{expanded: open}}>
                <View style={styles.row}>
                    <View style={styles.flex}>
                        <Text style={[styles.when, {color: text}]}>
                            {fmtDay(s.start)} · {fmtTime(s.start)} – {s.end ? fmtTime(s.end) : 'now'}
                        </Text>
                        <Text style={[styles.sub, {color: muted}]}>{primary}</Text>
                    </View>
                    <Text style={[styles.duration, {color: ORANGE}]}>{formatDuration(sessionDuration(s, now))}</Text>
                </View>
                {open ? renderDetails(s) : null}
            </TouchableOpacity>
        );
    };

    const header = (
        <TodaySummaryCard summary={history ? summarizeDay(history, now) : null} error={error && !history} />
    );

    const empty = () => {
        if (!history && !error) return <ActivityIndicator style={styles.loader} color={ORANGE} />;
        if (error && !history) {
            return (
                <TouchableOpacity onPress={onRefresh} style={styles.retry} accessibilityRole="button">
                    <Text style={styles.retryText}>Try again</Text>
                </TouchableOpacity>
            );
        }
        return (
            <Text style={[styles.empty, {color: muted}]}>
                No sessions recorded yet. Sessions appear here after Silent Focus has been on.
            </Text>
        );
    };

    return (
        <SafeAreaView style={[styles.flex, {backgroundColor: bg}]}>
            <View style={styles.header}>
                <TouchableOpacity
                    onPress={() => navigation.goBack()}
                    style={styles.back}
                    accessibilityRole="button"
                    accessibilityLabel="Back">
                    <BackIcon width={26} height={26} color={text} />
                </TouchableOpacity>
                <Text style={[styles.title, {color: text}]}>Session History</Text>
            </View>
            <FlatList
                data={history?.sessions || []}
                keyExtractor={s => s.id}
                renderItem={renderItem}
                ListHeaderComponent={header}
                ListEmptyComponent={empty}
                ListFooterComponent={
                    history?.recordingSince ? (
                        <Text style={[styles.footer, {color: muted}]}>
                            Recorded on this phone since {fmtDay(history.recordingSince)}. Kept for up to 90 days.
                        </Text>
                    ) : null
                }
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ORANGE} />}
                contentContainerStyle={styles.list}
            />
        </SafeAreaView>
    );
};

export default SessionHistoryScreen;

const styles = StyleSheet.create({
    flex: {flex: 1},
    header: {flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8},
    back: {height: 44, width: 44, alignItems: 'center', justifyContent: 'center'},
    title: {fontSize: 20, fontWeight: '700'},
    list: {padding: 16, paddingBottom: 48},
    card: {borderRadius: 14, padding: 14, marginBottom: 10},
    row: {flexDirection: 'row', alignItems: 'center'},
    when: {fontSize: 15, fontWeight: '600'},
    sub: {fontSize: 13, marginTop: 2},
    duration: {fontSize: 15, fontWeight: '700', marginLeft: 12},
    details: {marginTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#999', paddingTop: 8},
    factRow: {flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2},
    factKey: {fontSize: 13},
    factValue: {fontSize: 13, fontWeight: '600', flexShrink: 1, textAlign: 'right', marginLeft: 12},
    subhead: {fontSize: 12, fontWeight: '700', marginTop: 10, marginBottom: 4},
    eventLine: {fontSize: 13, paddingVertical: 1},
    empty: {textAlign: 'center', marginTop: 24, fontSize: 14, paddingHorizontal: 16},
    footer: {textAlign: 'center', fontSize: 12, marginTop: 12},
    loader: {marginTop: 24},
    retry: {alignSelf: 'center', marginTop: 24, backgroundColor: ACTION_BUTTON_BG, borderRadius: 18, paddingVertical: 8, paddingHorizontal: 20},
    retryText: {color: '#fff', fontWeight: '600'},
});
