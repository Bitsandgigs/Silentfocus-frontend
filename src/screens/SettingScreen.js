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
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {
    widthPercentageToDP as wp,
    heightPercentageToDP as hp,
} from 'react-native-responsive-screen';
import {useNavigation} from '@react-navigation/native';
import CustomLoader from '../componentes/CustomLoader/CustomLoader';
import EndPoints from '../utils/api/endpoints';
import APICall from '../utils/api/api';
import {Constants, Images} from '../utils/theme';
import {showAlert} from '../function/Alert';
import screens from '../utils/theme/screens';

const SettingsScreen = () => {
    const navigation = useNavigation();
    const [locationMode, setLocationMode] = useState(false);
    const [calendarMode, setCalendarMode] = useState(false);
    const [customMode, setCustomMode] = useState(false);
    const [modalVisible, setModalVisible] = useState(false);
    const [tempResponse, setTempResponse] = useState('');
    const [autoResponse, setAutoResponse] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const colorScheme = useColorScheme();
    const isDark = colorScheme === 'dark';
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

    const handleSetControlModes = async updatedValues => {
        const payload = {
            userId: Constants.commonConstant.appUserId || '',
            locationMode: updatedValues.locationMode,
            calendarMode: updatedValues.calendarMode,
            customMode: updatedValues.customMode,
        };

        setIsLoading(true);

        await SetControlModesApiCall(payload);
    };

    const SetControlModesApiCall = async payload => {
        console.log('payload_set_control', payload);
        const url = EndPoints.setControlModes;

        await APICall('post', payload, url).then(response => {
            setIsLoading(false);
            if (
                response?.statusCode === Constants.apiStatusCode.success &&
                response?.data
            ) {
                const responseData = response?.data;

                if (responseData?.status === '1') {
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

    const toggleSwitch = type => {
        if (type === 'location') {
            setLocationMode(prev => !prev);
            handleSetControlModes({
                locationMode: !locationMode,
                calendarMode,
                customMode,
            });
        } else if (type === 'calendar') {
            setCalendarMode(prev => !prev);
            handleSetControlModes({
                locationMode,
                calendarMode: !calendarMode,
                customMode,
            });
        } else if (type === 'custom') {
            setCustomMode(prev => !prev);
            handleSetControlModes({
                locationMode,
                calendarMode,
                customMode: !customMode,
            });
            navigation.navigate(screens.MapScreen);
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
                                            {
                                                'Your phone will be muted automatically when any silent zones detected like libraries, offices, or religious places.'
                                            }
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
                                        {'Custom'}
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
                                            {'You can add your custom location'}
                                        </Text>
                                    </View>
                                </View>
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

                    {/* Auto Response Section */}
                    <Text style={[styles.sectionTitle, {color: text}]}>
                        SET AUTO RESPONSE
                    </Text>
                    <View
                        style={[styles.responseCard, {backgroundColor: card}]}>
                        <Text style={[styles.modeSubTitle, {color: text}]}>
                            SELECT RESPONSE
                        </Text>
                        <View
                            style={[styles.divider, {backgroundColor: divider}]}
                        />
                        {autoResponse ? (
                            <View style={styles.responseRow}>
                                <Text
                                    style={[
                                        styles.responsePreview,
                                        {color: mutedText},
                                    ]}>
                                    "{autoResponse}"
                                </Text>
                                <TouchableOpacity
                                    onPress={() => setAutoResponse('')}>
                                    <Text style={styles.deleteBtn}>✕</Text>
                                </TouchableOpacity>
                            </View>
                        ) : (
                            <TouchableOpacity
                                onPress={() => {
                                    setTempResponse(autoResponse);
                                    setModalVisible(true);
                                }}>
                                <Text style={styles.manualText}>
                                    Write Manually ＋
                                </Text>
                            </TouchableOpacity>
                        )}
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
                                    multiline
                                />
                                <View style={styles.modalButtons}>
                                    <TouchableOpacity
                                        style={styles.saveBtn}
                                        onPress={() => {
                                            setAutoResponse(
                                                tempResponse.trim(),
                                            );
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
                                                color: '#D6721E',
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
            <CustomLoader isLoading={false} />
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
        backgroundColor: '#D6721E',
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
});

export default SettingsScreen;
