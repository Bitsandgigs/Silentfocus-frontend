import * as React from "react";
import Svg, { Path } from "react-native-svg";
const Logout = (props) => (
  <Svg
    xmlns="http://www.w3.org/2000/svg"
    width={22}
    height={22}
    viewBox="0 0 22 22"
    fill="none"
    {...props}
  >
    <Path
      d="M8.15845 6.93021C8.44261 3.63021 10.1384 2.28271 13.8509 2.28271H13.9701C18.0676 2.28271 19.7084 3.92355 19.7084 8.02105V13.9977C19.7084 18.0952 18.0676 19.7361 13.9701 19.7361H13.8509C10.1659 19.7361 8.47011 18.4069 8.16761 15.1619"
      stroke="white"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <Path
      d="M13.75 11H3.31836"
      stroke="white"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <Path
      d="M5.36258 7.9292L2.29175 11L5.36258 14.0709"
      stroke="white"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);
export default Logout;
