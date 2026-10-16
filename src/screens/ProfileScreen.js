import React, {useState, useRef, useEffect} from 'react';
import {
    View,
    Text,
    TextInput,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    Modal,
    Pressable,
    useColorScheme,
    Platform,
    Linking,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import LogoutIcon from '../assets/svgs/Logout';
import {SafeAreaView} from 'react-native-safe-area-context';
import {
    widthPercentageToDP as wp,
    heightPercentageToDP as hp,
} from 'react-native-responsive-screen';
import {Constants} from '../utils/theme';
import {
    showAlert,
    showAlertWithTwoCallBack,
    showApiErrorAlert,
} from '../function/Alert';
import {deleteAccount} from '../utils/account';
import EndPoints from '../utils/api/endpoints';
import APICall from '../utils/api/api';
import CustomLoader from '../componentes/CustomLoader/CustomLoader';
import {clearLocalStorage} from '../function/commonFunctions';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DeviceInfo from 'react-native-device-info';
import {syncAutomationSettings} from '../utils/automationSync';
import {prepareUserLogout} from '../utils/serverSync';
import {syncDeviceCalendar} from '../utils/silentFocusEngine';
import {requestCalendarPermission} from '../utils/locationPermissions';
import PermissionHub from '../componentes/PermissionHub';
import FeedbackForm from '../componentes/FeedbackForm';
import {clearLearnedNow, confirmClearActivity} from '../utils/privacyActions';
import {getLearningState} from '../utils/learning';
import {useIsFocused} from '@react-navigation/native';
import {LIGHT_CONTROLS, linkColor} from '../utils/theme/controlColors';
import CalendarPickerModal from '../componentes/CalendarPickerModal';
import {describeSelection, getDeviceCalendars, saveCalendarSelection} from '../utils/deviceCalendars';

const CALENDAR_SYNC_KEY = 'isCalendarSynced';

const ProfileScreen = () => {
    // Round 3 (#4): which of the phone's calendars are used (summary line).
    const [calendarSummary, setCalendarSummary] = useState(null);
    const [isCalendarSynced, setIsCalendarSynced] = useState(false);
    const [modalVisible, setModalVisible] = useState(false);

    const [phoneNumber, setPhoneNumber] = useState('');
    const [isEditingPhone, setIsEditingPhone] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    const [changePasswordModalVisible, setChangePasswordModalVisible] =
        useState(false);
    const [oldPassword, setOldPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    const phoneInputRef = useRef(null);
    // Last phone number the server confirmed; the auto-save skips it so
    // opening Profile never re-sends the number it just loaded.
    const savedPhoneRef = useRef('');

    const colorScheme = useColorScheme();
    const isDark = colorScheme === 'dark';

    const background = isDark ? '#111' : '#fff';
    const card = isDark ? 'rgba(85,85,85,0.12)' : '#2E3A3E14';
    const text = isDark ? '#eee' : LIGHT_CONTROLS.mutedText;
    const mutedText = isDark ? '#aaa' : LIGHT_CONTROLS.mutedText;
    const divider = isDark ? 'rgba(85,85,85,0.35)' : '#ccc';
    const link = linkColor(isDark);

    useEffect(() => {
        loadCalendarSyncStatus();
    }, []);

    const loadCalendarSyncStatus = async () => {
        try {
            const storedStatus = await AsyncStorage.getItem(CALENDAR_SYNC_KEY);
            if (storedStatus !== null) {
                setIsCalendarSynced(JSON.parse(storedStatus)); // convert string to boolean
            }
        } catch (error) {
            console.error('Error loading calendar sync status:', error?.message);
        }
    };

    const saveCalendarSyncStatus = async status => {
        try {
            await AsyncStorage.setItem(
                CALENDAR_SYNC_KEY,
                JSON.stringify(status),
            );
        } catch (error) {
            console.error('Error saving calendar sync status:', error?.message);
        }
    };

    const askCalendarPermission = async () => {
        const permission = await requestCalendarPermission();
        if (permission === 'denied') {
            showAlert(
                Constants.commonConstant.appName,
                'Calendar access was not allowed, so meetings will not silence your phone. Your other settings still work.',
            );
        }
        return permission;
    };

    // Round 3 (#4): connecting = allow Silent Focus to read this phone's
    // calendars, then choose which ones (Google, Samsung, Outlook /
    // Exchange, local...). The native engine silences during their events;
    // nothing is uploaded or turned into schedules.
    const openCalendarPicker = async () => {
        const permission = await askCalendarPermission();
        if (permission === 'granted') setModalVisible(true);
    };

    const refreshCalendarSummary = async () => {
        try {
            const result = await getDeviceCalendars();
            setCalendarSummary(
                result?.permission === 'granted'
                    ? describeSelection(result.selection, result.calendars)
                    : 'Calendar access is off. Tap "Change calendars" to allow it.',
            );
        } catch (e) {
            setCalendarSummary(null);
        }
    };

    const handleSaveCalendars = async ids => {
        try {
            await saveCalendarSelection(ids);
        } catch (e) {
            showAlert(Constants.commonConstant.appName, 'Your calendar choice could not be saved. Please try again.');
            return;
        }
        setModalVisible(false);
        setIsCalendarSynced(true);
        await saveCalendarSyncStatus(true);
        await syncAutomationSettings().catch(() => null);
        syncDeviceCalendar().catch(() => {});
        refreshCalendarSummary();
    };

    const handleDisconnectCalendar = async () => {
        setIsCalendarSynced(false);
        setCalendarSummary(null);
        await saveCalendarSyncStatus(false);
        // Turns calendar automation off natively and clears its cache.
        syncAutomationSettings().catch(() => {});
    };

    // Learned-places count for "Clear learned locations" (refreshed on focus).
    const [learnedCount, setLearnedCount] = useState(0);
    const isScreenFocused = useIsFocused();
    useEffect(() => {
        if (isScreenFocused && isCalendarSynced) refreshCalendarSummary();
    }, [isScreenFocused, isCalendarSynced]);
    useEffect(() => {
        if (!isScreenFocused) return;
        getLearningState()
            .then(state => setLearnedCount(state?.placeCount || 0))
            .catch(() => {});
    }, [isScreenFocused]);

    const onClearLearned = async () => {
        const next = await clearLearnedNow();
        if (next) {
            setLearnedCount(next.placeCount || 0);
        }
    };

    const onPressLogOut = async () => {
        let deviceId = '';
        try {
            deviceId = await DeviceInfo.getUniqueId();
        } catch (e) {
            // Logout must not depend on the device id being available.
        }
        setIsLoading(true);
        // While the token is still valid: one bounded sync, then keep this
        // account's not-yet-backed-up activity in its outbox. If that can't
        // be saved, stay signed in rather than lose it.
        const prepared = await prepareUserLogout().catch(() => ({ok: false}));
        if (!prepared.ok) {
            setIsLoading(false);
            showAlert(
                Constants.commonConstant.appName,
                "Some activity hasn't been backed up yet and couldn't be saved on this phone, so you're still signed in. Please try again.",
            );
            return;
        }
        LogOutApiCall({device_id: deviceId});
    };

    const onPressModifyFilters = timestamp => {
        const date = new Date(timestamp).getTime(); // Current time in ms

        if (Platform.OS === 'ios') {
            // iOS calendar requires seconds
            const seconds = Math.floor(date / 1000);
            Linking.openURL(`calshow:${seconds}`);
        } else {
            // Android calendar uses milliseconds
            Linking.openURL(`content://com.android.calendar/time/${date}`);
        }
    };

    useEffect(() => {
        setIsLoading(true);
        GetUserProfileApiCall();
    }, []);

    useEffect(() => {
        if (!phoneNumber) return;

        const timeout = setTimeout(() => {
            if (
                phoneNumber.length === 10 &&
                phoneNumber !== savedPhoneRef.current
            ) {
                const payload = {
                    username: Constants.commonConstant.appUser.username
                        ? Constants.commonConstant.appUser.username
                        : '',
                    email: Constants.commonConstant.appUser.email
                        ? Constants.commonConstant.appUser.email
                        : '',
                    phone_number: phoneNumber,
                };

                UpdateUserProfileApiCall(payload);
            }
        }, 800);

        return () => clearTimeout(timeout);
    }, [phoneNumber]);

    const UpdateUserProfileApiCall = async payload => {
        let url = EndPoints.updateProfile.replace(
            '{user_id}',
            `${Constants.commonConstant.appUserId}`,
        );

        const response = await APICall('put', payload, url);
        setIsLoading(false);
        if (
            response?.statusCode === Constants.apiStatusCode.success &&
            response?.data?.status === '1'
        ) {
            savedPhoneRef.current =
                response.data.result?.phone_number ?? payload.phone_number;
        } else {
            showApiErrorAlert(Constants.commonConstant.appName, response);
        }
    };

    // Response: {status, message, result: {user_id, username, email,
    // phone_number, created_at}}.
    const GetUserProfileApiCall = async payload => {
        let url = EndPoints.getUserProfile.replace(
            '{user_id}',
            `${Constants.commonConstant.appUserId}`,
        );

        const response = await APICall('get', payload, url);
        setIsLoading(false);
        if (
            response?.statusCode === Constants.apiStatusCode.success &&
            response?.data?.status === '1'
        ) {
            const loadedPhone = response.data.result?.phone_number || '';
            savedPhoneRef.current = loadedPhone;
            setPhoneNumber(loadedPhone);
        } else {
            showApiErrorAlert(Constants.commonConstant.appName, response);
        }
    };

    const ChangePasswordApiCall = async () => {
        if (!oldPassword || !newPassword || !confirmPassword) {
            showAlert(
                Constants.commonConstant.appName,
                'Please fill all password fields.',
            );
            return;
        }
        if (newPassword !== confirmPassword) {
            showAlert(
                Constants.commonConstant.appName,
                'New password and confirm password do not match.',
            );
            return;
        }

        const url = EndPoints.changePassword;
        const payload = {
            old_password: oldPassword,
            new_password: newPassword,
            confirm_password: confirmPassword,
        };

        setIsLoading(true);
        await APICall('post', payload, url).then(response => {
            setIsLoading(false);
            if (
                response?.statusCode === Constants.apiStatusCode.success &&
                response?.data
            ) {
                const responseData = response?.data;
                if (responseData?.status === '1') {
                    setChangePasswordModalVisible(false);
                    setOldPassword('');
                    setNewPassword('');
                    setConfirmPassword('');
                    showAlert(
                        Constants.commonConstant.appName,
                        responseData?.message || 'Password updated successfully.',
                    );
                } else {
                    showApiErrorAlert(Constants.commonConstant.appName, response);
                }
            } else {
                showApiErrorAlert(Constants.commonConstant.appName, response);
            }
        });
    };

    // Best-effort server logout (token revoke), then always sign out
    // locally - a failed/slow/offline backend must never keep the user in.
    const LOGOUT_SERVER_TIMEOUT_MS = 10000;
    const LogOutApiCall = async payload => {
        const url = EndPoints.logOut;
        try {
            await Promise.race([
                APICall('post', payload, url),
                new Promise(resolve =>
                    setTimeout(resolve, LOGOUT_SERVER_TIMEOUT_MS),
                ),
            ]);
        } catch (e) {
            // Ignored: local logout below still happens.
        }
        setIsLoading(false);
        await clearLocalStorage();
    };

    // Two explicit confirmations, then DELETE /account. Local data is
    // removed and the user is signed out only after the server confirmed.
    const onPressDeleteAccount = () => {
        showAlertWithTwoCallBack(
            'Delete account?',
            'This permanently deletes your Silent Focus account, including your silent zones, schedules, settings and synced history. This cannot be undone.',
            'Cancel',
            () => {},
            'Continue',
            () =>
                showAlertWithTwoCallBack(
                    'Are you sure?',
                    'Your account will be deleted now and you will be signed out of this phone.',
                    'Cancel',
                    () => {},
                    'Delete',
                    DeleteAccountApiCall,
                ),
        );
    };

    const DeleteAccountApiCall = async () => {
        setIsLoading(true);
        let result;
        try {
            result = await deleteAccount();
        } catch (e) {
            result = {ok: false, response: undefined};
        }
        setIsLoading(false);
        if (!result.ok) {
            showApiErrorAlert(
                Constants.commonConstant.appName,
                result.response,
                'Your account could not be deleted. Please try again.',
            );
        }
        // On success the session is cleared and the app returns to sign-in.
    };

    return (
        <SafeAreaView style={{flex: 1, backgroundColor: background}}>
            <ScrollView
                style={styles.container}
                contentContainerStyle={styles.scrollContent}
                // keyboardShouldPersistTaps="handled"
            >
                {/* <Text style={styles.header}>Account Center</Text> */}

                {/* Account Info */}
                <Section
                    title="Account & Profile "
                    // height={125}
                    cardColor={card}>
                    <View style={styles.fieldRow}>
                        <Field
                            label="Name"
                            value={Constants.commonConstant.appUser.username}
                            textColor={text}
                        />
                    </View>
                    <Separator divider={divider} />
                    <View style={styles.fieldRow}>
                        <Field
                            label="Email"
                            value={Constants.commonConstant.appUser.email}
                            textColor={text}
                        />
                    </View>
                    <Separator divider={divider} />
                    {/* <View style={styles.fieldRow}> */}
                    <View style={styles.fieldRow}>
                        <View style={styles.rowHeader}>
                            <Text style={[styles.label, {color: text}]}>
                                Phone
                            </Text>
                            {isEditingPhone ? (
                                <TextInput
                                    ref={phoneInputRef}
                                    value={phoneNumber}
                                    onChangeText={setPhoneNumber}
                                    onBlur={() => setIsEditingPhone(false)}
                                    autoFocus
                                    keyboardType="phone-pad"
                                    style={[
                                        styles.value,
                                        {color: text, padding: 0},
                                    ]}
                                    placeholder="+ Add Phone Number"
                                    placeholderTextColor={link}
                                    maxLength={12}
                                />
                            ) : (
                                <Pressable
                                    onPress={() => setIsEditingPhone(true)}>
                                    <Text
                                        style={[
                                            styles.value,
                                            {
                                                color: phoneNumber
                                                    ? text
                                                    : link,
                                            },
                                        ]}>
                                        {phoneNumber || '+ Add Phone Number'}
                                    </Text>
                                </Pressable>
                            )}
                        </View>
                        {/* </View> */}
                    </View>
                </Section>

                {/* Calendar Settings */}
                <Section
                    title="Calendar Settings"
                    // height={isCalendarSynced ? 200 : 180}
                    cardColor={card}>
                    <View style={styles.fieldRow}>
                        <Field
                            label="Calendar Sync"
                            value={isCalendarSynced ? 'Active' : 'Inactive'}
                            color={isCalendarSynced ? '#34A853' : mutedText}
                        />
                    </View>
                    <Separator divider={divider} />
                    <View style={styles.fieldRow}>
                        <TouchableOpacity
                            onPress={() =>
                                onPressModifyFilters(new Date().getTime())
                            }>
                            <Field
                                label="Event Filters"
                                value="Modify Filters"
                                color={link}
                            />
                        </TouchableOpacity>
                    </View>
                    <Separator divider={divider} />

                    {isCalendarSynced ? (
                        <>
                            <Text
                                style={[
                                    styles.providerText,
                                    {color: mutedText},
                                ]}
                                testID="calendar-summary">
                                {calendarSummary || 'Calendars on this phone'}
                            </Text>
                            <TouchableOpacity
                                onPress={openCalendarPicker}
                                accessibilityRole="button">
                                <Text style={[styles.disconnect, {color: link}]}>
                                    Change calendars
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={handleDisconnectCalendar}
                                accessibilityRole="button">
                                <Text style={[styles.disconnect, {color: link}]}>
                                    Disconnect Calendar
                                </Text>
                            </TouchableOpacity>
                        </>
                    ) : (
                        <TouchableOpacity onPress={openCalendarPicker} accessibilityRole="button">
                            <Text style={[styles.syncNow, {color: link}]}>
                                + Sync a Calendar
                            </Text>
                        </TouchableOpacity>
                    )}
                </Section>
                {/* Permissions (moved from Control; live status - Client Issue #7) */}
                <View style={styles.section}>
                    <SectionTitle>Permissions</SectionTitle>
                    <PermissionHub />
                </View>

                {/* Privacy & Data (moved from Control - Client Issue #7) */}
                <Section title="Privacy & Data" cardColor={card}>
                    <Text style={[styles.privacyNote, {color: mutedText}]}>
                        Activity is kept on this phone for up to 30 days (200 entries) and session history for
                        up to 90 days. Logging out clears both.
                    </Text>
                    <Separator divider={divider} />
                    <Pressable
                        style={styles.fieldRow}
                        accessibilityRole="button"
                        onPress={() => confirmClearActivity()}>
                        <Field label="Clear activity history" textColor={text} />
                    </Pressable>
                    <Separator divider={divider} />
                    <Pressable
                        style={styles.fieldRow}
                        accessibilityRole="button"
                        onPress={onClearLearned}>
                        <Field
                            label={`Clear learned locations${learnedCount ? ` (${learnedCount})` : ''}`}
                            textColor={text}
                        />
                    </Pressable>
                </Section>

                {/* Feedback (client request, Round 9) */}
                <Section title="Feedback" cardColor={card}>
                    <FeedbackForm />
                </Section>

                {/* Legal */}
                <Section title="Legal" cardColor={card}>
                    <View style={styles.fieldRow}>
                        <Field label="Terms of Service" textColor={text} />
                    </View>
                    <Separator divider={divider} />
                    <View style={styles.fieldRow}>
                        <Field label="Privacy Policy" textColor={text} />
                    </View>
                </Section>

                {/* Account */}
                <Section title="Account" cardColor={card}>
                    <Pressable
                        style={styles.fieldRow}
                        onPress={() => setChangePasswordModalVisible(true)}>
                        <Field
                            label="Add or Change Password"
                            textColor={text}
                        />
                    </Pressable>
                    <Separator divider={divider} />
                    <Pressable
                        style={styles.fieldRow}
                        accessibilityRole="button"
                        onPress={onPressDeleteAccount}>
                        <Field label="Delete Account" textColor={text} />
                    </Pressable>
                </Section>

                {/* Logout */}
                <View style={styles.logoutContainer}>
                    <TouchableOpacity
                        activeOpacity={0.9}
                        onPress={() => onPressLogOut()}>
                        <LinearGradient
                            colors={['#B87333', '#B06E31', '#523317']}
                            start={{x: 0, y: 0.5}}
                            end={{x: 1, y: 0.5}}
                            style={styles.logoutBtn}>
                            <LogoutIcon width={16} height={16} />
                            <Text style={styles.logoutText}>Logout</Text>
                        </LinearGradient>
                    </TouchableOpacity>
                </View>

                {/* Calendar picker (Round 3 #4): every calendar on this phone */}
                <CalendarPickerModal
                    visible={modalVisible}
                    onClose={() => setModalVisible(false)}
                    onSave={handleSaveCalendars}
                    onRequestPermission={askCalendarPermission}
                />

                {/* Change Password Modal */}
                <Modal
                    transparent
                    animationType="fade"
                    visible={changePasswordModalVisible}>
                    <Pressable
                        style={styles.modalBackdrop}
                        onPress={() => setChangePasswordModalVisible(false)}>
                        <Pressable
                            style={[
                                styles.modalBox,
                                {backgroundColor: isDark ? '#222' : '#fff'},
                            ]}
                            onPress={() => {}}>
                            <Text style={[styles.modalTitle, {color: text}]}>
                                Change Password
                            </Text>
                            <TextInput
                                value={oldPassword}
                                onChangeText={setOldPassword}
                                placeholder="Current Password"
                                placeholderTextColor="#999"
                                secureTextEntry
                                style={[styles.modalInput, {color: text}]}
                            />
                            <TextInput
                                value={newPassword}
                                onChangeText={setNewPassword}
                                placeholder="New Password"
                                placeholderTextColor="#999"
                                secureTextEntry
                                style={[styles.modalInput, {color: text}]}
                            />
                            <TextInput
                                value={confirmPassword}
                                onChangeText={setConfirmPassword}
                                placeholder="Confirm New Password"
                                placeholderTextColor="#999"
                                secureTextEntry
                                style={[styles.modalInput, {color: text}]}
                            />
                            <TouchableOpacity
                                style={styles.modalSubmitBtn}
                                onPress={ChangePasswordApiCall}>
                                <Text style={styles.modalSubmitText}>
                                    Update Password
                                </Text>
                            </TouchableOpacity>
                        </Pressable>
                    </Pressable>
                </Modal>
            </ScrollView>
            <CustomLoader isLoading={isLoading} />
        </SafeAreaView>
    );
};

// Reusable components
// Light mode: #888 on white was 3.5:1.
const SectionTitle = ({children}) => {
    const isDark = useColorScheme() === 'dark';
    return (
        <Text style={[styles.sectionTitle, !isDark && {color: LIGHT_CONTROLS.mutedText}]}>
            {children}
        </Text>
    );
};

const Section = ({title, children, height, cardColor}) => (
    <View style={styles.section}>
        <SectionTitle>{title}</SectionTitle>
        <View style={[styles.sectionBox, {height, backgroundColor: cardColor}]}>
            {children}
        </View>
    </View>
);

const Field = ({label, value, color, textColor}) => {
    const colorScheme = useColorScheme();
    const isDark = colorScheme === 'dark';
    const defaultLabelColor = isDark ? '#eee' : LIGHT_CONTROLS.mutedText;
    const defaultValueColor = isDark ? '#aaa' : LIGHT_CONTROLS.mutedText;

    return (
        <View style={styles.rowHeader}>
            <Text
                style={[styles.label, {color: textColor || defaultLabelColor}]}>
                {label}
            </Text>
            <Text
                style={[
                    styles.value,
                    {color: textColor || color || defaultValueColor},
                ]}>
                {value}
            </Text>
        </View>
    );
};

const Separator = ({divider}) => {
    const colorScheme = useColorScheme();
    const isDark = colorScheme === 'dark';
    return (
        <View
            style={[
                styles.separator,
                {
                    backgroundColor:
                        divider || (isDark ? 'rgba(85,85,85,0.35)' : '#bbb'),
                },
            ]}
        />
    );
};

const styles = StyleSheet.create({
    privacyNote: {
        fontSize: 13,
        lineHeight: 18,
        paddingVertical: 10,
    },
    container: {
        flex: 1,
        paddingTop: hp('1%'),
        paddingHorizontal: wp('5%'),
    },
    scrollContent: {
        paddingBottom: hp('12%'),
        paddingTop: hp('2%'),
    },

    header: {
        fontSize: wp('5.5%'),
        fontWeight: '600',
        color: '#D6721E',
        textAlign: 'center',
        marginBottom: hp('2.5%'),
    },
    section: {
        marginBottom: hp('3%'),
    },
    sectionTitle: {
        fontSize: wp('3.2%'),
        fontWeight: '600',
        color: '#888',
        marginBottom: hp('1.2%'),
    },
    sectionBox: {
        width: '100%',
        maxWidth: wp('90%'),
        alignSelf: 'center',
        borderRadius: wp('4.5%'),
        paddingHorizontal: wp('4%'),
        paddingVertical: wp('3%'),
        justifyContent: 'center',
    },
    fieldRow: {
        marginVertical: hp('0.6%'),
    },
    rowHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    label: {
        fontSize: wp('3.5%'),
        fontWeight: '400',
    },
    value: {
        fontSize: wp('3.5%'),
        // width: wp('10%'),
        fontWeight: '400',
    },
    separator: {
        height: 1,
        marginVertical: hp('0.5%'),
    },
    disconnect: {
        color: '#D6721E',
        textAlign: 'center',
        fontSize: wp('3.2%'),
        fontWeight: '600',
        marginTop: hp('1%'),
    },
    providerText: {
        textAlign: 'center',
        fontSize: wp('3.2%'),
        fontWeight: '400',
        marginTop: hp('2%'),
    },
    syncNow: {
        color: '#D6721E',
        textAlign: 'center',
        fontSize: wp('3.2%'),
        fontWeight: '600',
        marginTop: hp('0.8%'),
    },
    // logoutContainer: {
    //   alignItems: 'flex-end',
    //   justifyContent: 'center',
    //   marginTop: hp('1%'),
    // },
    logoutContainer: {
        alignItems: 'flex-end',
        justifyContent: 'center',
        marginTop: hp('1%'),
        marginBottom: hp('4%'), // ✅ Add this
        paddingRight: wp('2%'), // Optional: tweak right spacing
    },

    logoutBtn: {
        width: wp('40%'),
        height: hp('6%'),
        borderRadius: wp('10%'),
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#000',
        shadowOffset: {width: 0, height: 4},
        shadowOpacity: 0.4,
        shadowRadius: 65,
    },
    logoutText: {
        color: '#fff',
        fontSize: wp('4%'),
        fontWeight: '600',
        marginLeft: wp('1.5%'),
    },
    modalBackdrop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalBox: {
        width: wp('80%'),
        borderRadius: wp('3%'),
        padding: wp('5%'),
    },
    modalTitle: {
        fontSize: wp('4.3%'),
        fontWeight: '400',
        marginBottom: hp('1.5%'),
        textAlign: 'center',
    },
    optionBtn: {
        paddingVertical: hp('1.2%'),
        // borderBottomWidth: 1,
        borderBottomColor: '#444',
    },
    optionText: {
        color: '#D6721E',
        fontSize: wp('3.5%'),
        textAlign: 'center',
    },
    modalInput: {
        borderRadius: wp('2%'),
        borderWidth: 1,
        borderColor: '#5555551F',
        paddingHorizontal: wp('3%'),
        paddingVertical: hp('1.2%'),
        fontSize: wp('3.5%'),
        marginBottom: hp('1.2%'),
    },
    modalSubmitBtn: {
        backgroundColor: '#ff6600',
        borderRadius: wp('2%'),
        paddingVertical: hp('1.3%'),
        marginTop: hp('0.5%'),
    },
    modalSubmitText: {
        color: '#fff',
        fontSize: wp('3.7%'),
        fontWeight: 'bold',
        textAlign: 'center',
    },
});

export default ProfileScreen;
