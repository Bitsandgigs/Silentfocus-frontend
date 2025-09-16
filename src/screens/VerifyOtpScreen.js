import React, {useState, useEffect} from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    ScrollView,
    SafeAreaView,
    Platform,
} from 'react-native';

// Lib
import {useNavigation, useRoute} from '@react-navigation/native';
import {
    heightPercentageToDP as hp,
    widthPercentageToDP as wp,
} from 'react-native-responsive-screen';

import {hasNotch} from 'react-native-device-info';

// Component
import CustomButton from '../componentes/CustomButton/CustomButton';

// Mics Constants
import BackIcon from '../assets/svgs/Back';
import responsive from '../styles/responsive';
import {height, localize} from '../function/commonFunctions';
import {Colors, Constants} from '../utils/theme';

// API
import EndPoints from '../utils/api/endpoints';
import APICall from '../utils/api/api';
import {showAlert} from '../function/Alert';
import CustomLoader from '../componentes/CustomLoader/CustomLoader';
import CommonStyle from '../utils/theme/commonStyle';
import {
    CodeField,
    Cursor,
    useBlurOnFulfill,
    useClearByFocusCell,
} from 'react-native-confirmation-code-field';
import screens from '../utils/theme/screens';

export default function VerifyOtpScreen() {
    // navigation
    const navigation = useNavigation();
    const route = useRoute();
    const {email} = route.params;

    // useState
    const [isLoading, setIsLoading] = useState(false);
    const [isError, setIsError] = useState(false);
    const [value, setValue] = useState('');
    const [seconds, setSeconds] = useState(60);
    const CELL_COUNT = 4;

    const [autoCompleteType, setAutoCompleteType] = useState();
    const phoneRef = useBlurOnFulfill({value, cellCount: CELL_COUNT});
    const [props, getCellOnLayoutHandler] = useClearByFocusCell({
        value,
        setValue,
    });

    // useEffect
    useEffect(() => {
        const interval = setInterval(() => {
            if (seconds > 0) {
                setSeconds(seconds - 1);
            } else {
                clearInterval(interval);
            }
        }, 1000);

        return () => clearInterval(interval);
    }, [seconds]);

    useEffect(() => {
        const type = Platform.select({
            android: 'sms-otp',
            default: 'one-time-code',
        });
        setAutoCompleteType(type);
    }, []);

    const handleVerifyaAndRegister = async () => {
        const payload = {
            email: email ? email : '',
            otp: value ? value : '',
        };
        setIsLoading(true);
        VerifyOtpApiCall(payload);
    };

    const handleResendOtp = async () => {
        const payload = {
            email: email ? email : '',
        };
        ResendOtpApiCall(payload);
    };

    const VerifyOtpApiCall = async payload => {
        const url = EndPoints.resetPassword;

        await APICall('post', payload, url).then(response => {
            setIsLoading(false);
            if (
                response?.statusCode === Constants.apiStatusCode.success &&
                response?.data
            ) {
                const responseData = response?.data;

                if (responseData?.status === '1') {
                    navigation.navigate(screens.ResetPasswordScreen, {
                        email: payload.email,
                    });
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

    const ResendOtpApiCall = async payload => {
        const url = EndPoints.resendOtp;

        await APICall('post', payload, url).then(response => {
            setIsLoading(false);
            if (
                response?.statusCode === Constants.apiStatusCode.success &&
                response?.data
            ) {
                const responseData = response?.data;

                if (responseData?.status === '1') {
                    // navigation.navigate(screens.ResetPasswordScreen, {
                    //     email: payload.email,
                    // });
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

    // Render Component
    return (
        <SafeAreaView style={styles.container}>
            <ScrollView
                keyboardShouldPersistTaps={'handled'}
                showsVerticalScrollIndicator={false}>
                <TouchableOpacity
                    onPress={() => navigation.goBack()}
                    style={styles.backButton}>
                    <BackIcon width={26} height={26} color={Colors.black} />
                </TouchableOpacity>
                <View style={{flex: 1}}>
                    <View style={styles.headerWrapper}>
                        <Text style={styles.heading}>{localize('SF20')}</Text>
                        <Text style={styles.subheading}>
                            {localize('SF21')}
                        </Text>
                    </View>

                    <View style={styles.outerCard}>
                        <View style={styles.cardWrapper}>
                            <View>
                                <CodeField
                                    ref={phoneRef}
                                    {...props}
                                    value={value}
                                    onFocus={() => {
                                        setIsError(false);
                                    }}
                                    onChangeText={setValue}
                                    cellCount={CELL_COUNT}
                                    rootStyle={CommonStyle.codeFieldRoot}
                                    keyboardType={'number-pad'}
                                    textContentType={'oneTimeCode'}
                                    autoComplete={autoCompleteType}
                                    testID={'my-code-input'}
                                    autoFocus
                                    renderCell={({
                                        index,
                                        symbol,
                                        isFocused,
                                    }) => {
                                        return (
                                            <View
                                                key={index}
                                                style={[
                                                    CommonStyle.cell,
                                                    isFocused &&
                                                        CommonStyle.focusCell,
                                                    isError &&
                                                        CommonStyle.errorCell,
                                                ]}
                                                onLayout={getCellOnLayoutHandler(
                                                    index,
                                                )}>
                                                <Text
                                                    style={[
                                                        CommonStyle.cellText,
                                                        isError &&
                                                            CommonStyle.errorText,
                                                    ]}>
                                                    {symbol ||
                                                        (isFocused ? (
                                                            <Cursor />
                                                        ) : null)}
                                                </Text>
                                            </View>
                                        );
                                    }}
                                />

                                {seconds !== 0 ? (
                                    <View
                                        style={{
                                            flexDirection: 'row',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            margin: 8,
                                            padding: 8,
                                        }}>
                                        <Text
                                            style={{
                                                color: Colors.themeColor,
                                                fontSize: 14,
                                                fontWeight: 'bold',
                                            }}>
                                            {'Send again'}
                                        </Text>
                                        <Text
                                            style={{
                                                color: Colors.themeColor,
                                                fontSize: 14,
                                                fontWeight: 'bold',
                                            }}>
                                            {' '}
                                            {'('}
                                            {seconds} {'sec'}
                                            {')'}
                                        </Text>
                                    </View>
                                ) : (
                                    <TouchableOpacity
                                        onPress={() => handleResendOtp()}
                                        style={{
                                            margin: 8,
                                            padding: 10,
                                            alignSelf: 'center',
                                        }}>
                                        <Text
                                            style={{
                                                color: Colors.themeColor,
                                                fontSize: '15',
                                                fontWeight: 'bold',
                                            }}>
                                            {localize('SF27')}
                                        </Text>
                                    </TouchableOpacity>
                                )}

                                <CustomButton
                                    title={localize('SF22')}
                                    onPress={handleVerifyaAndRegister}
                                    disabled={value.length !== CELL_COUNT}
                                />
                            </View>
                        </View>
                    </View>
                </View>
            </ScrollView>

            <CustomLoader isLoading={isLoading} />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {flex: 1},
    backButton: {
        marginTop: hp(6),
        marginLeft: responsive.margin(16),
        zIndex: 100,
    },
    headerWrapper: {
        marginTop: hp(3),
        width: wp(90),
        alignSelf: 'center',
    },
    heading: {
        fontSize: responsive.fontSize(28),
        fontWeight: '600',
        color: Colors.black,
        marginHorizontal: responsive.margin(6),
    },
    subheading: {
        fontSize: responsive.fontSize(15),
        color: Colors.black,
        marginTop: responsive.margin(15),
        marginHorizontal: responsive.margin(6),
        marginBottom: responsive.margin(30),
    },
    outerCard: {
        flex: 1,
        justifyContent: 'flex-end',
        marginBottom: hasNotch() ? height(0) : height(30),
    },
    cardWrapper: {
        paddingHorizontal: 24,
        paddingTop: 24,
        height: hp(35),
        paddingBottom: 36,
        marginHorizontal: 6,
    },
    tabRow: {
        flexDirection: 'row',
        backgroundColor: '#e0e0e0',
        borderRadius: 50,
        marginBottom: 24,
        padding: 6,
    },
    tabButton: {flex: 1, paddingVertical: 12, alignItems: 'center'},
    tabActive: {backgroundColor: '#fff', borderRadius: 50},
    tabText: {color: '#333', fontWeight: '600'},
    tabTextActive: {color: '#D67D33'},
    inputBox: {
        borderRadius: 16,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        marginBottom: 16,
        height: 60,
    },
    input: {flex: 1, fontSize: 14},
    inputIcon: {marginRight: 10},
    inputIconRight: {marginLeft: 10},
    row: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginVertical: 8,
        alignItems: 'center',
    },
    rowLeft: {flexDirection: 'row', alignItems: 'center'},
    rememberText: {marginLeft: 8, fontSize: 13, color: Colors.black},
    forgotText: {color: '#D67D33', fontSize: 13},
    loginButton: {
        backgroundColor: '#D67D33',
        paddingVertical: 14,
        borderRadius: 30,
        alignItems: 'center',
        marginTop: 16,
    },
    loginButtonText: {color: '#fff', fontWeight: 'bold', fontSize: 16},
    dividerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginVertical: 24,
    },
    line: {flex: 1, height: 1, backgroundColor: '#ddd'},
    orText: {marginHorizontal: 8, color: '#888', fontSize: 12},
    socialRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 15,
    },
    socialButtonModern: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#D67D33',
        backgroundColor: '#fff',
        borderRadius: 32,
        paddingVertical: 12,
        paddingHorizontal: 20,
        flex: 1,
        marginHorizontal: 4,
    },
    socialIconModern: {
        width: 20,
        height: 20,
        marginRight: 10,
        resizeMode: 'contain',
    },
    socialText: {fontSize: 14, color: '#000', fontWeight: '500', marginLeft: 5},
    modalOverlay: {flex: 1, justifyContent: 'center', alignItems: 'center'},
    modalContent: {
        width: '85%',
        backgroundColor: '#fff',
        padding: 24,
        borderRadius: 32,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: {width: 0, height: 4},
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 10,
    },
});
