import React from 'react';
import {StyleSheet, Text, TouchableOpacity, View, useColorScheme} from 'react-native';

import {ACTION_BUTTON_BG} from '../utils/theme/controlColors';

/**
 * Shown where a feature is locked by the user's plan (e.g. calendars and automatic replies after the free
 * trial). The wording comes from the caller; the button opens the plans screen.
 */
const PlanLockCard = ({title, body, onPress, testID = 'plan-lock'}) => {
    const isDark = useColorScheme() === 'dark';
    const text = isDark ? '#FFFFFF' : '#1A1A1A';
    const muted = isDark ? '#BBB' : '#555';
    const bg = isDark ? 'rgba(85, 85, 85, 0.12)' : '#2E3A3E14';
    return (
        <View style={[styles.card, {backgroundColor: bg}]} testID={testID}>
            <Text style={[styles.title, {color: text}]}>{'\uD83D\uDD12 '}{title}</Text>
            <Text style={[styles.body, {color: muted}]}>{body}</Text>
            <TouchableOpacity style={styles.button} onPress={onPress} accessibilityRole="button" testID={`${testID}-plans`}>
                <Text style={styles.buttonText}>See plans</Text>
            </TouchableOpacity>
        </View>
    );
};

export default PlanLockCard;

const styles = StyleSheet.create({
    card: {borderRadius: 14, padding: 14, marginBottom: 12, borderLeftWidth: 4, borderLeftColor: '#D6721E'},
    title: {fontSize: 15, fontWeight: '700', marginBottom: 4},
    body: {fontSize: 13, lineHeight: 18},
    button: {alignSelf: 'flex-start', marginTop: 10, backgroundColor: ACTION_BUTTON_BG, borderRadius: 18, paddingVertical: 8, paddingHorizontal: 16},
    buttonText: {color: '#fff', fontWeight: '600'},
});
