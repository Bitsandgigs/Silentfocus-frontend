import React, {useCallback, useEffect, useState} from 'react';
import {
    ActivityIndicator,
    Alert,
    AppState,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TouchableOpacity,
    View,
    useColorScheme,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useNavigation} from '@react-navigation/native';
import {PERMISSIONS, RESULTS, openSettings, request} from 'react-native-permissions';
import BackIcon from '../assets/svgs/Back';
import WhatsAppCallCheck from '../componentes/WhatsAppCallCheck';
import {ACTION_BUTTON_BG, linkColor} from '../utils/theme/controlColors';
import {openDndAccessSettings} from '../utils/silentFocusEngine';
import {
    DEFAULT_COMMS_STATE,
    SIM_CALL_MODES,
    SIM_CALL_MODE_OPTIONS,
    callExceptionBlockers,
    describeUrgentRule,
    getCommsState,
    openCallScreeningSettings,
    openNotificationAccessSettings,
    openWhatsAppAlertSettings,
    sendTestWhatsAppAlert,
    testAlertMessage,
    whatsAppAlertBlockers,
    pickEmergencyContact,
    removeEmergencyContact,
    requestCallScreeningRole,
    setCallSettings,
} from '../utils/comms';

const ORANGE = '#D6721E';

const BLOCKER_COPY = {
    UNSUPPORTED: {
        title: 'Not available on this phone',
        body: 'Emergency and urgent callers need Android 10 or newer.',
    },
    SCREENING_ROLE: {
        title: 'Let Silent Focus recognise callers',
        body: 'Android shares the caller’s number only with the app you choose for call screening. Silent Focus uses it just to spot your emergency contacts and repeat callers; it never blocks or rejects calls.',
        action: 'Allow call screening',
    },
    CONTACTS_PERMISSION: {
        title: 'Allow calls from saved contacts',
        body: 'Android only shows calls from people in your contacts to a call-screening app that has contacts permission. Your contacts are never uploaded or read in bulk.',
        action: 'Allow contacts',
    },
    DND_ACCESS: {
        title: 'Do Not Disturb access is off',
        body: 'Silent Focus needs it to pause silence while an allowed call rings.',
        action: 'Open settings',
    },
    PHONE_STATE: {
        title: 'Resume silence right after the call',
        body: 'With phone-state access, silence comes back as soon as the call stops ringing. Without it, it comes back within about a minute and a half.',
        action: 'Allow',
    },
};

// Important WhatsApp calls: why the alert may be silent. One plain sentence
// each; the banner title and button are the same for all (Round 4 #B).
const WA_BLOCKER_COPY = {
    NOTIFICATION_ACCESS: {body: 'Silent Focus needs notification access to notice WhatsApp calls.'},
    NOTIFICATIONS_OFF: {body: 'Notifications are turned off for Silent Focus.'},
    DND_ACCESS: {body: 'Silent Focus needs Do Not Disturb access.'},
    CHANNEL_OFF: {body: 'Important WhatsApp call alerts are turned off in your phone settings.'},
    NO_DND_OVERRIDE: {body: 'Turn on “Ignore Do not disturb” (or “Override Do Not Disturb”) for this alert.'},
};

const EmergencyContactsScreen = () => {
    const navigation = useNavigation();
    const isDark = useColorScheme() === 'dark';
    const bg = isDark ? '#111111' : '#FFFFFF';
    const card = isDark ? 'rgba(85, 85, 85, 0.12)' : '#2E3A3E14';
    const text = isDark ? '#FFFFFF' : '#1A1A1A';
    const muted = isDark ? '#AAA' : '#555';

    const [state, setState] = useState(DEFAULT_COMMS_STATE);
    // null = loading, true = loaded, false = could not be read.
    const [loaded, setLoaded] = useState(null);
    const [busy, setBusy] = useState(false);
    const [learnMore, setLearnMore] = useState(false);

    const refresh = useCallback(async () => {
        try {
            setState(await getCommsState());
            setLoaded(true);
        } catch (e) {
            // Keep the last known state; show a retry if nothing loaded yet.
            setLoaded(prev => (prev === true ? true : false));
        }
    }, []);

    useEffect(() => {
        refresh();
        const sub = AppState.addEventListener('change', s => s === 'active' && refresh());
        return () => sub.remove();
    }, [refresh]);

    const blockers = callExceptionBlockers(state);
    const cs = state.callSettings;

    const updateCall = async patch => {
        setState(prev => ({...prev, callSettings: {...prev.callSettings, ...patch}}));
        try {
            setState(await setCallSettings(patch));
        } catch (e) {
            refresh();
        }
    };

    const alertOnly = cs.simCallMode === SIM_CALL_MODES.ALERT_ONLY;

    // Emergency Call Handling: confirmed, because it changes what the next
    // emergency or urgent SIM call does.
    const onSelectSimCallMode = mode => {
        if (mode === cs.simCallMode) return;
        const toAlert = mode === SIM_CALL_MODES.ALERT_ONLY;
        Alert.alert(
            toAlert ? 'Use Alert Only?' : 'Use Ring Through DND?',
            toAlert
                ? 'Emergency and urgent SIM calls will no longer ring through Silent Focus. Silent Focus stays on and plays its own alert for up to 30 seconds instead. Answer from your phone’s call screen.'
                : 'Emergency and urgent SIM calls will ring while Silent Focus is on, as before.',
            [
                {text: 'Cancel', style: 'cancel'},
                {text: 'Change', onPress: () => updateCall({simCallMode: mode})},
            ],
        );
    };

    const confirmScreeningRole = () => {
        Alert.alert(
            'Use Silent Focus for call screening?',
            'Only one app can screen calls. If you use another call-screening or spam-blocking app, Silent Focus will replace it (your phone app’s own spam protection is not affected). You can change this any time in Settings › Apps › Default apps.',
            [
                {text: 'Not now', style: 'cancel'},
                {
                    text: 'Continue',
                    onPress: async () => {
                        await requestCallScreeningRole();
                        refresh();
                    },
                },
            ],
        );
    };

    const requestPermission = async permission => {
        const result = await request(permission);
        if (result === RESULTS.BLOCKED) openSettings().catch(() => {});
        refresh();
    };

    const onBlockerAction = key => {
        if (key === 'SCREENING_ROLE') confirmScreeningRole();
        else if (key === 'CONTACTS_PERMISSION') requestPermission(PERMISSIONS.ANDROID.READ_CONTACTS);
        else if (key === 'PHONE_STATE') requestPermission(PERMISSIONS.ANDROID.READ_PHONE_STATE);
        else if (key === 'DND_ACCESS') openDndAccessSettings();
    };

    const waBlockers = whatsAppAlertBlockers(state);

    const onWaBlockerAction = key => {
        if (key === 'NOTIFICATION_ACCESS') openNotificationAccessSettings();
        else if (key === 'DND_ACCESS') openDndAccessSettings();
        else openWhatsAppAlertSettings();
    };

    const onTestAlert = async () => {
        const outcome = await sendTestWhatsAppAlert();
        let status = {};
        try {
            const next = await getCommsState();
            setState(next);
            status = next.whatsAppAlert;
        } catch (e) {
            refresh();
        }
        Alert.alert('Try an Alert', testAlertMessage(outcome, status));
    };

    const onCheckAction = action => {
        if (action === 'NAME_MATCH') updateCall({whatsAppNameMatch: true});
        else if (action === 'NOTIFICATION_ACCESS') openNotificationAccessSettings();
        else if (waBlockers.length > 0) onWaBlockerAction(waBlockers[0]);
        else openWhatsAppAlertSettings();
    };

    const onAdd = async () => {
        if (busy) return;
        setBusy(true);
        try {
            const picked = await pickEmergencyContact();
            if (picked?.error) {
                Alert.alert('Silent Focus', 'That contact has no usable phone number.');
            }
        } catch (e) {
            Alert.alert('Silent Focus', 'The contact could not be added.');
        } finally {
            setBusy(false);
            refresh();
        }
    };

    const onRemove = contact => {
        Alert.alert('Remove emergency contact?', contact.name || contact.number, [
            {text: 'Cancel', style: 'cancel'},
            {
                text: 'Remove',
                style: 'destructive',
                onPress: async () => setState(await removeEmergencyContact(contact.id)),
            },
        ]);
    };

    return (
        <SafeAreaView style={[styles.flex, {backgroundColor: bg}]}>
            <ScrollView contentContainerStyle={styles.container}>
                <View style={styles.header}>
                    <TouchableOpacity
                        onPress={() => navigation.goBack()}
                        style={styles.backButton}
                        accessibilityRole="button"
                        accessibilityLabel="Back">
                        <BackIcon width={26} height={26} color={text} />
                    </TouchableOpacity>
                    <Text style={[styles.title, {color: text}]}>Emergency Contacts</Text>
                </View>

                {loaded !== true ? (
                    loaded === null ? (
                        <ActivityIndicator style={styles.stateBox} color={ORANGE} />
                    ) : (
                        <TouchableOpacity onPress={() => refresh(true)} style={styles.stateBox} accessibilityRole="button">
                            <Text style={{color: muted, textAlign: 'center'}}>
                                Settings could not be loaded. Tap to retry.
                            </Text>
                        </TouchableOpacity>
                    )
                ) : null}
                {loaded === true ? (
                <>
                <Text style={[styles.intro, {color: muted}]}>
                    {alertOnly
                        ? 'Calls from these people trigger a Silent Focus alert while Silent Focus is on. Silent Focus stays on throughout.'
                        : 'Calls from these people ring even while Silent Focus is on. Silent Focus stays on and silence returns after the call.'}
                </Text>

                {blockers.map(key => {
                    const copy = BLOCKER_COPY[key];
                    return (
                        <View key={key} style={[styles.banner, {backgroundColor: card}]}>
                            <Text style={[styles.bannerTitle, {color: text}]}>{copy.title}</Text>
                            <Text style={[styles.bannerBody, {color: muted}]}>{copy.body}</Text>
                            {copy.action ? (
                                <TouchableOpacity
                                    onPress={() => onBlockerAction(key)}
                                    style={styles.bannerButton}
                                    accessibilityRole="button">
                                    <Text style={styles.bannerButtonText}>{copy.action}</Text>
                                </TouchableOpacity>
                            ) : null}
                        </View>
                    );
                })}

                <View style={[styles.row, {backgroundColor: card}]}>
                    <View style={styles.flex}>
                        <Text style={[styles.rowTitle, {color: text}]}>Allow emergency contacts</Text>
                        <Text style={[styles.rowBody, {color: muted}]}>
                            {alertOnly ? 'Their calls trigger a Silent Focus alert.' : 'Their calls ring through silence.'}
                        </Text>
                    </View>
                    <Switch
                        value={cs.emergencyEnabled}
                        onValueChange={v => updateCall({emergencyEnabled: v})}
                        trackColor={{false: '#444', true: '#F08A2C'}}
                        thumbColor="#fff"
                        accessibilityLabel="Allow emergency contacts"
                    />
                </View>

                <Text style={[styles.section, {color: text}]}>CONTACTS</Text>
                {state.emergencyContacts.length === 0 ? (
                    <Text style={[styles.rowBody, {color: muted}]}>No emergency contacts yet.</Text>
                ) : (
                    state.emergencyContacts.map(c => (
                        <View key={c.id} style={[styles.row, {backgroundColor: card}]}>
                            <View style={styles.flex}>
                                <Text style={[styles.rowTitle, {color: text}]}>{c.name || 'Contact'}</Text>
                                <Text style={[styles.rowBody, {color: muted}]}>{c.number}</Text>
                            </View>
                            <TouchableOpacity
                                onPress={() => onRemove(c)}
                                accessibilityRole="button"
                                accessibilityLabel={`Remove ${c.name || 'contact'}`}
                                style={styles.removeButton}>
                                <Text style={styles.removeText}>Remove</Text>
                            </TouchableOpacity>
                        </View>
                    ))
                )}
                <TouchableOpacity
                    style={[styles.addButton, busy && styles.disabled]}
                    onPress={onAdd}
                    disabled={busy}
                    accessibilityRole="button">
                    <Text style={styles.addButtonText}>+ Add Contact</Text>
                </TouchableOpacity>

                <Text style={[styles.section, {color: text}]}>URGENT CALLERS</Text>
                <View style={[styles.row, {backgroundColor: card}]}>
                    <View style={styles.flex}>
                        <Text style={[styles.rowTitle, {color: text}]}>Allow urgent repeat callers</Text>
                        <Text style={[styles.rowBody, {color: muted}]}>{describeUrgentRule(cs)}</Text>
                    </View>
                    <Switch
                        value={cs.urgentEnabled}
                        onValueChange={v => updateCall({urgentEnabled: v})}
                        trackColor={{false: '#444', true: '#F08A2C'}}
                        thumbColor="#fff"
                        accessibilityLabel="Allow urgent repeat callers"
                    />
                </View>
                <Text style={[styles.footnote, {color: muted}]}>
                    After an urgent call, further calls from that number stay silenced for{' '}
                    {cs.urgentCooldownMinutes} minutes. Private or hidden numbers are never counted.
                </Text>

                <Text style={[styles.section, {color: text}]} accessibilityRole="header">
                    EMERGENCY CALL HANDLING
                </Text>
                <View accessibilityRole="radiogroup">
                    {SIM_CALL_MODE_OPTIONS.map(o => {
                        const selected = cs.simCallMode === o.mode;
                        return (
                            <TouchableOpacity
                                key={o.mode}
                                testID={`sim-call-mode-${o.mode}`}
                                onPress={() => onSelectSimCallMode(o.mode)}
                                style={[styles.row, {backgroundColor: card}, selected && styles.rowSelected]}
                                accessibilityRole="radio"
                                accessibilityState={{checked: selected}}
                                accessibilityLabel={`${o.title}. ${o.body}`}>
                                <View style={[styles.radio, selected && styles.radioOn]}>
                                    {selected ? <View style={styles.radioDot} /> : null}
                                </View>
                                <View style={styles.flex}>
                                    <Text style={[styles.rowTitle, {color: text}]}>
                                        {o.title}
                                        {selected ? '  · Active' : ''}
                                    </Text>
                                    <Text style={[styles.rowBody, {color: muted}]}>{o.body}</Text>
                                </View>
                            </TouchableOpacity>
                        );
                    })}
                </View>
                <Text style={[styles.footnote, {color: muted}]}>
                    Ring Through DND lets qualifying SIM calls ring. Alert Only keeps Silent Focus active and uses a
                    separate emergency notification. WhatsApp alerts are handled separately.
                </Text>

                {/* Round 4 (#B): plain-language "Important WhatsApp Calls". */}
                <Text style={[styles.waHeading, {color: text}]} accessibilityRole="header">
                    Important WhatsApp Calls
                </Text>
                <Text style={[styles.intro, {color: muted}]}>
                    Get an alert when an emergency contact calls you on WhatsApp, or when someone calls repeatedly.
                </Text>
                <View style={[styles.row, {backgroundColor: card}]}>
                    <View style={styles.flex}>
                        <Text style={[styles.rowTitle, {color: text}]}>Alerts for WhatsApp calls</Text>
                        <Text style={[styles.rowBody, {color: muted}]}>Works for WhatsApp and WhatsApp Business.</Text>
                    </View>
                    <Switch
                        value={cs.whatsAppAlertsEnabled}
                        onValueChange={v => updateCall({whatsAppAlertsEnabled: v})}
                        trackColor={{false: '#444', true: '#F08A2C'}}
                        thumbColor="#fff"
                        accessibilityLabel="Alerts for important WhatsApp calls"
                    />
                </View>

                {cs.whatsAppAlertsEnabled ? (
                    <>
                        <View style={[styles.row, {backgroundColor: card}]}>
                            <View style={styles.flex}>
                                <Text style={[styles.rowTitle, {color: text}]}>Emergency Contacts</Text>
                                <Text style={[styles.rowBody, {color: muted}]}>
                                    Get an alert when someone on your emergency contacts list calls you.
                                </Text>
                            </View>
                            <Text style={[styles.status, {color: cs.emergencyEnabled ? text : muted}]}>
                                {cs.emergencyEnabled ? 'On' : 'Off'}
                            </Text>
                        </View>
                        <View style={[styles.row, {backgroundColor: card}]}>
                            <View style={styles.flex}>
                                <Text style={[styles.rowTitle, {color: text}]}>Urgent Repeat Calls</Text>
                                <Text style={[styles.rowBody, {color: muted}]}>
                                    Get an alert when the same person calls {cs.urgentThreshold} times within{' '}
                                    {cs.urgentWindowMinutes} minutes.
                                </Text>
                            </View>
                            <Text style={[styles.status, {color: cs.urgentEnabled ? text : muted}]}>
                                {cs.urgentEnabled ? 'On' : 'Off'}
                            </Text>
                        </View>
                        {!cs.emergencyEnabled || !cs.urgentEnabled ? (
                            <Text style={[styles.footnote, {color: muted}]}>
                                Turn these on with the switches above.
                            </Text>
                        ) : null}

                        {waBlockers.length > 0 ? (
                            <View style={[styles.banner, {backgroundColor: card}]} testID="wa-setup-warning">
                                <Text style={[styles.bannerTitle, {color: text}]}>
                                    Important call alerts may be silent. Check your sound settings.
                                </Text>
                                <Text style={[styles.bannerBody, {color: muted}]}>
                                    {WA_BLOCKER_COPY[waBlockers[0]].body}
                                </Text>
                                <TouchableOpacity
                                    onPress={() => onWaBlockerAction(waBlockers[0])}
                                    style={styles.bannerButton}
                                    accessibilityRole="button">
                                    <Text style={styles.bannerButtonText}>Check Settings</Text>
                                </TouchableOpacity>
                            </View>
                        ) : null}

                        <Text style={[styles.bodyText, {color: muted}]}>
                            Silent Focus plays a special alert for important WhatsApp calls. Set your phone to Ring to
                            hear it, or Vibrate to feel it.
                        </Text>
                        <TouchableOpacity
                            style={styles.addButton}
                            onPress={onTestAlert}
                            accessibilityRole="button"
                            accessibilityHint="Check how an important call alert sounds on your phone"
                            testID="wa-test-alert">
                            <Text style={styles.addButtonText}>Try an Alert</Text>
                        </TouchableOpacity>
                        <Text style={[styles.footnote, styles.centered, {color: muted}]}>
                            Check how an important call alert sounds on your phone.
                        </Text>
                        <TouchableOpacity
                            onPress={() => openWhatsAppAlertSettings()}
                            accessibilityRole="button"
                            style={styles.linkButton}>
                            <Text style={[styles.link, {color: linkColor(isDark)}]}>Alert Sound & Settings ›</Text>
                        </TouchableOpacity>

                        <View style={[styles.row, {backgroundColor: card}]}>
                            <View style={styles.flex}>
                                <Text style={[styles.rowTitle, {color: text}]}>Recognise by name (optional)</Text>
                                <Text style={[styles.rowBody, {color: muted}]}>
                                    Some WhatsApp calls only show a name. You can allow Silent Focus to use that name to
                                    recognise an emergency contact. Less reliable than a phone number.
                                </Text>
                            </View>
                            <Switch
                                value={cs.whatsAppNameMatch}
                                onValueChange={v => updateCall({whatsAppNameMatch: v})}
                                trackColor={{false: '#444', true: '#F08A2C'}}
                                thumbColor="#fff"
                                accessibilityLabel="Recognise WhatsApp emergency contacts by name"
                            />
                        </View>

                        <WhatsAppCallCheck
                            colors={{text, muted, card}}
                            settings={cs}
                            onAction={onCheckAction}
                        />

                        <TouchableOpacity
                            onPress={() => setLearnMore(v => !v)}
                            accessibilityRole="button"
                            accessibilityState={{expanded: learnMore}}
                            style={styles.linkButton}>
                            <Text style={[styles.link, {color: linkColor(isDark)}]}>
                                {learnMore ? 'Hide details' : 'Learn more'}
                            </Text>
                        </TouchableOpacity>
                        {learnMore ? (
                            <Text style={[styles.footnote, {color: muted}]}>
                                This is Silent Focus’s own alert, not WhatsApp’s ringtone. Open WhatsApp to answer. You
                                get one alert per call, and only a few in a short time. The lock screen does not show
                                who is calling. If you turn on a Do Not Disturb mode of your own that blocks all
                                sounds, the alert stays silent.
                            </Text>
                        ) : null}
                    </>
                ) : null}

                {state.callScreening.held ? (
                    <TouchableOpacity onPress={openCallScreeningSettings} accessibilityRole="button">
                        <Text style={[styles.link, {color: linkColor(isDark)}]}>Change call-screening app ›</Text>
                    </TouchableOpacity>
                ) : null}
                </>
                ) : null}
            </ScrollView>
        </SafeAreaView>
    );
};

export default EmergencyContactsScreen;

const styles = StyleSheet.create({
    stateBox: {marginTop: 32, padding: 16},
    flex: {flex: 1},
    container: {padding: 16, paddingBottom: 48},
    header: {flexDirection: 'row', alignItems: 'center', marginBottom: 12},
    backButton: {height: 44, width: 44, alignItems: 'center', justifyContent: 'center'},
    title: {fontSize: 20, fontWeight: '700'},
    intro: {fontSize: 14, lineHeight: 20, marginBottom: 16},
    banner: {borderRadius: 14, padding: 14, marginBottom: 12, borderLeftWidth: 4, borderLeftColor: ORANGE},
    bannerTitle: {fontSize: 15, fontWeight: '700', marginBottom: 4},
    bannerBody: {fontSize: 13, lineHeight: 18},
    bannerButton: {
        alignSelf: 'flex-start',
        marginTop: 10,
        backgroundColor: ACTION_BUTTON_BG,
        borderRadius: 18,
        paddingVertical: 8,
        paddingHorizontal: 16,
        minHeight: 36,
        justifyContent: 'center',
    },
    bannerButtonText: {color: '#fff', fontWeight: '600'},
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 14,
        padding: 14,
        marginBottom: 10,
    },
    rowTitle: {fontSize: 15, fontWeight: '600'},
    rowSelected: {borderWidth: 1.5, borderColor: ORANGE},
    radio: {
        width: 22,
        height: 22,
        borderRadius: 11,
        borderWidth: 2,
        borderColor: '#888',
        marginRight: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    radioOn: {borderColor: ORANGE},
    radioDot: {width: 10, height: 10, borderRadius: 5, backgroundColor: ACTION_BUTTON_BG},
    rowBody: {fontSize: 13, marginTop: 2, lineHeight: 18},
    section: {fontSize: 14, fontWeight: '700', marginTop: 18, marginBottom: 10},
    removeButton: {paddingVertical: 8, paddingHorizontal: 10, minHeight: 44, justifyContent: 'center'},
    removeText: {color: '#B3261E', fontWeight: '600'},
    addButton: {
        backgroundColor: ACTION_BUTTON_BG,
        borderRadius: 22,
        paddingVertical: 12,
        alignItems: 'center',
        marginTop: 6,
    },
    disabled: {opacity: 0.6},
    addButtonText: {color: '#fff', fontWeight: '700', fontSize: 15},
    footnote: {fontSize: 12, lineHeight: 17, marginTop: 4},
    link: {color: ORANGE, fontWeight: '600', marginTop: 20},
    linkButton: {minHeight: 44, justifyContent: 'center'},
    waHeading: {fontSize: 18, fontWeight: '700', marginTop: 24, marginBottom: 6},
    status: {fontSize: 14, fontWeight: '700', marginLeft: 12},
    bodyText: {fontSize: 14, lineHeight: 20, marginTop: 6, marginBottom: 4},
    centered: {textAlign: 'center', marginTop: 6},
});
