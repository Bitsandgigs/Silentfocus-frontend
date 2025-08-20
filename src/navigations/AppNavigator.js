import React from 'react';
import {NavigationContainer} from '@react-navigation/native';
import {CardStyleInterpolators} from '@react-navigation/stack';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import LogoScreen from '../screens/LogoScreen';
import WelcomeScreen1 from '../screens/Welcome1Screen';
import WelcomeScreen2 from '../screens/Welcome2Screen';
import WelcomeScreen3 from '../screens/Welcome3Screen';
import PermissionScreen from '../screens/PermissionScreen';
import LoginScreen from '../screens/LoginScreen';
import MainTabs from '../MainTabs';
import {ThemeProvider} from '../context/ThemeContext';
import OnboardingScreen from '../screens/OnboardingScreen';
//import HomeScreen from '../screens/HomeScreen';

const Stack = createNativeStackNavigator();

const AppNavigator = () => {
  return (
    <ThemeProvider>
      <NavigationContainer>
        <Stack.Navigator
          initialRouteName="Logo"
          screenOptions={{
            headerShown: false,
            cardStyleInterpolator: CardStyleInterpolators.forHorizontalIOS, // 👈 add this line
          }}>
          <Stack.Screen
            name="Logo"
            component={LogoScreen}
            options={{headerShown: false}}
          />
          <Stack.Screen
            name="Welcome1"
            component={WelcomeScreen1}
            options={{headerShown: false}}
          />
          <Stack.Screen
            name="Welcome2"
            component={WelcomeScreen2}
            options={{headerShown: false}}
          />
          <Stack.Screen
            name="Welcome3"
            component={WelcomeScreen3}
            options={{headerShown: false}}
          />
          <Stack.Screen
            name="Onboarding"
            component={OnboardingScreen}
            options={{headerShown: false}}
          />
          <Stack.Screen
            name="Permission"
            component={PermissionScreen}
            options={{headerShown: false}}
          />
          <Stack.Screen
            name="Login"
            component={LoginScreen}
            options={{headerShown: false}}
          />
          <Stack.Screen
            name="MainTabs"
            component={MainTabs}
            options={{headerShown: false}}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </ThemeProvider>
  );
};

export default AppNavigator;
