import React from 'react';

// Lib
import {createStackNavigator} from '@react-navigation/stack';

// Mics Constants
import LoginScreen from '../../screens/LoginScreen';
import PermissionScreen from '../../screens/PermissionScreen';
import screens from '../../utils/theme/screens';
import ForgotPasswordScreen from '../../screens/ForgotPasswordScreen';
import VerifyOtpScreen from '../../screens/VerifyOtpScreen';
import ResetPasswordScreen from '../../screens/ResetPasswordScreen';

export default function LoginStack() {
    // Navigation
    const LoginStackNavigator = createStackNavigator();

    // Render Component
    return (
        <LoginStackNavigator.Navigator
            initialRouteName={screens.PermissionScreen}>
            <LoginStackNavigator.Screen
                name={screens.PermissionScreen}
                component={PermissionScreen}
                options={{headerShown: false}}
            />
            <LoginStackNavigator.Screen
                name={screens.LoginScreen}
                component={LoginScreen}
                options={{headerShown: false}}
            />
            <LoginStackNavigator.Screen
                name={screens.ForgotPasswordScreen}
                component={ForgotPasswordScreen}
                options={{headerShown: false}}
            />
            <LoginStackNavigator.Screen
                name={screens.VerifyOtpScreen}
                component={VerifyOtpScreen}
                options={{headerShown: false}}
            />
            <LoginStackNavigator.Screen
                name={screens.ResetPasswordScreen}
                component={ResetPasswordScreen}
                options={{headerShown: false}}
            />
        </LoginStackNavigator.Navigator>
    );
}
