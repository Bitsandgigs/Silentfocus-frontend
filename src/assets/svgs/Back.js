import * as React from "react";
import Svg, { Circle, Path } from "react-native-svg";

const Back = ({ color = 'white', ...props }) => (
  <Svg
    xmlns="http://www.w3.org/2000/svg"
    width={35}
    height={35}
    viewBox="0 0 35 35"
    fill="none"
    {...props}
  >
    <Circle cx={17.5} cy={17.5} r={17} stroke={color} />
    <Path
      d="M10.6464 18.1464C10.4512 18.3417 10.4512 18.6583 10.6464 18.8536L13.8284 22.0355C14.0237 22.2308 14.3403 22.2308 14.5355 22.0355C14.7308 21.8403 14.7308 21.5237 14.5355 21.3284L11.7071 18.5L14.5355 15.6716C14.7308 15.4763 14.7308 15.1597 14.5355 14.9645C14.3403 14.7692 14.0237 14.7692 13.8284 14.9645L10.6464 18.1464ZM25 19C25.2761 19 25.5 18.7761 25.5 18.5C25.5 18.2239 25.2761 18 25 18V19ZM11 18.5V19H25V18.5V18H11V18.5Z"
      fill={color}
    />
  </Svg>
);
export default Back;
