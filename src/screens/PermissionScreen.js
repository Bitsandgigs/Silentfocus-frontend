import React, {useState, useRef, useEffect} from 'react';
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
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useNavigation} from '@react-navigation/native';

import CustomButton from '../componentes/CustomButton/CustomButton';

import CalenderIcon from '../assets/svgs/Calender';
import LocationIcon from '../assets/svgs/Location';
import NotificationIcon from '../assets/svgs/Notification';
import Toggle from '../assets/svgs/Toggle';
import {Permissions, Responsive} from '../utils/theme';
import screens from '../utils/theme/screens';

const {width, height} = Dimensions.get('window');

const PermissionScreen = () => {
    const navigation = useNavigation();

    const {SilentFocus} = NativeModules;

    const colorScheme = useColorScheme();
    const isDark = colorScheme === 'dark';
    const [isLocationEnabled, setIsLocationEnabled] = useState(false);
    const [isCalendarEnabled, setIsCalendarEnabled] = useState(false);
    const [isNotificationsEnabled, setIsNotificationsEnabled] = useState(false);
    const [isDNDEnabled, setIsDNDEnabled] = useState(false);

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

    useEffect(() => {
        checkLocation();
        checkCalender();
        checkNotification();
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

    // Function
    const onLocationPermission = () => {
        Permissions.requestLocationPermission(requestLocationPermission);
    };

    const requestLocationPermission = () => {
        setIsLocationEnabled(!isLocationEnabled);
    };

    const onCalendarPermission = () => {
        Permissions.requestCalenderPermission(requestCalenderPermission);
    };

    const requestCalenderPermission = () => {
        setIsCalendarEnabled(!isCalendarEnabled);
    };

    const onNotificationPermission = () => {
        Permissions.requestNotificationPermission(
            requestNotificationPermission,
        );
    };

    const requestNotificationPermission = () => {
        setIsNotificationsEnabled(!isNotificationsEnabled);
    };

    const onDNDPermission = () => {
        SilentFocus.openDndAccessSettings();
        // Permissions.requestNotificationPermission(
        //     requestNotificationPermission,
        // );
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
                                Notification Access
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
                        <View
                            style={[styles.card, {backgroundColor: cardColor}]}>
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
                    )}
                </Animated.View>
            </ScrollView>
            <View style={styles.customButtonView}>
                <CustomButton
                    title={'Continue'}
                    onPress={onPressContinue}
                    disabled={
                        !isLocationEnabled ||
                        !isCalendarEnabled ||
                        !isNotificationsEnabled
                    }
                />
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
