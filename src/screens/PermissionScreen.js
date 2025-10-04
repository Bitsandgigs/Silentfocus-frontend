import React, {useState, useRef, useEffect, useCallback} from 'react';
import {
    View,
    Text,
    StyleSheet,
    useColorScheme,
    TouchableOpacity,
    Animated,
    Easing,
    Dimensions,
    ScrollView,
    NativeModules,
    Platform,
    AppState,
    Alert,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useFocusEffect, useNavigation} from '@react-navigation/native';

import CustomButton from '../componentes/CustomButton/CustomButton';

import CalenderIcon from '../assets/svgs/Calender';
import LocationIcon from '../assets/svgs/Location';
import NotificationIcon from '../assets/svgs/Notification';
import Toggle from '../assets/svgs/Toggle';
import {Permissions, Responsive} from '../utils/theme';
import screens from '../utils/theme/screens';
import RNAndroidNotificationListener, {
    RNAndroidNotificationListenerHeadlessJsName,
} from 'react-native-android-notification-listener';

const {width, height} = Dimensions.get('window');

const PermissionScreen = () => {
    const navigation = useNavigation();

    const {SilentFocus} = NativeModules;

    const colorScheme = useColorScheme();
    const isDark = colorScheme === 'dark';
    const [isLocationEnabled, setIsLocationEnabled] = useState(false);
    const [isCalendarEnabled, setIsCalendarEnabled] = useState(false);
    const [isNotificationsEnabled, setIsNotificationsEnabled] = useState(false);
    const [isRnNotificationsEnabled, setIsRnNoticationEnable] = useState(false);
    const [isCallLogEnabled, setIsCallLogEnabled] = useState(false);
    const [isSmsEnabled, setIsSmsEnabled] = useState(false);
    const [isPhoneStateEnabled, setIsPhoneStateEnabled] = useState(false);
    const [isDNDEnabled, setIsDNDEnabled] = useState(false);
    const [appState, setAppState] = useState(AppState.currentState);
    const appStateRef = useRef(AppState.currentState);
    const lastOpenedSettingRef = useRef(null); // 'notification' | 'dnd' | null

    const textColor = isDark ? '#fff' : '#000';
    const subtitleColor = isDark ? '#aaa' : '#555';
    const cardColor = isDark ? '#1a1a1a' : '#f3f3f3';
    const orange = '#B87333';

    const fadeAnim = useRef(new Animated.Value(0)).current;
    const slideAnim = useRef(new Animated.Value(30)).current;

    // useEffect
    useEffect(() => {
        Animated.parallel([
            Animated.timing(fadeAnim, {
                toValue: 1,
                duration: 600,
                useNativeDriver: true,
                easing: Easing.out(Easing.ease),
            }),
            Animated.timing(slideAnim, {
                toValue: 0,
                duration: 600,
                useNativeDriver: true,
                easing: Easing.out(Easing.ease),
            }),
        ]).start();
    }, []);

    useFocusEffect(
        useCallback(() => {
            checkAllPermissions();
        }, []),
    );
    useEffect(() => {
        const subscription = AppState.addEventListener(
            'change',
            async nextState => {
                const prev = appStateRef.current;
                appStateRef.current = nextState;

                // only when moving from background/inactive -> active
                if (
                    (prev === 'background' || prev === 'inactive') &&
                    nextState === 'active'
                ) {
                    console.log(
                        '[AppState] returned to foreground. lastOpenedSetting=',
                        lastOpenedSettingRef.current,
                    );

                    // small delay to let system settings take effect
                    await new Promise(res => setTimeout(res, 700));

                    if (lastOpenedSettingRef.current === 'notification') {
                        if (Platform.OS === 'android') {
                            await checkNotificationPermission();
                        }
                    } else if (lastOpenedSettingRef.current === 'dnd') {
                        await checkDndPermission();
                    } else {
                        // unknown — check both
                        await checkAllPermissions();
                    }

                    // clear the flag
                    lastOpenedSettingRef.current = null;
                }
            },
        );

        return () => {
            subscription.remove();
        };
    }, []);

    useEffect(() => {
        checkLocation();
        checkCalender();
        checkNotification();
        checkPhoneStatePermission();
        checkCallLogPermission();
        checkSmsPermission();
    }, []);

    const checkLocation = async () => {
        const checkLocationPermission =
            await Permissions.checkLocationPermission();
        setIsLocationEnabled(checkLocationPermission);
    };

    const checkCalender = async () => {
        const checkCalenderPermission =
            await Permissions.checkCalenderPermission();
        setIsCalendarEnabled(checkCalenderPermission);
    };

    const checkNotification = async () => {
        const checkNotificationPermission =
            await Permissions.checkNotificationPermission();
        setIsNotificationsEnabled(checkNotificationPermission);
    };

    const checkPhoneStatePermission = async () => {
        const checkPhoneStatePermissionEnable =
            await Permissions.checkPhoneStatePermission();
        setIsPhoneStateEnabled(checkPhoneStatePermissionEnable);
    };

    const checkCallLogPermission = async () => {
        const checkCallLogPermissionEnable =
            await Permissions.checkCallLogPermission();
        setIsCallLogEnabled(checkCallLogPermissionEnable);
    };

    const checkSmsPermission = async () => {
        const checkSmsPermissionEnable = await Permissions.checkSMSPermission();
        setIsSmsEnabled(checkSmsPermissionEnable);
    };

    // Function
    const onLocationPermission = () => {
        Permissions.requestLocationPermission(requestLocationPermission);
    };

    const onCalendarPermission = () => {
        Permissions.requestCalenderPermission(requestCalenderPermission);
    };

    const onCalllogPermission = () => {
        Permissions.requestCallLogPermission(requestCallLogPermission);
    };
    const onSmsPermission = () => {
        Permissions.requestSMSPermission(requestSMSPermission);
    };
    const onPhoneStatePermission = () => {
        Permissions.requestPhoneStatePermission(requestPhoneStatePermission);
    };

    const requestCallLogPermission = () => {
        setIsCallLogEnabled(!isCallLogEnabled);
    };

    const requestSMSPermission = () => {
        setIsSmsEnabled(!isSmsEnabled);
    };

    const requestPhoneStatePermission = () => {
        setIsPhoneStateEnabled(!isPhoneStateEnabled);
    };

    const onNotificationPermission = () => {
        Permissions.requestNotificationPermission(
            requestNotificationPermission,
        );
    };
    const requestLocationPermission = () => {
        setIsLocationEnabled(!isLocationEnabled);
    };

    const requestCalenderPermission = () => {
        setIsCalendarEnabled(!isCalendarEnabled);
    };

    const onRnNotificationPermission = async () => {
        if (!isRnNotificationsEnabled) {
            await RNAndroidNotificationListener.requestPermission();
        } else {
            setIsRnNoticationEnable(false);
        }
    };

    const requestNotificationPermission = () => {
        setIsNotificationsEnabled(!isNotificationsEnabled);
    };

    const checkAllPermissions = async () => {
        if (Platform.OS === 'android') {
            await Promise.all([
                checkDndPermission(),
                checkNotificationPermission(),
            ]);
        }
    };

    /** Normalize permission results to boolean */
    const normalizePermission = value => {
        if (typeof value === 'boolean') return value;
        if (!value && value !== false) return false;
        const v = String(value).toLowerCase();
        return (
            v === 'true' ||
            v === 'authorized' ||
            v === 'granted' ||
            v === 'enabled'
        );
    };

    /** Check notification listener permission */
    const checkNotificationPermission = async () => {
        try {
            const status =
                await RNAndroidNotificationListener.getPermissionStatus();
            const enabled = normalizePermission(status);
            console.log(
                '[Permission] notification status:',
                status,
                '=>',
                enabled,
            );
            setIsRnNoticationEnable(enabled);
            return enabled;
        } catch (err) {
            console.error(
                '[Permission] checkNotificationPermission error',
                err,
            );
            setIsRnNoticationEnable(false);
            return false;
        }
    };

    /** Check DND permission via your native module (adjust name if different) */
    const checkDndPermission = async () => {
        try {
            const result =
                await NativeModules.SilentFocus?.checkDndPermission();
            const enabled = normalizePermission(result);
            console.log('[Permission] DND status:', result, '=>', enabled);
            setIsDNDEnabled(enabled);
            return enabled;
        } catch (err) {
            console.error('[Permission] checkDndPermission error', err);
            setIsDNDEnabled(false);
            return false;
        }
    };

    // const checkDndPermission = async () => {
    //     try {
    //         const result = await SilentFocus.checkDndPermission();
    //         console.log('DND Permission result:', result); // Debug log
    //         setIsDNDEnabled(result);
    //     } catch (e) {
    //         console.warn('Error checking DND Permission', e);
    //     }
    // };

    const onDNDPermission = async () => {
        if (!isDNDEnabled) {
            // Open DND Settings
            SilentFocus.openDndAccessSettings();
        } else {
            // Toggle off
            setIsDNDEnabled(false);
        }
    };

    const onPressContinue = () => {
        navigation.navigate(screens.LoginScreen);
    };

    // Render Component
    return (
        <SafeAreaView style={styles.container}>
            <ScrollView
                keyboardShouldPersistTaps={'handled'}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.scrollContent}>
                <Animated.View
                    style={[
                        styles.content,
                        {
                            opacity: fadeAnim,
                            transform: [{translateY: slideAnim}],
                        },
                    ]}>
                    <Text style={[styles.title, {color: textColor}]}>
                        You Stay in{'\n'}Control
                    </Text>
                    <Text
                        style={[styles.description, {color: subtitleColor}]}
                        allowFontScaling={false}>
                        To automate silent mode based on where you are and
                        what’s on your calendar, we need a few permissions.
                    </Text>

                    {/* Location Permission */}
                    <View style={[styles.card, {backgroundColor: cardColor}]}>
                        <View style={styles.icon}>
                            <LocationIcon
                                width={24}
                                height={24}
                                color={orange}
                            />
                        </View>
                        <View style={styles.textBlock}>
                            <Text
                                style={[styles.cardTitle, {color: textColor}]}>
                                Access Your Location
                            </Text>
                            <Text
                                style={[
                                    styles.cardDescription,
                                    {color: subtitleColor},
                                ]}>
                                To detect silent zones like libraries, offices,
                                or religious places.
                            </Text>
                        </View>
                        <TouchableOpacity onPress={onLocationPermission}>
                            <Toggle isOn={isLocationEnabled} />
                        </TouchableOpacity>
                    </View>

                    {/* Calendar Permission */}
                    <View style={[styles.card, {backgroundColor: cardColor}]}>
                        <View style={styles.icon}>
                            <CalenderIcon
                                width={24}
                                height={24}
                                color={orange}
                            />
                        </View>
                        <View style={styles.textBlock}>
                            <Text
                                style={[styles.cardTitle, {color: textColor}]}>
                                Access Your Calendar
                            </Text>
                            <Text
                                style={[
                                    styles.cardDescription,
                                    {color: subtitleColor},
                                ]}>
                                To mute your phone automatically during
                                scheduled meetings or events.
                            </Text>
                        </View>
                        <TouchableOpacity onPress={onCalendarPermission}>
                            <Toggle isOn={isCalendarEnabled} />
                        </TouchableOpacity>
                    </View>

                    {/* Notification Permission */}
                    <View style={[styles.card, {backgroundColor: cardColor}]}>
                        <View style={styles.icon}>
                            <NotificationIcon
                                width={24}
                                height={24}
                                color={orange}
                            />
                        </View>
                        <View style={styles.textBlock}>
                            <Text
                                style={[styles.cardTitle, {color: textColor}]}>
                                Push Notification Permission
                            </Text>
                            <Text
                                style={[
                                    styles.cardDescription,
                                    {color: subtitleColor},
                                ]}>
                                To notify you about missed calls and messages
                                after silent mode ends.
                            </Text>
                        </View>
                        <TouchableOpacity onPress={onNotificationPermission}>
                            <Toggle isOn={isNotificationsEnabled} />
                        </TouchableOpacity>
                    </View>

                    {Platform.OS === 'android' && (
                        <>
                            <View
                                style={[
                                    styles.card,
                                    {backgroundColor: cardColor},
                                ]}>
                                <View style={styles.icon}>
                                    <NotificationIcon
                                        width={24}
                                        height={24}
                                        color={orange}
                                    />
                                </View>
                                <View style={styles.textBlock}>
                                    <Text
                                        style={[
                                            styles.cardTitle,
                                            {color: textColor},
                                        ]}>
                                        Do Not Disturb
                                    </Text>
                                    <Text
                                        style={[
                                            styles.cardDescription,
                                            {color: subtitleColor},
                                        ]}>
                                        To notify you about missed calls and
                                        messages after silent mode ends.
                                    </Text>
                                </View>
                                <TouchableOpacity onPress={onDNDPermission}>
                                    <Toggle isOn={isDNDEnabled} />
                                </TouchableOpacity>
                            </View>

                            {/* Notification Permission */}
                            <View
                                style={[
                                    styles.card,
                                    {backgroundColor: cardColor},
                                ]}>
                                <View style={styles.icon}>
                                    <NotificationIcon
                                        width={24}
                                        height={24}
                                        color={orange}
                                    />
                                </View>
                                <View style={styles.textBlock}>
                                    <Text
                                        style={[
                                            styles.cardTitle,
                                            {color: textColor},
                                        ]}>
                                        Notification Access Permission
                                    </Text>
                                    <Text
                                        style={[
                                            styles.cardDescription,
                                            {color: subtitleColor},
                                        ]}>
                                        To read and detect missed calls and
                                        messages from other apps while your
                                        phone is silent.
                                    </Text>
                                </View>
                                <TouchableOpacity
                                    onPress={onRnNotificationPermission}>
                                    <Toggle isOn={isRnNotificationsEnabled} />
                                </TouchableOpacity>
                            </View>

                            {/* call log */}
                            <View
                                style={[
                                    styles.card,
                                    {backgroundColor: cardColor},
                                ]}>
                                <View style={styles.icon}>
                                    <NotificationIcon
                                        width={24}
                                        height={24}
                                        color={orange}
                                    />
                                </View>
                                <View style={styles.textBlock}>
                                    <Text
                                        style={[
                                            styles.cardTitle,
                                            {color: textColor},
                                        ]}>
                                        Call Log Access
                                    </Text>
                                    <Text
                                        style={[
                                            styles.cardDescription,
                                            {color: subtitleColor},
                                        ]}>
                                        Allows the app to read your call history
                                        so it can detect missed or incoming
                                        calls while your phone is silent
                                    </Text>
                                </View>
                                <TouchableOpacity onPress={onCalllogPermission}>
                                    <Toggle isOn={isCallLogEnabled} />
                                </TouchableOpacity>
                            </View>

                            {/* sms */}
                            <View
                                style={[
                                    styles.card,
                                    {backgroundColor: cardColor},
                                ]}>
                                <View style={styles.icon}>
                                    <NotificationIcon
                                        width={24}
                                        height={24}
                                        color={orange}
                                    />
                                </View>
                                <View style={styles.textBlock}>
                                    <Text
                                        style={[
                                            styles.cardTitle,
                                            {color: textColor},
                                        ]}>
                                        SMS Access
                                    </Text>
                                    <Text
                                        style={[
                                            styles.cardDescription,
                                            {color: subtitleColor},
                                        ]}>
                                        Allows the app to read incoming SMS
                                        messages so it can detect missed
                                        messages and notify you even when your
                                        phone is in silent mode.
                                    </Text>
                                </View>
                                <TouchableOpacity onPress={onSmsPermission}>
                                    <Toggle isOn={isSmsEnabled} />
                                </TouchableOpacity>
                            </View>

                            {/*  phone state */}
                            <View
                                style={[
                                    styles.card,
                                    {backgroundColor: cardColor},
                                ]}>
                                <View style={styles.icon}>
                                    <NotificationIcon
                                        width={24}
                                        height={24}
                                        color={orange}
                                    />
                                </View>
                                <View style={styles.textBlock}>
                                    <Text
                                        style={[
                                            styles.cardTitle,
                                            {color: textColor},
                                        ]}>
                                        Phone State Access
                                    </Text>
                                    <Text
                                        style={[
                                            styles.cardDescription,
                                            {color: subtitleColor},
                                        ]}>
                                        Allows the app to detect your phone’s
                                        current state (ringing, idle, or in a
                                        call) to manage notifications and
                                        silence mode behavior effectively.
                                    </Text>
                                </View>
                                <TouchableOpacity
                                    onPress={onPhoneStatePermission}>
                                    <Toggle isOn={isPhoneStateEnabled} />
                                </TouchableOpacity>
                            </View>
                        </>
                    )}
                </Animated.View>
            </ScrollView>
            <View style={styles.customButtonView}>
                {Platform.OS === 'android' ? (
                    <CustomButton
                        title="Continue"
                        onPress={onPressContinue}
                        disabled={
                            !isLocationEnabled ||
                            !isCalendarEnabled ||
                            !isNotificationsEnabled ||
                            !isDNDEnabled ||
                            !isRnNotificationsEnabled ||
                            !isCallLogEnabled ||
                            !isSmsEnabled ||
                            !isPhoneStateEnabled
                        }
                    />
                ) : (
                    <CustomButton
                        title="Continue"
                        onPress={onPressContinue}
                        disabled={
                            !isLocationEnabled ||
                            !isCalendarEnabled ||
                            !isNotificationsEnabled
                        }
                    />
                )}
            </View>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    scrollContent: {
        paddingHorizontal: width * 0.06,
        paddingTop: height * 0.04,
        paddingBottom: height * 0.15,
    },
    content: {
        flexGrow: 1,
    },
    title: {
        fontSize: width * 0.08,
        fontWeight: 'bold',
        marginBottom: height * 0.015,
        fontFamily: 'Roboto',
    },
    description: {
        fontSize: width * 0.042,
        marginBottom: height * 0.03,
        lineHeight: width * 0.06,
        fontFamily: 'Roboto',
    },
    card: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        padding: 16,
        borderRadius: 17,
        marginBottom: 16,
        flexWrap: 'nowrap',
    },
    textBlock: {
        flex: 1,
        flexShrink: 1,
    },
    icon: {
        marginRight: 12,
        marginTop: 6,
    },
    cardTitle: {
        fontSize: width * 0.038,
        fontFamily: 'Roboto',
        fontWeight: '600',
        marginBottom: 4,
    },
    cardDescription: {
        fontSize: 14,
        fontWeight: '300',
        lineHeight: 20,
        flexWrap: 'wrap',
    },
    customButtonView: {
        marginHorizontal: Responsive.widthPercentageToDP(5),
    },
});

export default PermissionScreen;
