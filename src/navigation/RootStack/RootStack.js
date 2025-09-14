import React, {useContext} from 'react';

// Lib
import {createStackNavigator} from '@react-navigation/stack';

// Mics Constants
import {AppContext} from '../../utils/context/contextProvider';
import {RootStackScreens} from './RootNavigation.types';

// Screens
// import {GetStartedScreen} from '../../container/GetStarted';
import {InternetConnectionScreen} from '../../container/InternetConnection';

// Stack
import LoginStack from '../LoginStack/LoginStack';
import HomeStack from '../HomeStack/HomeStack';
import GreetingsStack from '../GreetingsStack/GreetingsStack';
import LogoScreen from '../../screens/LogoScreen';

export default function RootStack() {
    // Navigator Stack
    const RootStackNavigator = createStackNavigator();

    // Context Provider
    const {isSplashShow, isGetStarted, isLogin, isInternetConnection} =
        useContext(AppContext);

    // Render Component
    return (
        <RootStackNavigator.Navigator
            screenOptions={{
                headerShown: false,
            }}>
            <>
                {!isInternetConnection ? (
                    {
                        /* <RootStackNavigator.Screen
            name={RootStackScreens.InternetConnectionScreen}
            component={InternetConnectionScreen}
            options={{
              animationTypeForReplace: 'push',
            }}
          /> */
                    }
                ) : (
                    <>
                        {isSplashShow ? (
                            <RootStackNavigator.Screen
                                name={RootStackScreens.LogoScreen}
                                component={LogoScreen}
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
                    </>
                )}
            </>
        </RootStackNavigator.Navigator>
    );
}
