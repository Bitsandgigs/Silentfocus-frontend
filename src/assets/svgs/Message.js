import * as React from "react";
import Svg, { Path } from "react-native-svg";
const MessageIcon = (props) => (
  <Svg
    xmlns="http://www.w3.org/2000/svg"
    width={18}
    height={18}
    viewBox="0 0 18 18"
    fill="none"
    {...props}
  >
    <Path
      d="M6 13.5L7.7175 15.2175C7.8855 15.3867 8.0853 15.521 8.30543 15.6126C8.52555 15.7042 8.76158 15.7514 9 15.7514C9.23843 15.7514 9.47445 15.7042 9.69458 15.6126C9.9147 15.521 10.1145 15.3867 10.2825 15.2175L12 13.5H13.5C14.2957 13.5 15.0587 13.184 15.6213 12.6214C16.184 12.0587 16.5 11.2957 16.5 10.5V5.25C16.5 4.45435 16.184 3.69134 15.6213 3.12872C15.0587 2.56612 14.2957 2.25 13.5 2.25H4.5C3.70435 2.25 2.94129 2.56612 2.37868 3.12872C1.81607 3.69134 1.5 4.45435 1.5 5.25V10.5C1.5 11.2957 1.81607 12.0587 2.37868 12.6214C2.94129 13.184 3.70435 13.5 4.5 13.5H6Z"
      stroke="white"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <Path
      d="M12.75 6.75H5.25"
      stroke="white"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <Path
      d="M9.75 9H5.25"
      stroke="white"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);
export default MessageIcon;
