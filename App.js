import React from 'react';
import {StatusBar} from 'react-native';
import {Colors} from './src/utils/theme';
// Context Provider
import ContextProvider from './src/utils/context/contextProvider';
import {NavigationContainer} from '@react-navigation/native';
// Stack
import RootStack from './src/navigation/RootStack/RootStack';
import {ThemeProvider} from './src/context/ThemeContext';

export default function App() {
  return (
    <>
      <ThemeProvider>
        <StatusBar backgroundColor={Colors.white} barStyle={'dark-content'} />
        <ContextProvider>
          <NavigationContainer>
            <RootStack />
          </NavigationContainer>
        </ContextProvider>
      </ThemeProvider>
    </>
  );
}
