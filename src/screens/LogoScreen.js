import React, {useContext, useEffect, useRef, useState} from 'react';
import {
  View,
  Image,
  useColorScheme,
  StyleSheet,
  StatusBar,
  Animated,
  Easing,
} from 'react-native';
import {AppContext} from '../utils/context/contextProvider';
import SplashScreen from 'react-native-splash-screen';

// Same bitmap and size (180x49dp) as the native launch window background
// (android res/drawable/sf_launch_window.xml), so the hand-over from native to
// JS is seamless: the logo is already fully visible, it is never re-faded in
// from black. Only the exit (zoom out + fade) is animated.
const LOGO = require('../assets/images/silence_focus_splash_logo.png');
const HOLD_MS = 900;
const EXIT_MS = 600;

const LogoScreen = () => {
  const colorScheme = useColorScheme();
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  const backgroundColor = colorScheme === 'dark' ? '#000' : '#fff';
  const barStyle = colorScheme === 'dark' ? 'light-content' : 'dark-content';

  const {setIsSplashShow} = useContext(AppContext);

  // Until the JS logo bitmap is decoded the screen stays transparent so the native
  // window-background logo keeps showing (an opaque black View with a not-yet-drawn
  // Image caused a 2-3 frame blank flicker). Fallback so it can never stay transparent.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setReady(true), 700);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    Animated.sequence([
      Animated.delay(HOLD_MS),
      Animated.parallel([
        Animated.timing(scale, {
          toValue: 1.6,
          duration: EXIT_MS,
          useNativeDriver: true,
          easing: Easing.in(Easing.cubic),
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: EXIT_MS,
          useNativeDriver: true,
        }),
      ]),
    ]).start();

    const timeout = setTimeout(() => {
      setIsSplashShow(false);
    }, HOLD_MS + EXIT_MS);

    return () => clearTimeout(timeout);
  }, [scale, opacity, setIsSplashShow]);

  useEffect(() => {
    // No-op now that no native splash dialog is shown; kept for safety.
    SplashScreen.hide();
  }, []);

  return (
    <View
      style={[
        styles.container,
        {backgroundColor: ready ? backgroundColor : 'transparent'},
      ]}>
      <StatusBar backgroundColor={backgroundColor} barStyle={barStyle} />
      <Animated.View style={{transform: [{scale}], opacity}}>
        <Image
          source={LOGO}
          style={[styles.logo, {opacity: ready ? 1 : 0}]}
          resizeMode="contain"
          fadeDuration={0}
          onLoad={() => setReady(true)}
        />
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logo: {
    width: 180,
    height: 49,
  },
});

export default LogoScreen;
