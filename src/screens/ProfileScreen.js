import React, {useState, useRef} from 'react';
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
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import LogoutIcon from '../assets/svgs/Logout';
import {useNavigation} from '@react-navigation/native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {
    widthPercentageToDP as wp,
    heightPercentageToDP as hp,
} from 'react-native-responsive-screen';
import {Constants} from '../utils/theme';
import {showAlert} from '../function/Alert';
import EndPoints from '../utils/api/endpoints';
import APICall from '../utils/api/api';
import screens from '../utils/theme/screens';
import CustomLoader from '../componentes/CustomLoader/CustomLoader';
import {clearLocalStorage} from '../function/commonFunctions';

const calendarOptions = ['Google Calendar', 'Outlook Calendar'];

const ProfileScreen = () => {
    const [calendarProvider, setCalendarProvider] = useState(null);
    const [isCalendarSynced, setIsCalendarSynced] = useState(false);
    const [modalVisible, setModalVisible] = useState(false);

    const [phoneNumber, setPhoneNumber] = useState('');
    const [isEditingPhone, setIsEditingPhone] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    const phoneInputRef = useRef(null);

    const colorScheme = useColorScheme();
    const navigation = useNavigation();
    const isDark = colorScheme === 'dark';

    const background = isDark ? '#111' : '#fff';
    const card = isDark ? 'rgba(85,85,85,0.12)' : '#2E3A3E14';
    const text = isDark ? '#eee' : '#999';
    const mutedText = isDark ? '#aaa' : '#999';
    const divider = isDark ? 'rgba(85,85,85,0.35)' : '#ccc';

    const handleSelectProvider = provider => {
        setCalendarProvider(provider);
        setIsCalendarSynced(true);
        setModalVisible(false);
    };

    const handleDisconnectCalendar = () => {
        setIsCalendarSynced(false);
        setCalendarProvider(null);
    };

    const onPressLogOut = () => {
        const payload = {
            user_id: Constants.commonConstant.appUserId
                ? Constants.commonConstant.appUserId
                : '',
        };
        setIsLoading(true);
        LogOutApiCall(payload);
    };

    const LogOutApiCall = async payload => {
        const url = EndPoints.logOut;

        await APICall('post', payload, url).then(response => {
            setIsLoading(false);
            if (
                response?.statusCode === Constants.apiStatusCode.success &&
                response?.data
            ) {
                const responseData = response?.data;

                if (responseData?.status === '1') {
                    clearLocalStorage();
                } else if (responseData?.status === '0') {
                    showAlert(
                        Constants.commonConstant.appName,
                        responseData?.message,
                    );
                }
            } else if (
                response?.statusCode === Constants.apiStatusCode.invalidContent
            ) {
                const errorData = response?.data;
                showAlert(Constants.commonConstant.appName, errorData?.detail);
            } else if (
                response?.statusCode ===
                Constants.apiStatusCode.unprocessableContent
            ) {
                const errorData = response?.data?.detail[0];
                showAlert(Constants.commonConstant.appName, errorData?.msg);
            } else if (
                response?.statusCode === Constants.apiStatusCode.serverError
            ) {
                showAlert(
                    Constants.commonConstant.appName,
                    'Internal Server Error',
                );
            }
        });
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
                                    placeholderTextColor="#D6721E"
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
                                                    : '#D6721E',
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
                            color={isCalendarSynced ? '#34A853' : '#999'}
                        />
                    </View>
                    <Separator divider={divider} />
                    <View style={styles.fieldRow}>
                        <Field
                            label="Event Filters"
                            value="Modify Filters"
                            color="#D6721E"
                        />
                    </View>
                    <Separator divider={divider} />

                    {isCalendarSynced ? (
                        <>
                            <Text
                                style={[
                                    styles.providerText,
                                    {color: mutedText},
                                ]}>
                                {calendarProvider}
                            </Text>
                            <TouchableOpacity
                                onPress={handleDisconnectCalendar}>
                                <Text style={styles.disconnect}>
                                    Disconnect Calendar
                                </Text>
                            </TouchableOpacity>
                        </>
                    ) : (
                        <TouchableOpacity onPress={() => setModalVisible(true)}>
                            <Text style={styles.syncNow}>
                                + Sync a Calendar
                            </Text>
                        </TouchableOpacity>
                    )}
                </Section>
                {/* Permission */}

                <Section
                    title="Permissions & Privacy"
                    // height={109}
                    cardColor={card}>
                    <View style={styles.fieldRow}>
                        <Field label="Terms of Service" textColor={text} />
                    </View>
                    <Separator divider={divider} />
                    <View style={styles.fieldRow}>
                        <Field label="Privacy Policy" textColor={text} />
                    </View>
                </Section>

                {/* Legal */}
                <Section
                    title="Data & Legal "
                    // height={109}
                    cardColor={card}>
                    <View style={styles.fieldRow}>
                        <Field
                            label="Active Permissions"
                            value="Location"
                            color={mutedText}
                        />
                    </View>
                    <Separator divider={divider} />
                    <View style={styles.fieldRow}>
                        <Field
                            label="Add or Change Password"
                            textColor={text}
                        />
                    </View>
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

                {/* Sync Modal */}
                <Modal transparent animationType="fade" visible={modalVisible}>
                    <Pressable
                        style={styles.modalBackdrop}
                        onPress={() => setModalVisible(false)}>
                        <View
                            style={[
                                styles.modalBox,
                                {backgroundColor: isDark ? '#222' : '#fff'},
                            ]}>
                            <Text style={[styles.modalTitle, {color: text}]}>
                                Choose Calendar Provider
                            </Text>
                            {calendarOptions.map(opt => (
                                <TouchableOpacity
                                    key={opt}
                                    onPress={() => handleSelectProvider(opt)}
                                    style={styles.optionBtn}>
                                    <Text style={styles.optionText}>{opt}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </Pressable>
                </Modal>
            </ScrollView>
            <CustomLoader isLoading={isLoading} />
        </SafeAreaView>
    );
};

// Reusable components
const Section = ({title, children, height, cardColor}) => (
    <View style={styles.section}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <View style={[styles.sectionBox, {height, backgroundColor: cardColor}]}>
            {children}
        </View>
    </View>
);

const Field = ({label, value, color, textColor}) => {
    const colorScheme = useColorScheme();
    const isDark = colorScheme === 'dark';
    const defaultLabelColor = isDark ? '#eee' : '#999';
    const defaultValueColor = isDark ? '#aaa' : '#999';

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
        borderBottomWidth: 1,
        borderBottomColor: '#444',
    },
    optionText: {
        color: '#D6721E',
        fontSize: wp('3.5%'),
        textAlign: 'center',
    },
});

export default ProfileScreen;
