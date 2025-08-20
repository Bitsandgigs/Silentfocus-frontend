// components/SilentModeCircle.js
import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import SilentIcon from '../assets/svgs/Silent'; // your existing icon

const SilentModeCircle = ({ isDark }) => {
  return (
    <View style={styles.wrapper}>
      <Svg width={250} height={250} viewBox="0 0 250 250" style={styles.outer}>
        <Circle cx="125" cy="125" r="125" fill="#555555" fillOpacity="0.15" />
      </Svg>
      <Svg width={183} height={183} viewBox="0 0 183 183" style={styles.inner}>
        <Circle cx="91.5" cy="91.5" r="91.5" fill="#555555" fillOpacity="0.15" />
      </Svg>
      <View style={styles.iconContainer}>
        <SilentIcon stroke={isDark ? '#FFFFFF' : '#000000'} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    width: 250,
    height: 250,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  outer: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  inner: {
    position: 'absolute',
    top: 33.5,
    left: 33.5,
  },
  iconContainer: {
    zIndex: 2,
  },
});

export default SilentModeCircle;
