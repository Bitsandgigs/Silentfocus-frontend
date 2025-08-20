import React, {useEffect, useState} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  useColorScheme,
  Dimensions,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import HomeIcon from '../assets/svgs/HomeIcon';
import MissedIcon from '../assets/svgs/ActivityIcon';
import ControlIcon from '../assets/svgs/SettingIcon';
import ProfileIcon from '../assets/svgs/ProfileIcon';
import {heightPercentageToDP as hp} from 'react-native-responsive-screen';

const icons = {
  Home: <HomeIcon />,
  Missed: <MissedIcon />,
  Control: <ControlIcon />,
  Accounts: <ProfileIcon />,
};

const labels = {
  Home: 'Home',
  Missed: 'Activity',
  Control: 'Control',
  Accounts: 'Accounts',
};

const {width} = Dimensions.get('window');

const CustomTabBar = ({state, navigation}) => {
  const insets = useSafeAreaInsets();
  const [paddingBottom, setPaddingBottom] = useState(hp('2%'));
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  useEffect(() => {
    if (insets.bottom == 24) {
      console.log('insets bottom: ', insets.bottom);
      setPaddingBottom(hp(2)); // More padding for button navigation
    } else {
      console.log('insets bottom: ', insets.bottom);
      setPaddingBottom(hp(2)); // Less padding for gesture navigation
    }
  }, []);

  return (
    <View style={[styles.absoluteContainer, {paddingBottom}]}>
      <View
        style={[
          styles.tabBar,
          {
            backgroundColor: isDark ? '#111' : '#222',
            borderColor: '#333',
          },
        ]}>
        {state.routes.map((route, index) => {
          const isFocused = state.index === index;
          const label = labels[route.name];
          const Icon = icons[route.name];

          const onPress = () => {
            if (!isFocused) navigation.navigate(route.name);
          };

          return (
            <TouchableOpacity
              key={route.key}
              onPress={onPress}
              activeOpacity={0.8}
              style={isFocused ? styles.activeTab : styles.inactiveTab}>
              <View style={styles.iconRow}>
                {React.cloneElement(Icon, {
                  width: 22,
                  height: 22,
                  color: isFocused ? '#FFA43A' : '#fff',
                })}
                {isFocused && <Text style={styles.activeLabel}>{label}</Text>}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  absoluteContainer: {
    position: 'absolute',
    bottom: 0,
    width: '100%',
    alignItems: 'center',
    zIndex: 100,
  },
  tabBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    borderRadius: 40,
    width: width - 30,
    height: 75,
    paddingHorizontal: 16,
    borderWidth: 1,
  },
  activeTab: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 42,
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  inactiveTab: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  activeLabel: {
    color: '#FFA43A',
    fontWeight: '600',
    fontSize: 14,
    marginLeft: 6,
  },
});

export default CustomTabBar;
// import React from 'react';
// import {
//   View,
//   Text,
//   TouchableOpacity,
//   StyleSheet,
//   useColorScheme,
//   Dimensions,
// } from 'react-native';
// import { useSafeAreaInsets } from 'react-native-safe-area-context';

// import HomeIcon from '../assets/svgs/HomeIcon';
// import MissedIcon from '../assets/svgs/ActivityIcon';
// import ControlIcon from '../assets/svgs/SettingIcon';
// import ProfileIcon from '../assets/svgs/ProfileIcon';

// const icons = {
//   Home: <HomeIcon />,
//   Missed: <MissedIcon />,
//   Control: <ControlIcon />,
//   Accounts: <ProfileIcon />,
// };

// const labels = {
//   Home: 'Home',
//   Missed: 'Missed',
//   Control: 'Control',
//   Accounts: 'Accounts',
// };

// const { width } = Dimensions.get('window');

// const CustomTabBar = ({ state, navigation }) => {
//   const insets = useSafeAreaInsets();
//   const colorScheme = useColorScheme();
//   const isDark = colorScheme === 'dark';

//   return (
//     <View style={[styles.absoluteContainer, { paddingBottom: insets.bottom }]}>
//       <View
//         style={[
//           styles.tabBar,
//           isDark && {
//             backgroundColor: 'rgba(85, 85, 85, 0.12)',
//             borderRadius: 42,
//             shadowColor: '#000',
//             shadowOffset: { width: 0, height: 4 },
//             shadowOpacity: 0.4,
//             shadowRadius: 65,
//             elevation: 10,
//           },
//         ]}
//       >
//         {state.routes.map((route, index) => {
//           const isFocused = state.index === index;
//           const label = labels[route.name];
//           const Icon = icons[route.name];

//           const onPress = () => {
//             if (!isFocused) navigation.navigate(route.name);
//           };

//           return (
//             <TouchableOpacity
//               key={route.key}
//               onPress={onPress}
//               activeOpacity={0.8}
//               style={[
//                 isFocused ? styles.activeTab : styles.inactiveTab,
//                 isDark &&
//                   isFocused && {
//                     backgroundColor: 'rgba(0, 0, 0, 0.65)',
//                     shadowColor: '#000',
//                     shadowOffset: { width: 0, height: 4 },
//                     shadowOpacity: 0.4,
//                     shadowRadius: 65,
//                     elevation: 10,
//                   },
//               ]}
//             >
//               <View style={styles.iconRow}>
//                 {React.cloneElement(Icon, {
//                   width: 22,
//                   height: 22,
//                   color: isFocused ? '#FFA43A' : '#fff',
//                 })}
//                 {isFocused && <Text style={styles.activeLabel}>{label}</Text>}
//               </View>
//             </TouchableOpacity>
//           );
//         })}
//       </View>
//     </View>
//   );
// };

// const styles = StyleSheet.create({
//   absoluteContainer: {
//     position: 'absolute',
//     bottom: 0,
//     width: '100%',
//     alignItems: 'center',
//     zIndex: 100,
//   },
//   tabBar: {
//     flexDirection: 'row',
//     justifyContent: 'space-around',
//     alignItems: 'center',
//     borderRadius: 40,
//     width: width - 30,
//     height: 75,
//     paddingHorizontal: 16,
//     borderWidth: 0,
//     backgroundColor: '#222', // fallback light theme
//   },
//   activeTab: {
//     flexDirection: 'row',
//     alignItems: 'center',
//     justifyContent: 'center',
//     borderRadius: 42,
//     backgroundColor: 'rgba(255, 255, 255, 0.07)',
//     paddingHorizontal: 18,
//     paddingVertical: 10,
//   },
//   inactiveTab: {
//     width: 44,
//     height: 44,
//     justifyContent: 'center',
//     alignItems: 'center',
//   },
//   iconRow: {
//     flexDirection: 'row',
//     alignItems: 'center',
//   },
//   activeLabel: {
//     color: '#FFA43A',
//     fontWeight: '600',
//     fontSize: 14,
//     marginLeft: 6,
//   },
// });

// export default CustomTabBar;
