import React from 'react';

// Lib
import {createStackNavigator} from '@react-navigation/stack';

// // Stack
// import BottomTabStack from './BottomTabStack';
// import {BottomTabScreens} from './BottomTab.types';

// Mics Constants
import {Screens} from '../../utils/theme';
import MainTabs from '../../MainTabs';
import LogoScreen from '../../screens/LogoScreen';

export default function HomeStack() {
  // Navigation
  const HomeStackNavigator = createStackNavigator();

  // Render Component
  return (
    <HomeStackNavigator.Navigator initialRouteName={'MainTabs'}>
      <HomeStackNavigator.Screen
        name={'MainTabs'}
        component={MainTabs}
        options={{headerShown: false}}
      />
    </HomeStackNavigator.Navigator>
  );
}
