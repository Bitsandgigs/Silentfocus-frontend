import * as React from "react";
import Svg, { G, Path, Defs, ClipPath, Rect } from "react-native-svg";
const Facebook = (props) => (
  <Svg
    xmlns="http://www.w3.org/2000/svg"
    width={22}
    height={22}
    viewBox="0 0 22 22"
    fill="none"
    {...props}
  >
    <G clipPath="url(#clip0_1_794)">
      <Path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M11.7509 22H1.21423C0.543433 22 0 21.4562 0 20.7857V1.21422C0 0.543517 0.543518 0 1.21423 0H20.7859C21.4564 0 22 0.543517 22 1.21422V20.7857C22 21.4563 21.4563 22 20.7859 22H15.1797V13.4804H18.0393L18.4675 10.1601H15.1797V8.04038C15.1797 7.07909 15.4466 6.424 16.8251 6.424L18.5833 6.42323V3.45359C18.2792 3.41312 17.2355 3.32272 16.0213 3.32272C13.4864 3.32272 11.7509 4.87003 11.7509 7.71156V10.1601H8.88393V13.4804H11.7509V22Z"
        fill="#4460A0"
      />
    </G>
    <Defs>
      <ClipPath id="clip0_1_794">
        <Rect width={22} height={22} fill="white" />
      </ClipPath>
    </Defs>
  </Svg>
);
export default Facebook;
