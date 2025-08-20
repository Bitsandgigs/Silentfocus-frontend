import React from 'react';
import {  StatusBar, KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';
import AppNavigator from './src/navigations/AppNavigator'; // adjust the path as needed
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { enableScreens } from 'react-native-screens';

enableScreens();

const App = () => {
  return (
   <SafeAreaProvider>
<StatusBar backgroundColor="#000000" barStyle="light-content" />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoiding}
      >
        <AppNavigator />
      </KeyboardAvoidingView>
      </SafeAreaProvider>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#000', // Match status bar color if desired
  },
  keyboardAvoiding: {
    flex: 1,
  },
});

export default App;
