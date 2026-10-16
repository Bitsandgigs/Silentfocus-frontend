import React from 'react';
import {useEffect, useState} from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    Modal,
    TextInput,
    useColorScheme,
    KeyboardAvoidingView,
    Platform,
    Image,
    Switch,
    Alert,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {
    widthPercentageToDP as wp,
    heightPercentageToDP as hp,
} from 'react-native-responsive-screen';
import {useIsFocused, useNavigation} from '@react-navigation/native';
import CustomLoader from '../componentes/CustomLoader/CustomLoader';
import EndPoints from '../utils/api/endpoints';
import APICall from '../utils/api/api';
import {
    describeControlModes,
    isPersistedCustomConfirmation,
    markDeviceCustomConfirmed,
    readDeviceCustomConfirmed,
    syncAutomationSettings,
} from '../utils/automationSync';
import {ensureLocationAutomationPermissions} from '../utils/locationPermissions';
import {Constants, Images} from '../utils/theme';
import {showAlert, showApiErrorAlert} from '../function/Alert';
import screens from '../utils/theme/screens';
import {pushAutoReply} from '../utils/autoResponseSync';
import {clearLearnedNow} from '../utils/privacyActions';
import {fetchZonesForSync} from '../utils/automationSync';
import {ACTION_BUTTON_BG, linkColor} from '../utils/theme/controlColors';
import {
    DEFAULT_LEARNING_STATE,
    getLearningState,
    setLearningEnabled,
} from '../utils/learning';
import {
    DEFAULT_COMMS_STATE,
    DEFAULT_REPLY,
    MAX_TEMPLATE_LENGTH,
    getCommsState,
    openNotificationAccessSettings,
    setAutoReplySettings,
} from '../utils/comms';

const SettingsScreen = () => {
    const navigation = useNavigation();
    const [locationMode, setLocationMode] = useState(false);
    const [calendarMode, setCalendarMode] = useState(false);
    const [customMode, setCustomMode] = useState(false);
    // #4: confirmation state only for the explanatory texts (rule unchanged).
    const [customModeConfirmed, setCustomModeConfirmed] = useState(null);
    const [deviceConfirmed, setDeviceConfirmed] = useState(false);
    const modeInfo = describeControlModes({locationMode, customMode, customModeConfirmed}, deviceConfirmed);
    const [modalVisible, setModalVisible] = useState(false);
    const [tempResponse, setTempResponse] = useState('');
    const [comms, setComms] = useState(DEFAULT_COMMS_STATE);
    const [learning, setLearning] = useState(DEFAULT_LEARNING_STATE);
    const [isLoading, setIsLoading] = useState(false);

    const isFocused = useIsFocused();
    const colorScheme = useColorScheme();
    const isDark = colorScheme === 'dark';
    // Orange link text: AA in light mode too (#D6721E was 3.3:1 on white).
    const link = linkColor(isDark);
    const background = isDark ? '#111' : '#fff';
    const bg = isDark ? '#111111' : '#FFFFFF';
    const card = isDark ? 'rgba(85, 85, 85, 0.12)' : '#2E3A3E14';
    const text = isDark ? '#FFFFFF' : '#1A1A1A';
    const mutedText = isDark ? '#AAA' : '#444';
    const divider = isDark ? 'rgba(85, 85, 85, 0.35)' : '#C2C2C2';

    useEffect(() => {
        const payload = {
            userId: Constants.commonConstant.appUserId
                ? Constants.commonConstant.appUserId
                : '',
        };
        setIsLoading(true);
        GetControlModesApiCall(payload);
    }, []);

    // Auto reply / emergency settings live natively (work offline and with
    // the app closed); refreshed whenever this tab is shown.
    useEffect(() => {
        if (isFocused) {
            getCommsState()
                .then(setComms)
                .catch(() => {});
            getLearningState()
                .then(setLearning)
                .catch(() => {});
        }
    }, [isFocused]);

    // Smart Location Learning: off stops new samples; existing places can
    // be cleared right away or kept.
    const onToggleLearning = async on => {
        try {
            const next = await setLearningEnabled(on);
            setLearning(next);
            if (!on && next.placeCount > 0) {
                Alert.alert(
                    'Smart Location Learning is off',
                    'No new places will be learned. Clear the places already learned on this phone?',
                    [
                        {text: 'Keep', style: 'cancel'},
                        {text: 'Clear', style: 'destructive', onPress: onClearLearned},
                    ],
                );
            }
        } catch (e) {
            showAlert(Constants.commonConstant.appName, 'The setting could not be changed.');
        }
    };

    // "Clear learned locations" lives in the Accounts tab (Client Issue #7);
    // here it is only offered when learning is turned off.
    const onClearLearned = async () => {
        const next = await clearLearnedNow();
        if (next) {
            setLearning(next);
        }
    };

    const saveAutoReply = async patch => {
        setComms(prev => ({...prev, autoReply: {...prev.autoReply, ...patch}}));
        try {
            setComms(await setAutoReplySettings(patch));
            pushAutoReply({fetchZones: fetchZonesForSync}).catch(() => {});
        } catch (e) {
            showAlert(
                Constants.commonConstant.appName,
                'Auto reply settings could not be saved.',
            );
        }
    };

    // The Auto Reply screen has no on/off switch; this is the only place to
    // turn it on, so it carries the notification-access prompt.
    const onToggleAutoReply = v => {
        if (v && !comms.notificationAccess) {
            Alert.alert(
                'Notification access needed',
                'Auto reply works through the reply button in messaging notifications, so Silent Focus needs notification access. Message text is never stored or uploaded.',
                [
                    {text: 'Not now', style: 'cancel'},
                    {text: 'Open settings', onPress: openNotificationAccessSettings},
                ],
            );
        }
        saveAutoReply({enabled: v});
    };

    // `previous`: the modes before this optimistic toggle, restored when
    // the server didn't accept the change (offline, 4xx/5xx).
    // `customModeConfirmed`: only the Custom toggle itself sends it - the
    // user's explicit choice that switches this account to independent
    // Custom Mode (see zonesEnabledFor in automationSync.js).
    const handleSetControlModes = async (updatedValues, previous, customModeConfirmed = false) => {
        const payload = {
            userId: Constants.commonConstant.appUserId || '',
            locationMode: updatedValues.locationMode,
            calendarMode: updatedValues.calendarMode,
            customMode: updatedValues.customMode,
            ...(customModeConfirmed ? {customModeConfirmed: 1} : {}),
        };

        setIsLoading(true);

        await SetControlModesApiCall(payload, previous);
    };

    const SetControlModesApiCall = async (payload, previous) => {
        const url = EndPoints.setControlModes;

        const response = await APICall('post', payload, url);
        setIsLoading(false);
        if (
            response?.statusCode === Constants.apiStatusCode.success &&
            response?.data?.status === '1'
        ) {
            if (payload.customModeConfirmed && isPersistedCustomConfirmation(response)) {
                await markDeviceCustomConfirmed(Constants.commonConstant.appUserId);
                setCustomModeConfirmed(true);
                setDeviceConfirmed(true);
            }
            // Custom/Calendar Mode gate the native automation.
            syncAutomationSettings().catch(() => {});
            return;
        }
        if (previous) {
            setLocationMode(previous.locationMode);
            setCalendarMode(previous.calendarMode);
            setCustomMode(previous.customMode);
        }
        showApiErrorAlert(
            Constants.commonConstant.appName,
            response,
            'The setting could not be saved. Please try again.',
        );
    };

    // API
    const GetControlModesApiCall = async payload => {
        const url = EndPoints.getControlModes;

        await APICall('get', payload, url).then(response => {
            setIsLoading(false);
            if (
                response?.statusCode === Constants.apiStatusCode.success &&
                response?.data
            ) {
                const responseData = response?.data;

                if (responseData?.status === '1') {
                    setLocationMode(responseData.result.locationMode);
                    setCalendarMode(responseData.result.calendarMode);
                    setCustomMode(responseData.result.customMode);
                    setCustomModeConfirmed(responseData.result.customModeConfirmed ?? null);
                    readDeviceCustomConfirmed(Constants.commonConstant.appUserId).then(setDeviceConfirmed);
                } else {
                    showApiErrorAlert(Constants.commonConstant.appName, response);
                }
            } else {
                showApiErrorAlert(Constants.commonConstant.appName, response);
            }
        });
    };

    const toggleSwitch = async type => {
        if (type === 'location') {
            if (!locationMode) {
                // Public places are found and watched in the background.
                const perms = await ensureLocationAutomationPermissions();
                if (!perms.automationReady) {
                    showAlert(
                        Constants.commonConstant.appName,
                        'Location Mode is on, but it only works once location is allowed "all the time". You can allow it later from Home.',
                    );
                }
            }
            setLocationMode(prev => !prev);
            handleSetControlModes(
                {locationMode: !locationMode, calendarMode, customMode},
                {locationMode, calendarMode, customMode},
            );
        } else if (type === 'calendar') {
            setCalendarMode(prev => !prev);
            handleSetControlModes(
                {locationMode, calendarMode: !calendarMode, customMode},
                {locationMode, calendarMode, customMode},
            );
        } else if (type === 'custom') {
            if (!customMode) {
                // Silent Zones need location: ask (with explanation) first.
                const perms = await ensureLocationAutomationPermissions();
                if (!perms.automationReady) {
                    showAlert(
                        Constants.commonConstant.appName,
                        'Custom Mode is on, but Silent Zones only work once location is allowed "all the time". You can allow it later from Home.',
                    );
                }
            }
            setCustomMode(prev => !prev);
            handleSetControlModes(
                {locationMode, calendarMode, customMode: !customMode},
                {locationMode, calendarMode, customMode},
                true,
            );
        }
    };

    return (
        <SafeAreaView style={{flex: 1, backgroundColor: background}}>
            <KeyboardAvoidingView
                style={{flex: 1}}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                keyboardVerticalOffset={hp('10%')} // adjust depending on your tab height
            >
                <ScrollView
                    style={styles.container}
                    contentContainerStyle={styles.scrollContent}
                    showsVerticalScrollIndicator={false}
                    bounces={false}>
                    <Text style={styles.title}>Control Center</Text>

                    <Text style={[styles.sectionTitle, {color: text}]}>
                        SELECT YOUR DESIRED SILENT FOCUS MODE
                    </Text>

                    <View style={styles.containerView}>
                        <View
                            style={[
                                styles.card,
                                {
                                    backgroundColor: isDark
                                        ? '#1C1C1C'
                                        : '#5555551F',
                                },
                            ]}>
                            <View style={styles.cardContent}>
                                <Image
                                    source={Images.iconLocation}
                                    style={styles.icon}
                                />
                                <View style={styles.timeBlock}>
                                    <Text
                                        style={[
                                            styles.timeRange,
                                            {
                                                color: isDark
                                                    ? 'white'
                                                    : '#1C1C1C',
                                            },
                                        ]}>
                                        {'Location Mode'}
                                    </Text>

                                    <View style={styles.labelBlock}>
                                        <Text
                                            style={[
                                                styles.everyday,
                                                {
                                                    color: isDark
                                                        ? 'rgba(250,250,250,0.45)'
                                                        : '#555',
                                                },
                                            ]}>
                                            {modeInfo.locationText}
                                        </Text>
                                    </View>
                                </View>
                                <Switch
                                    value={locationMode}
                                    style={styles.toggleWrapper}
                                    onValueChange={() =>
                                        toggleSwitch('location')
                                    }
                                    trackColor={{
                                        false: '#444',
                                        true: '#F08A2C',
                                    }}
                                    thumbColor={locationMode ? '#fff' : '#fff'}
                                />
                            </View>
                        </View>
                    </View>

                    <View style={styles.containerView}>
                        <View
                            style={[
                                styles.card,
                                {
                                    backgroundColor: isDark
                                        ? '#1C1C1C'
                                        : '#5555551F',
                                },
                            ]}>
                            <View style={styles.cardContent}>
                                <Image
                                    source={Images.iconCalendar}
                                    style={styles.icon}
                                />
                                <View style={styles.timeBlock}>
                                    <Text
                                        style={[
                                            styles.timeRange,
                                            {
                                                color: isDark
                                                    ? 'white'
                                                    : '#1C1C1C',
                                            },
                                        ]}>
                                        {'Calendar Mode'}
                                    </Text>

                                    <View style={styles.labelBlock}>
                                        <Text
                                            style={[
                                                styles.everyday,
                                                {
                                                    color: isDark
                                                        ? 'rgba(250,250,250,0.45)'
                                                        : '#555',
                                                },
                                            ]}>
                                            {
                                                'Your phone will be muted automatically during scheduled meetings or events.'
                                            }
                                        </Text>
                                    </View>
                                </View>
                                <Switch
                                    value={calendarMode}
                                    style={styles.toggleWrapper}
                                    onValueChange={() =>
                                        toggleSwitch('calendar')
                                    }
                                    trackColor={{
                                        false: '#444',
                                        true: '#F08A2C',
                                    }}
                                    thumbColor={true ? '#fff' : '#fff'}
                                />
                            </View>
                        </View>
                    </View>

                    <View style={styles.containerView}>
                        <View
                            style={[
                                styles.card,
                                {
                                    backgroundColor: isDark
                                        ? '#1C1C1C'
                                        : '#5555551F',
                                },
                            ]}>
                            <View style={styles.cardContent}>
                                <Image
                                    source={Images.iconCustom}
                                    style={styles.icon}
                                />
                                <TouchableOpacity
                                    style={styles.timeBlock}
                                    accessibilityRole="button"
                                    onPress={() =>
                                        navigation.navigate(screens.MapScreen)
                                    }>
                                    <Text
                                        style={[
                                            styles.timeRange,
                                            {
                                                color: isDark
                                                    ? 'white'
                                                    : '#1C1C1C',
                                            },
                                        ]}>
                                        {'Custom · My Silent Zones'}
                                    </Text>

                                    <View style={styles.labelBlock}>
                                        <Text
                                            style={[
                                                styles.everyday,
                                                {
                                                    color: isDark
                                                        ? 'rgba(250,250,250,0.45)'
                                                        : '#555',
                                                },
                                            ]}>
                                            {modeInfo.customText}
                                        </Text>
                                        <Text
                                            accessibilityLiveRegion="polite"
                                            style={[
                                                styles.everyday,
                                                {color: isDark ? '#E6E6E6' : '#1C1C1C'},
                                            ]}>
                                            {modeInfo.customStatus}
                                        </Text>
                                        <Text style={[styles.manageZonesLink, {color: link}]}>
                                            {'Manage Silent Zones ›'}
                                        </Text>
                                    </View>
                                </TouchableOpacity>
                                <Switch
                                    value={customMode}
                                    style={styles.toggleWrapper}
                                    onValueChange={() => toggleSwitch('custom')}
                                    trackColor={{
                                        false: '#444',
                                        true: '#F08A2C',
                                    }}
                                    thumbColor={true ? '#fff' : '#fff'}
                                />
                            </View>
                        </View>
                    </View>

                    {/* Auto Response Section (persisted natively; see AutoReplyScreen) */}
                    <Text style={[styles.sectionTitle, {color: text}]}>
                        SET AUTO RESPONSE
                    </Text>
                    <View
                        style={[styles.responseCard, {backgroundColor: card}]}>
                        <View style={styles.responseRow}>
                            <Text style={[styles.modeSubTitle, {color: text}]}>
                                AUTO REPLY
                            </Text>
                            <Switch
                                value={comms.autoReply.enabled}
                                onValueChange={onToggleAutoReply}
                                trackColor={{false: '#444', true: '#F08A2C'}}
                                thumbColor="#fff"
                                accessibilityLabel="Auto reply"
                            />
                        </View>
                        <View
                            style={[styles.divider, {backgroundColor: divider}]}
                        />
                        <View style={styles.responseRow}>
                            <Text
                                style={[
                                    styles.responsePreview,
                                    {color: mutedText},
                                ]}>
                                "{comms.autoReply.defaultTemplate}"
                            </Text>
                            <TouchableOpacity
                                accessibilityRole="button"
                                accessibilityLabel="Edit default reply"
                                onPress={() => {
                                    setTempResponse(
                                        comms.autoReply.defaultTemplate,
                                    );
                                    setModalVisible(true);
                                }}>
                                <Text style={[styles.manualText, {color: link}]}>Edit</Text>
                            </TouchableOpacity>
                        </View>
                        <TouchableOpacity
                            accessibilityRole="button"
                            onPress={() =>
                                navigation.navigate(screens.AutoReplyScreen)
                            }>
                            <Text style={[styles.manageZonesLink, {color: link}]}>
                                {'Zone replies, frequency & access ›'}
                            </Text>
                        </TouchableOpacity>
                    </View>

                    {/* Emergency contacts / urgent callers */}
                    <Text style={[styles.sectionTitle, {color: text}]}>
                        EMERGENCY & URGENT CALLS
                    </Text>
                    <TouchableOpacity
                        accessibilityRole="button"
                        style={[styles.responseCard, {backgroundColor: card}]}
                        onPress={() =>
                            navigation.navigate(screens.EmergencyContactsScreen)
                        }>
                        <Text style={[styles.modeSubTitle, {color: text}]}>
                            EMERGENCY CONTACTS
                        </Text>
                        <Text
                            style={[
                                styles.responsePreview,
                                {color: mutedText},
                            ]}>
                            {`${comms.emergencyContacts.length} contact${
                                comms.emergencyContacts.length === 1 ? '' : 's'
                            } · Urgent callers ${
                                comms.callSettings.urgentEnabled ? 'on' : 'off'
                            }`}
                        </Text>
                        <Text style={[styles.manageZonesLink, {color: link}]}>
                            {'Manage emergency contacts ›'}
                        </Text>
                    </TouchableOpacity>

                    {/* Smart Location Learning (suggestions only, on-device) */}
                    <Text style={[styles.sectionTitle, {color: text}]}>
                        SMART LOCATION LEARNING
                    </Text>
                    <View style={[styles.responseCard, {backgroundColor: card}]}>
                        <View style={styles.responseRow}>
                            <Text style={[styles.modeSubTitle, {color: text}]}>
                                SUGGEST SILENT ZONES
                            </Text>
                            <Switch
                                value={learning.enabled}
                                onValueChange={onToggleLearning}
                                trackColor={{false: '#444', true: '#F08A2C'}}
                                thumbColor="#fff"
                                accessibilityLabel="Smart Location Learning"
                            />
                        </View>
                        <Text style={[styles.responsePreview, styles.plainText, {color: mutedText}]}>
                            When you turn Silent Focus on by hand, it notes roughly where you are. After a few
                            times at the same place on different days, it suggests a Silent Zone - it never
                            creates one by itself. Learned places stay on this phone and are kept for 30 days.
                        </Text>
                    </View>

                    {/* Modal */}
                    <Modal
                        visible={modalVisible}
                        transparent
                        animationType="fade"
                        onRequestClose={() => setModalVisible(false)}>
                        <View style={styles.modalOverlay}>
                            <View
                                style={[
                                    styles.modalContent,
                                    {
                                        backgroundColor: isDark
                                            ? '#1c1c1c'
                                            : '#fff',
                                    },
                                ]}>
                                <Text
                                    style={[styles.modalTitle, {color: text}]}>
                                    Set Auto Response
                                </Text>
                                <TextInput
                                    style={[
                                        styles.input,
                                        {
                                            color: text,
                                            backgroundColor: isDark
                                                ? '#222'
                                                : '#f2f2f2',
                                        },
                                    ]}
                                    placeholder="Type your message..."
                                    placeholderTextColor={mutedText}
                                    value={tempResponse}
                                    onChangeText={setTempResponse}
                                    maxLength={MAX_TEMPLATE_LENGTH}
                                    multiline
                                />
                                <View style={styles.modalButtons}>
                                    <TouchableOpacity
                                        style={styles.saveBtn}
                                        onPress={() => {
                                            saveAutoReply({
                                                defaultTemplate:
                                                    tempResponse.trim() ||
                                                    DEFAULT_REPLY,
                                            });
                                            setModalVisible(false);
                                        }}>
                                        <Text
                                            style={{
                                                color: '#fff',
                                                fontWeight: '600',
                                            }}>
                                            Save
                                        </Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={styles.cancelBtn}
                                        onPress={() => setModalVisible(false)}>
                                        <Text
                                            style={{
                                                color: link,
                                                fontWeight: '600',
                                            }}>
                                            Cancel
                                        </Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        </View>
                    </Modal>
                </ScrollView>
            </KeyboardAvoidingView>
            <CustomLoader isLoading={isLoading} />
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        paddingTop: hp('1%'),
        paddingHorizontal: wp('5%'),
    },
    scrollContent: {
        paddingBottom: hp('25%'), // Increased from 12% to 20% to clear bottom navigation
        paddingTop: hp('2%'),
    },
    title: {
        fontSize: wp('5.5%'),
        fontWeight: '700',
        color: '#D6721E',
        textAlign: 'center',
        marginBottom: hp('3%'),
    },
    sectionTitle: {
        fontSize: wp('3.4%'),
        fontWeight: '700',
        marginBottom: hp('1.5%'),
        marginTop: hp('1%'),
    },
    modeCard: {
        width: wp('90%'),
        borderRadius: wp('4.5%'),
        paddingHorizontal: wp('4%'),
        alignSelf: 'center',
        marginBottom: hp('2%'),
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: wp('3%'),
    },
    iconBox: {
        width: wp('8%'),
        alignItems: 'center',
        justifyContent: 'center',
    },
    textBlock: {
        flex: 1,
        marginLeft: wp('2.5%'),
    },
    modeTitle: {
        fontSize: wp('4%'),
        fontWeight: '700',
        marginBottom: hp('0.5%'),
    },
    modeDesc: {
        fontSize: wp('3.2%'),
    },
    responseCard: {
        width: wp('90%'),
        borderRadius: wp('4.5%'),
        paddingHorizontal: wp('5%'),
        paddingVertical: hp('2%'),
        alignSelf: 'center',
        marginTop: hp('1.5%'),
        marginBottom: hp('2%'), // Added bottom margin to ensure spacing
    },
    modeSubTitle: {
        fontSize: wp('3.3%'),
        fontWeight: '600',
        marginBottom: hp('1%'),
    },
    divider: {
        height: 1,
        marginBottom: hp('1.2%'),
        marginTop: hp('0.5%'),
    },
    manualText: {
        fontSize: wp('3.5%'),
        fontWeight: '600',
        color: '#D6721E',
        marginTop: hp('0.5%'),
    },
    plainText: {
        fontStyle: 'normal',
        marginTop: 8,
        lineHeight: 18,
    },
    responsePreview: {
        fontSize: wp('3.2%'),
        fontStyle: 'italic',
        flex: 1,
    },
    responseRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: hp('0.5%'),
    },
    deleteBtn: {
        color: '#D6721E',
        fontSize: wp('4.5%'),
        paddingHorizontal: wp('2%'),
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalContent: {
        width: wp('85%'),
        borderRadius: wp('3.5%'),
        padding: wp('5%'),
    },
    modalTitle: {
        fontSize: wp('4.5%'),
        fontWeight: '600',
        marginBottom: hp('1.5%'),
    },
    input: {
        borderColor: '#ccc',
        borderWidth: 1,
        borderRadius: wp('2.5%'),
        padding: wp('3%'),
        fontSize: wp('3.5%'),
        minHeight: hp('12%'),
        textAlignVertical: 'top',
    },
    modalButtons: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: hp('3%'),
    },
    saveBtn: {
        backgroundColor: ACTION_BUTTON_BG, // white text 6.0:1 (#D6721E was 3.3:1)
        paddingVertical: hp('1%'),
        paddingHorizontal: wp('5%'),
        borderRadius: wp('2%'),
    },
    cancelBtn: {
        paddingVertical: hp('1%'),
        paddingHorizontal: wp('5%'),
    },
    containerView: {
        paddingHorizontal: wp('0%'),
        marginBottom: hp('2.5%'),
    },
    card: {
        borderRadius: wp('4.5%'),
        padding: wp('5%'),
        flexDirection: 'row',
        alignItems: 'center',
    },
    cardContent: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    timeBlock: {
        flex: 1,
        marginLeft: wp('4%'),
    },
    timeRange: {
        fontSize: wp('4%'),
        fontWeight: '600',
        fontFamily: 'Roboto',
    },
    labelBlock: {
        marginTop: hp('0.7%'),
    },
    everyday: {
        fontSize: wp('3.2%'),
        fontFamily: 'Roboto',
    },

    icon: {
        width: 30,
        height: 30,
    },
    toggleWrapper: {
        marginLeft: wp('1%'),
        // tintColor: '#B87333',
    },
    manageZonesLink: {
        color: '#D6721E',
        marginTop: 6,
        fontWeight: '600',
    },
});

export default SettingsScreen;
