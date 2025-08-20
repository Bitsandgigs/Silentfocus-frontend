// ThemeContext.js
import React, {createContext, useEffect, useState} from 'react';
import {useColorScheme} from 'react-native';

export const ThemeContext = createContext();

export const ThemeProvider = ({children}) => {
  const systemColorScheme = useColorScheme();
  const [theme, setTheme] = useState({
    backgroundColor: systemColorScheme === 'dark' ? '#000' : '#fff',
    textColor: systemColorScheme === 'dark' ? '#fff' : '#000',
    descColor: systemColorScheme === 'dark' ? '#ccc' : '#444',
    isDark: systemColorScheme === 'dark',
  });

  useEffect(() => {
    // Update theme when system color scheme changes
    setTheme({
      backgroundColor: systemColorScheme === 'dark' ? '#000' : '#fff',
      textColor: systemColorScheme === 'dark' ? '#fff' : '#000',
      descColor: systemColorScheme === 'dark' ? '#ccc' : '#444',
      isDark: systemColorScheme === 'dark',
    });
  }, [systemColorScheme]);

  return (
    <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>
  );
};
