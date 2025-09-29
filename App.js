import React, {useEffect} from 'react';
import {Platform, StatusBar} from 'react-native';
import {Colors} from './src/utils/theme';
// Context Provider
import ContextProvider from './src/utils/context/contextProvider';
import {NavigationContainer} from '@react-navigation/native';
// Stack
import RootStack from './src/navigation/RootStack/RootStack';
import {ThemeProvider} from './src/context/ThemeContext';
import KeyboardManager from 'react-native-keyboard-manager';

export default function App() {
    useEffect(() => {
        if (Platform.OS === 'ios') {
            KeyboardManager.setEnable(true);
            KeyboardManager.setEnableDebugging(true);
            KeyboardManager.setKeyboardDistanceFromTextField(15);
            KeyboardManager.setLayoutIfNeededOnUpdate(true);
            KeyboardManager.setEnableAutoToolbar(true);
            KeyboardManager.setToolbarDoneBarButtonItemText('Done');

            KeyboardManager.setToolbarManageBehaviourBy('position'); // "subviews" | "tag" | "position"
            KeyboardManager.setToolbarPreviousNextButtonEnable(true);

            KeyboardManager.setToolbarTintColor(Colors.black); // Only #000000 format is supported
            KeyboardManager.setToolbarBarTintColor(Colors.textInput); // Only #000000 format is supported
            KeyboardManager.setShouldShowToolbarPlaceholder(false);
            KeyboardManager.setOverrideKeyboardAppearance(true);
            KeyboardManager.setShouldResignOnTouchOutside(true);
            KeyboardManager.setKeyboardAppearance('light'); // "default" | "light" | "dark"
            KeyboardManager.resignFirstResponder();
            KeyboardManager.setShouldPlayInputClicks(true);
            KeyboardManager.reloadLayoutIfNeeded();
            KeyboardManager.isKeyboardShowing().then(() => {
                // ...
            });
        }
    }, []);

    return (
        <>
            <ThemeProvider>
                <StatusBar
                    backgroundColor={Colors.white}
                    barStyle={'dark-content'}
                />
                <ContextProvider>
                    <NavigationContainer>
                        <RootStack />
                    </NavigationContainer>
                </ContextProvider>
            </ThemeProvider>
        </>
    );
}
