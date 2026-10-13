// Round 4: "Check WhatsApp Call Alerts" – a short check the user starts
// while someone calls them on WhatsApp. Shows yes/no answers only; the
// native side keeps no caller name, number or message (WhatsAppCallCheck.kt).
import React, {useCallback, useEffect, useRef, useState} from 'react';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {ACTION_BUTTON_BG} from '../utils/theme/controlColors';
import {
    describeCallCheck,
    getWhatsAppCallCheck,
    startWhatsAppCallCheck,
    stopWhatsAppCallCheck,
} from '../utils/comms';

const POLL_MS = 1500;

const minutesLeft = ms => {
    const s = Math.max(0, Math.round(ms / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

const WhatsAppCallCheck = ({colors, settings, onAction}) => {
    const {text, muted, card} = colors;
    const [check, setCheck] = useState(null);
    const [busy, setBusy] = useState(false);
    const timer = useRef(null);

    const stopPolling = () => {
        if (timer.current) clearInterval(timer.current);
        timer.current = null;
    };

    const load = useCallback(async () => {
        try {
            const r = await getWhatsAppCallCheck();
            setCheck(r?.exists ? r : null);
            if (!r?.running) stopPolling();
            return r;
        } catch (e) {
            stopPolling();
            return null;
        }
    }, []);

    const startPolling = useCallback(() => {
        stopPolling();
        timer.current = setInterval(load, POLL_MS);
    }, [load]);

    useEffect(() => {
        // A check started earlier keeps running natively; pick it up again.
        load().then(r => r?.running && startPolling());
        return stopPolling;
    }, [load, startPolling]);

    const onStart = async () => {
        if (busy) return;
        setBusy(true);
        try {
            setCheck(await startWhatsAppCallCheck());
            startPolling();
        } catch (e) {
            setCheck(null);
        } finally {
            setBusy(false);
        }
    };

    const onStop = async () => {
        stopPolling();
        setCheck(await stopWhatsAppCallCheck(false).catch(() => null));
    };

    const onDone = async () => {
        stopPolling();
        await stopWhatsAppCallCheck(true).catch(() => null);
        setCheck(null);
    };

    if (!check) {
        return (
            <View style={[styles.box, {backgroundColor: card}]}>
                <Text style={[styles.title, {color: text}]}>Check WhatsApp Call Alerts</Text>
                <Text style={[styles.body, {color: muted}]}>
                    If a real WhatsApp call was silent, run this check and ask someone to call you on WhatsApp.
                    Nothing is sent anywhere.
                </Text>
                <TouchableOpacity
                    style={[styles.button, busy && styles.disabled]}
                    onPress={onStart}
                    disabled={busy}
                    accessibilityRole="button"
                    testID="wa-call-check-start">
                    <Text style={styles.buttonText}>Check WhatsApp Call Alerts</Text>
                </TouchableOpacity>
            </View>
        );
    }

    const {rows, summary, action} = describeCallCheck(check, settings);
    const actionLabel = {
        NOTIFICATION_ACCESS: 'Open notification access',
        NAME_MATCH: 'Turn on “Recognise by name”',
        SETTINGS: 'Check Settings',
    }[action];

    return (
        <View style={[styles.box, {backgroundColor: card}]} testID="wa-call-check">
            <Text style={[styles.title, {color: text}]}>
                {check.running ? 'Checking WhatsApp calls…' : 'Check result'}
            </Text>
            {check.running ? (
                <Text style={[styles.body, {color: text}]}>
                    Ask someone to call you on WhatsApp while this check is running. Time left:{' '}
                    {minutesLeft(check.remainingMs)}
                </Text>
            ) : null}
            {rows.map(r => (
                <View key={r.key} style={styles.resultRow} accessible accessibilityLabel={`${r.label}: ${r.value}`}>
                    <Text style={[styles.resultLabel, {color: muted}]}>{r.label}</Text>
                    <Text style={[styles.resultValue, {color: text}]}>{r.value}</Text>
                </View>
            ))}
            <Text style={[styles.summary, {color: text}]} accessibilityLiveRegion="polite">
                {summary}
            </Text>
            {!check.running && check.shape ? (
                <Text style={[styles.detail, {color: muted}]} selectable>
                    Support details: {check.shape}
                </Text>
            ) : null}
            {actionLabel ? (
                <TouchableOpacity style={styles.secondary} onPress={() => onAction(action)} accessibilityRole="button">
                    <Text style={[styles.secondaryText, {color: text}]}>{actionLabel}</Text>
                </TouchableOpacity>
            ) : null}
            {check.running ? (
                <TouchableOpacity style={styles.button} onPress={onStop} accessibilityRole="button" testID="wa-call-check-stop">
                    <Text style={styles.buttonText}>Stop Check</Text>
                </TouchableOpacity>
            ) : (
                <View style={styles.buttons}>
                    <TouchableOpacity style={[styles.button, styles.half]} onPress={onStart} accessibilityRole="button">
                        <Text style={styles.buttonText}>Check Again</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.button, styles.half]}
                        onPress={onDone}
                        accessibilityRole="button"
                        accessibilityHint="Closes and deletes this result"
                        testID="wa-call-check-done">
                        <Text style={styles.buttonText}>Done</Text>
                    </TouchableOpacity>
                </View>
            )}
        </View>
    );
};

export default WhatsAppCallCheck;

const styles = StyleSheet.create({
    box: {borderRadius: 14, padding: 14, marginTop: 12},
    title: {fontSize: 15, fontWeight: '700', marginBottom: 4},
    body: {fontSize: 13, lineHeight: 18, marginBottom: 8},
    resultRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        paddingVertical: 6,
        gap: 8,
    },
    resultLabel: {fontSize: 13, flexShrink: 1},
    resultValue: {fontSize: 13, fontWeight: '700', flexShrink: 1, textAlign: 'right'},
    summary: {fontSize: 14, lineHeight: 20, marginTop: 8},
    detail: {fontSize: 11, lineHeight: 15, marginTop: 8},
    buttons: {flexDirection: 'row', flexWrap: 'wrap', gap: 10},
    button: {
        backgroundColor: ACTION_BUTTON_BG,
        borderRadius: 22,
        paddingVertical: 12,
        paddingHorizontal: 16,
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 48,
        marginTop: 10,
    },
    half: {flexGrow: 1, flexBasis: 120},
    buttonText: {color: '#fff', fontWeight: '700', fontSize: 15, textAlign: 'center'},
    disabled: {opacity: 0.6},
    secondary: {
        marginTop: 10,
        borderRadius: 22,
        borderWidth: 1,
        borderColor: ACTION_BUTTON_BG,
        paddingVertical: 10,
        paddingHorizontal: 16,
        minHeight: 44,
        alignItems: 'center',
        justifyContent: 'center',
    },
    secondaryText: {fontWeight: '600', textAlign: 'center'},
});
