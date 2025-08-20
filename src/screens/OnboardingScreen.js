import React, {useRef, useState, useEffect, useContext} from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  Animated,
  useColorScheme,
  Image,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import {SafeAreaView, useSafeAreaInsets} from 'react-native-safe-area-context';
import Carousel, {Pagination} from 'react-native-snap-carousel';
import {
  widthPercentageToDP as wp,
  heightPercentageToDP as hp,
} from 'react-native-responsive-screen';
import {scale, moderateScale} from 'react-native-size-matters';
import {useNavigation} from '@react-navigation/native';
import {ThemeContext} from '../context/ThemeContext';
import AntDesign from 'react-native-vector-icons/AntDesign';
import {AppContext} from '../utils/context/contextProvider';
import {setAsyncData} from '../function/commonFunctions';
import {Constants} from '../utils/theme';

const {width, height} = Dimensions.get('window');

const onboardingData = [
  {
    title: 'TAKE BACK\nCONTROL',
    description:
      'Silent Focus automatically mutes your phone in libraries, offices, religious places, and during meetings.',
    image: require('../assets/images/home.png'),
    styles: {width: wp('90%'), height: hp('40%')},
  },
  {
    title: 'Smart Automation\nYour Way',
    description:
      "Whether you're attending a meeting or entering a quiet zone, your phone will switch to silent mode automatically.",
    image: require('../assets/images/home2.png'),
    styles: {width: wp('90%'), height: hp('40%')},
  },
  {
    title: 'Stay in\nControl',
    description:
      'Customize silent zones, set response messages, and view missed notifications – all without compromising your privacy.',
    image: require('../assets/images/home3.png'),
    styles: {width: wp('90%'), height: hp('40%')},
  },
];

const OnboardingScreen = () => {
  const colorScheme = useColorScheme();
  const navigation = useNavigation();
  const {backgroundColor, textColor, descColor, isDark} =
    useContext(ThemeContext);
  const [activeIndex, setActiveIndex] = useState(0);
  const carouselRef = useRef(null);
  const animation = useRef(new Animated.Value(0)).current;
  const orange = '#B87333';
  const insets = useSafeAreaInsets();

  // Context
  const {setIsGetStarted} = useContext(AppContext);

  useEffect(() => {
    Animated.timing(animation, {
      toValue: 1,
      duration: 800,
      useNativeDriver: true,
    }).start();
  }, [activeIndex]);

  const renderItem = ({item, index}) => (
    <Animated.View
      style={[
        styles.animatedContent,
        {
          opacity: animation,
          transform: [{scale: animation}],
        },
      ]}>
      <Text style={[styles.title, {color: textColor}]}>{item.title}</Text>
      <Image
        source={item.image}
        style={item.styles}
        resizeMode="contain"
        onError={() => console.warn('Image failed to load')}
      />
      <Text style={[styles.description, {color: descColor}]}>
        {item.description}
      </Text>
    </Animated.View>
  );

  const pagination = () => (
    <Pagination
      dotsLength={onboardingData.length}
      activeDotIndex={activeIndex}
      dotStyle={{
        width: 20,
        height: 6,
        borderRadius: 3,
        backgroundColor: '#F08A2C',
        marginHorizontal: wp('-1%'),
      }}
      inactiveDotStyle={{
        width: 12,
        height: 6,
        borderRadius: 3,
        backgroundColor: '#C4A484',
        marginHorizontal: wp('0.5%'),
      }}
      inactiveDotOpacity={0.4}
      inactiveDotScale={0.9}
      containerStyle={{
        alignSelf: 'center',
      }}
    />
  );

  const handleNext = () => {
    if (activeIndex < onboardingData.length - 1) {
      carouselRef.current.snapToNext();
    } else {
      setAsyncData(Constants.asyncStorageKeys.showGetStarted, true);
      setIsGetStarted(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, {backgroundColor}]}>
      <StatusBar
        translucent
        backgroundColor="transparent"
        barStyle={isDark ? 'light-content' : 'dark-content'}
      />
      <Carousel
        ref={carouselRef}
        data={onboardingData}
        renderItem={renderItem}
        sliderWidth={width}
        itemWidth={width}
        onSnapToItem={index => setActiveIndex(index)}
        decelerationRate="fast"
        snapToInterval={width}
      />
      <View style={styles.arrowContainer}>
        {activeIndex < onboardingData.length - 1 ? (
          <View
            style={{
              paddingBottom: insets.bottom,
              flexDirection: 'row',
              width: wp(90),
              justifyContent: 'space-between',
            }}>
            {pagination()}

            <TouchableOpacity
              style={[styles.nextButton, {backgroundColor: orange}]}
              onPress={handleNext}>
              <AntDesign name="arrowright" size={30} color="#fff" />
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={[
              styles.button,
              {backgroundColor: orange, bottom: insets.bottom},
            ]}
            onPress={handleNext}>
            <Text style={styles.buttonText}>Next</Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
  },
  animatedContent: {
    alignItems: 'center',
    paddingHorizontal: wp('6%'),
    flex: 1,
    justifyContent: 'center',
    marginTop: -hp('10%'),
  },
  title: {
    fontSize: scale(28),
    fontWeight: 'bold',
    textAlign: 'center',
    alignSelf: 'center',
    marginBottom: hp('8%'),
  },
  description: {
    fontSize: moderateScale(14),
    fontWeight: '600',
    textAlign: 'center',
    alignSelf: 'center',
    lineHeight: moderateScale(20),
    marginBottom: hp('6%'),
  },
  image: {
    width: wp('90%'),
    height: hp('40%'),
    marginBottom: hp('3%'),
    marginTop: hp('-4%'),
  },
  arrowContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: wp('5%'),
    position: 'absolute',
    bottom: hp('4%'),
    width: '100%',
  },
  nextButton: {
    width: wp('16%'),
    height: wp('16%'),
    backgroundColor: '#130160',
    borderRadius: 100,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gettingStarted: {
    backgroundColor: '#130160',
    width: '100%',
    height: hp('7.5%'),
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  getStartedText: {
    color: '#fff',
    fontSize: hp('2.5%'),
    fontWeight: 'bold',
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
});

export default OnboardingScreen;
