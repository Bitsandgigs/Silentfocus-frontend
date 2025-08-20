import * as React from "react";
import Svg, { Path } from "react-native-svg";
const clock = (props) => (
  <Svg
    xmlns="http://www.w3.org/2000/svg"
    width={22}
    height={22}
    viewBox="0 0 22 22"
    fill="none"
    {...props}
  >
    <Path
      d="M11 7.33325V10.9999L13.2917 13.2916"
      stroke="#B87333"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <Path
      d="M6.41671 3.05959C7.76501 2.27964 9.33042 1.83325 11 1.83325C16.0626 1.83325 20.1667 5.93731 20.1667 10.9999C20.1667 16.0625 16.0626 20.1666 11 20.1666C5.93743 20.1666 1.83337 16.0625 1.83337 10.9999C1.83337 9.3303 2.27976 7.76488 3.05971 6.41659"
      stroke="#B87333"
      strokeWidth={1.6}
      strokeLinecap="round"
    />
  </Svg>
);
export default clock;
