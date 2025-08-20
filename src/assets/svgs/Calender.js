import * as React from 'react';
import Svg, {Path, Defs, LinearGradient, Stop} from 'react-native-svg';
const CalenderIcon = props => (
  <Svg
    xmlns="http://www.w3.org/2000/svg"
    width={24}
    height={24}
    viewBox="0 0 24 24"
    fill="none"
    {...props}>
    <Path
      d="M8.62311 12C8.0952 12 7.66724 12.4279 7.66724 12.9559C7.66724 13.4838 8.0952 13.9118 8.62311 13.9118H16.2701C16.7981 13.9118 17.226 13.4838 17.226 12.9559C17.226 12.4279 16.7981 12 16.2701 12H8.62311Z"
      fill="url(#paint0_linear_1_1340)"
    />
    <Path
      d="M7.66724 16.7795C7.66724 16.2516 8.0952 15.8236 8.62311 15.8236H12.4466C12.9746 15.8236 13.4025 16.2516 13.4025 16.7795C13.4025 17.3074 12.9746 17.7354 12.4466 17.7354H8.62311C8.0952 17.7354 7.66724 17.3074 7.66724 16.7795Z"
      fill="url(#paint1_linear_1_1340)"
    />
    <Path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M7.66732 2.44128C8.19523 2.44128 8.6232 2.86925 8.6232 3.39716V4.35304H16.2702V3.39716C16.2702 2.86925 16.6982 2.44128 17.2261 2.44128C17.754 2.44128 18.182 2.86925 18.182 3.39716V4.44864C20.3635 4.89147 22.0055 6.82019 22.0055 9.13242V16.7794C22.0055 19.419 19.8656 21.5588 17.2261 21.5588H7.66732C5.02775 21.5588 2.88794 19.419 2.88794 16.7794V9.13242C2.88794 6.82019 4.52991 4.89147 6.71145 4.44864V3.39716C6.71145 2.86925 7.13941 2.44128 7.66732 2.44128ZM20.0937 10.0883H4.79969V16.7794C4.79969 18.3632 6.08358 19.6471 7.66732 19.6471H17.2261C18.8099 19.6471 20.0937 18.3632 20.0937 16.7794V10.0883Z"
      fill="url(#paint2_linear_1_1340)"
    />
    <Defs>
      <LinearGradient
        id="paint0_linear_1_1340"
        x1={12.4466}
        y1={12}
        x2={12.4466}
        y2={13.9118}
        gradientUnits="userSpaceOnUse">
        <Stop stopColor="#B87333" />
        <Stop offset={1} stopColor="#523317" />
      </LinearGradient>
      <LinearGradient
        id="paint1_linear_1_1340"
        x1={10.5349}
        y1={15.8236}
        x2={10.5349}
        y2={17.7354}
        gradientUnits="userSpaceOnUse">
        <Stop stopColor="#B87333" />
        <Stop offset={1} stopColor="#523317" />
      </LinearGradient>
      <LinearGradient
        id="paint2_linear_1_1340"
        x1={12.4467}
        y1={2.44128}
        x2={12.4467}
        y2={21.5588}
        gradientUnits="userSpaceOnUse">
        <Stop stopColor="#B87333" />
        <Stop offset={1} stopColor="#523317" />
      </LinearGradient>
    </Defs>
  </Svg>
);
export default CalenderIcon;
