

import React from 'react';
import { useColorScheme } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import CustomTabBar from './components/CustomTabar';

import HomeScreen from './screens/HomeScreen';
import ChatScreen from './screens/ActivityScreen';
import SettingsScreen from './screens/SettingScreen';
import ProfileScreen from './screens/ProfileScreen';

const Tab = createBottomTabNavigator();

const MainTabs = () => {
  const colorScheme = useColorScheme();

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        lazy: false,
      }}
      tabBar={(props) => <CustomTabBar {...props} theme={colorScheme} />} // 👈 pass theme here
    >
      <Tab.Screen name="Home" component={HomeScreen} options={{ unmountOnBlur: false }} />
<Tab.Screen
  name="Missed"
  component={ChatScreen}
  options={{
    tabBarIcon: ({ focused }) => <ActivityIcon focused={focused} />,
  }}
/>

      <Tab.Screen name="Control" component={SettingsScreen} options={{ unmountOnBlur: false }} />
      <Tab.Screen name="Accounts" component={ProfileScreen} options={{ unmountOnBlur: false }} />
    </Tab.Navigator>
  );
};

export default MainTabs;
