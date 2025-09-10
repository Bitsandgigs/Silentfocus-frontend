import React, {useState, useRef, useContext, useEffect} from 'react';
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
import {useNavigation} from '@react-navigation/native';
import {
    heightPercentageToDP as hp,
    widthPercentageToDP as wp,
} from 'react-native-responsive-screen';
import {useFormik} from 'formik';
import * as yup from 'yup';
import {hasNotch} from 'react-native-device-info';

// Component
import CustomButton from '../componentes/CustomButton/CustomButton';

// Mics Constants
import BackIcon from '../assets/svgs/Back';
import responsive from '../styles/responsive';
import {height, localize, setAsyncData} from '../function/commonFunctions';
import {Colors, Constants} from '../utils/theme';
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
import CommonStyle, {OTPTextInputStyles} from '../utils/theme/commonStyle';
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

    const handleVerifyaAndRegister = async () => {
        navigation.navigate(screens.ResetPasswordScreen);
        const payload = {
            email: values.email ? values.email : '',
            otp: value ? value : '',
        };
        // setIsLoading(true);
        // VerifyOtpApiCall(payload);
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
                'Password must be 6 characters minimum.',
                function (value) {
                    if (value === undefined) {
                        return false;
                    }
                    return value.length >= 6;
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
            // if (isLoginData) {
            //     const payload = {
            //         email: values.email ? values.email : '',
            //         password: values.password ? values.password : '',
            //     };
            //     setIsLoading(true);
            //     LoginApiCall(payload);
            // } else {
            //     const payload = {
            //         username: values.name ? values.name : '',
            //         email: values.email ? values.email : '',
            //         password: values.password ? values.password : '',
            //     };
            //     setIsLoading(true);
            //     RegisterApiCall(payload);
            // }
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
        // borderRadius: 42,
        paddingHorizontal: 24,
        paddingTop: 24,
        height: hp(35),
        paddingBottom: 36,
        // backgroundColor: '#fff',
        // shadowColor: '#000',
        // shadowOffset: {width: 0, height: -4},
        // shadowOpacity: 0.1,
        // shadowRadius: 10,
        // elevation: 10,
        marginHorizontal: 6,
        // borderWidth: 1,
        // borderColor: '#16151640',
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
