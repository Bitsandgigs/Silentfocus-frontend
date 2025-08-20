import React from 'react';

// Lib
import {createStackNavigator} from '@react-navigation/stack';

// Mics Constants
import {Screens} from '../../utils/theme';
import PermissionScreen from '../../screens/PermissionScreen';
import LoginScreen from '../../screens/LoginScreen';

export default function LoginStack() {
  // Navigation
  const LoginStackNavigator = createStackNavigator();

  // Render Component
  return (
    <LoginStackNavigator.Navigator initialRouteName={'PermissionScreen'}>
      <LoginStackNavigator.Screen
        name={'PermissionScreen'}
        component={PermissionScreen}
        options={{headerShown: false}}
      />
      <LoginStackNavigator.Screen
        name="Login"
        component={LoginScreen}
        options={{headerShown: false}}
      />
    </LoginStackNavigator.Navigator>
  );
}
