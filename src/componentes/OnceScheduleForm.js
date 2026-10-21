import React, {useState} from 'react';
import {Alert, StyleSheet, Text, TouchableOpacity, View} from 'react-native';

import CustomDateTimePicker from './CustomDateTimePicker/CustomDateTimePicker';
import {
    ONCE_ERROR_TEXT,
    ONCE_LIMITS,
    SCHEDULE_TEXTS,
    describeOncePlan,
    formatDateTime,
    formatDuration,
    proposeNextDayStart,
    validateOnce,
} from '../utils/scheduleRules';
import {saveOnceSchedule} from '../utils/silentFocusEngine';

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

/**
 * Start and end date + time of a one-time schedule. No weekdays. A start
 * that has already passed is never accepted silently: the user is offered
 * the same time on the next day, with the exact date, or picks again.
 */
export default function OnceScheduleForm({startAt, endAt, onChange, palette, isDark}) {
    const [picker, setPicker] = useState(null); // 'start' | 'end' | null
    const text = isDark ? '#FFFFFF' : '#1A1A1A';
    const muted = isDark ? '#CFCFCF' : '#444444';
    const now = Date.now();
    const error = startAt && endAt ? validateOnce(startAt, endAt, now) : null;

    const onPickStart = date => {
        setPicker(null);
        const picked = date.getTime();
        const duration = endAt > startAt ? endAt - startAt : 60 * 60 * 1000;
        const proposal = proposeNextDayStart(picked, Date.now());
        if (proposal === null) {
            onChange({startAt: picked, endAt: picked + duration});
            return;
        }
        Alert.alert(
            'That time has passed',
            `${formatDateTime(picked)} is already over. Use ${formatDateTime(proposal)} instead?`,
            [
                {text: 'Choose again', style: 'cancel', onPress: () => setPicker('start')},
                {text: 'Use this', onPress: () => onChange({startAt: proposal, endAt: proposal + duration})},
            ],
        );
    };

    const onPickEnd = date => {
        setPicker(null);
        onChange({startAt, endAt: date.getTime()});
    };

    const row = (label, value, which, a11y) => (
        <TouchableOpacity
            onPress={() => setPicker(which)}
            accessibilityRole="button"
            accessibilityLabel={`${a11y}: ${value}. Tap to change.`}
            style={[styles.row, {borderColor: palette.divider}]}>
            <Text style={[styles.rowLabel, {color: muted}]}>{label}</Text>
            <Text style={[styles.rowValue, {color: text}]}>{value}</Text>
        </TouchableOpacity>
    );

    return (
        <View style={styles.wrap}>
            {row('Starts', formatDateTime(startAt, now), 'start', 'Start')}
            {row('Ends', formatDateTime(endAt, now), 'end', 'End')}
            {error ? (
                <Text style={[styles.error, {color: isDark ? '#FF8A80' : '#B3261E'}]} accessibilityLiveRegion="polite">
                    {ONCE_ERROR_TEXT[error]}
                </Text>
            ) : (
                <Text style={[styles.summary, {color: muted}]} accessibilityLiveRegion="polite">
                    {`Lasts ${formatDuration(endAt - startAt)}. ${SCHEDULE_TEXTS.onPhoneOnly}`}
                </Text>
            )}
            <CustomDateTimePicker
                date={new Date(startAt)}
                onChange={onPickStart}
                onCancel={() => setPicker(null)}
                modePicker={'datetime'}
                isModalVisible={picker === 'start'}
                title={'Start'}
                isShowCloseButton
                confirmButtonText={'Confirm'}
                minDate={new Date(now - ONCE_LIMITS.START_GRACE_MS)}
                maxDate={new Date(now + YEAR_MS)}
            />
            <CustomDateTimePicker
                date={new Date(endAt)}
                onChange={onPickEnd}
                onCancel={() => setPicker(null)}
                modePicker={'datetime'}
                isModalVisible={picker === 'end'}
                title={'End'}
                isShowCloseButton
                confirmButtonText={'Confirm'}
                minDate={new Date(startAt + ONCE_LIMITS.MIN_DURATION_MS)}
                maxDate={new Date(startAt + ONCE_LIMITS.MAX_DURATION_MS)}
            />
        </View>
    );
}

/**
 * Shows the exact plan, then saves natively. Resolves true when saved.
 * Re-validates at tap time (minutes may have passed on this screen).
 */
export const confirmAndSaveOnce = ({userId, id = null, startAt, endAt}) =>
    new Promise(resolve => {
        const error = validateOnce(startAt, endAt, Date.now());
        if (error) {
            Alert.alert('Check the times', ONCE_ERROR_TEXT[error], [{text: 'OK', onPress: () => resolve(false)}]);
            return;
        }
        Alert.alert(
            id ? 'Save changes?' : 'Save one-time schedule?',
            describeOncePlan(startAt, endAt),
            [
                {text: 'Cancel', style: 'cancel', onPress: () => resolve(false)},
                {
                    text: 'Save',
                    onPress: async () => {
                        try {
                            const result = await saveOnceSchedule(userId, {id, startAt, endAt});
                            if (result?.ok) {
                                resolve(true);
                                return;
                            }
                            Alert.alert(
                                'Not saved',
                                ONCE_ERROR_TEXT[result?.error] || 'The schedule could not be saved. Please try again.',
                            );
                        } catch (e) {
                            Alert.alert('Not saved', 'The schedule could not be saved. Please try again.');
                        }
                        resolve(false);
                    },
                },
            ],
            {cancelable: true, onDismiss: () => resolve(false)},
        );
    });

const styles = StyleSheet.create({
    wrap: {marginTop: 20},
    row: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottomWidth: 1,
        paddingVertical: 14,
        minHeight: 48,
        gap: 8,
    },
    rowLabel: {fontSize: 15, fontFamily: 'Roboto'},
    rowValue: {fontSize: 16, fontWeight: '600', fontFamily: 'Roboto', flexShrink: 1, textAlign: 'right'},
    summary: {fontSize: 14, lineHeight: 20, marginTop: 12, fontFamily: 'Roboto'},
    error: {fontSize: 14, lineHeight: 20, marginTop: 12, fontFamily: 'Roboto'},
});
