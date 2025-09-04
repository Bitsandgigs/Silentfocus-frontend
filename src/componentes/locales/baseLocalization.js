import baseLocal from 'react-native-i18n';

import en from './en';

baseLocal.fallbacks = true;

baseLocal.translations = {
    en,
};

export default baseLocal;
