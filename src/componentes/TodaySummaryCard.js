import React from 'react';
import {linkColor} from '../utils/theme/controlColors';
import {StyleSheet, Text, TouchableOpacity, View, useColorScheme} from 'react-native';
import {formatDuration} from '../utils/sessionHistory';

const ORANGE = '#D6721E';

/**
 * "Today" summary built from recorded sessions only (summarizeDay). Rows
 * with nothing recorded are left out rather than shown as invented zeros;
 * when recording began after midnight the card says so.
 */
const TodaySummaryCard = ({summary, onPress, error}) => {
    const isDark = useColorScheme() === 'dark';
    const card = isDark ? 'rgba(85, 85, 85, 0.12)' : '#eeeeee';
    const text = isDark ? '#fff' : '#1a1a1a';
    const muted = isDark ? '#aaa' : '#555';

    let body;
    if (error) {
        body = <Text style={[styles.note, {color: muted}]}>Session history could not be loaded.</Text>;
    } else if (!summary) {
        body = null;
    } else if (summary.sessionCount === 0) {
        body = (
            <Text style={[styles.note, {color: muted}]}>
                {summary.recordingSince == null
                    ? 'No Silent Focus sessions recorded yet.'
                    : 'No Silent Focus sessions today.'}
            </Text>
        );
    } else {
        const rows = [
            ['Silent Focus', `${formatDuration(summary.activeMs)}${summary.ongoing ? ' (on now)' : ''}`],
            ['Sessions', String(summary.sessionCount)],
            summary.emergencyBreakthroughs > 0 && ['Emergency breakthroughs', String(summary.emergencyBreakthroughs)],
            summary.urgentBreakthroughs > 0 && ['Urgent callers', String(summary.urgentBreakthroughs)],
            summary.autoRepliesSent > 0 && ['Auto replies', String(summary.autoRepliesSent)],
            summary.zones.length > 0 && ['Zones', summary.zones.join(', ')],
        ].filter(Boolean);
        body = (
            <>
                {rows.map(([label, value]) => (
                    <View key={label} style={styles.row}>
                        <Text style={[styles.label, {color: muted}]}>{label}</Text>
                        <Text style={[styles.value, {color: text}]} numberOfLines={2}>
                            {value}
                        </Text>
                    </View>
                ))}
                {!summary.covered && summary.recordingSince ? (
                    <Text style={[styles.note, {color: muted}]}>
                        Recorded since {new Date(summary.recordingSince).toLocaleTimeString([], {hour: 'numeric', minute: '2-digit'})}.
                    </Text>
                ) : null}
            </>
        );
    }

    const content = (
        <View style={[styles.card, {backgroundColor: card}]}>
            <View style={styles.header}>
                <Text style={[styles.title, {color: text}]}>Today</Text>
                {onPress ? <Text style={[styles.link, {color: linkColor(isDark)}]}>Session history ›</Text> : null}
            </View>
            {body}
        </View>
    );
    return onPress ? (
        <TouchableOpacity onPress={onPress} accessibilityRole="button" accessibilityLabel="Open session history">
            {content}
        </TouchableOpacity>
    ) : (
        content
    );
};

export default TodaySummaryCard;

const styles = StyleSheet.create({
    card: {borderRadius: 16, padding: 14, marginBottom: 12},
    header: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6},
    title: {fontSize: 16, fontWeight: '700'},
    link: {color: ORANGE, fontWeight: '600', fontSize: 13},
    row: {flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3},
    label: {fontSize: 13},
    value: {fontSize: 13, fontWeight: '600', flexShrink: 1, textAlign: 'right', marginLeft: 12},
    note: {fontSize: 13, marginTop: 4},
});
