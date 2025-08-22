import React, {useContext, useEffect, useRef} from 'react';
import {
  View,
  useColorScheme,
  StyleSheet,
  StatusBar,
  Animated,
  Easing,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {SafeAreaView} from 'react-native-safe-area-context';
import Svg, {
  Defs,
  LinearGradient,
  Stop,
  Text as SvgText,
} from 'react-native-svg';
import Logo from '../assets/svgs/logo'; // Mic+Slash Icon SVG
import {AppContext} from '../utils/context/contextProvider';
import SplashScreen from 'react-native-splash-screen';
const LogoScreen = () => {
  const navigation = useNavigation();
  const colorScheme = useColorScheme();
  const scale = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  const backgroundColor = colorScheme === 'dark' ? '#000' : '#fff';
  const barStyle = colorScheme === 'dark' ? 'light-content' : 'dark-content';

  const {setIsSplashShow} = useContext(AppContext);

  useEffect(() => {
    // Step 1: Animate logo from inside out (scale + fade in)
    Animated.sequence([
      Animated.parallel([
        Animated.timing(scale, {
          toValue: 1,
          duration: 1200,
          useNativeDriver: true,
          easing: Easing.out(Easing.exp),
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ]),
      Animated.delay(500), // Hold the logo briefly

      // Step 2: Exit animation (fade out + zoom out)
      Animated.parallel([
        Animated.timing(scale, {
          toValue: 1.6,
          duration: 600,
          useNativeDriver: true,
          easing: Easing.in(Easing.cubic),
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 600,
          useNativeDriver: true,
        }),
      ]),
    ]).start();

    // Step 3: Navigate after animation finishes
    const timeout = setTimeout(() => {
      setIsSplashShow(false);
    }, 2500); // Total time of full animation

    return () => clearTimeout(timeout);
  }, [navigation, scale, opacity]);

  useEffect(() => {
    SplashScreen.hide();
  }, []);

  return (
    <SafeAreaView style={[styles.container, {backgroundColor}]}>
      <StatusBar backgroundColor={backgroundColor} barStyle={barStyle} />

      <Animated.View
        style={[
          styles.logoWrapper,
          {
            transform: [{scale}],
            opacity,
          },
        ]}>
        <Logo width={48} height={48} style={{marginRight: 12}} />
        <Svg height="50" width="200">
          <Defs>
            <LinearGradient id="grad" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0%" stopColor="#F08A2C" />
              <Stop offset="100%" stopColor="#8A4F19" />
            </LinearGradient>
          </Defs>
          <SvgText
            fill="url(#grad)"
            fontSize="28"
            fontWeight="bold"
            x="0"
            y="35">
            Silent Focus
          </SvgText>
        </Svg>
      </Animated.View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  // container: {
  //   flex: 1,
  //   backgroundColor: '#ffffff',
  //   justifyContent: 'center',
  //   alignItems: 'center',
  // },
  // logoContainer: {
  //   width: 200,
  //   height: 200,
  //   justifyContent: 'center',
  //   alignItems: 'center',
  // },
  // logo: {
  //   width: '100%',
  //   height: '100%',
  // },
});

export default LogoScreen;
