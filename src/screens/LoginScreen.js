import React, {useState, useRef} from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Switch,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Modal,
  Image,
  TextInput as RNTextInput,
  useColorScheme,
  Dimensions,
  SafeAreaView,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {BlurView} from '@react-native-community/blur';
import PasswordIcon from '../assets/svgs/Password';
import BackIcon from '../assets/svgs/Back';
import {Mail, Eye, EyeOff} from 'lucide-react-native';
import {
  heightPercentageToDP as hp,
  widthPercentageToDP as wp,
} from 'react-native-responsive-screen';
import responsive from '../styles/responsive';

const {height} = Dimensions.get('window');

const LoginScreen = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const otpRefs = [useRef(), useRef(), useRef(), useRef()];
  const navigation = useNavigation();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const orange = '#B87333';
  const backgroundColor = isDark ? '#000' : '#fff';
  const textColor = isDark ? '#fff' : '#000';
  const subTextColor = isDark ? '#ccc' : '#444';
  const cardBg = isDark ? 'rgba(21, 22, 21, 0.17)' : '#fff';
  const inputBg = 'rgba(85, 85, 85, 0.12)';
  return (
    <SafeAreaView style={[styles.container, {backgroundColor}]}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={backgroundColor}
      />
      <TouchableOpacity
        onPress={() => navigation.goBack()}
        style={styles.backButton}>
        <BackIcon width={26} height={26} color={isDark ? '#fff' : '#000'} />
      </TouchableOpacity>

      <KeyboardAvoidingView
        style={{flex: 1}}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={{flex: 1}}>
          {/* <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <BackIcon color={isDark ? 'white' : 'black'} />
          </TouchableOpacity>

          <Text style={[styles.heading, { color: textColor }]}>Go ahead and setup your account</Text>
          <Text style={[styles.subheading, { color: subTextColor }]}>Sign up and enjoy the unique experience of Silent Focus</Text> */}
          <View style={styles.headerWrapper}>
            <Text style={[styles.heading, {color: textColor}]}>
              Go ahead and setup your account
            </Text>
            <Text style={[styles.subheading, {color: subTextColor}]}>
              Sign up and enjoy the unique experience of Silent Focus
            </Text>
          </View>

          <View style={styles.outerCard}>
            <View style={styles.cardWrapper}>
              <ScrollView
                contentContainerStyle={{paddingBottom: 40}}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}>
                <View>
                  <View style={styles.tabRow}>
                    <TouchableOpacity
                      style={[styles.tabButton, isLogin && styles.tabActive]}
                      onPress={() => setIsLogin(true)}>
                      <Text
                        style={[
                          styles.tabText,
                          isLogin && styles.tabTextActive,
                        ]}>
                        Login
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.tabButton, !isLogin && styles.tabActive]}
                      onPress={() => setIsLogin(false)}>
                      <Text
                        style={[
                          styles.tabText,
                          !isLogin && styles.tabTextActive,
                        ]}>
                        Register
                      </Text>
                    </TouchableOpacity>
                  </View>

                  <View style={[styles.inputBox, {backgroundColor: inputBg}]}>
                    <Mail color={orange} style={styles.inputIcon} />
                    <TextInput
                      placeholder="Email address"
                      placeholderTextColor="#888"
                      style={[styles.input, {color: textColor}]}
                      keyboardType="email-address"
                      autoCapitalize="none"
                    />
                  </View>

                  <View style={[styles.inputBox, {backgroundColor: inputBg}]}>
                    <PasswordIcon
                      width={20}
                      height={20}
                      style={styles.inputIcon}
                    />
                    <TextInput
                      placeholder="Password"
                      placeholderTextColor="#888"
                      secureTextEntry={!showPassword}
                      style={[styles.input, {color: textColor}]}
                    />
                    <TouchableOpacity
                      onPress={() => setShowPassword(!showPassword)}>
                      {showPassword ? (
                        <EyeOff color="#888" style={styles.inputIconRight} />
                      ) : (
                        <Eye color="#888" style={styles.inputIconRight} />
                      )}
                    </TouchableOpacity>
                  </View>

                  <View style={styles.row}>
                    <View style={styles.rowLeft}>
                      <Switch
                        value={rememberMe}
                        onValueChange={setRememberMe}
                        thumbColor="#fff"
                        trackColor={{
                          false: '#ccc',
                          true: 'rgba(240, 138, 44, 0.35)',
                        }}
                        style={{transform: [{scale: 0.8}]}}
                      />
                      <Text
                        style={[styles.rememberText, {color: subTextColor}]}>
                        Remember me
                      </Text>
                    </View>
                    <TouchableOpacity>
                      <Text style={styles.forgotText}>Forgot password</Text>
                    </TouchableOpacity>
                  </View>

                  <TouchableOpacity
                    style={styles.loginButton}
                    onPress={() => {
                      if (isLogin) {
                        navigation.navigate('MainTabs');
                      } else {
                        setModalVisible(true);
                      }
                    }}>
                    <Text style={styles.loginButtonText}>
                      {isLogin ? 'Login' : 'Verify and Register'}
                    </Text>
                  </TouchableOpacity>

                  <View style={styles.dividerRow}>
                    <View style={styles.line} />
                    <Text style={styles.orText}>or login with</Text>
                    <View style={styles.line} />
                  </View>

                  <View style={styles.socialRow}>
                    <TouchableOpacity style={styles.socialButtonModern}>
                      <Image
                        source={require('../assets/images/Goggle.png')}
                        style={styles.socialIconModern}
                      />
                      <Text style={styles.socialText}>Google</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.socialButtonModern}>
                      <Image
                        source={require('../assets/images/facebook.png')}
                        style={styles.socialIconModern}
                      />
                      <Text style={styles.socialText}>Facebook</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </ScrollView>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>

      <Modal
        transparent
        animationType="fade"
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}>
        <BlurView
          style={styles.modalOverlay}
          blurType={isDark ? 'dark' : 'light'}
          blurAmount={10}
          reducedTransparencyFallbackColor="white">
          <View style={styles.modalContent}>
            <Image
              source={require('../assets/images/tts.png')}
              style={{width: 64, height: 64, marginBottom: 16}}
            />
            <Text style={{fontSize: 20, fontWeight: '600', marginBottom: 6}}>
              Verify your account
            </Text>
            <Text
              style={{
                fontSize: 14,
                color: '#555',
                textAlign: 'center',
                marginBottom: 4,
              }}>
              Enter 4 digits verification code we have sent to
            </Text>
            <Text style={{fontWeight: 'bold', marginBottom: 16}}>
              ShipraChaubey@gmail.com
            </Text>

            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-evenly',
                marginBottom: 16,
                width: '100%',
              }}>
              {[0, 1, 2, 3].map(i => (
                <RNTextInput
                  key={i}
                  ref={otpRefs[i]}
                  maxLength={1}
                  style={{
                    width: 60,
                    height: 60,
                    backgroundColor: '#eee',
                    borderRadius: 12,
                    textAlign: 'center',
                    textShadowColor: 'black',
                    fontSize: 20,
                    color: 'black',
                  }}
                  keyboardType="numeric"
                  onChangeText={text => {
                    if (text.length === 1 && i < 3) {
                      otpRefs[i + 1].current?.focus();
                    }
                  }}
                />
              ))}
            </View>

            <TouchableOpacity
              style={[styles.loginButton, {width: '100%'}]}
              onPress={() => {
                setModalVisible(false);
                setTimeout(() => {
                  navigation.navigate('MainTabs');
                }, 100);
              }}>
              <Text style={styles.loginButtonText}>Verify and Register</Text>
            </TouchableOpacity>
          </View>
        </BlurView>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1},
  backButton: {
    // position: 'absolute',
    marginTop: hp(6),
    marginLeft: responsive.margin(16),
    zIndex: 100,
  },
  headerWrapper: {
    marginTop: hp(6),
    width: wp(90),
    alignSelf: 'center',
  },
  heading: {
    fontSize: responsive.fontSize(28),
    fontWeight: '600',
    marginHorizontal: responsive.margin(6),

    // marginTop: height * 0.06,
  },
  subheading: {
    fontSize: responsive.fontSize(15),
    marginTop: responsive.margin(15),
    marginHorizontal: responsive.margin(6),
  },
  outerCard: {
    flex: 1,
    justifyContent: 'flex-end',
    // backgroundColor: 'red',
  },
  // cardWrapper: {
  //   borderTopLeftRadius: 42,
  //   borderTopRightRadius: 42,
  //   paddingHorizontal: 24,
  //   paddingTop: 24,
  //   paddingBottom: 36,
  //   backgroundColor: '#fff',
  //   shadowColor: '#000',
  //   shadowOffset: { width: 0, height: -4 },
  //   shadowOpacity: 0.1,
  //   shadowRadius: 10,
  //   elevation: 10,
  //   height: height * 0.6,
  //    marginHorizontal: 6,
  // },
  cardWrapper: {
    borderRadius: 42,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 36,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: -4},
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 10,
    height: height * 0.65,
    marginHorizontal: 6,
    borderWidth: 1,
    borderColor: '#16151640',
  },
  tabRow: {
    flexDirection: 'row',
    backgroundColor: '#e0e0e0',
    borderRadius: 50,
    marginBottom: 24,
    padding: 6,
  },
  tabButton: {flex: 1, paddingVertical: 12, alignItems: 'center'},
  tabActive: {backgroundColor: '#fff', borderRadius: 50},
  tabText: {color: '#333', fontWeight: '600'},
  tabTextActive: {color: '#D67D33'},
  inputBox: {
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 16,
    height: 60,
  },
  input: {flex: 1, fontSize: 14},
  inputIcon: {marginRight: 10},
  inputIconRight: {marginLeft: 10},
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 8,
    alignItems: 'center',
  },
  rowLeft: {flexDirection: 'row', alignItems: 'center'},
  rememberText: {marginLeft: 8, fontSize: 13},
  forgotText: {color: '#D67D33', fontSize: 13},
  loginButton: {
    backgroundColor: '#D67D33',
    paddingVertical: 14,
    borderRadius: 30,
    alignItems: 'center',
    marginTop: 16,
  },
  loginButtonText: {color: '#fff', fontWeight: 'bold', fontSize: 16},
  dividerRow: {flexDirection: 'row', alignItems: 'center', marginVertical: 24},
  line: {flex: 1, height: 1, backgroundColor: '#ddd'},
  orText: {marginHorizontal: 8, color: '#888', fontSize: 12},
  socialRow: {flexDirection: 'row', justifyContent: 'space-between'},
  socialButtonModern: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D67D33',
    backgroundColor: '#fff',
    borderRadius: 32,
    paddingVertical: 12,
    paddingHorizontal: 20,
    flex: 1,
    marginHorizontal: 4,
  },
  socialIconModern: {
    width: 20,
    height: 20,
    marginRight: 10,
    resizeMode: 'contain',
  },
  socialText: {fontSize: 14, color: '#000', fontWeight: '500', marginLeft: 5},
  modalOverlay: {flex: 1, justifyContent: 'center', alignItems: 'center'},
  modalContent: {
    width: '85%',
    backgroundColor: '#fff',
    padding: 24,
    borderRadius: 32,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 10,
  },
});

export default LoginScreen;
