import React, {useCallback, useEffect, useState} from 'react';
import {
    ActivityIndicator,
    Alert,
    AppState,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    View,
    useColorScheme,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useNavigation} from '@react-navigation/native';
import BackIcon from '../assets/svgs/Back';
import {
    DEFAULT_COMMS_STATE,
    DEFAULT_REPLY,
    MAX_TEMPLATE_LENGTH,
    REPLY_COOLDOWN_OPTIONS,
    getCommsState,
    openNotificationAccessSettings,
    setAutoReplySettings,
} from '../utils/comms';
import {pushAutoReply, syncAutoReply} from '../utils/autoResponseSync';
import {fetchZonesForSync} from '../utils/automationSync';
import {ACTION_BUTTON_BG} from '../utils/theme/controlColors';

const ORANGE = '#D6721E';

const AutoReplyScreen = () => {
    const navigation = useNavigation();
    const isDark = useColorScheme() === 'dark';
    const bg = isDark ? '#111111' : '#FFFFFF';
    const card = isDark ? 'rgba(85, 85, 85, 0.12)' : '#2E3A3E14';
    const text = isDark ? '#FFFFFF' : '#1A1A1A';
    const muted = isDark ? '#AAA' : '#555';
    const inputBg = isDark ? '#222' : '#f2f2f2';

    const [state, setState] = useState(DEFAULT_COMMS_STATE);
    // null = loading, true = loaded, false = could not be read.
    const [loaded, setLoaded] = useState(null);
    const [defaultDraft, setDefaultDraft] = useState(DEFAULT_REPLY);
    const [zoneDrafts, setZoneDrafts] = useState({});
    const [dirty, setDirty] = useState(false);

    const applyState = useCallback((s, resetDrafts) => {
        setState(s);
        if (resetDrafts) {
            setDefaultDraft(s.autoReply.defaultTemplate);
            setZoneDrafts(s.autoReply.zoneTemplates);
            setDirty(false);
        }
    }, []);

    const refresh = useCallback(
        async resetDrafts => {
            try {
                applyState(await getCommsState(), resetDrafts);
                setLoaded(true);
            } catch (e) {
                // Keep what's on screen; show a retry if nothing loaded yet.
                setLoaded(prev => (prev === true ? true : false));
            }
        },
        [applyState],
    );

    useEffect(() => {
        refresh(true);
        // Bring in the account's replies (or push unsent local edits); the
        // screen keeps working from the phone's copy meanwhile.
        syncAutoReply({fetchZones: fetchZonesForSync})
            .then(next => next && applyState(next, true))
            .catch(() => {});
        const sub = AppState.addEventListener('change', s => s === 'active' && refresh(false));
        return () => sub.remove();
    }, [refresh]);

    const ar = state.autoReply;

    const update = async patch => {
        setState(prev => ({...prev, autoReply: {...prev.autoReply, ...patch}}));
        try {
            applyState(await setAutoReplySettings(patch), false);
            pushAutoReply({fetchZones: fetchZonesForSync}).catch(() => {});
        } catch (e) {
            refresh(false);
        }
    };

    const saveTemplates = async () => {
        try {
            applyState(
                await setAutoReplySettings({defaultTemplate: defaultDraft, zoneTemplates: zoneDrafts}),
                true,
            );
            pushAutoReply({fetchZones: fetchZonesForSync}).catch(() => {});
        } catch (e) {
            Alert.alert('Silent Focus', 'Your replies could not be saved. Please try again.');
        }
    };

    const onToggleEnabled = v => {
        if (v && !state.notificationAccess) {
            Alert.alert(
                'Notification access needed',
                'Auto reply works through the reply button in messaging notifications, so Silent Focus needs notification access. Message text is never stored or uploaded.',
                [
                    {text: 'Not now', style: 'cancel'},
                    {text: 'Open settings', onPress: openNotificationAccessSettings},
                ],
            );
        }
        update({enabled: v});
    };

    return (
        <SafeAreaView style={[styles.flex, {backgroundColor: bg}]}>
            <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
                    <View style={styles.header}>
                        <TouchableOpacity
                            onPress={() => navigation.goBack()}
                            style={styles.backButton}
                            accessibilityRole="button"
                            accessibilityLabel="Back">
                            <BackIcon width={26} height={26} color={text} />
                        </TouchableOpacity>
                        <Text style={[styles.title, {color: text}]}>Auto Reply</Text>
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
                    {!state.notificationAccess ? (
                        <View style={[styles.banner, {backgroundColor: card}]}>
                            <Text style={[styles.bannerTitle, {color: text}]}>Notification access is off</Text>
                            <Text style={[styles.body, {color: muted}]}>
                                Needed to see messages that arrive while Silent Focus is on and to reply from their
                                notification.
                            </Text>
                            <TouchableOpacity
                                style={styles.smallButton}
                                onPress={openNotificationAccessSettings}
                                accessibilityRole="button">
                                <Text style={styles.smallButtonText}>Open settings</Text>
                            </TouchableOpacity>
                        </View>
                    ) : null}

                    <View style={[styles.row, {backgroundColor: card}]}>
                        <View style={styles.flex}>
                            <Text style={[styles.rowTitle, {color: text}]}>Auto reply</Text>
                            <Text style={[styles.body, {color: muted}]}>
                                Reply automatically while Silent Focus is on.
                            </Text>
                        </View>
                        <Switch
                            value={ar.enabled}
                            onValueChange={onToggleEnabled}
                            trackColor={{false: '#444', true: '#F08A2C'}}
                            thumbColor="#fff"
                            accessibilityLabel="Auto reply"
                        />
                    </View>

                    <View style={[styles.row, {backgroundColor: card}]}>
                        <View style={styles.flex}>
                            <Text style={[styles.rowTitle, {color: text}]}>Reply to messaging apps</Text>
                            <Text style={[styles.body, {color: muted}]}>
                                Works with apps whose notifications have a Reply button (for example WhatsApp,
                                Telegram, Google Messages). Group chats are never auto-replied.
                            </Text>
                        </View>
                        <Switch
                            value={ar.messagingEnabled}
                            onValueChange={v => update({messagingEnabled: v})}
                            trackColor={{false: '#444', true: '#F08A2C'}}
                            thumbColor="#fff"
                            accessibilityLabel="Reply to messaging apps"
                        />
                    </View>

                    <Text style={[styles.section, {color: text}]}>HOW OFTEN</Text>
                    <View style={styles.chips}>
                        {REPLY_COOLDOWN_OPTIONS.map(o => {
                            const selected = ar.cooldownMinutes === o.minutes;
                            return (
                                <TouchableOpacity
                                    key={o.minutes}
                                    onPress={() => update({cooldownMinutes: o.minutes})}
                                    style={[styles.chip, selected && styles.chipSelected]}
                                    accessibilityRole="radio"
                                    accessibilityState={{selected}}>
                                    <Text style={[styles.chipText, {color: selected ? '#fff' : muted}]}>{o.label}</Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                    <Text style={[styles.footnote, {color: muted}]}>
                        At most one reply per sender in this interval, and never more than once per sender for the
                        whole Silent Focus session with “Once per session”.
                    </Text>

                    <Text style={[styles.section, {color: text}]}>DEFAULT REPLY</Text>
                    <TextInput
                        style={[styles.input, {color: text, backgroundColor: inputBg}]}
                        value={defaultDraft}
                        onChangeText={t => {
                            setDefaultDraft(t);
                            setDirty(true);
                        }}
                        placeholder={DEFAULT_REPLY}
                        placeholderTextColor={muted}
                        maxLength={MAX_TEMPLATE_LENGTH}
                        multiline
                        accessibilityLabel="Default reply"
                    />

                    <Text style={[styles.section, {color: text}]}>SILENT ZONE REPLIES</Text>
                    {state.zones.length === 0 ? (
                        <Text style={[styles.body, {color: muted}]}>
                            Add Silent Zones to use a different reply in each place.
                        </Text>
                    ) : (
                        state.zones.map(z => (
                            <View key={z.id} style={styles.zoneBlock}>
                                <Text style={[styles.zoneName, {color: text}]}>{z.name || `Zone ${z.id}`}</Text>
                                <TextInput
                                    style={[styles.input, {color: text, backgroundColor: inputBg}]}
                                    value={zoneDrafts[z.id] || ''}
                                    onChangeText={t => {
                                        setZoneDrafts(prev => ({...prev, [z.id]: t}));
                                        setDirty(true);
                                    }}
                                    placeholder="Uses the default reply"
                                    placeholderTextColor={muted}
                                    maxLength={MAX_TEMPLATE_LENGTH}
                                    multiline
                                    accessibilityLabel={`Reply for ${z.name || 'zone'}`}
                                />
                            </View>
                        ))
                    )}

                    <TouchableOpacity
                        style={[styles.saveButton, !dirty && styles.disabled]}
                        disabled={!dirty}
                        onPress={saveTemplates}
                        accessibilityRole="button">
                        <Text style={styles.saveText}>Save replies</Text>
                    </TouchableOpacity>

                    <Text style={[styles.section, {color: text}]}>SMS AND MISSED CALLS</Text>
                    <Text style={[styles.body, {color: muted}]}>
                        Automatic text messages and missed-call replies aren’t available: Android only lets the
                        default SMS app send texts in the background. Replies from Google Messages still work through
                        its Reply button.
                    </Text>
                </>
                ) : null}
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
};

export default AutoReplyScreen;

const styles = StyleSheet.create({
    stateBox: {marginTop: 32, padding: 16},
    flex: {flex: 1},
    container: {padding: 16, paddingBottom: 48},
    header: {flexDirection: 'row', alignItems: 'center', marginBottom: 12},
    backButton: {height: 44, width: 44, alignItems: 'center', justifyContent: 'center'},
    title: {fontSize: 20, fontWeight: '700'},
    banner: {borderRadius: 14, padding: 14, marginBottom: 12, borderLeftWidth: 4, borderLeftColor: ORANGE},
    bannerTitle: {fontSize: 15, fontWeight: '700', marginBottom: 4},
    body: {fontSize: 13, lineHeight: 18, marginTop: 2},
    // Filled controls with white text use ACTION_BUTTON_BG (6.0:1; #D6721E was 3.3:1).
    smallButton: {
        alignSelf: 'flex-start',
        marginTop: 10,
        backgroundColor: ACTION_BUTTON_BG,
        borderRadius: 18,
        paddingVertical: 8,
        paddingHorizontal: 16,
    },
    smallButtonText: {color: '#fff', fontWeight: '600'},
    row: {flexDirection: 'row', alignItems: 'center', borderRadius: 14, padding: 14, marginBottom: 10},
    rowTitle: {fontSize: 15, fontWeight: '600'},
    section: {fontSize: 14, fontWeight: '700', marginTop: 18, marginBottom: 10},
    chips: {flexDirection: 'row', flexWrap: 'wrap'},
    chip: {
        borderRadius: 16,
        borderWidth: 1,
        borderColor: ORANGE,
        paddingVertical: 8,
        paddingHorizontal: 12,
        marginRight: 8,
        marginBottom: 8,
        minHeight: 36,
        justifyContent: 'center',
    },
    chipSelected: {backgroundColor: ACTION_BUTTON_BG, borderColor: ACTION_BUTTON_BG},
    chipText: {fontSize: 13, fontWeight: '600'},
    footnote: {fontSize: 12, lineHeight: 17},
    input: {borderRadius: 10, padding: 12, minHeight: 64, textAlignVertical: 'top', fontSize: 14},
    zoneBlock: {marginBottom: 12},
    zoneName: {fontSize: 14, fontWeight: '600', marginBottom: 6},
    saveButton: {backgroundColor: ACTION_BUTTON_BG, borderRadius: 22, paddingVertical: 12, alignItems: 'center', marginTop: 12},
    disabled: {opacity: 0.5},
    saveText: {color: '#fff', fontWeight: '700', fontSize: 15},
});
