import React, {useCallback, useEffect, useState} from 'react';
import {ACTION_BUTTON_BG, linkColor} from '../utils/theme/controlColors';
import {StyleSheet, Text, TouchableOpacity, View, useColorScheme} from 'react-native';
import {useIsFocused, useNavigation} from '@react-navigation/native';
import screens from '../utils/theme/screens';
import {
    DEFAULT_LEARNING_STATE,
    acceptLearningSuggestion,
    answerLearningOptIn,
    dismissLearningSuggestion,
    getLearningState,
    isLearningAvailable,
    shouldOfferOptIn,
    subscribeLearningSuggestion,
    zonePrefillFromSuggestion,
} from '../utils/learning';

const ORANGE = '#D6721E';

/**
 * Home card for Smart Location Learning. Shows either the one-time offer to
 * turn learning on (right after a manual Silent ON) or a pending suggestion.
 * Non-blocking: nothing happens unless the user taps a button.
 * [manualOnCount] increases each time the user turns Silent Focus on by hand.
 */
const LearningSuggestionCard = ({manualOnCount}) => {
    const navigation = useNavigation();
    const isFocused = useIsFocused();
    const isDark = useColorScheme() === 'dark';
    const [state, setState] = useState(DEFAULT_LEARNING_STATE);
    const [offerOptIn, setOfferOptIn] = useState(false);

    const refresh = useCallback(() => {
        getLearningState()
            .then(setState)
            .catch(() => {});
    }, []);

    useEffect(() => {
        if (isFocused) refresh();
    }, [isFocused, refresh]);

    useEffect(() => subscribeLearningSuggestion(refresh), [refresh]);

    useEffect(() => {
        if (!manualOnCount) return;
        getLearningState()
            .then(s => {
                setState(s);
                setOfferOptIn(shouldOfferOptIn(s, true));
            })
            .catch(() => {});
    }, [manualOnCount]);

    if (!isLearningAvailable) return null;

    const card = isDark ? 'rgba(85, 85, 85, 0.18)' : '#FFF4EA';
    const text = isDark ? '#FFFFFF' : '#1A1A1A';
    const muted = isDark ? '#BBB' : '#555';

    if (state.suggestion) {
        const s = state.suggestion;
        const onCreate = async () => {
            await acceptLearningSuggestion(s.id).then(setState).catch(() => {});
            navigation.navigate(screens.MapScreen, zonePrefillFromSuggestion(s));
        };
        const onNotNow = () => dismissLearningSuggestion(s.id).then(setState).catch(() => {});
        return (
            <View style={[styles.card, {backgroundColor: card}]} accessibilityRole="summary">
                <Text style={[styles.title, {color: text}]}>You often use Silent Focus here.</Text>
                <Text style={[styles.body, {color: muted}]}>
                    Would you like to create a Silent Zone for this location?
                </Text>
                <View style={styles.actions}>
                    <TouchableOpacity onPress={onCreate} style={styles.primary} accessibilityRole="button">
                        <Text style={styles.primaryText}>Create Silent Zone</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={onNotNow} style={styles.secondary} accessibilityRole="button">
                        <Text style={[styles.secondaryText, {color: linkColor(isDark)}]}>Not Now</Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    }

    if (offerOptIn) {
        const answer = accepted =>
            answerLearningOptIn(accepted)
                .then(s => {
                    setState(s);
                    setOfferOptIn(false);
                })
                .catch(() => setOfferOptIn(false));
        return (
            <View style={[styles.card, {backgroundColor: card}]}>
                <Text style={[styles.title, {color: text}]}>Learn places you silence your phone?</Text>
                <Text style={[styles.body, {color: muted}]}>
                    When you turn Silent Focus on by hand, Silent Focus can note roughly where you are. If you
                    do it at the same place on different days, it will suggest a Silent Zone. Places stay on this
                    phone, and you can clear them in Settings.
                </Text>
                <View style={styles.actions}>
                    <TouchableOpacity onPress={() => answer(true)} style={styles.primary} accessibilityRole="button">
                        <Text style={styles.primaryText}>Turn on</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => answer(false)} style={styles.secondary} accessibilityRole="button">
                        <Text style={[styles.secondaryText, {color: linkColor(isDark)}]}>No thanks</Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    }

    return null;
};

export default LearningSuggestionCard;

const styles = StyleSheet.create({
    card: {
        borderRadius: 14,
        padding: 14,
        marginTop: 12,
        borderLeftWidth: 4,
        borderLeftColor: ORANGE,
        alignSelf: 'stretch',
    },
    title: {fontSize: 15, fontWeight: '700', marginBottom: 4},
    body: {fontSize: 13, lineHeight: 18},
    actions: {flexDirection: 'row', alignItems: 'center', marginTop: 12, flexWrap: 'wrap'},
    primary: {
        backgroundColor: ACTION_BUTTON_BG,
        borderRadius: 18,
        paddingVertical: 8,
        paddingHorizontal: 16,
        marginRight: 12,
        minHeight: 36,
        justifyContent: 'center',
    },
    primaryText: {color: '#fff', fontWeight: '600'},
    secondary: {paddingVertical: 8, paddingHorizontal: 8, minHeight: 36, justifyContent: 'center'},
    secondaryText: {fontWeight: '600'},
});
