// Lib
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';

// Mics Constants
// import baseLocal from '../locales/baseLocalization';
import {Constants, Emitter, Responsive} from '../utils/theme';
import {defaultUser} from '../utils/theme/constants';

// Common Function
// Localization
// export const localize = localizeStr => baseLocal.t(localizeStr);

// Async Storage
export const setAsyncData = async (keyName, dataArray) => {
  await AsyncStorage.setItem(keyName, JSON.stringify(dataArray));
};

export const getAsyncData = async keyName => {
  const data = await AsyncStorage.getItem(keyName);
  if (data === null) return null;
  return JSON.parse(data);
};

export const removeAsyncData = async keyName => {
  await AsyncStorage.removeItem(keyName);
};

// Internet Connection
export const checkInternetConnection = async () => {
  const data = await NetInfo.fetch();
  if (data.isConnected) {
    return data.isConnected && data.isInternetReachable !== false;
  }
  return false;
};

// Extra Function
export const convertHtmlToText = html => {
  return html
    .replace(/<[^>]+>/g, '') // remove all HTML tags
    .replace(/\s+/g, ' ') // normalize spacing
    .trim();
};

// iPhone 13 mini
export const width = pixel => {
  return Responsive.widthPercentageToDP(pixel / 3.67);
};

export const height = pixel => {
  return Responsive.heightPercentageToDP(pixel / 8);
};

// Logout
export const logout = () => {
  clearLocalStorage();
};

export const clearLocalStorage = () => {
  AsyncStorage.clear();
  Constants.commonConstant.appUserId = 0;
  Constants.commonConstant.appUser = defaultUser;
  Constants.commonConstant.appToken = '';
  Emitter.emit(Constants.eventListenerKeys.logoutListener, null);
};
