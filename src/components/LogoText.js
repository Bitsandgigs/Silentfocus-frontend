// components/LogoText.js
import React from 'react';
import Svg, { Defs, LinearGradient, Stop, Text } from 'react-native-svg';

const LogoText = () => {
  return (
    <Svg width={220} height={60}>
      <Defs>
        <LinearGradient id="grad" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0%" stopColor="#F08A2C" />
          <Stop offset="100%" stopColor="#8A4F19" />
        </LinearGradient>
      </Defs>
      <Text
        fill="url(#grad)"
        fontSize="28"
        fontWeight="bold"
        x="0"
        y="40"
      >
        Silent Focus
      </Text>
    </Svg>
  );
};

export default LogoText;
