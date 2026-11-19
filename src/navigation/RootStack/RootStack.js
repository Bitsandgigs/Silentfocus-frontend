import React, {useContext} from 'react';

// Lib
import {createStackNavigator} from '@react-navigation/stack';

// Mics Constants
import {AppContext} from '../../utils/context/contextProvider';
import {RootStackScreens} from './RootNavigation.types';
import {usePlanSync} from '../../utils/usePlanSync';

// Stack
import LoginStack from '../LoginStack/LoginStack';
import HomeStack from '../HomeStack/HomeStack';
import GreetingsStack from '../GreetingsStack/GreetingsStack';
import LogoScreen from '../../screens/LogoScreen';

export default function RootStack() {
    // Navigator Stack
    const RootStackNavigator = createStackNavigator();

    // Context Provider
    const {isSplashShow, isGetStarted, isLogin, isSessionLoaded} =
        useContext(AppContext);
    usePlanSync(isLogin);

    // Render Component. Offline is shown as a banner (see OfflineBanner),
    // never by swapping screens, so connectivity can't log the user out.
    return (
        <RootStackNavigator.Navigator
            screenOptions={{
                headerShown: false,
            }}>
            {isSplashShow || !isSessionLoaded ? (
                <RootStackNavigator.Screen
                    name={RootStackScreens.LogoScreen}
                    component={LogoScreen}
                    // Transparent card: the native launch window (logo) shows through
                    // until LogoScreen's own logo is drawn, so there is no black gap.
                    options={{cardStyle: {backgroundColor: 'transparent'}}}
                />
            ) : isGetStarted ? (
                <RootStackNavigator.Screen
                    name={RootStackScreens.GreetingsStack}
                    component={GreetingsStack}
                />
            ) : !isLogin ? (
                <RootStackNavigator.Screen
                    name={RootStackScreens.LoginStack}
                    component={LoginStack}
                    options={{
                        animationTypeForReplace: 'push',
                    }}
                />
            ) : (
                <RootStackNavigator.Screen
                    name={RootStackScreens.HomeStack}
                    component={HomeStack}
                    options={{
                        animationTypeForReplace: 'push',
                    }}
                />
            )}
        </RootStackNavigator.Navigator>
    );
}
