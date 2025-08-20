
import * as React from "react";
import Svg, { Path } from "react-native-svg";

const ProfileIcon = ({ color = "white", ...props }) => (
  <Svg
    xmlns="http://www.w3.org/2000/svg"
    width={22}
    height={22}
    viewBox="0 0 22 22"
    fill="none"
    {...props}
  >
    <Path
      d="M11.1468 9.96409C11.0551 9.95492 10.9451 9.95492 10.8443 9.96409C8.66255 9.89075 6.93005 8.10325 6.93005 5.90325C6.93005 3.65742 8.74505 1.83325 11.0001 1.83325C13.2459 1.83325 15.0701 3.65742 15.0701 5.90325C15.0609 8.10325 13.3284 9.89075 11.1468 9.96409Z"
      stroke={color}
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <Path
      d="M6.56329 13.3465C4.34495 14.8315 4.34495 17.2515 6.56329 18.7273C9.08412 20.414 13.2183 20.414 15.7391 18.7273C17.9575 17.2423 17.9575 14.8223 15.7391 13.3465C13.2275 11.669 9.09329 11.669 6.56329 13.3465Z"
      stroke={color}
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

export default ProfileIcon;
// import * as React from "react";
// import Svg, { Path, Defs, LinearGradient, Stop } from "react-native-svg";

// const ProfileIcon = (props) => (
//   <Svg
//     xmlns="http://www.w3.org/2000/svg"
//     width={22}
//     height={22}
//     viewBox="0 0 22 22"
//     fill="none"
//     {...props}
//   >
//     <Defs>
//       <LinearGradient id="copperGradient" x1="0" y1="0" x2="0" y2="22" gradientUnits="userSpaceOnUse">
//         <Stop offset="0%" stopColor="#B87333" />
//         <Stop offset="100%" stopColor="#523317" />
//       </LinearGradient>
//     </Defs>

//     {/* Head */}
//     <Path
//       d="M11.1468 9.96409C11.0551 9.95492 10.9451 9.95492 10.8443 9.96409C8.66255 9.89075 6.93005 8.10325 6.93005 5.90325C6.93005 3.65742 8.74505 1.83325 11.0001 1.83325C13.2459 1.83325 15.0701 3.65742 15.0701 5.90325C15.0609 8.10325 13.3284 9.89075 11.1468 9.96409Z"
//       stroke="url(#copperGradient)"
//       strokeWidth={1.6}
//       strokeLinecap="round"
//       strokeLinejoin="round"
//     />

//     {/* Shoulders / body */}
//     <Path
//       d="M6.56329 13.3465C4.34495 14.8315 4.34495 17.2515 6.56329 18.7273C9.08412 20.414 13.2183 20.414 15.7391 18.7273C17.9575 17.2423 17.9575 14.8223 15.7391 13.3465C13.2275 11.669 9.09329 11.669 6.56329 13.3465Z"
//       stroke="url(#copperGradient)"
//       strokeWidth={1.6}
//       strokeLinecap="round"
//       strokeLinejoin="round"
//     />
//   </Svg>
// );

// export default ProfileIcon;
