import React, {useState, useRef, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  useColorScheme,
  TouchableOpacity,
  Animated,
  Easing,
  Dimensions,
  ScrollView,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useNavigation} from '@react-navigation/native';

import CalenderIcon from '../assets/svgs/Calender';
import LocationIcon from '../assets/svgs/Location';
import NotificationIcon from '../assets/svgs/Notification';
import Toggle from '../assets/svgs/Toggle';
import {scale, verticalScale, moderateScale} from 'react-native-size-matters';

import {useSafeAreaInsets} from 'react-native-safe-area-context';
const {width, height} = Dimensions.get('window');

//const insets = useSafeAreaInsets();

const PermissionScreen = () => {
  const navigation = useNavigation();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const insets = useSafeAreaInsets();
  //const { width, height } = Dimensions.get('window');
  const [locationEnabled, setLocationEnabled] = useState(false);
  const [calendarEnabled, setCalendarEnabled] = useState(true);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);

  const backgroundColor = isDark ? '#000' : '#fff';
  const textColor = isDark ? '#fff' : '#000';
  const subtitleColor = isDark ? '#aaa' : '#555';
  const cardColor = isDark ? '#1a1a1a' : '#f3f3f3';
  const orange = '#B87333';

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
        easing: Easing.out(Easing.ease),
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 600,
        useNativeDriver: true,
        easing: Easing.out(Easing.ease),
      }),
    ]).start();
  }, []);

  return (
    <SafeAreaView
      style={{flex: 1, backgroundColor: isDark ? '#111111' : '#ffffff'}}>
      {/* 
    <SafeAreaView style={[styles.container, { backgroundColor }]}> */}
      <StatusBar
        backgroundColor={backgroundColor}
        barStyle={isDark ? 'light-content' : 'dark-content'}
      />
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          {backgroundColor: isDark ? '#111111' : '#ffffff'},
        ]}
        showsVerticalScrollIndicator={false}>
        {/* <View style={styles.scrollContent}> */}

        <Animated.View
          style={[
            styles.content,
            {
              opacity: fadeAnim,
              transform: [{translateY: slideAnim}],
            },
          ]}>
          <Text style={[styles.title, {color: textColor}]}>
            You Stay in{'\n'}Control
          </Text>
          <Text
            style={[styles.description, {color: subtitleColor}]}
            allowFontScaling={false}>
            To automate silent mode based on where you are and what’s on your
            calendar, we need a few permissions.
          </Text>

          {/* Location Permission */}
          <View style={[styles.card, {backgroundColor: cardColor}]}>
            <View style={styles.icon}>
              <LocationIcon width={24} height={24} color={orange} />
            </View>
            <View style={styles.textBlock}>
              <Text style={[styles.cardTitle, {color: textColor}]}>
                Access your Location
              </Text>
              <Text style={[styles.cardDescription, {color: subtitleColor}]}>
                To detect silent zones like libraries, offices, or religious
                places.
              </Text>
            </View>
            <TouchableOpacity onPress={() => setLocationEnabled(prev => !prev)}>
              <Toggle isOn={locationEnabled} />
            </TouchableOpacity>
          </View>

          {/* Calendar Permission */}
          <View style={[styles.card, {backgroundColor: cardColor}]}>
            <View style={styles.icon}>
              <CalenderIcon width={24} height={24} color={orange} />
            </View>
            <View style={styles.textBlock}>
              <Text style={[styles.cardTitle, {color: textColor}]}>
                Access your calendar
              </Text>
              <Text style={[styles.cardDescription, {color: subtitleColor}]}>
                To mute your phone automatically during scheduled meetings or
                events.
              </Text>
            </View>
            <TouchableOpacity onPress={() => setCalendarEnabled(prev => !prev)}>
              <Toggle isOn={calendarEnabled} />
            </TouchableOpacity>
          </View>

          {/* Notification Permission */}
          <View style={[styles.card, {backgroundColor: cardColor}]}>
            <View style={styles.icon}>
              <NotificationIcon width={24} height={24} color={orange} />
            </View>
            <View style={styles.textBlock}>
              <Text style={[styles.cardTitle, {color: textColor}]}>
                Notification access
              </Text>
              <Text style={[styles.cardDescription, {color: subtitleColor}]}>
                To notify you about missed calls and messages after silent mode
                ends.
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => setNotificationsEnabled(prev => !prev)}>
              <Toggle isOn={notificationsEnabled} />
            </TouchableOpacity>
          </View>
        </Animated.View>
        {/* </View> */}
      </ScrollView>

      <TouchableOpacity
        style={[
          styles.button,
          {backgroundColor: orange, bottom: insets.bottom + height * 0.015},
        ]}
        onPress={() => navigation.navigate('Login')}>
        <Text style={styles.buttonText}>Continue</Text>
      </TouchableOpacity>
      {/* </SafeAreaView> */}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: width * 0.06,
    paddingTop: height * 0.04,
    paddingBottom: height * 0.15,
  },
  content: {
    flexGrow: 1,
  },
  title: {
    fontSize: width * 0.08,
    fontWeight: 'bold',
    marginBottom: height * 0.015,
    fontFamily: 'Roboto',
  },
  description: {
    fontSize: width * 0.042,
    marginBottom: height * 0.03,
    lineHeight: width * 0.06,
    fontFamily: 'Roboto',
  },
  // card: {
  //   flexDirection: 'row',
  //   padding: width * 0.045,
  //   borderRadius: 17,
  //   alignItems: 'flex-start',
  //   marginBottom: height * 0.025,
  // },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 16,
    borderRadius: 17,
    marginBottom: 16,
    flexWrap: 'nowrap',
  },

  textBlock: {
    flex: 1,
    flexShrink: 1, // allow text to wrap
  },

  icon: {
    marginRight: 12,
    marginTop: 6,
  },
  textBlock: {
    flex: 1,
  },
  cardTitle: {
    fontSize: width * 0.038,
    fontFamily: 'Roboto',
    fontWeight: '600',
    marginBottom: 4,
  },
  // cardDescription: {
  //   fontSize: width * 0.036,
  //   fontFamily: 'Roboto',
  //   fontWeight: '300',
  //   lineHeight: 20,
  // },
  cardDescription: {
    fontSize: 14,
    fontWeight: '300',
    lineHeight: 20,
    flexWrap: 'wrap',
  },

  button: {
    // position: 'absolute',
    // bottom: height * 0.035,position: 'absolute',
    position: 'absolute',
    //bottom: insets.bottom + height * 0.015,
    left: width * 0.06,
    right: width * 0.06,
    borderRadius: 30,
    paddingVertical: height * 0.02,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
  },
  buttonText: {
    color: '#fff',
    fontSize: width * 0.045,
    fontWeight: 'bold',
    fontFamily: 'Roboto',
  },
  //   button: {
  //   position: 'absolute',
  //   left: width * 0.06,
  //   right: width * 0.06,
  //   borderRadius: 30,
  //   paddingVertical: height * 0.02,
  //   alignItems: 'center',
  //   justifyContent: 'center',
  //   elevation: 4,
  // },
});

export default PermissionScreen;
