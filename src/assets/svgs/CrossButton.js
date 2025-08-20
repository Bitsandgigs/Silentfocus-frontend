import * as React from "react";
import Svg, { G, Circle, Path, Defs, ClipPath, Rect } from "react-native-svg";
const CrossButton = (props) => (
  <Svg
    xmlns="http://www.w3.org/2000/svg"
    width={22}
    height={22}
    viewBox="0 0 22 22"
    fill="none"
    {...props}
  >
    <G clipPath="url(#clip0_1_1536)">
      <Circle cx={11} cy={11} r={11} fill="white" />
      <Path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M14.8892 13.915C15.158 14.1831 15.158 14.6231 14.8892 14.8913C14.6211 15.1594 14.1852 15.1594 13.9164 14.8913L11.0041 11.9763L8.07124 14.9118C7.80037 15.18 7.36177 15.18 7.09089 14.9118C6.82071 14.6368 6.82071 14.1969 7.09089 13.9288L10.0238 10.9931L7.1115 8.08501C6.84268 7.81688 6.84268 7.37685 7.1115 7.10873C7.37893 6.8406 7.81481 6.8406 8.08362 7.10873L10.9959 10.0237L13.9507 7.06752C14.2216 6.7994 14.6595 6.7994 14.9304 7.06752C15.2006 7.34252 15.2006 7.7756 14.9304 8.0506L11.9762 11.0069L14.8892 13.915ZM11 0C4.92456 0 0 4.9225 0 11C0 17.0775 4.92456 22 11 22C17.0754 22 22 17.0775 22 11C22 4.9225 17.0754 0 11 0Z"
        fill="black"
      />
    </G>
    <Defs>
      <ClipPath id="clip0_1_1536">
        <Rect width={22} height={22} fill="white" />
      </ClipPath>
    </Defs>
  </Svg>
);
export default CrossButton;
