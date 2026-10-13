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
import {showAlert, showApiErrorAlert} from '../function/Alert';
import CustomLoader from '../componentes/CustomLoader/CustomLoader';
import CommonStyle from '../utils/theme/commonStyle';
import {
    CodeField,
    Cursor,
    useBlurOnFulfill,
    useClearByFocusCell,
} from 'react-native-confirmation-code-field';
import screens from '../utils/theme/screens';
import {getAppConfig} from '../utils/appConfig';

export default function VerifyOtpScreen() {
    // navigation
    const navigation = useNavigation();
    const route = useRoute();
    const {email} = route.params;

    // useState
    const [isLoading, setIsLoading] = useState(false);
    const [isError, setIsError] = useState(false);
    const [value, setValue] = useState('');
    // Server-side resend cooldown (GET /app-config; default 30 s).
    const resendCooldown = getAppConfig().otpResendCooldownSeconds;
    const [seconds, setSeconds] = useState(resendCooldown);
    const CELL_COUNT = 4;

    const [autoCompleteType, setAutoCompleteType] = useState();
    const phoneRef = useBlurOnFulfill({value, cellCount: CELL_COUNT});
    const [props, getCellOnLayoutHandler] = useClearByFocusCell({
        value,
        setValue,
    });

    useEffect(() => {
        if (seconds === 0) return; // stop when timer hits 0

        const interval = setInterval(() => {
            setSeconds(prev => prev - 1);
        }, 1000);

        return () => clearInterval(interval); // cleanup
    }, [seconds]);

    // // useEffect
    // useEffect(() => {
    //     const interval = setInterval(() => {
    //         if (seconds > 0) {
    //             setSeconds(seconds - 1);
    //         } else {
    //             clearInterval(interval);
    //         }
    //     }, 1000);

    //     return () => clearInterval(interval);
    // }, [seconds]);

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
        setSeconds(resendCooldown);
        ResendOtpApiCall(payload);
    };

    // POST reset-password {email, otp} -> result.reset_token: a one-time,
    // short-lived token create-new-password requires. It is only passed to
    // the next screen in memory - never stored or logged.
    const VerifyOtpApiCall = async payload => {
        const url = EndPoints.resetPassword;

        await APICall('post', payload, url).then(response => {
            setIsLoading(false);
            if (
                response?.statusCode === Constants.apiStatusCode.success &&
                response?.data
            ) {
                const responseData = response?.data;

                const resetToken = responseData?.result?.reset_token;
                if (
                    responseData?.status === '1' &&
                    typeof resetToken === 'string' &&
                    resetToken !== ''
                ) {
                    setValue('');
                    navigation.navigate(screens.ResetPasswordScreen, {
                        email: payload.email,
                        resetToken,
                    });
                } else if (responseData?.status === '1') {
                    // Verified but no reset token: the password can't be set.
                    showAlert(
                        Constants.commonConstant.appName,
                        'Your code was verified, but the password reset could not be started. Please request a new code and try again.',
                    );
                } else {
                    showApiErrorAlert(Constants.commonConstant.appName, response);
                }
            } else {
                showApiErrorAlert(Constants.commonConstant.appName, response);
            }
        });
    };

    // This screen is the password-reset flow: a new reset OTP comes from
    // forgot-password again (resend-otp is for pending sign-ups only).
    const ResendOtpApiCall = async payload => {
        const url = EndPoints.forgotPassword;

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
                } else {
                    showApiErrorAlert(Constants.commonConstant.appName, response);
                }
            } else {
                showApiErrorAlert(Constants.commonConstant.appName, response);
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

                                {seconds > 0 ? (
                                    <View
                                        style={{
                                            flexDirection: 'row',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            marginTop: 16,
                                            marginBottom: 16,
                                        }}>
                                        <Text
                                            style={{
                                                fontSize: 15,
                                                color: Colors.themeColor,
                                            }}>
                                            Haven't received the code yet ? Send
                                            Again
                                        </Text>
                                        <Text
                                            style={{
                                                color: Colors.themeColor,
                                                fontWeight: 'bold',
                                            }}>
                                            {' '}
                                            ({seconds} sec)
                                        </Text>
                                    </View>
                                ) : (
                                    <TouchableOpacity
                                        onPress={handleResendOtp}
                                        style={{
                                            alignSelf: 'center',
                                            marginTop: 16,
                                            marginBottom: 16,
                                        }}>
                                        <Text
                                            style={{
                                                color: Colors.themeColor,
                                                fontSize: 15,
                                                fontWeight: 'bold',
                                            }}>
                                            Haven't received the code yet?
                                            Resend OTP
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
