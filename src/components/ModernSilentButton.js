
// import React from 'react';
// import { View, Text, StyleSheet, useColorScheme } from 'react-native';
// import Svg, { Circle, Path, Defs, LinearGradient, Stop } from 'react-native-svg';

// const ModernSilentButton = ({ silentMode, timerFormatted }) => {
//   const colorScheme = useColorScheme();
//   const isLight = colorScheme === 'light';

//   const outerFill = silentMode
//     ? '#388E3C'
//     : isLight
//     ? 'url(#outerGrad)'
//     : '#555555';
//   const outerOpacity = silentMode ? 0.65 : isLight ? 1 : 0.15;

//   const innerFill = silentMode
//     ? '#4CAF50'
//     : isLight
//     ? 'url(#innerGrad)'
//     : '#555555';
//   const innerOpacity = silentMode ? 1 : isLight ? 1 : 0.15;

//   const iconStroke = silentMode ? '#FFFFFF' : isLight ? '#FFFFFF' : 'url(#grad)';

//   return (
//     <View style={styles.wrapper}>
//       {/* Outer Circle */}
//       <Svg width={250} height={250} viewBox="0 0 250 250" style={styles.outer}>
//         <Defs>
//           <LinearGradient id="outerGrad" x1="0" y1="0" x2="1" y2="1">
//             <Stop offset="0%" stopColor="#F08A2C" stopOpacity={0.35} />
//             <Stop offset="100%" stopColor="#8A4F19" stopOpacity={0.35} />
//           </LinearGradient>
//         </Defs>
//         <Circle cx="125" cy="125" r="125" fill={outerFill} fillOpacity={outerOpacity} />
//       </Svg>

//       {/* Inner Circle */}
//       <Svg width={183} height={183} viewBox="0 0 183 183" style={styles.inner}>
//         <Defs>
//           <LinearGradient id="innerGrad" x1="0" y1="0" x2="1" y2="1">
//             <Stop offset="0%" stopColor="#F08A2C" />
//             <Stop offset="100%" stopColor="#8A4F19" />
//           </LinearGradient>
//         </Defs>
//         <Circle cx="91.5" cy="91.5" r="91.5" fill={innerFill} fillOpacity={innerOpacity} />
//       </Svg>

//       {/* Inside Content: Timer or Icon */}
//       {silentMode ? (
//         <Text style={styles.timerText}>{timerFormatted}</Text>
//       ) : (
//         <Svg width={75} height={75} viewBox="0 0 75 75">
//           <Defs>
//             <LinearGradient id="grad" x1="0" y1="0" x2="1" y2="1">
//               <Stop offset="0%" stopColor="#D6721E" />
//               <Stop offset="100%" stopColor="#A15200" />
//             </LinearGradient>
//           </Defs>
//           <Path
//             d="M33.125 15.625L40.625 9.375V25M9.375 9.375L65.625 65.625M40.625 56.25V65.625L21.875 50H15.625C12.1732 50 9.375 47.2019 9.375 43.75V31.25C9.375 30.1116 9.67934 29.0443 10.2111 28.125"
//             stroke={iconStroke}
//             fill="none"
//             strokeWidth={5}
//             strokeLinecap="round"
//             strokeLinejoin="round"
//           />
//         </Svg>
//       )}

//       {/* Below Label */}
//            <Text style={styles.modeLabel}>
//   Silent Mode{'\n'}{silentMode ? 'ON' : 'OFF'}
// </Text>
//     </View>
//   );
// };

// const styles = StyleSheet.create({
//   wrapper: {
//     width: 250,
//     height: 250,
//     alignItems: 'center',
//     justifyContent: 'center',
//     position: 'relative',
//   },
//   outer: {
//     position: 'absolute',
//     top: 0,
//     left: 0,
//   },
//   inner: {
//     position: 'absolute',
//     top: 33.5,
//     left: 33.5,
//   },
//   timerText: {
//     width: 142,
//     height: 42,
//     textAlign: 'center',
//     color: '#FAFAFA',
//     fontFamily: 'Roboto',
//     fontSize: 36,
//     fontWeight: '400',
//   },
//   modeLabel: {
//     position: 'absolute',
//     bottom: 44,
//     width: 114,
//     textAlign: 'center',
//     color: 'rgba(250, 250, 250, 0.75)',
//     fontFamily: 'Roboto',
//     fontSize: 13,
//     fontWeight: '300',
//     lineHeight: 16,
//     paddingBottom: 2,
//   },
// });

// export default ModernSilentButton;
import React from 'react';
import { View, Text, StyleSheet, useColorScheme } from 'react-native';
import Svg, { Circle, Path, Defs, LinearGradient, Stop } from 'react-native-svg';
import { widthPercentageToDP as wp, heightPercentageToDP as hp } from 'react-native-responsive-screen';

const ModernSilentButton = ({ silentMode, timerFormatted }) => {
  const colorScheme = useColorScheme();
  const isLight = colorScheme === 'light';

  const outerFill = silentMode ? '#388E3C' : isLight ? 'url(#outerGrad)' : '#555555';
  const outerOpacity = silentMode ? 0.65 : isLight ? 1 : 0.15;

  const innerFill = silentMode ? '#4CAF50' : isLight ? 'url(#innerGrad)' : '#555555';
  const innerOpacity = silentMode ? 1 : isLight ? 1 : 0.15;

  const iconStroke = silentMode ? '#FFFFFF' : isLight ? '#FFFFFF' : 'url(#grad)';

  return (
    <View style={styles.wrapper}>
      <Svg width={wp('65%')} height={wp('65%')} viewBox="0 0 250 250" style={styles.outer}>
        <Defs>
          <LinearGradient id="outerGrad" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0%" stopColor="#F08A2C" stopOpacity={0.35} />
            <Stop offset="100%" stopColor="#8A4F19" stopOpacity={0.35} />
          </LinearGradient>
        </Defs>
        <Circle cx="125" cy="125" r="125" fill={outerFill} fillOpacity={outerOpacity} />
      </Svg>

      <Svg width={wp('48%')} height={wp('48%')} viewBox="0 0 183 183" style={styles.inner}>
        <Defs>
          <LinearGradient id="innerGrad" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0%" stopColor="#F08A2C" />
            <Stop offset="100%" stopColor="#8A4F19" />
          </LinearGradient>
        </Defs>
        <Circle cx="91.5" cy="91.5" r="91.5" fill={innerFill} fillOpacity={innerOpacity} />
      </Svg>

      {silentMode ? (
        <Text style={styles.timerText}>{timerFormatted}</Text>
      ) : (
        <Svg width={wp('20%')} height={wp('20%')} viewBox="0 0 75 75">
          <Defs>
            <LinearGradient id="grad" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0%" stopColor="#D6721E" />
              <Stop offset="100%" stopColor="#A15200" />
            </LinearGradient>
          </Defs>
          <Path
            d="M33.125 15.625L40.625 9.375V25M9.375 9.375L65.625 65.625M40.625 56.25V65.625L21.875 50H15.625C12.1732 50 9.375 47.2019 9.375 43.75V31.25C9.375 30.1116 9.67934 29.0443 10.2111 28.125"
            stroke={iconStroke}
            fill="none"
            strokeWidth={5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      )}

      <Text style={styles.modeLabel}>
        Silent Mode{'\n'}{silentMode ? 'ON' : 'OFF'}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    width: wp('65%'),
    height: wp('65%'),
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  outer: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  inner: {
    position: 'absolute',
    top: wp('8.9%'),
    left: wp('8.9%'),
  },
  timerText: {
    width: wp('38%'),
    height: hp('5%'),
    textAlign: 'center',
    color: '#FAFAFA',
    fontFamily: 'Roboto',
    fontSize: wp('8.5%'),
    fontWeight: '400',
  },
  modeLabel: {
    position: 'absolute',
    bottom: hp('5.5%'),
    width: wp('30%'),
    textAlign: 'center',
    color: 'rgba(250, 250, 250, 0.75)',
    fontFamily: 'Roboto',
    fontSize: wp('3.2%'),
    fontWeight: '300',
    lineHeight: hp('2.2%'),
  },
});

export default ModernSilentButton;
