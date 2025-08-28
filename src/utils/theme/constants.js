import { Dimensions } from 'react-native';

export const defaultUser = {
  user_id: 0,
  username: '',
  email: '',
  phone_number: '',
};

export const commonConstant = {
  appName: 'Silence Focus',
  scrWidth: Dimensions.get('screen').width,
  scrHeight: Dimensions.get('screen').height,
  appUserId: 0,
  appUser: defaultUser,
  appToken: '',

  // animation Timing
  animTime100: 100,
  animTime200: 200,
  animTime300: 300,
  animTime350: 350,
  animTime400: 400,
  animTime500: 500,
  animTime700: 700,
  animTime800: 800,
  animTime900: 900,
  animTime1000: 1000,
  animTime1200: 1200,
  animTime1500: 1500,
  animTime2000: 2000,
  animTime2100: 2100,
  animTime2500: 2500,
  animTime3000: 3000,
  animTime3500: 3500,
  animTime4000: 4000,
  animDelay5500: 5500,
};

export const apiStatusCode = {
  success: 200,
  invalidContent: 404,
  unprocessableContent: 422,
  unAuthorized: 401,
  serverError: 500,
};

export const asyncStorageKeys = {
  showGetStarted: 'showGetStarted',
  userToken: 'userToken',
  userData: 'userData',
};

export const eventListenerKeys = {
  logoutListener: 'logoutListener',
  internetConnectionListener: 'internetConnectionListener',
  isUpdateSupportAgent: 'isUpdateSupportAgent',
};

export default {
  commonConstant,
  apiStatusCode,
  asyncStorageKeys,
  eventListenerKeys,
};
