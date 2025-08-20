import React from 'react';

// Lib
import {createStackNavigator} from '@react-navigation/stack';

// Mics Constants
import LogoScreen from '../../screens/LogoScreen';
import OnboardingScreen from '../../screens/OnboardingScreen';

export default function GreetingsStack() {
  // Navigation
  const GreetingsStackNavigator = createStackNavigator();

  // Render Component
  return (
    <GreetingsStackNavigator.Navigator initialRouteName={'Onboarding'}>
      <GreetingsStackNavigator.Screen
        name={'Onboarding'}
        component={OnboardingScreen}
        options={{headerShown: false}}
      />
    </GreetingsStackNavigator.Navigator>
  );
}
