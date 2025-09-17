import React from 'react';

// Lib
import {createStackNavigator} from '@react-navigation/stack';

// // Stack
// import BottomTabStack from './BottomTabStack';
// import {BottomTabScreens} from './BottomTab.types';

// Mics Constants

import MainTabs from '../../MainTabs';
import ScheduleTimeScreen from '../../screens/ScheduleTimeScreen';
import EditScheduleTimeScreen from '../../screens/EditScheduleTimeScreen';
import screens from '../../utils/theme/screens';

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
            <HomeStackNavigator.Screen
                name={screens.ScheduleTimeScreen}
                component={ScheduleTimeScreen}
                options={{headerShown: false}}
            />
            <HomeStackNavigator.Screen
                name={screens.EditScheduleTimeScreen}
                component={EditScheduleTimeScreen}
                options={{headerShown: false}}
            />
        </HomeStackNavigator.Navigator>
    );
}
