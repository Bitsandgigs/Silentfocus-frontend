import React from 'react';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';

import {SCHEDULE_TEXTS, SCHEDULE_TYPE} from '../utils/scheduleRules';

const OPTIONS = [
    {type: SCHEDULE_TYPE.ONCE, label: 'Once'},
    {type: SCHEDULE_TYPE.WEEKLY, label: 'Every week'},
];

/**
 * "How often?" - Once / Every week, with the matching explanation below.
 * [locked]: editing an existing schedule keeps its type (shown, not
 * changeable), so a weekly schedule can never silently become one-time.
 */
export default function ScheduleTypeSelector({value, onChange, locked = false, palette, isDark}) {
    const text = isDark ? '#FFFFFF' : '#1A1A1A';
    const muted = isDark ? '#CFCFCF' : '#444444';
    return (
        <View style={styles.wrap}>
            <Text style={[styles.heading, {color: text}]} accessibilityRole="header">
                How often?
            </Text>
            {!locked && <Text style={[styles.intro, {color: muted}]}>{SCHEDULE_TEXTS.intro}</Text>}
            <View style={styles.row} accessibilityRole="radiogroup">
                {OPTIONS.filter(o => !locked || o.type === value).map(o => {
                    const selected = o.type === value;
                    return (
                        <TouchableOpacity
                            key={o.type}
                            disabled={locked}
                            onPress={() => onChange?.(o.type)}
                            accessibilityRole="radio"
                            accessibilityState={{checked: selected, disabled: locked}}
                            style={[
                                styles.option,
                                {backgroundColor: selected ? palette.scheduleSelected : palette.pill},
                            ]}>
                            <Text
                                style={[
                                    styles.optionText,
                                    {color: selected ? palette.scheduleSelectedText : palette.pillText},
                                ]}>
                                {o.label}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </View>
            <View style={[styles.note, {borderColor: palette.divider}]}>
                <Text style={[styles.noteText, {color: text}]}>
                    {value === SCHEDULE_TYPE.ONCE ? SCHEDULE_TEXTS.once : SCHEDULE_TEXTS.weekly}
                </Text>
            </View>
        </View>
    );
}

// Weekly: the days are required; an end before the start ends the next day.
export function WeeklyHint({hasDays, overnight, isDark}) {
    const muted = isDark ? '#CFCFCF' : '#444444';
    return (
        <View style={{marginTop: 16}}>
            {!hasDays && (
                <Text style={{fontSize: 14, color: isDark ? '#FF8A80' : '#B3261E', fontFamily: 'Roboto'}}>
                    {SCHEDULE_TEXTS.weeklyNoDays}
                </Text>
            )}
            {overnight && (
                <Text style={{fontSize: 14, lineHeight: 20, color: muted, fontFamily: 'Roboto', marginTop: 4}}>
                    Ends the next day: each chosen day runs past midnight.
                </Text>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    wrap: {marginTop: 16},
    heading: {fontSize: 16, fontWeight: '700', fontFamily: 'Roboto'},
    intro: {fontSize: 14, fontFamily: 'Roboto', marginTop: 4},
    row: {flexDirection: 'row', flexWrap: 'wrap', marginTop: 10, gap: 10},
    option: {
        minHeight: 44,
        paddingHorizontal: 18,
        paddingVertical: 10,
        borderRadius: 10,
        justifyContent: 'center',
        alignItems: 'center',
        flexGrow: 1,
    },
    optionText: {fontSize: 15, fontWeight: '600', fontFamily: 'Roboto'},
    note: {marginTop: 12, padding: 12, borderRadius: 10, borderWidth: 1},
    noteText: {fontSize: 14, lineHeight: 20, fontFamily: 'Roboto'},
});
