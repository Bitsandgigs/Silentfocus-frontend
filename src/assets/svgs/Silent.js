

import * as React from "react";
import Svg, { Path, Defs, LinearGradient, Stop } from "react-native-svg";
const SilentIcon = (props) => (
  <Svg
    xmlns="http://www.w3.org/2000/svg"
    width={75}
    height={75}
    viewBox="0 0 75 75"
    fill="none"
    {...props}
  >
    <Path
      d="M33.125 15.625L40.625 9.375V25M9.375 9.375L65.625 65.625M40.625 56.25V65.625L21.875 50H15.625C12.1732 50 9.375 47.2019 9.375 43.75V31.25C9.375 30.1116 9.67934 29.0443 10.2111 28.125"
      stroke="url(#paint0_linear_1_1390)"
      strokeWidth={5}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <Defs>
      <LinearGradient
        id="paint0_linear_1_1390"
        x1={37.5}
        y1={9.375}
        x2={37.5}
        y2={65.625}
        gradientUnits="userSpaceOnUse"
      >
        <Stop stopColor="#B87333" />
        <Stop offset={1} stopColor="#523317" />
      </LinearGradient>
    </Defs>
  </Svg>
);
export default SilentIcon;

