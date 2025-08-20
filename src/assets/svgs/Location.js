import * as React from 'react';
import Svg, {
  G,
  Path,
  Defs,
  LinearGradient,
  Stop,
  ClipPath,
  Rect,
} from 'react-native-svg';
const LocationIcon = props => (
  <Svg
    xmlns="http://www.w3.org/2000/svg"
    width={24}
    height={24}
    viewBox="0 0 24 24"
    fill="none"
    {...props}>
    <G clipPath="url(#clip0_1_1331)">
      <Path
        d="M12.4466 0.529541C7.69569 0.529541 3.84375 4.38149 3.84375 9.13243C3.84375 11.0032 4.45706 12.7198 5.47651 14.1257C5.49479 14.1594 5.49766 14.197 5.51845 14.2293L11.2537 22.8322C11.5197 23.2311 11.9677 23.4706 12.4466 23.4706C12.9255 23.4706 13.3736 23.2311 13.6396 22.8322L19.3748 14.2293C19.396 14.197 19.3985 14.1594 19.4168 14.1257C20.4362 12.7198 21.0495 11.0032 21.0495 9.13243C21.0495 4.38149 17.1976 0.529541 12.4466 0.529541ZM12.4466 12.0001C10.863 12.0001 9.57901 10.7161 9.57901 9.13243C9.57901 7.54878 10.863 6.2648 12.4466 6.2648C14.0303 6.2648 15.3143 7.54878 15.3143 9.13243C15.3143 10.7161 14.0303 12.0001 12.4466 12.0001Z"
        fill="url(#paint0_linear_1_1331)"
      />
    </G>
    <Defs>
      <LinearGradient
        id="paint0_linear_1_1331"
        x1={12.4466}
        y1={0.529541}
        x2={12.4466}
        y2={23.4706}
        gradientUnits="userSpaceOnUse">
        <Stop stopColor="#B87333" />
        <Stop offset={1} stopColor="#523317" />
      </LinearGradient>
      <ClipPath id="clip0_1_1331">
        <Rect
          width={22.941}
          height={22.941}
          fill="white"
          transform="translate(0.976074 0.529541)"
        />
      </ClipPath>
    </Defs>
  </Svg>
);
export default LocationIcon;
