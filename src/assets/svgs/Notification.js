import * as React from 'react';
import Svg, {Path, Defs, LinearGradient, Stop} from 'react-native-svg';
const NotificationIcon = props => (
  <Svg
    xmlns="http://www.w3.org/2000/svg"
    width={24}
    height={24}
    viewBox="0 0 24 24"
    fill="none"
    {...props}>
    <Path
      d="M8.78467 19.8782C9.58865 20.9002 10.8517 21.5588 12.2719 21.5588C13.6921 21.5588 14.9551 20.9002 15.7591 19.8782C13.4442 20.1919 11.0996 20.1919 8.78467 19.8782Z"
      fill="url(#paint0_linear_1_1351)"
    />
    <Path
      d="M18.7231 9.13242V9.80545C18.7231 10.6132 18.9537 11.4028 19.3857 12.0748L20.4442 13.7218C21.4112 15.226 20.673 17.2707 18.9913 17.7464C14.592 18.9908 9.95167 18.9908 5.55237 17.7464C3.87068 17.2707 3.13253 15.226 4.09943 13.7218L5.15801 12.0748C5.58999 11.4028 5.8205 10.6132 5.8205 9.80545V9.13242C5.8205 5.43701 8.70886 2.44128 12.2718 2.44128C15.8348 2.44128 18.7231 5.43701 18.7231 9.13242Z"
      fill="url(#paint1_linear_1_1351)"
    />
    <Defs>
      <LinearGradient
        id="paint0_linear_1_1351"
        x1={12.2719}
        y1={19.8782}
        x2={12.2719}
        y2={21.5588}
        gradientUnits="userSpaceOnUse">
        <Stop stopColor="#B87333" />
        <Stop offset={1} stopColor="#523317" />
      </LinearGradient>
      <LinearGradient
        id="paint1_linear_1_1351"
        x1={12.2718}
        y1={2.44128}
        x2={12.2718}
        y2={18.6797}
        gradientUnits="userSpaceOnUse">
        <Stop stopColor="#B87333" />
        <Stop offset={1} stopColor="#523317" />
      </LinearGradient>
    </Defs>
  </Svg>
);
export default NotificationIcon;
