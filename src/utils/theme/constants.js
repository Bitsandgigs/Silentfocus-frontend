import {Dimensions} from 'react-native';

export const defaultUser = {
  id: 0,
  name: '',
  email: '',
  phonenumber: '',
  profile_image: null,
};

export const commonConstant = {
  appName: 'Whats Mark',
  scrWidth: Dimensions.get('screen').width,
  scrHeight: Dimensions.get('screen').height,
  appUserId: 0,
  appUser: defaultUser,
  appToken: '',
  appBaseURL: '',
  InteractionId: '',
  appPusherData: {},
  oneSignalAppId: '9397cedf-fb02-43ef-b786-ea99b08100b2',

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
  successDocument: 201,
  invalidContent: 404,
  unprocessableContent: 422,
  unAuthorized: 401,
  serverError: 500,
};

export const asyncStorageKeys = {
  showGetStarted: 'showGetStarted',
  userBaseURL: 'userBaseURL',
  userToken: 'userToken',
  userData: 'userData',
  pusherData: 'pusherData',
  isLoginUser: 'isLoginUser',
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
