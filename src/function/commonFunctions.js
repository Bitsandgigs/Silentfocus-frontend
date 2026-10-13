// Lib
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';

// Mics Constants
// import baseLocal from '../locales/baseLocalization';
import {Responsive} from '../utils/theme';
import {clearSession} from '../utils/session';
import i18n from '../componentes/locales/baseLocalization';
// import baseLocal from '../componentes/locales/baseLocalization';

// Common Function
// Localization
// export const localize = localizeStr => baseLocal.t(localizeStr);


export const localize = key => i18n.t(key);
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

// Logout - removes only the session keys (see utils/session), never the
// whole AsyncStorage.
export const logout = () => clearSession();

export const clearLocalStorage = () => clearSession();

export const convertTo24HourFormat = timeString => {
    const [time, period] = timeString.split(' ');

    const [hours, minutes] = time.split(':');
    let hoursNum = parseInt(hours, 10);

    if (period === 'PM' && hoursNum !== 12) {
        hoursNum += 12;
    } else if (period === 'AM' && hoursNum === 12) {
        hoursNum = 0;
    }

    return `${hoursNum.toString().padStart(2, '0')}:${minutes}:00`;
};
