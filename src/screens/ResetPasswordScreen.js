import React, {useState, useEffect} from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    ScrollView,
    SafeAreaView,
} from 'react-native';

// Lib
import {useNavigation, useRoute} from '@react-navigation/native';
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
import {height, localize} from '../function/commonFunctions';
import {Colors, Constants, Images} from '../utils/theme';
import {validatePassword} from '../function/validation';

// API
import EndPoints from '../utils/api/endpoints';
import APICall from '../utils/api/api';
import {showAlert} from '../function/Alert';
import CustomLoader from '../componentes/CustomLoader/CustomLoader';
import CustomTextInputView from '../componentes/CustomTextInputView/CustomTextInputView';
import screens from '../utils/theme/screens';

export default function ResetPasswordScreen() {
    // navigation
    const navigation = useNavigation();
    const route = useRoute();
    const {email} = route.params;

    // useState
    const [isShowPassword, setIsShowPassword] = useState(false);
    const [isShowConfirmPassword, setIsShowConfirmPassword] = useState(false);

    const [hasErrors, setHasErrors] = useState(false);

    // useState
    const [isLoading, setIsLoading] = useState(false);

    const validationSchema = yup.object().shape({
        password: yup
            .string()
            .test(
                'min-password',
                'Password must be at least 8 characters long.',
                function (value) {
                    if (value === undefined) {
                        return false;
                    }

                    return value.length >= 8; // Changed to >= to include passwords exactly 8 characters long
                },
            )
            .test(
                'valid-password',
                'Your password must be at least 8 characters long and contain at least one digit and one non-digit character.',
                function (value) {
                    if (value === undefined) {
                        return false;
                    }

                    return validatePassword(value);
                },
            ),
        confirmPassword: yup
            .string()
            .test(
                'valid-confirm-password',
                'Password and Confirm Password do not match.',
                function (value) {
                    return (
                        value === this.parent.password &&
                        !formik.errors.password
                    );
                },
            ),
    });

    const formik = useFormik({
        initialValues: {
            password: '',
            confirmPassword: '',
        },
        validateOnBlur: false,
        validateOnChange: hasErrors,
        validateOnMount: false,
        onSubmit: values => {
            const payload = {
                email: email ? email : '',
                new_password: values.password ? values.password : '',
                confirm_password: values.confirmPassword
                    ? values.confirmPassword
                    : '',
            };
            setIsLoading(true);
            ResetPasswordApiCall(payload);
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

    const onPressRightIconEye = () => {
        setIsShowConfirmPassword(!isShowConfirmPassword);
    };

    const ResetPasswordApiCall = async payload => {
        const url = EndPoints.resetNewPassword;

        await APICall('post', payload, url).then(response => {
            setIsLoading(false);
            if (
                response?.statusCode === Constants.apiStatusCode.success &&
                response?.data
            ) {
                const responseData = response?.data;

                if (responseData?.status === '1') {
                    navigation.navigate(screens.LoginScreen);
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
                        <Text style={styles.heading}>{localize('SF23')}</Text>
                        <Text style={styles.subheading}>
                            {localize('SF24')}
                        </Text>
                    </View>

                    <View style={styles.outerCard}>
                        <View style={styles.cardWrapper}>
                            <View>
                                <CustomTextInputView
                                    key={'input_1'}
                                    placeholder={'Password'}
                                    label={'Password'}
                                    value={values.password}
                                    onChangeText={handleChange('password')}
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

                                <CustomTextInputView
                                    key={'input_2'}
                                    label={'Confirm Password'}
                                    placeholder={'Confirm Password'}
                                    value={values.confirmPassword}
                                    onChangeText={handleChange(
                                        'confirmPassword',
                                    )}
                                    secureTextEntry={!isShowConfirmPassword}
                                    leftIcon={Images.iconPassword}
                                    rightIcon={
                                        isShowConfirmPassword
                                            ? Images.iconEyeOff
                                            : Images.iconEyeOn
                                    }
                                    onPressRightIcon={onPressRightIconEye}
                                    errorMessage={errors.confirmPassword}
                                    isValid={
                                        !errors.confirmPassword ||
                                        values.confirmPassword === ''
                                    }
                                    autoCapitalize={'none'}
                                    returnKeyType={'done'}
                                    autoCorrect={false}
                                />
                                <CustomButton
                                    title={localize('SF25')}
                                    onPress={handleSubmit}
                                    disabled={
                                        values.password === '' ||
                                        values.confirmPassword === ''
                                    }
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
        height: hp(50),
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
