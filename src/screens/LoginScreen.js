import React, {useState, useRef, useContext, useEffect} from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    Switch,
    ScrollView,
    Modal,
    Image,
    TextInput as RNTextInput,
    SafeAreaView,
    Platform,
} from 'react-native';

// Lib
import {useNavigation} from '@react-navigation/native';
import {BlurView} from '@react-native-community/blur';
import {
    heightPercentageToDP as hp,
    widthPercentageToDP as wp,
} from 'react-native-responsive-screen';
import {useFormik} from 'formik';
import * as yup from 'yup';
import {hasNotch} from 'react-native-device-info';

// Component
import CustomTextInputView from '../componentes/CustomTextInputView/CustomTextInputView';
import CustomButton from '../componentes/CustomButton/CustomButton';

// Mics Constants
import BackIcon from '../assets/svgs/Back';
import responsive from '../styles/responsive';
import {height, localize, setAsyncData} from '../function/commonFunctions';
import {Colors, Constants, Images} from '../utils/theme';
import {
    validateEmail,
    validateName,
    validatePassword,
} from '../function/validation';

// Context Provider
import {AppContext} from '../utils/context/contextProvider';

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

export default function LoginScreen() {
    // navigation
    const navigation = useNavigation();

    // useContext
    const {setIsLogin, updateConstantValue} = useContext(AppContext);

    // useState
    const [isLoginData, setIsLoginData] = useState(true);
    const [isShowPassword, setIsShowPassword] = useState(false);
    const [rememberMe, setRememberMe] = useState(false);
    const [modalVisible, setModalVisible] = useState(false);
    const [hasErrors, setHasErrors] = useState(false);
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

    const [loginActiveInputIndex, setLoginActiveInputIndex] = useState(0);
    const [registerActiveInputIndex, setRegisterActiveInputIndex] = useState(0);

    useEffect(() => {
        const type = Platform.select({
            android: 'sms-otp',
            default: 'one-time-code',
        });
        setAutoCompleteType(type);
    }, []);

    useEffect(() => {
        if (seconds === 0) return; // stop when timer hits 0

        const interval = setInterval(() => {
            setSeconds(prev => prev - 1);
        }, 1000);

        return () => clearInterval(interval); // cleanup
    }, [seconds]);

    // useState
    const [isLoading, setIsLoading] = useState(false);

    // useRef
    const otpRefs = [useRef(), useRef(), useRef(), useRef()];

    // Login
    const loginRefs = Array(2)
        .fill(0)
        .map(() => useRef());

    const loginHandleFocus = index => () => {
        setLoginActiveInputIndex(index);
    };

    const loginHandleFocusNext = () => {
        loginRefs[loginActiveInputIndex + 1].current.focus();
    };

    // Register
    const registerRefs = Array(3)
        .fill(0)
        .map(() => useRef());

    const registerHandleFocus = index => () => {
        setRegisterActiveInputIndex(index);
    };

    const registerHandleFocusNext = () => {
        registerRefs[registerActiveInputIndex + 1].current.focus();
    };

    const handleResendOtp = async () => {
        const payload = {
            email: values.email ? values.email : '',
        };
        setSeconds(60);
        ResendOtpApiCall(payload);
    };
    const handleVerifyaAndRegister = async () => {
        const payload = {
            email: values.email ? values.email : '',
            otp: value ? value : '',
        };
        setIsLoading(true);
        VerifyOtpApiCall(payload);
    };

    // API
    const LoginApiCall = async payload => {
        const url = EndPoints.login;

        await APICall('post', payload, url).then(response => {
            setIsLoading(false);
            if (
                response?.statusCode === Constants.apiStatusCode.success &&
                response?.data
            ) {
                const responseData = response?.data;

                if (responseData?.status === '1') {
                    Constants.commonConstant.appUser = responseData?.result;
                    Constants.commonConstant.appUserId =
                        responseData?.result?.user_id;

                    setAsyncData(
                        Constants.asyncStorageKeys.userData,
                        responseData?.result,
                    );
                    updateConstantValue(responseData?.result);

                    setIsLogin(true);
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

    const RegisterApiCall = async payload => {
        const url = EndPoints.register;

        await APICall('post', payload, url).then(response => {
            setIsLoading(false);
            console.log('RegisterApiCall', response);
            if (
                response?.statusCode === Constants.apiStatusCode.success &&
                response?.data
            ) {
                const responseData = response?.data;

                if (responseData?.status === '1') {
                    setModalVisible(true);
                    // Constants.commonConstant.appUser = responseData?.result;
                    // Constants.commonConstant.appUserId = responseData?.result?.user_id;

                    // setAsyncData(Constants.asyncStorageKeys.userData, responseData?.result);
                    // updateConstantValue(responseData?.result);

                    // setIsLogin(true);
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

    const VerifyOtpApiCall = async payload => {
        const url = EndPoints.verifyOtp;

        await APICall('post', payload, url).then(response => {
            setIsLoading(false);
            console.log('RegisterApiCall', response);
            if (
                response?.statusCode === Constants.apiStatusCode.success &&
                response?.data
            ) {
                const responseData = response?.data;

                if (responseData?.status === '1') {
                    Constants.commonConstant.appUser = responseData?.result;
                    Constants.commonConstant.appUserId =
                        responseData?.result?.user_id;

                    setAsyncData(
                        Constants.asyncStorageKeys.userData,
                        responseData?.result,
                    );
                    updateConstantValue(responseData?.result);
                    setModalVisible(false);
                    setIsLogin(true);
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
    // Formik and Yup
    const validationSchema = yup.object().shape({
        name: yup.string().when([], {
            is: () => !isLoginData, // only validate name when not login
            then: schema =>
                schema
                    .test(
                        'valid-name',
                        'Please enter a valid name.',
                        function (value) {
                            if (!value) return false;
                            return validateName(value);
                        },
                    )
                    .required('Name is required.'),
            otherwise: schema => schema.notRequired(),
        }),
        email: yup
            .string()
            .test(
                'valid-email',
                'Please enter a valid email address.',
                function (value) {
                    if (value === undefined) {
                        return false;
                    }
                    return validateEmail(value);
                },
            ),
        password: yup
            .string()
            .test(
                'min-password',
                'Password must be 8 characters minimum.',
                function (value) {
                    if (value === undefined) {
                        return false;
                    }
                    return value.length >= 8;
                },
            )
            .test(
                'valid-password',
                'Please enter a valid password.',
                function (value) {
                    if (value === undefined) {
                        return false;
                    }
                    return validatePassword(value);
                },
            ),
    });

    const formik = useFormik({
        initialValues: {
            name: '',
            email: __DEV__ ? 'payal.bitsandgigs@gmail.com' : '',
            password: __DEV__ ? 'Payal@123' : '',
        },

        validateOnBlur: false,
        validateOnChange: hasErrors,
        validateOnMount: false,
        onSubmit: values => {
            console.log(values);
            if (isLoginData) {
                const payload = {
                    email: values.email ? values.email : '',
                    password: values.password ? values.password : '',
                };
                setIsLoading(true);
                LoginApiCall(payload);
            } else {
                const payload = {
                    username: values.name ? values.name : '',
                    email: values.email ? values.email : '',
                    password: values.password ? values.password : '',
                };
                setIsLoading(true);
                RegisterApiCall(payload);
            }
        },
        validationSchema,
    });

    useEffect(() => {
        setHasErrors(Object.keys(formik.errors).length > 0);
    }, [formik.errors]);

    const {handleChange, handleSubmit, values, errors} = formik;

    // Function
    const onPressRightIcon = () => {
        setIsShowPassword(!isShowPassword);
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
                        <Text style={styles.heading}>
                            Go ahead and setup your account
                        </Text>
                        <Text style={styles.subheading}>
                            Sign up and enjoy the unique experience of Silent
                            Focus
                        </Text>
                    </View>

                    <View style={styles.outerCard}>
                        <View style={styles.cardWrapper}>
                            <View>
                                <View style={styles.tabRow}>
                                    <TouchableOpacity
                                        style={[
                                            styles.tabButton,
                                            isLoginData && styles.tabActive,
                                        ]}
                                        onPress={() => {
                                            values.name = '';
                                            values.email = '';
                                            values.password = '';
                                            setIsLoginData(true);
                                        }}>
                                        <Text
                                            style={[
                                                styles.tabText,
                                                isLoginData &&
                                                    styles.tabTextActive,
                                            ]}>
                                            Login
                                        </Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={[
                                            styles.tabButton,
                                            !isLoginData && styles.tabActive,
                                        ]}
                                        onPress={() => {
                                            values.name = '';
                                            values.email = '';
                                            values.password = '';
                                            setIsLoginData(false);
                                        }}>
                                        <Text
                                            style={[
                                                styles.tabText,
                                                !isLoginData &&
                                                    styles.tabTextActive,
                                            ]}>
                                            Register
                                        </Text>
                                    </TouchableOpacity>
                                </View>

                                {isLoginData ? (
                                    <>
                                        <CustomTextInputView
                                            key={'input_0'}
                                            placeholder={'Email address'}
                                            value={values.email}
                                            onChangeText={handleChange('email')}
                                            innerRef={loginRefs[0]}
                                            onFocus={loginHandleFocus(0)}
                                            blurOnSubmit={false}
                                            onSubmitEditing={
                                                loginHandleFocusNext
                                            }
                                            leftIcon={Images.iconEmail}
                                            errorMessage={errors.email}
                                            isValid={
                                                !errors.email ||
                                                values.email === ''
                                            }
                                            autoCapitalize={'none'}
                                            keyboardType={'email-address'}
                                            returnKeyType={'next'}
                                            autoCorrect={false}
                                        />
                                        <CustomTextInputView
                                            key={'input_2'}
                                            placeholder={'Password'}
                                            value={values.password}
                                            onChangeText={handleChange(
                                                'password',
                                            )}
                                            innerRef={loginRefs[1]}
                                            onFocus={loginHandleFocus(1)}
                                            secureTextEntry={!isShowPassword}
                                            leftIcon={Images.iconPassword}
                                            rightIcon={
                                                isShowPassword
                                                    ? Images.iconEyeOff
                                                    : Images.iconEyeOn
                                            }
                                            onPressRightIcon={onPressRightIcon}
                                            errorMessage={errors.password}
                                            isValid={
                                                !errors.password ||
                                                values.password === ''
                                            }
                                            autoCapitalize={'none'}
                                            returnKeyType={'done'}
                                            autoCorrect={false}
                                        />
                                    </>
                                ) : (
                                    <>
                                        <CustomTextInputView
                                            key={'input_0'}
                                            placeholder={'Name'}
                                            value={values.name}
                                            onChangeText={handleChange('name')}
                                            innerRef={registerRefs[0]}
                                            onFocus={registerHandleFocus(0)}
                                            blurOnSubmit={false}
                                            onSubmitEditing={
                                                registerHandleFocusNext
                                            }
                                            leftIcon={Images.iconUser}
                                            leftIconStyle={{
                                                tintColor: Colors.themeColor,
                                            }}
                                            errorMessage={errors.name}
                                            isValid={
                                                !errors.name ||
                                                values.name === ''
                                            }
                                            autoCapitalize={'none'}
                                            keyboardType={'email-address'}
                                            returnKeyType={'next'}
                                            autoCorrect={false}
                                        />
                                        <CustomTextInputView
                                            key={'input_1'}
                                            placeholder={'Email address'}
                                            value={values.email}
                                            onChangeText={handleChange('email')}
                                            innerRef={registerRefs[1]}
                                            onFocus={registerHandleFocus(1)}
                                            blurOnSubmit={false}
                                            onSubmitEditing={
                                                registerHandleFocusNext
                                            }
                                            leftIcon={Images.iconEmail}
                                            errorMessage={errors.email}
                                            isValid={
                                                !errors.email ||
                                                values.email === ''
                                            }
                                            autoCapitalize={'none'}
                                            keyboardType={'email-address'}
                                            returnKeyType={'next'}
                                            autoCorrect={false}
                                        />
                                        <CustomTextInputView
                                            key={'input_2'}
                                            placeholder={'Password'}
                                            value={values.password}
                                            onChangeText={handleChange(
                                                'password',
                                            )}
                                            innerRef={registerRefs[2]}
                                            onFocus={registerHandleFocus(2)}
                                            secureTextEntry={!isShowPassword}
                                            leftIcon={Images.iconPassword}
                                            rightIcon={
                                                isShowPassword
                                                    ? Images.iconEyeOff
                                                    : Images.iconEyeOn
                                            }
                                            onPressRightIcon={onPressRightIcon}
                                            errorMessage={errors.password}
                                            isValid={
                                                !errors.password ||
                                                values.password === ''
                                            }
                                            autoCapitalize={'none'}
                                            returnKeyType={'done'}
                                            autoCorrect={false}
                                        />
                                    </>
                                )}
                                <View style={styles.row}>
                                    <View style={styles.rowLeft}>
                                        <Switch
                                            value={rememberMe}
                                            onValueChange={setRememberMe}
                                            thumbColor="#fff"
                                            trackColor={{
                                                false: '#ccc',
                                                true: 'rgba(240, 138, 44, 0.35)',
                                            }}
                                            style={{transform: [{scale: 0.8}]}}
                                        />
                                        <Text style={styles.rememberText}>
                                            Remember me
                                        </Text>
                                    </View>
                                    <TouchableOpacity
                                        onPress={() =>
                                            navigation.navigate(
                                                screens.ForgotPasswordScreen,
                                            )
                                        }>
                                        <Text style={styles.forgotText}>
                                            Forgot password
                                        </Text>
                                    </TouchableOpacity>
                                </View>

                                {isLoginData ? (
                                    <CustomButton
                                        title={'Login'}
                                        onPress={handleSubmit}
                                        disabled={
                                            values.email === '' ||
                                            values.password === ''
                                        }
                                    />
                                ) : (
                                    <CustomButton
                                        title={'Verify and Register'}
                                        onPress={handleSubmit}
                                        disabled={
                                            values.name === '' ||
                                            values.email === '' ||
                                            values.password === ''
                                        }
                                    />
                                )}

                                <View style={styles.dividerRow}>
                                    <View style={styles.line} />
                                    <Text style={styles.orText}>
                                        or login with
                                    </Text>
                                    <View style={styles.line} />
                                </View>

                                <View style={styles.socialRow}>
                                    <TouchableOpacity
                                        style={styles.socialButtonModern}>
                                        <Image
                                            source={require('../assets/images/Goggle.png')}
                                            style={styles.socialIconModern}
                                        />
                                        <Text style={styles.socialText}>
                                            Google
                                        </Text>
                                    </TouchableOpacity>

                                    <TouchableOpacity
                                        style={styles.socialButtonModern}>
                                        <Image
                                            source={require('../assets/images/facebook.png')}
                                            style={styles.socialIconModern}
                                        />
                                        <Text style={styles.socialText}>
                                            Facebook
                                        </Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        </View>
                    </View>
                </View>
            </ScrollView>

            <Modal
                transparent
                animationType="fade"
                visible={modalVisible}
                onRequestClose={() => setModalVisible(false)}>
                <View style={styles.modalOverlay}>
                    <BlurView
                        style={StyleSheet.absoluteFill}
                        blurAmount={10}
                        reducedTransparencyFallbackColor="rgba(0,0,0,0.5)"
                    />

                    <View style={styles.modalContent}>
                        <Image
                            source={require('../assets/images/tts.png')}
                            style={{width: 64, height: 64, marginBottom: 16}}
                        />
                        <Text
                            style={{
                                fontSize: 20,
                                fontWeight: '600',
                                marginBottom: 6,
                            }}>
                            Verify your account
                        </Text>
                        <Text
                            style={{
                                fontSize: 14,
                                color: '#555',
                                textAlign: 'center',
                                marginBottom: 4,
                            }}>
                            Enter 4 digits verification code we have sent to
                        </Text>
                        <Text style={{fontWeight: 'bold', marginBottom: 16}}>
                            {!isLoginData && values.email ? values.email : ''}
                        </Text>

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
                            renderCell={({index, symbol, isFocused}) => {
                                return (
                                    <View
                                        key={index}
                                        style={[
                                            CommonStyle.cell,
                                            isFocused && CommonStyle.focusCell,
                                            isError && CommonStyle.errorCell,
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
                                                (isFocused ? <Cursor /> : null)}
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
                                        fontSize: 12,
                                        color: Colors.themeColor,
                                    }}>
                                    Haven't received the code yet ? Send Again
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
                                        fontSize: 13,
                                        fontWeight: 'bold',
                                    }}>
                                    Haven't received the code yet? Resend OTP
                                </Text>
                            </TouchableOpacity>
                        )}

                        <CustomButton
                            title={'Verify and Register'}
                            onPress={handleVerifyaAndRegister}
                            disabled={value.length !== CELL_COUNT}
                        />
                    </View>
                </View>
            </Modal>
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
        borderRadius: 42,
        paddingHorizontal: 24,
        paddingTop: 24,
        paddingBottom: 36,
        backgroundColor: '#fff',
        shadowColor: '#000',
        shadowOffset: {width: 0, height: -4},
        shadowOpacity: 0.1,
        shadowRadius: 10,
        elevation: 10,
        marginHorizontal: 6,
        borderWidth: 1,
        borderColor: '#16151640',
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
