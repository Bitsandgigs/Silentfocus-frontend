import React, {useState} from 'react';
import {ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View, useColorScheme} from 'react-native';
import {ACTION_BUTTON_BG, linkColor} from '../utils/theme/controlColors';
import {showAlert} from '../function/Alert';
import Constants from '../utils/theme/constants';
import {FEEDBACK_CATEGORIES, FEEDBACK_MAX_LENGTH, FEEDBACK_MIN_LENGTH, sendFeedback} from '../utils/feedback';

const ORANGE = '#D6721E';

const FAILURE_TEXT = {
    offline: 'You are offline. Please try again when you are connected.',
    signedOut: 'Please sign in again to send feedback.',
};

/** Accounts section: collapsed row that opens a short feedback form. */
const FeedbackForm = ({send = sendFeedback}) => {
    const isDark = useColorScheme() === 'dark';
    const [open, setOpen] = useState(false);
    const [category, setCategory] = useState('idea');
    const [message, setMessage] = useState('');
    const [sending, setSending] = useState(false);

    const text = isDark ? '#FFFFFF' : '#1A1A1A';
    const muted = isDark ? '#AAA' : '#555';
    const inputBg = isDark ? 'rgba(255,255,255,0.06)' : '#FFFFFF';
    const canSend = message.trim().length >= FEEDBACK_MIN_LENGTH && !sending;

    const onSend = async () => {
        if (!canSend) {
            return;
        }
        setSending(true);
        const result = await send({category, message});
        setSending(false);
        if (result.ok) {
            setMessage('');
            setOpen(false);
            showAlert(Constants.commonConstant.appName, 'Thanks! Your feedback was sent.');
            return;
        }
        showAlert(
            Constants.commonConstant.appName,
            FAILURE_TEXT[result.reason] || 'Your feedback could not be sent. Please try again.',
        );
    };

    return (
        <View>
            <TouchableOpacity
                onPress={() => setOpen(o => !o)}
                style={styles.header}
                accessibilityRole="button"
                accessibilityState={{expanded: open}}
                accessibilityLabel="Send feedback">
                <View style={styles.flex}>
                    <Text style={[styles.title, {color: text}]}>Send feedback</Text>
                    <Text style={[styles.hint, {color: muted}]}>Report a problem or suggest an idea.</Text>
                </View>
                <Text style={[styles.chevron, {color: linkColor(isDark)}]}>{open ? '▴' : '▾'}</Text>
            </TouchableOpacity>

            {open && (
                <View style={styles.body}>
                    <View style={styles.chips}>
                        {FEEDBACK_CATEGORIES.map(c => {
                            const selected = c.key === category;
                            return (
                                <TouchableOpacity
                                    key={c.key}
                                    onPress={() => setCategory(c.key)}
                                    style={[styles.chip, selected && styles.chipSelected]}
                                    accessibilityRole="radio"
                                    accessibilityState={{selected}}>
                                    <Text style={[styles.chipText, {color: selected ? '#fff' : muted}]}>{c.label}</Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                    <TextInput
                        value={message}
                        onChangeText={setMessage}
                        placeholder="Tell us what happened or what we could do better"
                        placeholderTextColor={muted}
                        multiline
                        maxLength={FEEDBACK_MAX_LENGTH}
                        style={[styles.input, {color: text, backgroundColor: inputBg}]}
                        accessibilityLabel="Feedback message"
                    />
                    <Text style={[styles.counter, {color: muted}]}>
                        {message.length}/{FEEDBACK_MAX_LENGTH}
                    </Text>
                    <TouchableOpacity
                        onPress={onSend}
                        disabled={!canSend}
                        style={[styles.button, !canSend && styles.buttonDisabled]}
                        accessibilityRole="button"
                        accessibilityState={{disabled: !canSend}}>
                        {sending ? (
                            <ActivityIndicator color="#fff" />
                        ) : (
                            <Text style={styles.buttonText}>Send</Text>
                        )}
                    </TouchableOpacity>
                </View>
            )}
        </View>
    );
};

export default FeedbackForm;

const styles = StyleSheet.create({
    flex: {flex: 1},
    header: {flexDirection: 'row', alignItems: 'center', paddingVertical: 6},
    title: {fontSize: 14, fontWeight: '600'},
    hint: {fontSize: 12, lineHeight: 17, marginTop: 2},
    chevron: {fontSize: 18, marginLeft: 12},
    body: {paddingTop: 8, paddingBottom: 4},
    chips: {flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10},
    chip: {
        borderWidth: 1,
        borderColor: ORANGE,
        borderRadius: 18,
        paddingVertical: 6,
        paddingHorizontal: 14,
        marginRight: 8,
        marginBottom: 6,
        minHeight: 36,
        justifyContent: 'center',
    },
    chipSelected: {backgroundColor: ACTION_BUTTON_BG, borderColor: ACTION_BUTTON_BG},
    chipText: {fontSize: 13, fontWeight: '600'},
    input: {
        minHeight: 110,
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 10,
        fontSize: 14,
        textAlignVertical: 'top',
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: '#999',
    },
    counter: {fontSize: 11, textAlign: 'right', marginTop: 4},
    button: {
        marginTop: 10,
        backgroundColor: ACTION_BUTTON_BG,
        borderRadius: 22,
        minHeight: 44,
        alignItems: 'center',
        justifyContent: 'center',
    },
    buttonDisabled: {opacity: 0.45},
    buttonText: {color: '#fff', fontSize: 15, fontWeight: '600'},
});
